"""Load KiCad stock / project symbols and footprints (read-only)."""
from __future__ import annotations

import copy
import os
from functools import lru_cache
from pathlib import Path

from sexp import QStr, find, findall, parse

KICAD = Path(os.environ.get("KICAD_ROOT", r"C:/Users/Admin/AppData/Local/Programs/KiCad/10.0"))
SYMDIR = KICAD / "share/kicad/symbols"
FPDIR = KICAD / "share/kicad/footprints"
HERE = Path(__file__).resolve().parent
PROJECT_SYMLIBS = {"TAPH_Rev0": HERE.parent / "kicad" / "libs" / "TAPH_Rev0.kicad_sym"}


@lru_cache(maxsize=None)
def _symlib(lib: str):
    path = PROJECT_SYMLIBS.get(lib, SYMDIR / f"{lib}.kicad_sym")
    tree = parse(path.read_text(encoding="utf-8"))
    return {s[1]: s for s in findall(tree, "symbol")}


def symbol(lib_id: str):
    """Return a flattened copy of a library symbol, renamed to lib_id."""
    lib, name = lib_id.split(":", 1)
    syms = _symlib(lib)
    s = copy.deepcopy(syms[name])
    ext = find(s, "extends")
    if ext is not None:
        parent = symbol(f"{lib}:{ext[1]}")
        # child properties override parent; parent graphics/pins kept
        props = {p[1]: p for p in findall(s, "property")}
        out = [parent[0], QStr(lib_id)]
        for c in parent[2:]:
            if isinstance(c, list) and c and c[0] == "property" and c[1] in props:
                out.append(props.pop(c[1]))
            elif isinstance(c, list) and c and c[0] == "symbol":
                c = copy.deepcopy(c)
                c[1] = QStr(c[1].replace(ext[1], name, 1))
                out.append(c)
            else:
                out.append(c)
        out.extend(props.values())
        s = out
    s[1] = QStr(lib_id)
    # sub-unit names must use the bare symbol name
    for c in s:
        if isinstance(c, list) and c and c[0] == "symbol":
            sub = str(c[1])
            if not sub.startswith(name + "_"):
                suffix = sub.split("_")[-2:]
                c[1] = QStr(name + "_" + "_".join(suffix))
    return s


def pins(sym):
    """List of dicts: number, name, type, x, y, angle, unit (lib coords, Y up)."""
    out = []
    for unit in findall(sym, "symbol"):
        parts = str(unit[1]).split("_")
        unit_no = int(parts[-2])
        for p in findall(unit, "pin"):
            at = find(p, "at")
            out.append({
                "type": p[1],
                "number": str(find(p, "number")[1]),
                "name": str(find(p, "name")[1]),
                "x": float(at[1]), "y": float(at[2]), "angle": float(at[3]) if len(at) > 3 else 0.0,
                "length": float(find(p, "length")[1]),
                "unit": unit_no,
            })
    return out


@lru_cache(maxsize=None)
def footprint(fp_id: str):
    lib, name = fp_id.split(":", 1)
    path = FPDIR / f"{lib}.pretty" / f"{name}.kicad_mod"
    return parse(path.read_text(encoding="utf-8"))


def footprint_exists(fp_id: str) -> bool:
    lib, name = fp_id.split(":", 1)
    return (FPDIR / f"{lib}.pretty" / f"{name}.kicad_mod").exists()
