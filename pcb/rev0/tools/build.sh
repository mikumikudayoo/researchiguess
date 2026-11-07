#!/usr/bin/env bash
# Regenerate the rev0 KiCad project from design.py and run verification.
# Usage: bash pcb/rev0/tools/build.sh [--no-pcb]
# Requires KiCad 10 (kicad-cli). Set KICAD_ROOT if not at the default location.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REV0="$(dirname "$HERE")"
KICAD_ROOT="${KICAD_ROOT:-C:/Users/Admin/AppData/Local/Programs/KiCad/10.0}"
KCLI="$KICAD_ROOT/bin/kicad-cli.exe"
[ -x "$KCLI" ] || KCLI="$(command -v kicad-cli)"
KPY="$KICAD_ROOT/bin/python.exe"
PY="${PYTHON:-python}"
B="$REV0/build"
mkdir -p "$B"
cd "$HERE"
"$PY" gen_symbols.py
"$PY" gen_project.py
"$PY" gen_sch.py
"$PY" gen_bom.py
cd "$REV0/kicad"
"$KCLI" sch erc --format report --severity-all -o "$B/erc_report.txt" taph_carrier_rev0.kicad_sch
"$KCLI" sch erc --format json --severity-all -o "$B/erc_report.json" taph_carrier_rev0.kicad_sch
"$KCLI" sch export netlist --format kicadsexpr -o "$B/taph_carrier_rev0.net" taph_carrier_rev0.kicad_sch
(cd "$HERE" && "$PY" check_netlist.py "$B/taph_carrier_rev0.net")
if [ "${1:-}" != "--no-pcb" ]; then
  (cd "$HERE" && "$KPY" gen_pcb.py "$B/taph_carrier_rev0.net")
  "$KCLI" pcb drc --format report --severity-all --schematic-parity -o "$B/drc_report.txt" taph_carrier_rev0.kicad_pcb || true
  "$KCLI" pcb drc --format json --severity-all --schematic-parity -o "$B/drc_report.json" taph_carrier_rev0.kicad_pcb || true
fi
echo "build complete"
