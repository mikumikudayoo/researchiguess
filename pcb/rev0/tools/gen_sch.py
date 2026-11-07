"""Generate the native KiCad 10 hierarchical schematic for TAPH carrier rev 0.

Connections are made by placing a net label / power symbol / no-connect flag
exactly on each pin end-point (no free wires), so the drawn connectivity is
fully determined by design.py. check_netlist.py then compares KiCad's own
exported netlist against design intent.
"""
from __future__ import annotations

import copy
import math
import uuid
from collections import defaultdict
from pathlib import Path

import kilib
from design import POWER_SYMBOLS, SHEETS, Part
from sexp import QStr, dump, find, findall

PROJECT = "taph_carrier_rev0"
OUTDIR = Path(__file__).resolve().parent.parent / "kicad"
NS = uuid.UUID("5a1d6c0e-7a9b-4e57-9a2c-7a9f00000000")
REV = "0-prelim"
DATE = "2026-11-07"


def uid(*key) -> str:
    """Deterministic UUIDs so regeneration produces stable diffs."""
    return str(uuid.uuid5(NS, "/".join(map(str, key))))


def rnd(v):
    return round(v + 0.0, 4)


def rot(x, y, deg):
    t = math.radians(deg)
    c, s = round(math.cos(t), 9), round(math.sin(t), 9)
    return x * c + y * s, -x * s + y * c


def pin_geometry(p, X, Y, deg):
    sx, sy = rot(p["x"], -p["y"], deg)
    a = math.radians(p["angle"])
    ox, oy = rot(-math.cos(a), math.sin(a), deg)
    return (rnd(X + sx), rnd(Y + sy)), (round(ox), round(oy))


def effects(size=1.27, justify=None, hide=False, bold=False):
    font = ["font", ["size", size, size]]
    if bold:
        font.append(["bold", "yes"])
    e = ["effects", font]
    if justify:
        e.append(["justify", *justify.split()])
    if hide:
        e.append(["hide", "yes"])
    return e


def prop(name, value, x, y, ang=0, hide=False, justify=None, size=1.27):
    p = ["property", QStr(name), QStr(value), ["at", rnd(x), rnd(y), ang]]
    if hide:
        p.append(["hide", "yes"])
    p.append(effects(size, justify))
    return p


class SheetWriter:
    def __init__(self, sheet, sheet_uuid, root_uuid, page, global_nets):
        self.sheet = sheet
        self.sheet_uuid = sheet_uuid
        self.root_uuid = root_uuid
        self.page = page
        self.global_nets = global_nets
        self.items = []
        self.libs = {}
        self.pwr_n = 0
        self.inst_path = f"/{root_uuid}/{sheet_uuid}"

    def lib(self, lib_id):
        if lib_id not in self.libs:
            self.libs[lib_id] = kilib.symbol(lib_id)
        return self.libs[lib_id]

    def lib_prop(self, sym, name):
        for p in findall(sym, "property"):
            if p[1] == name:
                at = find(p, "at")
                return float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0
        return 0.0, 0.0, 0.0

    def symbol(self, lib_id, ref, value, X, Y, deg, fields, key, in_bom=True, on_board=True, dnp=False):
        sym = self.lib(lib_id)
        u = uid(self.sheet.file, key)
        node = ["symbol", ["lib_id", QStr(lib_id)], ["at", rnd(X), rnd(Y), deg], ["unit", 1],
                ["exclude_from_sim", "no"], ["in_bom", "yes" if in_bom else "no"],
                ["on_board", "yes" if on_board else "no"], ["dnp", "yes" if dnp else "no"],
                ["uuid", QStr(u)]]
        for fname, fval, hide in fields:
            lx, ly, la = self.lib_prop(sym, fname)
            ox, oy = rot(lx, -ly, deg)
            # KiCad stores field angles relative to the symbol orientation
            node.append(prop(fname, fval, X + ox, Y + oy, int(la), hide=hide))
        for p in kilib.pins(sym):
            node.append(["pin", QStr(p["number"]), ["uuid", QStr(uid(self.sheet.file, key, "pin", p["number"]))]])
        node.append(["instances", ["project", QStr(PROJECT),
                                   ["path", QStr(self.inst_path), ["reference", QStr(ref)], ["unit", 1]]]])
        self.items.append(node)
        return sym

    def power(self, net, x, y, out):
        lib_id = POWER_SYMBOLS[net]
        self.pwr_n += 1
        ref = f"#PWR{self.page:02d}{self.pwr_n:03d}"
        if net == "GND":
            deg = {(0, 1): 0, (1, 0): 90, (0, -1): 180, (-1, 0): 270}[out]
        else:
            deg = {(0, -1): 0, (-1, 0): 90, (0, 1): 180, (1, 0): 270}[out]
        self.symbol(lib_id, ref, net, x, y, deg,
                    [("Reference", ref, True), ("Value", net, False), ("Footprint", "", True), ("Datasheet", "", True)],
                    key=f"pwr/{net}/{x}/{y}", in_bom=False, on_board=False)

    def label(self, net, x, y, out):
        ang = {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[out]
        just = "left" if ang in (0, 90) else "right"
        if net in self.global_nets:
            node = ["global_label", QStr(net), ["shape", "passive"], ["at", x, y, ang],
                    ["fields_autoplaced", "yes"], effects(1.27, just),
                    ["uuid", QStr(uid(self.sheet.file, "gl", net, x, y))],
                    prop("Intersheetrefs", "${INTERSHEET_REFS}", x, y, ang, hide=True)]
        else:
            node = ["label", QStr(net), ["at", x, y, ang], ["fields_autoplaced", "yes"],
                    effects(1.27, just + " bottom"), ["uuid", QStr(uid(self.sheet.file, "l", net, x, y))]]
        self.items.append(node)

    def no_connect(self, x, y):
        self.items.append(["no_connect", ["at", x, y], ["uuid", QStr(uid(self.sheet.file, "nc", x, y))]])

    def attach(self, net, pos, out, stagger=None):
        x, y = pos
        if net is None:
            self.no_connect(x, y)
        elif net in POWER_SYMBOLS:
            if stagger is not None and out[1] == 0:
                # connector power pin: horizontal stub (staggered by pin parity) and upright symbol,
                # so adjacent GND / supply symbols do not overlap
                L = 5.08 if stagger % 2 else 12.7
                ex, ey = rnd(x + out[0] * L), y
                self.items.append(["wire", ["pts", ["xy", x, y], ["xy", ex, ey]],
                                   ["stroke", ["width", 0], ["type", "default"]],
                                   ["uuid", QStr(uid(self.sheet.file, "pw", x, y, ex, ey))]])
                self.power(net, ex, ey, (0, 1) if net == "GND" else (0, -1))
            else:
                self.power(net, x, y, out)
        else:
            # short wire stub, then label; vertical pins get horizontal labels for legibility
            ex, ey = rnd(x + out[0] * 2.54), rnd(y + out[1] * 2.54)
            self.items.append(["wire", ["pts", ["xy", x, y], ["xy", ex, ey]],
                               ["stroke", ["width", 0], ["type", "default"]],
                               ["uuid", QStr(uid(self.sheet.file, "w", x, y, ex, ey))]])
            self.label(net, ex, ey, out if out[1] == 0 else (1, 0))

    def part(self, p: Part):
        fields = [("Reference", p.ref, False), ("Value", p.value, p.lib == "Connector:TestPoint"), ("Footprint", p.fp, True),
                  ("Datasheet", "", True), ("Status", p.status, True), ("MPN_candidate", p.mpn, True),
                  ("Review_note", p.note, True)]
        sym = self.symbol(p.lib, p.ref, p.value, p.x, p.y, p.rot, fields, key=f"part/{p.ref}",
                          in_bom=p.in_bom, dnp=p.dnp)
        seen = set()
        for pin in kilib.pins(sym):
            num = pin["number"]
            if num not in p.nets:
                raise SystemExit(f"{p.ref} pin {num} ({pin['name']}) has no net/no-connect assignment")
            seen.add(num)
            pos, out = pin_geometry(pin, p.x, p.y, p.rot)
            stag = int(num) if (p.ref.startswith("J") and p.ref not in ("J14", "J15") and num.isdigit()) else None
            self.attach(p.nets[num], pos, out, stag)
        extra = set(p.nets) - seen
        if extra:
            raise SystemExit(f"{p.ref}: nets given for nonexistent pins {extra}")

    def flag(self, x, y, net, n):
        ref = f"#FLG{self.page:02d}{n:02d}"
        sym = self.symbol("power:PWR_FLAG", ref, "PWR_FLAG", x, y, 0,
                          [("Reference", ref, True), ("Value", "PWR_FLAG", False), ("Footprint", "", True),
                           ("Datasheet", "", True)], key=f"flag/{net}", in_bom=False, on_board=False)
        pin = kilib.pins(sym)[0]
        pos, out = pin_geometry(pin, x, y, 0)
        self.attach(net, pos, out)

    def text(self, x, y, s, size):
        self.items.append(["text", QStr(s), ["exclude_from_sim", "no"], ["at", x, y, 0],
                           effects(size, "left top"), ["uuid", QStr(uid(self.sheet.file, "t", x, y))]])

    def box(self, x1, y1, x2, y2, caption):
        self.items.append(["rectangle", ["start", x1, y1], ["end", x2, y2],
                           ["stroke", ["width", 0.254], ["type", "dash"]], ["fill", ["type", "none"]],
                           ["uuid", QStr(uid(self.sheet.file, "r", x1, y1))]])
        self.items.append(["text", QStr(caption), ["exclude_from_sim", "no"], ["at", x1 + 1.27, y1 + 1.27, 0],
                           effects(1.524, "left top", bold=True), ["uuid", QStr(uid(self.sheet.file, "rc", x1, y1))]])

    def build(self):
        s = self.sheet
        for b in s.boxes:
            self.box(*b)
        for p in s.parts:
            self.part(p)
        for i, (x, y, net) in enumerate(s.flags, 1):
            self.flag(x, y, net, i)
        for x, y, t, size in s.texts:
            self.text(x, y, t, size)
        root = header("A4", uid(s.file, "file"), s.title, self.page, s.name)
        libs = ["lib_symbols"] + [self.libs[k] for k in sorted(self.libs)]
        root.append(libs)
        root.extend(self.items)
        root.append(["embedded_fonts", "no"])
        return root


def header(paper, file_uuid, title, page, short=None):
    short = short or title
    return ["kicad_sch", ["version", 20250610], ["generator", QStr("eeschema")], ["generator_version", QStr("10.0")],
            ["uuid", QStr(file_uuid)], ["paper", QStr(paper)],
            ["title_block", ["title", QStr(f"TAPH carrier rev 0 - {short}")], ["date", QStr(DATE)], ["rev", QStr(REV)],
             ["company", QStr("TAPH research - PRELIMINARY - NOT FOR FABRICATION")],
             ["comment", 1, QStr("Design-review prototype. Not reviewed for manufacture, assembly or energization.")],
             ["comment", 2, QStr("Unverified external components: sensor, generator, pump, servo, supply. See pcb/rev0/docs.")],
             ["comment", 3, QStr("Generated by pcb/rev0/tools/gen_sch.py from design.py")]]]


ROOT_NOTES = """TAPH ESP32 CARRIER - REV 0 PRELIMINARY DESIGN-REVIEW PACKAGE

STATUS: NOT FOR FABRICATION, ASSEMBLY OR ENERGIZATION. Prepared for adviser/consultant review (2026-11-08).
Passing ERC/DRC is a rule-consistency check only; it is not evidence of electrical or operational safety.

ARCHITECTURE (rev 0)
- Carrier PCB for a SOCKETED ESP32 development board (provisional: Espressif ESP32-DevKitC V4, classic ESP32, 38-pin).
- Three externally supplied low-voltage DC inputs, each a separate removable isolation point:
    VIN_LOGIC (J1, 12 V nominal) -> protection -> 5 V module -> +5V / DevKitC 5V
    PUMP_VIN (J2, 12 V nominal)  -> fuse -> pump connector, low-side MOSFET switch with hardware default-OFF
    SERVO_VIN (J4, per servo)    -> fuse -> servo connector; PWM buffered 3.3 V -> 5 V
- No mains voltage on the PCB. Generator power does not pass through the PCB (sense connections only).
- Measurement: generator voltage sense + external generator current sensor interface (analog or I2C),
  pump current (on-board shunt + INA180) and pump supply voltage. Flow pulse input; optional RPM and pitch feedback.
- OLED on I2C (IO21/IO22), I2C expansion, spare GPIO, test points on every rail and key signal.

FIELD "Status" ON EVERY PART: IMPLEMENTED / PROVISIONAL / TBD / OPTIONAL / DNP / CONFIRM (see pcb/rev0/README.md).
Values shown as "TBD" are intentionally unresolved: they depend on unverified external component ratings."""


def main():
    # nets appearing on more than one sheet -> global labels
    net_sheets = defaultdict(set)
    for s in SHEETS:
        for p in s.parts:
            for n in p.nets.values():
                if n and n not in POWER_SYMBOLS:
                    net_sheets[n].add(s.file)
        for _, _, n in s.flags:
            if n not in POWER_SYMBOLS:
                net_sheets[n].add(s.file)
    global_nets = {n for n, f in net_sheets.items() if len(f) > 1}

    root_uuid = uid("root")
    OUTDIR.mkdir(parents=True, exist_ok=True)
    root = header("A3", root_uuid, "Root / architecture", 1, "Architecture")
    root.append(["lib_symbols"])
    root.append(["text", QStr(ROOT_NOTES), ["exclude_from_sim", "no"], ["at", 20.32, 20.32, 0],
                 effects(1.524, "left top"), ["uuid", QStr(uid("root", "notes"))]])
    for i, s in enumerate(SHEETS):
        su = uid("sheet", s.file)
        col, row = i % 4, i // 4
        x, y = 20.32 + col * 96.52, 160.02 + row * 50.8
        w, h = 83.82, 30.48
        root.append(["sheet", ["at", x, y], ["size", w, h], ["exclude_from_sim", "no"], ["in_bom", "yes"],
                     ["on_board", "yes"], ["dnp", "no"], ["fields_autoplaced", "yes"],
                     ["stroke", ["width", 0.1524], ["type", "solid"]], ["fill", ["color", 0, 0, 0, 0.0]],
                     ["uuid", QStr(su)],
                     prop("Sheetname", s.name, x, y - 0.7116, 0, justify="left bottom"),
                     prop("Sheetfile", s.file, x, y + h + 0.5846, 0, justify="left top"),
                     ["instances", ["project", QStr(PROJECT), ["path", QStr(f"/{root_uuid}"), ["page", QStr(str(i + 2))]]]]])
        root.append(["text", QStr(s.title), ["exclude_from_sim", "no"], ["at", x + 2.54, y + 5.08, 0],
                     effects(1.27, "left top"), ["uuid", QStr(uid("root", "st", s.file))]])
        w_ = SheetWriter(s, su, root_uuid, i + 2, global_nets)
        tree = w_.build()
        (OUTDIR / s.file).write_text(dump(tree) + "\n", encoding="utf-8")
    root.append(["sheet_instances", ["path", QStr("/"), ["page", QStr("1")]]])
    root.append(["embedded_fonts", "no"])
    (OUTDIR / f"{PROJECT}.kicad_sch").write_text(dump(root) + "\n", encoding="utf-8")
    print("schematic written; global nets:", len(global_nets))


if __name__ == "__main__":
    main()
