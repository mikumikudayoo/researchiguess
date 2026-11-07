"""Generate project-local symbol library TAPH_Rev0.kicad_sym.

Two symbols model the two 19-pin headers of an Espressif ESP32-DevKitC V4
(38-pin) development board, as carried in two stock 1x19 2.54 mm sockets.
Pin order follows Espressif's published DevKitC V4 header tables (J2/J3).
It MUST be confirmed against the actual board in hand: many "38-pin ESP32"
clones differ in pin order and in row spacing.
"""
from __future__ import annotations

from pathlib import Path

from sexp import QStr, dump

OUT = Path(__file__).resolve().parent.parent / "kicad" / "libs" / "TAPH_Rev0.kicad_sym"

# (pin number, name, electrical type)
J2 = [
    (1, "3V3", "power_out"), (2, "EN", "input"), (3, "IO36/SENSOR_VP", "input"),
    (4, "IO39/SENSOR_VN", "input"), (5, "IO34", "input"), (6, "IO35", "input"),
    (7, "IO32", "bidirectional"), (8, "IO33", "bidirectional"), (9, "IO25", "bidirectional"),
    (10, "IO26", "bidirectional"), (11, "IO27", "bidirectional"), (12, "IO14", "bidirectional"),
    (13, "IO12/MTDI", "bidirectional"), (14, "GND", "power_in"), (15, "IO13", "bidirectional"),
    (16, "IO9/SD2", "bidirectional"), (17, "IO10/SD3", "bidirectional"),
    (18, "IO11/CMD", "bidirectional"), (19, "5V", "power_in"),
]
J3 = [
    (1, "GND", "power_in"), (2, "IO23", "bidirectional"), (3, "IO22", "bidirectional"),
    (4, "IO1/TXD0", "bidirectional"), (5, "IO3/RXD0", "bidirectional"), (6, "IO21", "bidirectional"),
    (7, "GND", "power_in"), (8, "IO19", "bidirectional"), (9, "IO18", "bidirectional"),
    (10, "IO5", "bidirectional"), (11, "IO17", "bidirectional"), (12, "IO16", "bidirectional"),
    (13, "IO4", "bidirectional"), (14, "IO0/BOOT", "bidirectional"), (15, "IO2", "bidirectional"),
    (16, "IO15/MTDO", "bidirectional"), (17, "IO8/SD1", "bidirectional"),
    (18, "IO7/SD0", "bidirectional"), (19, "IO6/CLK", "bidirectional"),
]


def font(size=1.27):
    return ["effects", ["font", ["size", size, size]]]


def prop(name, value, x, y, hide=False, justify=None):
    p = ["property", QStr(name), QStr(value), ["at", x, y, 0]]
    if hide:
        p.append(["hide", "yes"])
    eff = font()
    if justify:
        eff.append(["justify", justify])
    p.append(eff)
    return p


def header_symbol(name, header, pins, side, desc):
    # side: "left" -> pin endpoints on the left (x=-12.7, angle 0)
    #       "right" -> endpoints on the right (x=+12.7, angle 180)
    top = 24.13
    bottom = -24.13
    ex, ang = (-12.7, 0) if side == "left" else (12.7, 180)
    sym = [
        "symbol", QStr(name),
        ["pin_names", ["offset", 1.016]],
        ["exclude_from_sim", "no"], ["in_bom", "yes"], ["on_board", "yes"],
        prop("Reference", "J", 0, top + 2.54),
        prop("Value", name, 0, bottom - 2.54),
        prop("Footprint", "Connector_PinSocket_2.54mm:PinSocket_1x19_P2.54mm_Vertical", 0, bottom - 5.08, hide=True),
        prop("Datasheet", "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html", 0, 0, hide=True),
        prop("Description", desc, 0, 0, hide=True),
        prop("ki_keywords", "ESP32 DevKitC socket carrier", 0, 0, hide=True),
        ["symbol", QStr(f"{name}_0_1"),
         ["rectangle", ["start", -7.62, top], ["end", 7.62, bottom],
          ["stroke", ["width", 0.254], ["type", "default"]], ["fill", ["type", "background"]]],
         ],
    ]
    unit = ["symbol", QStr(f"{name}_1_1")]
    for i, (num, pname, ptype) in enumerate(pins):
        y = 22.86 - 2.54 * i
        unit.append(["pin", ptype, "line", ["at", ex, y, ang], ["length", 5.08],
                     ["name", QStr(pname), font()], ["number", QStr(str(num)), font()]])
    sym.append(unit)
    sym.append(["embedded_fonts", "no"])
    return sym


def main():
    lib = ["kicad_symbol_lib", ["version", 20251024], ["generator", QStr("taph_rev0_gen")],
           ["generator_version", QStr("10.0")]]
    lib.append(header_symbol(
        "ESP32-DevKitC-V4_J2", "DevKitC J2", J2, "left",
        "Socket for ESP32-DevKitC V4 header J2 (left). Pin order per Espressif user guide; CONFIRM against actual board."))
    lib.append(header_symbol(
        "ESP32-DevKitC-V4_J3", "DevKitC J3", J3, "right",
        "Socket for ESP32-DevKitC V4 header J3 (right). Pin order per Espressif user guide; CONFIRM against actual board."))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(dump(lib) + "\n", encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
