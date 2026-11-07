"""Generate the preliminary 2-layer PCB for TAPH carrier rev 0.

Run with KiCad's bundled Python (needs pcbnew + numpy):
    <KiCad>/bin/python.exe gen_pcb.py ../build/taph_carrier_rev0.net

* Footprints come from the stock KiCad libraries named in the schematic.
* Nets, references, values and schematic paths come from KiCad's own exported
  netlist, so `kicad-cli pcb drc --schematic-parity` checks real correspondence.
* A simple 2-layer grid maze router (below) routes ONLY logic power, digital and
  analog signal nets. Pump and servo power nets are deliberately NOT routed
  (routing BLOCKED until pump/servo currents are measured) and appear as
  unconnected items in DRC. GND is a pour on both layers.
* Nets the router fails to complete are left unrouted and reported - never forced.
"""
from __future__ import annotations

import fnmatch
import heapq
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import pcbnew

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sexp import find, findall, parse  # noqa: E402

REV0 = Path(__file__).resolve().parent.parent
KICAD_ROOT = Path(os.environ.get("KICAD_ROOT", r"C:/Users/Admin/AppData/Local/Programs/KiCad/10.0"))
FPDIR = KICAD_ROOT / "share/kicad/footprints"
OUT = REV0 / "kicad" / "taph_carrier_rev0.kicad_pcb"
REPORT = REV0 / "build" / "routing_report.json"

OX, OY = 50.0, 50.0          # board origin on the KiCad page
BW, BH = 130.0, 100.0        # board outline (provisional; enclosure unknown)
GRID = 0.25
CLR = 0.2 + 0.08             # design clearance 0.2 mm + margin for grid/diagonal error
VIA_D, VIA_DRILL = 0.8, 0.4

BLOCKED = {"PUMP_VIN_RAW", "+12V_PUMP", "PUMP_SW", "PUMP_SRC", "PGND",
           "SERVO_VIN_RAW", "SERVO_V+", "SERVO_GND"}
POWER_W = 0.6
SIGNAL_W = 0.25
POWER_PATTERNS = ["VIN_*", "+5V*", "+3V3"]

# ref: (x, y, rotation_deg) in board coordinates (origin = top-left corner of outline)
PLACE = {
    # --- logic supply (top-left)
    "J1": (7, 22, 90), "F1": (17, 20, 90), "D1": (25, 20, 0), "D2": (25, 26, 0), "C1": (33, 26, 0),
    "C2": (33, 15.5, 0), "U1": (41.5, 25, 0), "C3": (53, 25, 90), "D3": (53, 16.5, 90),
    "R1": (46.5, 11.5, 0), "LED1": (46.5, 15, 0),
    # --- MCU sockets (pin 1 / antenna end toward top edge)
    "J14": (62, 8, 0), "J15": (87.4, 8, 0),
    "C5": (57.5, 8.5, 90), "C6": (57.5, 14, 90), "C4": (57.5, 50, 90),
    # --- servo domain (left middle)
    "J4": (7, 42, 90), "F3": (16, 34.5, 0), "C11": (36, 37, 0), "D7": (36, 45, 0),
    "J5": (47, 34, 0), "U4": (54.5, 36.5, 90), "C12": (51.5, 41.5, 0), "R10": (57.5, 33, 90),
    "R11": (50.0, 37, 90), "NT2": (41.5, 50.5, 0),
    # --- pump domain (left bottom)
    "J2": (7, 68, 90), "F2": (16, 60.5, 0), "D4": (20, 70, 0), "C7": (35, 62, 0),
    "J3": (7, 88, 90), "D5": (17, 84, 90), "Q1": (24, 86, 0), "R5": (24, 93, 0), "NT1": (31, 96.5, 0),
    "U3": (34, 89, 0), "C8": (34, 84.5, 0), "R6": (39.5, 89, 90), "C9": (43, 89, 90),
    "R4": (28.5, 81, 90), "R3": (28.5, 76.5, 90), "JP1": (33, 76, 90),
    "R2": (14, 76, 90), "LED2": (17.5, 77.5, 90),
    "R7": (45, 60, 90), "R8": (45, 65.5, 90), "R9": (49.5, 62.5, 0), "C10": (53, 66, 90), "D6": (53, 60, 0),
    # --- HMI / expansion (bottom centre)
    "J11": (62, 95, 90), "R22": (64.5, 88.5, 0), "R23": (64.5, 84.5, 0), "C18": (70, 88.5, 0),
    "J13": (76, 95, 90), "J12": (100, 95, 0),
    # --- sensor inputs (right edge)
    "J6": (123, 14, 270), "R12": (112, 12.5, 0), "R13": (112, 16.5, 0), "D8": (105.5, 14, 0),
    "C13": (105.5, 19, 0), "JP2": (113, 21, 0),
    "J7": (123, 30, 270), "R14": (112, 28.5, 0), "R15": (112, 32.5, 0), "D9": (105.5, 30, 0),
    "C14": (105.5, 35, 0), "JP3": (113, 37, 0),
    "J8": (123, 46, 270), "R16": (112, 47.5, 0), "D10": (105.5, 46, 0), "C15": (105.5, 51, 0),
    # --- generator measurement (right edge)
    "J9": (123, 62, 270), "D11": (114, 61, 90), "R17": (109, 59.5, 90), "R18": (109, 65.5, 90),
    "R19": (104, 62.5, 0), "C16": (100, 66.5, 90), "D12": (100, 60, 0),
    "J10": (123, 76, 270), "R20": (112, 75.5, 90), "R21": (112, 81, 90), "C17": (107, 81, 90),
    "D13": (102, 76, 0), "JP4": (113, 86, 0),
    # --- test points
    "TP1": (18.5, 30), "TP2": (51, 30), "TP3": (57.5, 19), "TP4": (57.5, 23), "TP5": (57.5, 56),
    "TP6": (28, 70.5), "TP7": (36.5, 95.5), "TP8": (22, 80), "TP9": (47, 92), "TP10": (57.5, 62),
    "TP11": (29, 44), "TP12": (29, 48), "TP13": (46, 53), "TP14": (101, 10), "TP15": (96, 66.5),
    "TP16": (96, 80), "TP17": (74, 86), "TP18": (78, 86), "TP19": (96, 88), "TP20": (10.5, 75.5),
    # --- mounting (provisional, enclosure unknown)
    "H1": (4, 4), "H2": (126, 4), "H3": (4, 96), "H4": (126, 96),
}

# copper keep-outs (board coords): antenna region of the DevKitC module, both layers
ANTENNA_KEEPOUT = (58.5, 0.0, 91.0, 6.0)
# zone-fill keep-outs marking the BLOCKED high-current regions (tracks also not auto-routed there)
BLOCKED_REGIONS = {
    "PUMP POWER - ROUTING BLOCKED (pump current unverified)": (0.5, 57.5, 30.5, 99.5),
    "SERVO POWER - ROUTING BLOCKED (servo current unverified)": (0.5, 31.0, 42.0, 47.5),
}


def mm(v):
    return pcbnew.FromMM(v)


def V(x, y):
    return pcbnew.VECTOR2I(mm(OX + x), mm(OY + y))


def short(net):
    return net.rsplit("/", 1)[-1]


def is_power(net):
    return any(fnmatch.fnmatchcase(net, p) for p in POWER_PATTERNS)


# ------------------------------------------------------------------ netlist
def load_netlist(path):
    t = parse(open(path, encoding="utf-8").read())
    comps = {}
    for c in findall(find(t, "components"), "comp"):
        ref = str(find(c, "ref")[1])
        sp = find(c, "sheetpath")
        props = {str(find(p, "name")[1]): str(find(p, "value")[1]) if find(p, "value") else ""
                 for p in findall(c, "property")}
        comps[ref] = {
            "value": str(find(c, "value")[1]),
            "footprint": str(find(c, "footprint")[1]) if find(c, "footprint") else "",
            "path": str(find(sp, "tstamps")[1]) + str(find(c, "tstamps")[1]),
            "sheetname": str(find(sp, "names")[1]),
            "props": props,
        }
    nets = {}
    for n in findall(find(t, "nets"), "net"):
        name = str(find(n, "name")[1])  # full hierarchical name, as the schematic defines it
        for node in findall(n, "node"):
            nets[(str(find(node, "ref")[1]), str(find(node, "pin")[1]))] = name
    return comps, nets


# ------------------------------------------------------------------ board
def build_board(comps, pinnets):
    board = pcbnew.BOARD()
    board.SetCopperLayerCount(2)
    netinfo = {}
    for name in sorted(set(pinnets.values())):
        ni = pcbnew.NETINFO_ITEM(board, name)
        board.Add(ni)
        netinfo[name] = ni
    missing = [r for r in comps if r not in PLACE]
    if missing:
        raise SystemExit(f"no placement for {missing}")
    for ref, c in sorted(comps.items()):
        lib, name = c["footprint"].split(":", 1)
        fp = pcbnew.FootprintLoad(str(FPDIR / f"{lib}.pretty"), name)
        if fp is None:
            raise SystemExit(f"footprint not found {c['footprint']}")
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(ref)
        fp.SetValue(c["value"])
        fp.SetPath(pcbnew.KIID_PATH(c["path"]))
        fp.SetSheetname(c["sheetname"].strip("/"))
        fp.SetSheetfile(c["props"].get("Sheetfile", ""))
        for k in ("Status", "MPN_candidate", "Review_note"):
            if k in c["props"]:
                fp.SetField(k, c["props"][k])
                f = fp.GetField(k)
                if f:
                    f.SetVisible(False)
                    f.SetLayer(pcbnew.F_Fab)
        x, y, *r = PLACE[ref]
        board.Add(fp)
        fp.SetPosition(V(x, y))
        fp.SetOrientationDegrees(r[0] if r else 0)
        if ref.startswith("H"):
            fp.Reference().SetVisible(False)
        if c["props"].get("Status") == "DNP" or ref in ("D7", "D11"):
            fp.SetDNP(True)
        for pad in fp.Pads():
            n = pinnets.get((ref, pad.GetNumber()))
            if n and n in netinfo:
                pad.SetNet(netinfo[n])
    # outline
    rect = pcbnew.PCB_SHAPE(board)
    rect.SetShape(pcbnew.SHAPE_T_RECT)
    rect.SetStart(V(0, 0))
    rect.SetEnd(V(BW, BH))
    rect.SetLayer(pcbnew.Edge_Cuts)
    rect.SetWidth(mm(0.1))
    board.Add(rect)
    return board, netinfo


def add_zone(board, layer, net, x1, y1, x2, y2, rule=None, name=""):
    z = pcbnew.ZONE(board)
    z.SetLayer(layer)
    if rule is not None:
        z.SetIsRuleArea(True)
        z.SetLayerSet(rule)
        z.SetDoNotAllowZoneFills(True)
        z.SetDoNotAllowTracks(name.startswith("ANTENNA"))
        z.SetDoNotAllowVias(name.startswith("ANTENNA"))
        z.SetDoNotAllowPads(False)
        z.SetDoNotAllowFootprints(False)
        z.SetZoneName(name[:60])
    else:
        z.SetNet(net)
        z.SetLocalClearance(mm(0.45))  # >= every netclass clearance (zone filled before project netclasses load)
        z.SetMinThickness(mm(0.25))
        z.SetThermalReliefGap(mm(0.4))
        z.SetThermalReliefSpokeWidth(mm(0.5))
        z.SetAssignedPriority(0)
    ol = z.Outline()
    ol.NewOutline()
    for px, py in ((x1, y1), (x2, y1), (x2, y2), (x1, y2)):
        ol.Append(mm(OX + px), mm(OY + py))
    board.Add(z)
    return z


def add_text(board, s, x, y, size=1.0, layer=pcbnew.F_SilkS, bold=False):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(s)
    t.SetPosition(V(x, y))
    t.SetLayer(layer)
    t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
    t.SetTextThickness(mm(0.15 if not bold else 0.2))
    t.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_LEFT)
    if layer == pcbnew.B_SilkS:
        t.SetMirrored(True)
    board.Add(t)


# ------------------------------------------------------------------ router
class Router:
    """Two-layer 8-connected grid maze router (A*). Conservative, not optimal."""

    def __init__(self, board, netinfo):
        self.board = board
        self.netinfo = netinfo
        self.nx, self.ny = int(BW / GRID) + 1, int(BH / GRID) + 1
        self.names = ["<free>"] + sorted(netinfo)
        self.nid = {n: i for i, n in enumerate(self.names)}
        self.blocked_ids = {i for n, i in self.nid.items() if short(n) in BLOCKED}
        # occupancy: 0 free, -1 blocked for all, >0 net id
        self.occ = np.zeros((2, self.ny, self.nx), dtype=np.int32)
        self.pads = {}   # net -> list of (layers tuple, cell mask indices, center cell)
        self.tracks = []
        self.vias = []
        self.shapes = []  # (layers, net id, kind, params) exact copper geometry in board mm
        X, Y = np.meshgrid(np.arange(self.nx) * GRID, np.arange(self.ny) * GRID)
        self.X, self.Y = X, Y
        self._rasterise()

    def cell(self, x, y):
        return int(round(y / GRID)), int(round(x / GRID))

    def _box_cells(self, x1, y1, x2, y2):
        j1, i1 = max(0, math.floor(x1 / GRID)), max(0, math.floor(y1 / GRID))
        j2, i2 = min(self.nx - 1, math.ceil(x2 / GRID)), min(self.ny - 1, math.ceil(y2 / GRID))
        return i1, i2, j1, j2

    def _rasterise(self):
        e = int(math.ceil(0.5 / GRID))  # copper-to-edge clearance 0.5 mm
        self.occ[:, :e, :] = -1
        self.occ[:, -e:, :] = -1
        self.occ[:, :, :e] = -1
        self.occ[:, :, -e:] = -1
        x1, y1, x2, y2 = ANTENNA_KEEPOUT
        i1, i2, j1, j2 = self._box_cells(x1, y1, x2, y2)
        self.occ[:, i1:i2 + 1, j1:j2 + 1] = -1
        to = lambda v: pcbnew.ToMM(v)  # noqa: E731
        for fp in self.board.GetFootprints():
            # copper graphics inside footprints (e.g. net-tie bridges): block for every net
            for gi in fp.GraphicalItems():
                for li, L in enumerate((pcbnew.F_Cu, pcbnew.B_Cu)):
                    if gi.IsOnLayer(L):
                        bb = gi.GetBoundingBox()
                        i1, i2, j1, j2 = self._box_cells(to(bb.GetLeft()) - OX, to(bb.GetTop()) - OY,
                                                         to(bb.GetRight()) - OX, to(bb.GetBottom()) - OY)
                        self.occ[li, i1:i2 + 1, j1:j2 + 1] = -1
            for pad in fp.Pads():
                bb = pad.GetBoundingBox()
                bx1, by1 = to(bb.GetLeft()) - OX, to(bb.GetTop()) - OY
                bx2, by2 = to(bb.GetRight()) - OX, to(bb.GetBottom()) - OY
                net = pad.GetNetname()
                layers = [li for li, L in enumerate((pcbnew.F_Cu, pcbnew.B_Cu)) if pad.IsOnLayer(L)]
                val = self.nid.get(net, -1) if net else -1
                i1, i2, j1, j2 = self._box_cells(bx1, by1, bx2, by2)
                hw, hh = (bx2 - bx1) / 2, (by2 - by1) / 2
                try:
                    shp = pad.GetShape(pcbnew.F_Cu if 0 in layers else pcbnew.B_Cu)
                except TypeError:
                    shp = pad.GetShape()
                rr = min(hw, hh) if shp in (pcbnew.PAD_SHAPE_CIRCLE, pcbnew.PAD_SHAPE_OVAL) else 0.0
                if layers:
                    self.shapes.append((tuple(layers), val, "rr", ((bx1 + bx2) / 2, (by1 + by2) / 2, hw, hh, rr)))
                if pad.HasHole():
                    d = pad.GetDrillSize()
                    hr = max(to(d.x), to(d.y)) / 2
                    self.shapes.append(((0, 1), val, "rr", ((bx1 + bx2) / 2, (by1 + by2) / 2, hr, hr, hr)))
                if net and val > 0:
                    # interior cells (centre inside pad, 0.05 mm margin) are valid start/goal points
                    # (KiCad hit-test, so round/oval pads exclude their bounding-box corners)
                    m = np.zeros((self.ny, self.nx), dtype=bool)
                    for ii in range(i1, i2 + 1):
                        for jj in range(j1, j2 + 1):
                            if pad.HitTest(V(jj * GRID, ii * GRID), mm(-0.05)):
                                m[ii, jj] = True
                    if not m.any():
                        ci, cj = self.cell((bx1 + bx2) / 2, (by1 + by2) / 2)
                        m[ci, cj] = True
                    self.pads.setdefault(net, []).append((tuple(layers), m, f"{fp.GetReference()}.{pad.GetNumber()}"))

    @staticmethod
    def dilate(mask, r):
        if r <= 0:
            return mask.copy()
        out = mask.copy()
        H, W = mask.shape
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                if di * di + dj * dj > r * r + r:  # disc
                    continue
                src = mask[max(0, -di):H - max(0, di), max(0, -dj):W - max(0, dj)]
                out[max(0, di):H - max(0, -di), max(0, dj):W - max(0, -dj)] |= src
        return out

    def _dist(self, kind, prm, i1, i2, j1, j2):
        X = self.X[i1:i2, j1:j2]
        Y = self.Y[i1:i2, j1:j2]
        if kind == "rr":
            cx, cy, hw, hh, r = prm
            qx = np.abs(X - cx) - (hw - r)
            qy = np.abs(Y - cy) - (hh - r)
            return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
        x1, y1, x2, y2, hw = prm
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = np.clip(((X - x1) * dx + (Y - y1) * dy) / L2, 0, 1) if L2 > 0 else 0.0
        return np.hypot(X - (x1 + t * dx), Y - (y1 + t * dy)) - hw

    def _block(self, out, layers_sel, nid, extra):
        """Mark cells closer than (clearance + extra) to copper of other nets."""
        for layers, sid, kind, prm in self.shapes:
            if sid == nid and sid > 0:
                continue
            clr = (0.3 + 0.08 if sid in self.blocked_ids else CLR) + extra
            if kind == "rr":
                cx, cy, hw, hh, _ = prm
                bx1, by1, bx2, by2 = cx - hw, cy - hh, cx + hw, cy + hh
            else:
                x1, y1, x2, y2, hw = prm
                bx1, by1, bx2, by2 = min(x1, x2) - hw, min(y1, y2) - hw, max(x1, x2) + hw, max(y1, y2) + hw
            i1, i2, j1, j2 = self._box_cells(bx1 - clr, by1 - clr, bx2 + clr, by2 + clr)
            d = self._dist(kind, prm, i1, i2 + 1, j1, j2 + 1)
            hit = d < clr
            for li in layers:
                if li in layers_sel:
                    out[li][i1:i2 + 1, j1:j2 + 1] |= hit

    def free_mask(self, nid, width):
        r = int(math.ceil((CLR + width / 2) / GRID))
        rv = int(math.ceil((CLR + VIA_D / 2) / GRID))
        hard = [self.occ[li] == -1 for li in (0, 1)]
        blocked = [self.dilate(hard[li], r) for li in (0, 1)]
        self._block(blocked, (0, 1), nid, width / 2)
        vb = [self.dilate(hard[li], rv) for li in (0, 1)]
        self._block(vb, (0, 1), nid, VIA_D / 2)
        return [~blocked[0], ~blocked[1]], ~(vb[0] | vb[1])

    def astar(self, src, goal, free, via_ok, layer_cost=(1.0, 1.6)):
        H, W = self.ny, self.nx
        gi = np.argwhere(goal[0] | goal[1])
        if len(gi) == 0:
            return None
        # heuristic: distance to nearest goal cell (sampled)
        samp = gi[:: max(1, len(gi) // 200)]
        def h(i, j):
            d = np.min(np.hypot(samp[:, 0] - i, samp[:, 1] - j))
            return float(d)
        openh = []
        g = {}
        parent = {}
        for li in (0, 1):
            for i, j in np.argwhere(src[li]):
                s = (li, int(i), int(j))
                g[s] = 0.0
                parent[s] = None
                heapq.heappush(openh, (h(i, j), 0.0, s))
        moves = [(0, 1, 1.0), (1, 0, 1.0), (0, -1, 1.0), (-1, 0, 1.0),
                 (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142)]
        hcache = {}
        expanded = 0
        while openh:
            f, gc, s = heapq.heappop(openh)
            if gc > g.get(s, 1e18):
                continue
            li, i, j = s
            if goal[li][i, j]:
                path = []
                while s is not None:
                    path.append(s)
                    s = parent[s]
                return path[::-1]
            expanded += 1
            if expanded > 2000000:
                return None
            for di, dj, c in moves:
                ni, nj = i + di, j + dj
                if not (0 <= ni < H and 0 <= nj < W) or not free[li][ni, nj]:
                    continue
                if di and dj and not (free[li][i, nj] and free[li][ni, j]):
                    continue  # no corner cutting next to obstacles
                ns = (li, ni, nj)
                ng = gc + c * layer_cost[li]
                if ng < g.get(ns, 1e18):
                    g[ns] = ng
                    parent[ns] = s
                    hv = hcache.get((ni, nj))
                    if hv is None:
                        hv = hcache[(ni, nj)] = h(ni, nj)
                    heapq.heappush(openh, (ng + hv, ng, ns))
            if via_ok[i, j]:
                ns = (1 - li, i, j)
                if free[1 - li][i, j]:
                    ng = gc + 12.0
                    if ng < g.get(ns, 1e18):
                        g[ns] = ng
                        parent[ns] = s
                        heapq.heappush(openh, (ng + hcache.get((i, j), h(i, j)), ng, ns))
        return None

    def commit(self, net, path, width):
        nid = self.nid[net]
        segs = []
        for a, b in zip(path, path[1:]):
            if a[0] != b[0]:
                self.vias.append((net, a[1], a[2]))
                self.shapes.append(((0, 1), nid, "rr", (a[2] * GRID, a[1] * GRID, VIA_D / 2, VIA_D / 2, VIA_D / 2)))
            else:
                segs.append((a, b))
        for a, b in segs:
            self.shapes.append(((a[0],), nid, "seg", (a[2] * GRID, a[1] * GRID, b[2] * GRID, b[1] * GRID, width / 2)))
        # merge collinear segments
        merged = []
        for a, b in segs:
            if merged:
                pa, pb = merged[-1]
                if pb == a and pa[0] == a[0] and (pb[1] - pa[1], pb[2] - pa[2]) != (0, 0):
                    d1 = (np.sign(pb[1] - pa[1]), np.sign(pb[2] - pa[2]))
                    d2 = (np.sign(b[1] - a[1]), np.sign(b[2] - a[2]))
                    if d1 == d2:
                        merged[-1] = (pa, b)
                        continue
            merged.append((a, b))
        for a, b in merged:
            self.tracks.append((net, a[0], a[1], a[2], b[1], b[2], width))

    def route_net(self, net, width):
        pads = self.pads.get(net, [])
        if len(pads) < 2:
            return []
        nid = self.nid[net]
        tree = [np.zeros((self.ny, self.nx), dtype=bool) for _ in (0, 1)]
        layers, m, _ = pads[0]
        for li in layers:
            tree[li] |= m
        failures = []
        remaining = list(pads[1:])
        # nearest-first ordering
        def dist(p):
            c = np.argwhere(p[1])[0]
            t = np.argwhere(tree[0] | tree[1])
            return float(np.min(np.hypot(t[:, 0] - c[0], t[:, 1] - c[1])))
        while remaining:
            remaining.sort(key=dist)
            layers, m, name = remaining.pop(0)
            # already touching tree?
            if any((tree[li] & m).any() for li in layers):
                continue
            free, via_ok = self.free_mask(nid, width)
            src = [m & free[0] if 0 in layers else np.zeros_like(m), m & free[1] if 1 in layers else np.zeros_like(m)]
            for li in (0, 1):
                if li in layers:
                    src[li] = m.copy()
                    free[li] = free[li] | m
            goal = [tree[0] & free[0], tree[1] & free[1]]
            for li in (0, 1):
                goal[li] = goal[li] | (tree[li])
                free[li] = free[li] | tree[li]
            path = self.astar(src, goal, free, via_ok)
            if path is None:
                failures.append(name)
                continue
            self.commit(net, path, width)
            for li, i, j in path:
                tree[li][i, j] = True
            for li in layers:
                tree[li] |= m
        return failures

    def gnd_stitch(self, net="GND"):
        """Connect each SMD GND pad to the bottom GND plane with a short stub + via."""
        nid = self.nid[net]
        done = []
        for layers, m, name in self.pads.get(net, []):
            if layers != (0,):
                continue
            free, via_ok = self.free_mask(nid, 0.3)
            src = [m.copy(), np.zeros_like(m)]
            free[0] = free[0] | m
            # goal: any cell on F.Cu within 3 mm where a via fits
            c = np.argwhere(m)[0]
            win = np.zeros_like(m)
            r = int(5.0 / GRID)
            win[max(0, c[0] - r):c[0] + r + 1, max(0, c[1] - r):c[1] + r + 1] = True
            goal = [win & via_ok & free[0] & ~self.dilate(m, int(math.ceil(0.7 / GRID))), np.zeros_like(m)]
            # ...or any other GND copper already present (pads, stitch tracks)
            for L2, m2, n2 in self.pads.get(net, []):
                if n2 != name and 0 in L2:
                    goal[0] |= (m2 & win)
            for lay, sid, kind, prm in self.shapes:
                if sid == nid and kind == "seg" and 0 in lay:
                    x1, y1, x2, y2, _ = prm
                    for (xx, yy) in ((x1, y1), (x2, y2)):
                        ci, cj = self.cell(xx, yy)
                        if win[ci, cj]:
                            goal[0][ci, cj] = True
            path = self.astar(src, goal, free, np.zeros_like(via_ok))
            if path is None:
                done.append((name, False))
                continue
            self.commit(net, path, 0.3)
            li, i, j = path[-1]
            if not via_ok[i, j] or not win[i, j] or any(m2[i, j] for L2, m2, n2 in self.pads.get(net, []) if n2 != name):
                done.append((name, True))
                continue  # ended on existing GND copper: no via needed
            self.vias.append((net, i, j))
            self.shapes.append(((0, 1), nid, "rr", (j * GRID, i * GRID, VIA_D / 2, VIA_D / 2, VIA_D / 2)))
            done.append((name, True))
        return done

    def emit(self, board):
        layer = (pcbnew.F_Cu, pcbnew.B_Cu)
        for net, li, i1, j1, i2, j2, w in self.tracks:
            t = pcbnew.PCB_TRACK(board)
            t.SetStart(V(j1 * GRID, i1 * GRID))
            t.SetEnd(V(j2 * GRID, i2 * GRID))
            t.SetWidth(mm(w))
            t.SetLayer(layer[li])
            t.SetNet(self.netinfo[net])
            board.Add(t)
        seen = set()
        for net, i, j in self.vias:
            if (i, j) in seen:
                continue
            seen.add((i, j))
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(V(j * GRID, i * GRID))
            v.SetViaType(pcbnew.VIATYPE_THROUGH)
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetWidth(mm(VIA_D))
            v.SetDrill(mm(VIA_DRILL))
            v.SetNet(self.netinfo[net])
            board.Add(v)


def main(netpath):
    comps, pinnets = load_netlist(netpath)
    board, netinfo = build_board(comps, pinnets)

    router = Router(board, netinfo)
    report = {"grid_mm": GRID, "clearance_mm": CLR, "routed": [], "failed": {}, "blocked": sorted(BLOCKED),
              "gnd": "pour on F.Cu and B.Cu; SMD GND pads stitched by via"}
    order = [n for n in netinfo if short(n) not in BLOCKED and n != "GND" and not n.startswith("unconnected-")]
    # power first, then short nets first
    first = ("SERVO_PWM", "PUMP_EN")  # pins hemmed in at the DevKitC socket: route before their neighbours
    order.sort(key=lambda n: (short(n) not in first, not is_power(short(n)), len(router.pads.get(n, []))))
    if os.environ.get("TAPH_NO_ROUTE"):
        order = []
    for net in order:
        w = POWER_W if is_power(short(net)) else SIGNAL_W
        fails = router.route_net(net, w)
        if fails:
            report["failed"][net] = fails
        else:
            report["routed"].append(net)
        print(f"{net:16s} w={w} {'OK' if not fails else 'FAILED ' + str(fails)}", flush=True)
    stitched = router.gnd_stitch() if order else []
    report["gnd_stitch_failed"] = [n for n, ok in stitched if not ok]
    router.emit(board)

    # pours & rule areas
    gnd = netinfo["GND"]
    for L in (pcbnew.F_Cu, pcbnew.B_Cu):
        add_zone(board, L, gnd, 0, 0, BW, BH)
    both = pcbnew.LSET()
    both.AddLayer(pcbnew.F_Cu)
    both.AddLayer(pcbnew.B_Cu)
    add_zone(board, pcbnew.F_Cu, None, *ANTENNA_KEEPOUT, rule=both, name="ANTENNA KEEPOUT (DevKitC module - CONFIRM)")
    for name, (x1, y1, x2, y2) in BLOCKED_REGIONS.items():
        add_zone(board, pcbnew.F_Cu, None, x1, y1, x2, y2, rule=both, name=name)
        add_text(board, name, x1 + 0.8, y2 - 1.6, 0.8, pcbnew.Cmts_User)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())

    add_text(board, "TAPH ESP32 CARRIER REV 0 - PRELIMINARY - NOT FOR FABRICATION", 10, 2.5, 1.0, bold=True)
    add_text(board, "DevKitC: CONFIRM board, pinout, 25.40mm rows", 64, 57.5, 0.8, pcbnew.F_SilkS)
    add_text(board, "No mains. Pump/servo power routing BLOCKED pending measured currents.", 120, 2.5, 1.0, pcbnew.B_SilkS)
    board.GetDesignSettings().SetAuxOrigin(V(0, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcbnew.SaveBoard(str(OUT), board)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("saved", OUT, "routed", len(report["routed"]), "failed", len(report["failed"]))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(REV0 / "build" / "taph_carrier_rev0.net"))
