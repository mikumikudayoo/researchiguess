# TAPH ESP32 carrier PCB: rev 0 preliminary design package

**Status: PRELIMINARY DESIGN FOR REVIEW. NOT FOR FABRICATION, ASSEMBLY OR ENERGIZATION.**
Prepared 2026-11-07 for the research adviser/consultant meeting on 2026-11-08. The board must not be
represented as manufacturable or safe to power until the actual components and this design have been
reviewed. A clean ERC/DRC is not proof of operational safety.

## What this is

A native, editable **KiCad 10** project for a modular two-layer carrier board. The board takes a socketed
classic-ESP32 development board (provisionally an Espressif ESP32-DevKitC V4, **to be confirmed**) and
provides:

* externally supplied low-voltage DC inputs, each a separate isolation point: logic, pump and servo;
* input protection and a 5 V regulator module for logic;
* a pump switch that is **off by hardware default**, with a hardware enable jumper;
* a buffered servo PWM output with its own supply entry;
* a flow sensor input plus optional RPM and pitch-feedback inputs;
* a generator voltage-sense input and a generator current-sensor interface (analog or I2C);
* separate pump current and pump supply-voltage measurement;
* an OLED (I2C) socket, I2C expansion and spare GPIO;
* 20 labelled test points.

No mains voltage is routed on the PCB, and generator power does not pass through it.

## Package contents

| Path | Content |
|---|---|
| `kicad/taph_carrier_rev0.kicad_pro` | KiCad project (open this) |
| `kicad/*.kicad_sch` | Hierarchical schematic: root architecture sheet + 7 block sheets |
| `kicad/taph_carrier_rev0.kicad_pcb` | Preliminary 2-layer layout (130 × 100 mm, provisional) |
| `kicad/libs/TAPH_Rev0.kicad_sym` | Project-local symbols for the two DevKitC header sockets (stock footprints) |
| `exports/taph_carrier_rev0_schematic.pdf` | **Schematic for review** (8 pages) |
| `exports/pcb/pcb_top_layers.png/.svg/.pdf`, `pcb_bottom_layers_mirrored.*`, `pcb_assembly_view_top.*` | 2-D layer views |
| `exports/pcb/render_top.png`, `render_bottom.png`, `render_iso.png` | 3-D renders (appearance only) |
| `exports/taph_carrier_rev0_kicad_bom.csv` | KiCad-exported grouped BOM with Status / candidate part / review-note fields |
| `exports/erc_report.txt`, `exports/drc_report.txt`, `exports/routing_report.json` | Verification output |
| `docs/architecture.md` | **Electrical architecture explanation** (domains, protection, default-off, front ends, layout status) |
| `docs/gpio_map.md` | **Proposed GPIO map** and the reasons for each pin |
| `docs/bom_review.md` / `.csv` | **Component list**, each part's status: implemented, provisional, TBD, optional, DNP or confirm |
| `docs/verification.md` | **ERC/DRC results**, blockers and assumptions that need physical confirmation |
| `docs/questions_for_review.md` | **Questions for the adviser and consultant** |
| `tools/` | Generators (`design.py` is the single source of design intent) and the build/export scripts |

## Designed versus conceptual

| Item | State |
|---|---|
| Schematic topology of every block | **Designed.** Electrically coherent; ERC 0 errors / 0 warnings; exported netlist verified pin-by-pin against intent |
| Logic power chain, ESP32 sockets, pump gate drive and default-off, servo buffer, pulse-input and ADC conditioning, I2C/OLED, test points | **Designed** with chosen values; candidate parts still need datasheet confirmation |
| Logic/signal/analog routing | **Preliminary.** Auto-routed by a simple project router, DRC-clean apart from the items listed in `docs/verification.md`, not hand-optimised |
| Pump power path, servo power path | **Placed, routing BLOCKED.** Widths, fuses, MOSFET and shunt depend on unmeasured currents |
| Generator voltage divider, shunt value, INA180 gain, fuse ratings, servo bulk capacitor, TVS on servo/generator inputs | **TBD** (placeholder values); blocked on external specifications |
| RPM and pitch-feedback inputs, I2C expansion, spare GPIO | **Optional** interfaces; sensors not chosen |
| Mechanical safe state of the blade/servo; generator electrical characteristics | **Conceptual / unresolved.** Not claimed by this board |
| Dev board identity, pinout, row spacing, antenna position; enclosure and mounting | **To be confirmed** physically |
| Firmware support for the new channels and this GPIO map | **Not started.** The existing firmware is unchanged |

## Reference sources and how they were used

* **Rev-0 architecture:** the requirement list in the research director's brief of 2026-11-07. A separate
  "PCB architecture rev 0" file is not present in the repository. See `docs/architecture.md` §1.
* **Historical firmware** (`sketch_aug3a.ino` at `a37d1d5`): an inventory of functions only. Its pin
  assignments are not treated as evidence of wiring; several are strapping pins and were changed.
* **Current reliability adapter** (`firmware/esp32/taph_reliability`): interface requirements (pull-up
  pulse input, raw ADC current, reviewed inactive pump level, servo PWM). Its pins stay unconfigured.
* **Tinkercad conceptual drawing:** described in audit finding F10 (Uno with substitute symbols, such
  as a PIR for the flow sensor). Treated as a conceptual block list only; its wires are not authoritative.

## Reproduce

Requires KiCad 10 (`kicad-cli` and KiCad's bundled Python with `pcbnew`) and Python 3 for the
schematic generator:

```bash
bash pcb/rev0/tools/build.sh
```

```bash
bash pcb/rev0/tools/export.sh
```

`build.sh` regenerates the symbols, project, schematic and board from `tools/design.py` and
`tools/gen_pcb.py`, then runs ERC, the netlist cross-check and DRC. The generators are deterministic
(stable UUIDs). If the design is edited by hand in KiCad, treat the KiCad files as the source of truth and
stop regenerating them.
