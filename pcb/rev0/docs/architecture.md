# Electrical architecture: TAPH ESP32 carrier, rev 0 (preliminary)

> **Status:** design-review prototype for the 2026-11-08 adviser/consultant meeting.
> **Not** reviewed for fabrication, assembly or energization. A passing ERC/DRC is a rule-consistency
> check, not evidence of electrical or operational safety.

## 1. Sources and what they were used for

| Source | Used as | Not used as |
|---|---|---|
| Pasted rev-0 requirement list (research director, 2026-11-07) | Governing architecture: socketed classic-ESP32 carrier, external flow sensor, servo, 12 V pump, default-off pump switch, OLED, generator measurement, separate pump measurement, optional RPM/pitch feedback, external low-voltage DC, protection, test points | n/a |
| Historical firmware `sketch_aug3a.ino` @ `a37d1d5` | Inventory of *functions* the rig used (flow pulse, servo PWM, ACS712-style analog current, relay-switched 12 V pump, SSD1306 OLED on I2C) | **Not** evidence of physical wiring. Its pins (OLED on IO2/IO0, servo on IO5) are strapping pins and were not carried over |
| Current firmware `firmware/esp32/taph_reliability` | Required interfaces: pulse input with pull-up, one ADC current channel, servo PWM, pump output with a *reviewed inactive level*, explicit arming | Pin numbers: the committed template leaves every pin invalid (`-1`) on purpose |
| Audit F09/F10/F11/F14/F29 | Requirements: as-built schematic, signal voltage levels, supply ratings, isolated power boundaries, physically justified safe state, calibrated channels | n/a |
| Tinkercad conceptual drawing (described in audit F10: Uno + PIR-substitute symbols) | Confirms the conceptual block set only | Wires and symbols are explicitly non-authoritative; the drawing file itself is not in the repository |

**Deviation note:** no file named "PCB architecture rev 0" exists in the repository. The design follows the
requirement list supplied with the task, and every block below traces to an item on that list.

## 2. Block diagram (as implemented in the schematic)

```
 VIN_LOGIC (J1, 12 V nom.) ─ F1 PTC ─ D1 series Schottky ─┬─ D2 TVS, C1, C2 ─ U1 TSR 1-2450 ─ +5V ─┬─ D3 ─ +5V_ESP ─► DevKitC 5V pin
                                                          │                                       ├─ U4 servo signal buffer VCC
                                                          │                                       └─ (optional) 5 V sensor supply jumpers
                                                         VIN_PROT                     DevKitC on-board LDO ─► +3V3 ─► OLED, pull-ups, INA180, clamps

 PUMP_VIN (J2, 12 V nom.) ─ F2 blade fuse ─ +12V_PUMP ─┬─ D4 TVS, C7 bulk
                                                       ├─ J3 PUMP_OUT (+) ── pump ── J3 (−) = PUMP_SW ── Q1 AO3400A ── R5 shunt ── PGND ═NT1═ GND
                                                       ├─ D5 freewheel (PUMP_SW → +12V_PUMP)          gate ◄ R3 ◄ JP1 ◄ IO26 ; R4 10k gate→source
                                                       └─ R7/R8 divider → PUMP_V_ADC (IO32)       INA180 across R5 → PUMP_I_ADC (IO34)

 SERVO_VIN (J4, per servo spec) ─ F3 blade fuse ─ SERVO_V+ ─ C11 bulk ─ J5 (+)        SERVO_GND ═NT2═ GND
 IO25 ─ R10 pull-down ─ U4 74AHCT1G125 (3.3 V → 5 V) ─ R11 ─ J5 (S)

 GEN_V SENSE (J9) ─ R17/R18 divider (TBD) ─ R19/C16 ─ clamp D12 ─ IO36
 GEN_I SENSOR (J10, off-board sensor) ─ R20/R21 ½ divider ─ C17 ─ clamp D13 ─ IO39     (or I2C power monitor on J12)
 FLOW (J6) ─ pull-up R12, series R13, C13, clamp D8 ─ IO19      RPM (J7, opt.) ─ same ─ IO27      PITCH FB (J8, opt.) ─ IO35
 OLED (J11) + I2C expansion (J12) ─ IO21 SDA / IO22 SCL, 4.7 k pull-ups
```

## 3. Power domains and isolation points

| Domain | Entry | Protection on PCB | Isolation point | Unverified |
|---|---|---|---|---|
| Logic | J1 `VIN_LOGIC` | PTC F1, series Schottky D1 (reverse polarity), bidirectional TVS D2, bulk C1/C2, 5 V switching module U1 | Unplug J1 | Supply type/voltage range, load current, PTC rating, U1 derating |
| Pump | J2 `PUMP_VIN` | Replaceable mini-blade fuse F2, TVS D4, bulk C7, freewheel D5 | J2 is a separate input, so pump energy can be removed by an external, reviewed switch/interlock without affecting logic | Pump current (running/stall/inrush), fuse rating, Q1 adequacy, shunt value |
| Servo | J4 `SERVO_VIN` | Replaceable mini-blade fuse F3, bulk C11 (TBD), TVS D7 footprint (DNP) | J4 is a separate input; actuator power can be removed independently | Servo voltage, stall current, mechanical safe state |
| Measurement | J9, J10, J12 | Dividers, RC filters, Schottky clamps to the rails | none (non-isolated) | Generator type, AC/DC, maximum voltage/current; whether the generator/load negative may be bonded to logic GND |

Ground scheme: logic `GND` is the reference. The pump return (`PGND`) and servo return (`SERVO_GND`) are
separate nets, each joined to `GND` at one point by a net tie (NT1 at the pump shunt, NT2 at the servo
connector). High pump and servo currents therefore return to their own input terminals instead of flowing
through the logic ground pour. The layout implements this only in intent: the high-current copper is **not
routed** (see §6).

No mains voltage is present anywhere on the PCB. Each input expects an external, separately approved
low-voltage DC source (SELV). Which supplies are used is unresolved.

## 4. Pump switching: hardware default-off

* Q1 is an enhancement-mode N-MOSFET on the low side. With V<sub>GS</sub> = 0 it does not conduct.
* R4 (10 kΩ, gate to source) holds V<sub>GS</sub> = 0 whenever the drive is high-impedance: ESP32 reset and boot,
  unflashed or crashed firmware, a DevKitC removed from its socket, or JP1 removed. The ESP32's weak internal
  pulls cannot overcome it.
* JP1 (`PUMP_HW_ENABLE`, 2-pin header + shunt) is a physical disable: with the shunt removed, no firmware
  state can turn the pump on.
* There is no inverting stage anywhere in the pump path that could turn a floating input into "ON".
* IO26 was chosen because it is not a strapping pin and is not driven during boot. That behaviour is
  documented for the ESP32 but has not been observed on the actual module.
* LED2 lights when Q1 conducts, giving a hardware indication that does not depend on firmware.
* The firmware remains responsible for arming, freshness and latching, as in `docs/firmware.md`. The
  carrier adds a hardware floor beneath that logic. It is **not** an independent safety controller, an
  overspeed protection or an emergency stop. An external interlock on `PUMP_VIN` is still required.

## 5. Servo interface

* The servo is powered from its own input (J4/F3), never from the logic regulator.
* U4 (74AHCT1G125, TTL-threshold input) converts the 3.3 V PWM from IO25 to 5 V logic. The historical
  design drove the servo directly from 3.3 V, and whether the actual servo accepts 3.3 V is unknown.
* R10 holds the buffer input low while IO25 is high-impedance, so no pulses are produced at boot.
* **What the servo and blade do without pulses, after supply loss, or on a fault is not established.**
  The board does not define a mechanical safe state. Removing PWM may release or hold torque depending on
  the servo, and that must be measured.

## 6. Layout status

Two-layer, 130 × 100 mm (provisional: the enclosure and mounting are unknown). All parts are on the top
side. GND is poured on both layers, and SMD ground pads are stitched to the bottom plane with vias.

| Region | Layout state |
|---|---|
| Logic power, ESP32 sockets, sensor/measurement conditioning, OLED/I2C, test points | Placed and auto-routed by the project's simple grid router (0.6 mm power, 0.25 mm signals, 0.2 mm design clearance). Not hand-optimised. |
| Pump power path (`PUMP_VIN_RAW`, `+12V_PUMP`, `PUMP_SW`, `PUMP_SRC`, `PGND`) | **BLOCKED: placed, not routed.** Copper width, fuse, MOSFET thermal design and shunt Kelvin routing all depend on the unmeasured pump current. A rule area keeps the pour out of this region. |
| Servo power path (`SERVO_VIN_RAW`, `SERVO_V+`, `SERVO_GND`) | **BLOCKED: placed, not routed.** Depends on the servo stall current. |
| DevKitC antenna region | Copper keep-out (both layers) at the pin-1 end. Antenna overhang/position must be confirmed with the actual board. |

The netclasses `Pump_HighCurrent_BLOCKED` (2.0 mm) and `Servo_Power_BLOCKED` (1.5 mm) hold **placeholder**
widths so the layout can be reviewed. They are not derived from a current rating.

## 7. Analog front ends (measurement interfaces)

All analog inputs use ADC1 (IO32–IO39), because ADC2 is unavailable while Wi-Fi is active. Espressif's
documentation gives a usable range of roughly 0.15–2.45 V at 11 dB attenuation; confirm this against the
current ESP-IDF documentation for the exact chip revision. Each input has a series resistance, a
capacitor to GND and a BAT54S clamp to GND/+3V3. Clamp leakage contributes ADC error, so calibrate the
complete channel.

| Channel | Front end | Values |
|---|---|---|
| Generator voltage (IO36) | R17/R18 divider → 1 k → 100 nF → clamp | Divider **TBD**: choose so that V<sub>max,gen</sub>·R18/(R17+R18) ≤ ~2.4 V and check the resistor voltage rating |
| Generator current (IO39) | Off-board sensor on J10 → 10 k/10 k (×0.5) → 100 nF → clamp | Valid only for a sensor output ≤ 5 V; the sensor is **TBD** |
| Pump current (IO34) | R5 shunt → INA180 → 1 k/100 nF | Shunt and gain variant **TBD** |
| Pump supply voltage (IO32) | 56 k/10 k (12 V → 1.82 V) → 1 k → 100 nF → clamp | Full scale ~16 V (within the 2.45 V region) |
| Flow / RPM pulses (IO19 / IO27) | 10 k pull-up to 3.3 V, 1 k series, 1 nF, clamp; sensor supply chosen by solder jumper (ships **open**) | Sensor output type and supply unverified |
| Pitch feedback (IO35) | 1 k / 100 nF / clamp, sensor powered from 3.3 V | Mechanism unresolved |

Electrical power must be computed from synchronised voltage and current samples at stated terminals
(P = V·I), never from raw ADC counts or the historical 0.65 factor (see audit F08/F09).
