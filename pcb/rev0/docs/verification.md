# Verification record: rev 0 preliminary design

Tool: **KiCad 10.0.7** (`kicad-cli`, installed 2026-11-07 via winget package `KiCad.KiCad`), Windows 11.
Reproduce with `bash pcb/rev0/tools/build.sh && bash pcb/rev0/tools/export.sh`. The raw reports are
`exports/erc_report.txt` and `exports/drc_report.txt`.

> Passing ERC/DRC shows that the files are self-consistent against the rules entered. It is **not**
> evidence that the circuit is safe, that the external components are compatible, or that the board can
> be manufactured or energized.

## 1. Schematic: ERC (`kicad-cli sch erc --severity-all`)

| Result | Count |
|---|---:|
| Errors | **0** |
| Warnings | **0** |
| Exclusions | 0 |

Checks that KiCad ignores by default and that were left at their defaults: "global label only appears
once", "four connection points joined", "SPICE model issue", "footprint doesn't match footprint filters".
No severity was changed and nothing was excluded to obtain this result.

`PWR_FLAG` markers sit on three nets: `VIN_PROT` (fed from J1 through F1/D1), `+5V_ESP` (fed through D3)
and `GND`. These nets are genuinely powered from connectors or through diodes, so the flags are driver
annotations, not error suppression.

### Netlist consistency check (against `design.py`)

`tools/check_netlist.py` compares KiCad's **exported** netlist with the connections declared in
`tools/design.py`, pin by pin. Result: **252 pins / 47 nets match; 0 mismatches.**

Scope: this confirms that the drawn schematic is *consistent* with `design.py`. It detects drawing and
generation errors, such as labels that look attached but are not. It is **not** an independent check of
electrical correctness: `design.py` and the schematic express the same design intent, so a wrong design
decision passes. Electrical correctness depends on human review, datasheet checks and bench validation
(review finding R1-7).

## 2. PCB: DRC (`kicad-cli pcb drc --severity-all --schematic-parity`)

| Category | Count | Severity | Assessment |
|---|---:|---|---|
| Schematic parity issues | **0** | – | Every footprint matches its symbol (reference, value, footprint, fields, net) |
| Clearance / short / courtyard / hole / edge violations | **0** | – | |
| Unconnected items | **35** | error | **Expected and intentional.** All 35 are on the BLOCKED pump/servo power nets (`+12V_PUMP` 16, `PGND` 12, `SERVO_V+` 10, `SERVO_GND` 10, `PUMP_SW` 8, `PUMP_SRC` 6, `SERVO_VIN_RAW` 4, `PUMP_VIN_RAW` 4; KiCad counts each missing link as two endpoints). No logic, signal or analog net is unconnected. |
| Starved thermal relief | **4** | error | GND pour reaches J15 pin 7 (both layers), J8 pin 2 and C18 pin 2 with 1 of the required 2 spokes. Each is electrically connected, but the connection is weak. **Unresolved:** fix during manual layout review. The spoke rule was not relaxed. |
| Silkscreen overlap / over copper | **2** | warning | R11 reference text overlaps J5 silkscreen and pad. Cosmetic; unresolved. |

Checks that KiCad ignores by default (unchanged): "footprint has no courtyard", "track endpoint not
centered on via", "tuning profile geometries", "footprint filters", "footprint component type".

### Routing summary (`exports/routing_report.json`)

* Router: the project's own 2-layer A* grid router (`tools/gen_pcb.py`): 0.25 mm grid, 0.2 mm design
  clearance plus a 0.08 mm margin, 0.3 mm clearance to the BLOCKED high-current nets.
* **38 of 38** non-blocked, non-GND nets routed. Logic power uses 0.6 mm, signals 0.25 mm.
  1 265 track segments and 117 vias.
* GND: pours on F.Cu and B.Cu (0.45 mm clearance). Every SMD ground pad is stitched to the bottom plane
  with a via or tied to adjacent GND copper.
* The pump and servo power nets were **deliberately not routed** (see §4).
* The routing is machine-generated and not hand-optimised: it has long diagonals under the DevKitC
  module and is not reviewed for EMI, return paths or analog layout quality.

**Overall: the board is not DRC-clean.** 41 findings remain open: 35 unconnected, 4 starved-thermal errors
and 2 silkscreen warnings. They are preserved unexcluded (review finding R1-6).

## 2a. Open design-review findings

Independent review R1 of PR #8 raised seven findings. They are recorded with technical responses in
`docs/review_log.md`, and five of them (R1-1 to R1-5) require design changes that have **not** been
applied yet:
pump/servo reverse polarity (C7/C11 reverse-biased; fuse-cleared fault through Q1/D5/R5), shared-ground
return paths, U4 back-feed into an unpowered servo, the generator sense ground bond, and ADC full-scale
margins.

## 3. Board rules used (provisional)

| Rule | Value | Basis |
|---|---|---|
| Layers | 2 | Requirement |
| Min. clearance / track | 0.2 mm / 0.2 mm | Conservative for common 2-layer prototype services; **match to the chosen fab** |
| Via | 0.8 mm / 0.4 mm drill | Conservative |
| Copper to edge | 0.5 mm | Conservative |
| Netclass `Power_Logic` | 0.6 mm | ≤ ~1 A logic loads (estimate, not a measured current) |
| Netclasses `Pump_HighCurrent_BLOCKED` / `Servo_Power_BLOCKED` | 2.0 / 1.5 mm, 0.3 mm clearance | **Placeholders only**; not derived from a current rating |

## 4. Unresolved blockers (layout stopped here on purpose)

| # | Blocker | Blocks |
|---|---|---|
| B1 | Pump running, stall and inrush current | Pump copper width, F2 rating, Q1 adequacy and thermal design, R5 shunt value and power, INA180 gain, J2/J3 terminal rating |
| B2 | Servo model: supply voltage, stall current, signal level, unpowered/unpulsed behaviour | Servo copper width, F3, C11, D7, J5 header suitability, mechanical safe state |
| B3 | Generator type (DC, rectified AC or 3-phase), open-circuit voltage, load current, isolation requirement | R17/R18 divider, D11, whether J9 may be bonded to logic GND, choice of current sensor (J10 vs I2C) |
| B4 | Actual dev board (DevKitC V4 or a clone, WROOM or WROVER), pin order, row spacing, antenna position | J14/J15 footprint positions, GPIO map, antenna keep-out |
| B5 | Supplies: one shared 12 V source or separate sources; battery or charger presence; max/min voltage | TVS selection, U1 derating, F1 rating, ground-loop treatment (Q2 in the questions list) |
| B6 | Flow, RPM and pitch sensor models (supply voltage, output type, pulse rate) | Solder-jumper settings, pull-up/filter values |
| B7 | Enclosure and mounting | Board outline, hole positions, connector orientation |

## 5. Assumptions that need physical confirmation

1. A **12 V nominal** DC supply for logic and pump (requirement text). The real range is unknown.
2. Espressif DevKitC V4 header pinout (J2/J3 tables in the Espressif user guide) and **25.40 mm** row spacing.
3. IO26 is not driven during boot and has no internal pull-up strong enough to beat 10 kΩ (ESP32
   documentation; not observed on this module).
4. The ESP32 ADC usable range is ~0.15–2.45 V at 11 dB attenuation (recalled from Espressif documentation;
   confirm for the exact chip revision).
5. The common hobby-servo lead order is S / + / − and the common SSD1306 module order is
   GND / VCC / SCL / SDA. Both vary between suppliers.
6. Candidate parts (TSR 1-2450, AO3400A, INA180A1, 74AHCT1G125, BAT54S, SS34/SS14, SMBJ18CA,
   Keystone 3568, Phoenix MKDS) were chosen from general knowledge of their families. **None of their
   ratings has been re-checked against a datasheet in this session.** Every rating quoted in notes is
   marked for verification.
7. Footprints: every footprint is a stock KiCad 10.0.7 library footprint. Their *existence* is
   verified, but whether each matches the specific purchased part (e.g. the TSR-1 pinout, the Keystone
   3568 holder, the JST XH variant) is not.

## 6. What was not done

* No Gerber, drill, pick-and-place or fabrication output was generated (the export script omits them on
  purpose).
* No SPICE, thermal or signal-integrity simulation.
* No part was ordered, no board fabricated, nothing energized.
* Firmware was not changed. `firmware/esp32/taph_reliability` still has every pin set to `-1`, and
  the new channels have no firmware support.
* The historical artifacts, existing firmware, simulations and documents were not modified. All new work
  is under `pcb/rev0/`.
