# Proposed GPIO map: rev 0

**Proposal only.** This map is a design choice for the new carrier. It is **not** a record of how the
historical rig was wired, and the historical firmware's assignments are **not** evidence of physical wiring.
The pin order assumes an Espressif ESP32-DevKitC V4 (38-pin, classic ESP32). Confirm it against the board
in hand: many 38-pin clones differ in pin order and row spacing (22.86 mm vs 25.40 mm). The PCB uses
**25.40 mm**.

| GPIO | DevKitC header pin | Net | Direction | Function | Why this pin |
|---|---|---|---|---|---|
| IO36 (SENSOR_VP) | J2-3 | `GEN_V_ADC` | in (analog) | Generator voltage sense | ADC1, input-only |
| IO39 (SENSOR_VN) | J2-4 | `GEN_I_ADC` | in (analog) | Generator current sensor | ADC1, input-only |
| IO34 | J2-5 | `PUMP_I_ADC` | in (analog) | Pump current (INA180) | ADC1, input-only; also the historical "current" pin |
| IO35 | J2-6 | `PITCH_FB_ADC` | in (analog) | Optional pitch feedback | ADC1, input-only |
| IO32 | J2-7 | `PUMP_V_ADC` | in (analog) | Pump supply voltage | ADC1 |
| IO33 | J2-8 | `EXP_IO33` | spare | Expansion header J13 | ADC1 spare |
| IO25 | J2-9 | `SERVO_PWM` | out | Servo PWM → U4 buffer | Not a strapping pin (historical IO5 is strapping and emits PWM at boot) |
| IO26 | J2-10 | `PUMP_EN` | out | Q1 gate via JP1/R3, hardware pull-down R4 | Not strapping, quiet at boot; also the historical relay pin |
| IO27 | J2-11 | `RPM_PULSE` | in (interrupt) | Optional RPM | General GPIO |
| IO13 | J2-15 | `EXP_IO13` | spare | Expansion header J13 | |
| IO23 | J3-2 | `EXP_IO23` | spare | Expansion header J13 | |
| IO22 | J3-3 | `I2C_SCL` | I2C | OLED J11, I2C expansion J12 | Arduino-ESP32 default SCL |
| IO21 | J3-6 | `I2C_SDA` | I2C | OLED J11, I2C expansion J12 | Arduino-ESP32 default SDA (historical IO2/IO0 were strapping pins) |
| IO19 | J3-8 | `FLOW_PULSE` | in (interrupt) | Flow sensor pulses | General GPIO; also the historical flow pin |
| IO4 | J3-13 | `EXP_IO4` | spare | Expansion header J13 | |

## Deliberately unused

| GPIO | Reason |
|---|---|
| IO0, IO2, IO5, IO12, IO15 | Strapping pins (boot mode, flash voltage, boot log). IO12 must not be high at reset on modules with 3.3 V flash |
| IO6–IO11 | Connected to the module's SPI flash |
| IO1, IO3 | USB-UART (programming and the existing serial JSON telemetry) |
| IO14 | Outputs a PWM signal during boot |
| IO16, IO17 | Used for PSRAM on WROVER variants; left free in case the confirmed board is a WROVER |
| IO18 | Spare, not broken out (kept free for a later SPI need) |
| EN | Reset handled by the DevKitC button |

## Firmware follow-up (not done in this change)

`firmware/esp32/taph_reliability/local_config.example.hpp` intentionally keeps every pin at `-1`. After the
board is confirmed, a **private** `local_config.hpp` would use `flowPin = 19`, `currentAdcPin = 34`,
`servoPin = 25`, `pumpRelayPin = 26` and `pumpInactiveLevel = LOW`. On this carrier, LOW turns Q1 off, so
the pump "relay" is active-high. These values would be researcher-asserted review inputs, not facts
verified by software. The new channels (generator V/I, pump voltage, RPM, pitch feedback) have no firmware
support yet.
