#!/usr/bin/env bash
# Export the review package (no Gerbers / drill / pick-and-place: this board is NOT released for fabrication).
# Usage: bash pcb/rev0/tools/export.sh   (run tools/build.sh first)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REV0="$(dirname "$HERE")"
KICAD_ROOT="${KICAD_ROOT:-C:/Users/Admin/AppData/Local/Programs/KiCad/10.0}"
KCLI="$KICAD_ROOT/bin/kicad-cli.exe"
[ -x "$KCLI" ] || KCLI="$(command -v kicad-cli)"
E="$REV0/exports"
rm -rf "$E"
mkdir -p "$E/schematic_svg" "$E/pcb"
cd "$REV0/kicad"
SCH=taph_carrier_rev0.kicad_sch
PCB=taph_carrier_rev0.kicad_pcb

"$KCLI" sch export pdf -o "$E/taph_carrier_rev0_schematic.pdf" "$SCH"
"$KCLI" sch export svg -o "$E/schematic_svg" "$SCH"
"$KCLI" sch export netlist --format kicadsexpr -o "$E/taph_carrier_rev0.net" "$SCH"
"$KCLI" sch export bom -o "$E/taph_carrier_rev0_kicad_bom.csv" \
  --fields 'Reference,Value,Footprint,${QUANTITY},${DNP},Status,MPN_candidate,Review_note' \
  --labels 'Refs,Value,Footprint,Qty,DNP,Status,Candidate part,Review note' \
  --group-by 'Value,Footprint,Status' --exclude-dnp "$SCH" || \
  "$KCLI" sch export bom -o "$E/taph_carrier_rev0_kicad_bom.csv" "$SCH"

# 2-D layer views (board area only)
"$KCLI" pcb export svg --mode-single --page-size-mode 2 --exclude-drawing-sheet \
  -l F.Cu,F.Mask,F.SilkS,F.Fab,Edge.Cuts,User.Comments -o "$E/pcb/pcb_top_layers.svg" "$PCB"
"$KCLI" pcb export svg --mode-single --page-size-mode 2 --exclude-drawing-sheet --mirror \
  -l B.Cu,B.Mask,B.SilkS,Edge.Cuts -o "$E/pcb/pcb_bottom_layers_mirrored.svg" "$PCB"
"$KCLI" pcb export svg --mode-single --page-size-mode 2 --exclude-drawing-sheet \
  -l F.SilkS,F.Fab,F.Courtyard,Edge.Cuts,User.Comments --sketch-pads-on-fab-layers --crossout-DNP-footprints-on-fab-layers \
  -o "$E/pcb/pcb_assembly_view_top.svg" "$PCB"
"$KCLI" pcb export pdf --mode-single \
  -l F.Cu,F.SilkS,F.Fab,Edge.Cuts,User.Comments -o "$E/pcb/pcb_top_layers.pdf" "$PCB" || true
"$KCLI" pcb export pdf --mode-single --mirror \
  -l B.Cu,B.SilkS,Edge.Cuts -o "$E/pcb/pcb_bottom_layers_mirrored.pdf" "$PCB" || true

# 3-D renders (stock KiCad 3-D models; appearance only)
"$KCLI" pcb render --side top --quality high -w 1800 -h 1400 --background opaque -o "$E/pcb/render_top.png" "$PCB" || true
"$KCLI" pcb render --side bottom --quality high -w 1800 -h 1400 --background opaque -o "$E/pcb/render_bottom.png" "$PCB" || true
"$KCLI" pcb render --perspective --rotate '-40,0,25' --quality high -w 1800 -h 1300 --background opaque \
  -o "$E/pcb/render_iso.png" "$PCB" || true

# verification reports
"$KCLI" sch erc --format report --severity-all -o "$E/erc_report.txt" "$SCH"
"$KCLI" pcb drc --format report --severity-all --schematic-parity -o "$E/drc_report.txt" "$PCB" || true
cp "$REV0/build/routing_report.json" "$E/routing_report.json" 2>/dev/null || true
echo "exports written to $E"
