# Design review log: rev 0

Findings are recorded here with a technical response and a proposed action. **None of the proposed
actions has been applied to the schematic or layout yet.** Design changes wait for the adviser/consultant
review and the research director's authorization. The board remains not approved for fabrication or
energization, and nothing is merged.

## R1: independent review of PR #8 (ChatGPT, received 2026-11-07)

Reviewer's overall verdict: the package is suitable for the 2026-11-08 adviser meeting. It is not approved
for fabrication or energization.

| ID | Finding (summary) | Response | Status |
|---|---|---|---|
| R1-1 | Pump reverse-polarity protection relies on the fuse clearing a semiconductor fault | **Agree.** The protection is inadequate as drawn | Open: design change proposed |
| R1-2 | Shared-ground return paths between the logic, pump and servo supplies | **Agree.** The single-point joins only work if the supplies are wired for them | Open: blocked on supply decision (B5) |
| R1-3 | U4 output enable permanently grounded; unpowered-servo drive and sequencing | **Agree.** A back-feed path exists | Open: design change proposed |
| R1-4 | Generator voltage-sense ground connection | **Agree.** Already unresolved (B3); restated with failure modes | Open: blocked on generator data |
| R1-5 | 10 k/10 k generator-current divider full scale vs the ESP32 ADC range | **Agree.** The documented validity condition was wrong | Open: value reclassified to TBD in docs |
| R1-6 | Preserve the unresolved DRC findings; the board is not DRC-clean | **Agree.** Wording corrected | Documentation corrected |
| R1-7 | Netlist cross-check verifies consistency with `design.py`, not electrical correctness | **Agree.** Wording corrected | Documentation corrected |

### R1-1: pump reverse polarity

**Analysis.** With J2 reversed, PGND becomes the positive rail. Fault current flows
PGND → R5 (shunt) → Q1 body diode (source to drain) → PUMP_SW → D5 (anode to cathode) → +12V_PUMP → F2 → J2.
It is limited only by source impedance until F2 clears. In the same event:

* **C7 (100 µF polarized electrolytic) is reverse-biased at about −12 V.** That alone can damage or vent
  it, whether or not F2 clears.
* R5, Q1's body diode and D5 must survive the fuse's let-through (I²t). None of those surge ratings has
  been checked against a fuse that has not been chosen yet (B1).
* The voltage across R5 places U3 (INA180) IN+ below logic GND. Whether that stays inside the INA180's
  input limits depends on the fault current and the shunt value (datasheet limit not yet checked).
* The pump itself is shunted by D5 and sees only a diode drop, so it is not the main risk.

The same class of problem exists on **J4 (servo input)**: there is no reverse-polarity element at all,
C11 is polarized, and a reversed supply reaches the servo directly through J5. This was not in the review
but is recorded here for completeness. The logic input J1 is protected by series D1.

**Proposed action (rev 0.1, after B1/B2 are known).** Add a series reverse-polarity stage on PUMP_VIN and
SERVO_VIN. A P-channel MOSFET or an ideal-diode controller avoids the drop of a series diode at pump
current. Alternatively, use a keyed, polarized connector, and treat that only as a complement to the
series stage. Recheck C7/C11 type and placement after the stage. Size F2/F3 from measured currents,
then verify the downstream I²t withstand.

### R1-2: shared-ground return currents

**Analysis.** PGND joins GND only at NT1, and SERVO_GND only at NT2. That star is valid only if each
supply's negative reaches the board **only** through its own terminal. If one supply, or supplies with
bonded negatives, feeds J1 and J2 (or J4), a second return path forms:
supply − → J1 → GND pour → NT1 → PGND, in parallel with the J2 wire. Pump and servo current then divide
between the wires according to their resistance. The logic ground pour carries part of that current, and
the voltage drop shifts every ground-referenced measurement (ADC inputs, INA180 reference, sensor
returns). The PGND and SERVO_GND copper is also not routed yet, so the star is defined only in the
schematic.

**Proposed action.** Decide the supply arrangement first (question A1/A2). Then choose one:
(a) a single power entry with an on-board star point, where pump and servo returns never cross the logic
pour; or (b) separate isolated supplies, which keeps the current scheme; or (c) a documented wiring rule
(one negative conductor per supply, joined only on the board). Route PGND and SERVO_GND as dedicated
copper to their terminals and place NT1/NT2 accordingly.

### R1-3: U4 output enable and supply sequencing

**Analysis.** U4 ~OE (pin 1) is tied to GND, so the buffer drives whenever +5V is present.

* **Logic powered, servo unpowered:** if firmware drives PWM on IO25, U4 pushes 5 V pulses through
  R11 (330 Ω) into the unpowered servo's signal input. Through the servo's input protection, this can
  back-feed its electronics and the board's SERVO_V+ net (C11, TP11, J4), at up to roughly
  (5 V − diode drop − rail)/330 Ω, i.e. on the order of 10 mA. The servo may then start in an undefined
  state when its supply is applied. With IO25 idle, R10 keeps the output low and there is no back-feed.
* **Servo powered, logic unpowered:** U4 is unpowered while its output connects to a powered servo
  input. Whether the AHCT output tolerates this (an I<sub>off</sub> / partial-power-down rating) has not
  been checked. Also, if the DevKitC is powered from USB without the carrier +5V, IO25 can drive U4's
  input while U4's VCC is 0 V. Input over-voltage tolerance at VCC = 0 must also be checked in the
  datasheet.
* The firmware cannot see whether servo power is present.

**Proposed action.** Drive ~OE from a dedicated GPIO with a pull-up, so the buffer defaults to
high-impedance. Alternatively, gate ~OE with a "SERVO_V+ present" comparator or divider. Add a weak
pull-down on SERVO_SIG_OUT to SERVO_GND so the servo input sits at a defined low level when U4 is
high-impedance. Choose a buffer with a specified I<sub>off</sub> if the servo can be powered first.
Document a power-up sequence (logic → verify IO25 idle → servo) and the reverse for power-down in the
bench protocol.

### R1-4: generator voltage-sense ground

**Analysis.** J9 pin 2 is logic GND, so connecting it bonds the generator/load negative to the logic
ground. This is acceptable only if (i) the generator output is DC at J9 (a 3-phase or single-phase AC
machine needs rectification or a different front end), (ii) that negative is not already referenced
elsewhere, for example an earthed frame, the water path or another instrument's ground, and (iii) no
low-side current shunt in the generator loop would be bypassed by the bond. Otherwise the result is a
measurement error or a fault current through logic ground.

**Proposed action.** Keep R17/R18/D11 TBD (B3). After the generator is identified, choose between the
non-isolated single-ended input (only if conditions i–iii hold), a differential divider/amplifier input,
or isolated measurement (an isolated amplifier, or a power-monitor IC on the generator side with an
isolated interface). Question D16 asks the adviser to decide.

### R1-5: generator-current divider full scale

**Analysis.** The ×0.5 divider maps a 0–5 V sensor output to 0–2.5 V. The recalled ESP32 recommended
range at maximum attenuation is about 0.15–2.45 V (to be confirmed in current ESP-IDF documentation).
A 5 V-supplied sensor whose output can reach its rail, or a supply above 5.0 V, therefore saturates or
leaves the calibrated region. A typical 5 V hall sensor that swings 0.5–4.5 V maps to 0.25–2.25 V, which
fits but leaves little margin. If the sensor is powered at 3.3 V, the ×0.5 divider wastes half the range.
The documented condition "valid for ≤ 5 V" was therefore wrong; the correct condition is
V<sub>sensor,max</sub> × 0.5 ≤ ~2.45 V minus margin.

The same check applied to the other channels:

* PUMP_V (56 k/10 k) reaches 2.45 V at about 16.2 V. Inputs between that and the 18 V TVS standoff saturate.
* PUMP_I (INA180 powered from 3.3 V) can swing above 2.45 V unless the shunt and gain are chosen so that
  full scale stays at or below about 2.4 V.
* GEN_V is TBD.

**Proposed action.** Treat R20/R21 as **TBD** until the sensor is chosen. Pick the ratio so that the
sensor's maximum output, at its maximum supply, maps to about 2.2 V or less (for example 10 k/6.8 k ≈ ×0.40
for a 5 V sensor), or use a sensor with a 3.3 V output and no divider. Apply the same full-scale rule when
choosing the INA180 gain and R5. The schematic note on R20 still reads "≤ 5 V" and will be corrected at the
next schematic revision. The architecture document is corrected now.

### R1-6: DRC status

The board is **not DRC-clean**. The open findings are 35 unconnected items (all on the intentionally
unrouted pump/servo power nets), 4 starved thermal reliefs (errors) and 2 silkscreen warnings. They are
preserved in `exports/drc_report.txt` and `docs/verification.md`, and none has been excluded or relaxed.
The README sentence that called the routing "DRC-clean apart from the items listed" has been corrected.

### R1-7: scope of the netlist cross-check

`tools/check_netlist.py` confirms that the schematic KiCad actually draws, as exported in its own netlist,
matches the connections declared in `tools/design.py`. It detects drawing and generation errors such as
labels that look attached but are not. It does **not** independently verify electrical correctness:
`design.py` and the schematic express the same author's intent, so a wrong design choice there passes the
check. Electrical correctness rests on human review, datasheet checks and bench validation. The wording in
`docs/verification.md` has been corrected.
