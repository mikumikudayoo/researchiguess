"""Write the review BOM (CSV + Markdown) from design.py.

This is a review list, not a purchasing BOM: every candidate part number and
rating must be re-verified against the current manufacturer datasheet.
"""
import csv
from collections import OrderedDict
from pathlib import Path

from design import SHEETS

DOCS = Path(__file__).resolve().parent.parent / "docs"

VERIFY = {
    "IMPLEMENTED": "Circuit function chosen; candidate part/rating still to be checked against datasheet",
    "PROVISIONAL": "Depends on an unverified external component; re-select after that spec is confirmed",
    "TBD": "Value intentionally not chosen; blocked on an unverified external spec",
    "OPTIONAL": "Populate only if this interface is adopted",
    "DNP": "Footprint reserved; do not populate in rev 0",
    "CONFIRM": "Pinout/mechanical mapping must be checked against the physical part",
}


def rows():
    out = []
    for s in SHEETS:
        for p in s.parts:
            if p.lib.startswith("Mechanical:") or p.lib == "Connector:TestPoint":
                kind = "pcb-feature"
            elif p.lib == "Device:NetTie_2" or p.lib.startswith("Jumper:SolderJumper"):
                kind = "pcb-feature"
            else:
                kind = "component"
            out.append(OrderedDict(
                ref=p.ref, sheet=s.name, kind=kind, value=p.value, footprint=p.fp,
                status=p.status, dnp="yes" if p.dnp else "no", mpn_candidate=p.mpn,
                verification=VERIFY[p.status], note=p.note))
    order = {"J": 0, "U": 1, "Q": 2, "D": 3, "F": 4, "L": 5, "R": 6, "C": 7}
    def key(r):
        import re
        m = re.match(r"([A-Z]+)(\d+)", r["ref"])
        return (r["kind"] != "component", order.get(m.group(1)[0], 9), m.group(1), int(m.group(2)))
    return sorted(out, key=key)


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    rs = rows()
    with open(DOCS / "bom_review.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rs[0].keys()))
        w.writeheader()
        w.writerows(rs)
    counts = {}
    for r in rs:
        if r["kind"] == "component":
            counts[r["status"]] = counts.get(r["status"], 0) + 1
    md = ["# Rev 0 review component list", "",
          "Generated from `tools/design.py` (`python tools/gen_bom.py`). **Not a purchasing BOM.** "
          "No part has been bought, sampled or measured. *Candidate* part numbers name a part family that fits the circuit "
          "function; every rating must be re-checked against the current manufacturer datasheet before it is used.", "",
          "| Status | Meaning | Components |", "|---|---|---:|"]
    for k, v in VERIFY.items():
        md.append(f"| **{k}** | {v} | {counts.get(k, 0)} |")
    md += ["", "Nothing on this list is marked *verified*: no physical part, sample or datasheet check has been recorded for this board yet.", "",
           "## Components", "", "| Ref | Sheet | Value | Footprint (KiCad stock library) | Status | Candidate part | Review note |",
           "|---|---|---|---|---|---|---|"]
    for r in rs:
        if r["kind"] != "component":
            continue
        val = r["value"] + (" (DNP)" if r["dnp"] == "yes" else "")
        md.append(f"| {r['ref']} | {r['sheet']} | {val} | `{r['footprint']}` | {r['status']} | {r['mpn_candidate']} | {r['note']} |")
    md += ["", "## PCB features (not purchased parts)", "", "| Ref | Function | Footprint | Status | Note |", "|---|---|---|---|---|"]
    for r in rs:
        if r["kind"] == "component":
            continue
        md.append(f"| {r['ref']} | {r['value']} | `{r['footprint']}` | {r['status']} | {r['note']} |")
    md.append("")
    (DOCS / "bom_review.md").write_text("\n".join(md), encoding="utf-8")
    print("BOM rows:", len(rs), counts)


if __name__ == "__main__":
    main()
