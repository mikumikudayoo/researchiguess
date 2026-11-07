# Rev 0 review component list

Generated from `tools/design.py` (`python tools/gen_bom.py`). **Not a purchasing BOM.** No part has been bought, sampled or measured. *Candidate* part numbers name a part family that fits the circuit function; every rating must be re-checked against the current manufacturer datasheet before it is used.

| Status | Meaning | Components |
|---|---|---:|
| **IMPLEMENTED** | Circuit function chosen; candidate part/rating still to be checked against datasheet | 40 |
| **PROVISIONAL** | Depends on an unverified external component; re-select after that spec is confirmed | 15 |
| **TBD** | Value intentionally not chosen; blocked on an unverified external spec | 6 |
| **OPTIONAL** | Populate only if this interface is adopted | 11 |
| **DNP** | Footprint reserved; do not populate in rev 0 | 2 |
| **CONFIRM** | Pinout/mechanical mapping must be checked against the physical part | 5 |

Nothing on this list is marked *verified*: no physical part, sample or datasheet check has been recorded for this board yet.

## Components

| Ref | Sheet | Value | Footprint (KiCad stock library) | Status | Candidate part | Review note |
|---|---|---|---|---|---|---|
| J1 | Logic power | VIN_LOGIC 12V | `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` | PROVISIONAL | Phoenix MKDS 1,5/2-5,08 (candidate) | External low-voltage DC for logic only. Supply voltage/current rating unverified. No mains on PCB. |
| J2 | Pump switch | PUMP_VIN 12V | `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` | PROVISIONAL | Phoenix MKDS 1,5/2-5,08 (candidate) | Separate pump supply input. Route through an external, reviewed isolation switch/interlock. Terminal current rating vs pump current: VERIFY. |
| J3 | Pump switch | PUMP_OUT | `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` | PROVISIONAL | Phoenix MKDS 1,5/2-5,08 (candidate) | To external 12 V pump (+ / -). Pump model, current and inrush unverified. |
| J4 | Servo interface | SERVO_VIN | `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` | PROVISIONAL | Phoenix MKDS 1,5/2-5,08 (candidate) | Dedicated servo supply (voltage per actual servo datasheet). Removable for actuator isolation. |
| J5 | Servo interface | SERVO (S,+,-) | `Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical` | CONFIRM |  | Common hobby-servo order S,+,-; CONFIRM against actual servo lead. 2.54 mm pin current vs stall current unverified. |
| J6 | Sensor inputs | FLOW SENSOR | `Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical` | CONFIRM | JST XH 3-pin (candidate) | Pin 1 sensor supply, 2 GND, 3 signal. CONFIRM sensor lead mapping. |
| J7 | Sensor inputs | RPM SENSOR (opt) | `Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical` | OPTIONAL | JST XH 3-pin (candidate) | Pin 1 sensor supply, 2 GND, 3 signal. CONFIRM sensor lead mapping. |
| J8 | Sensor inputs | PITCH FB (opt) | `Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical` | OPTIONAL | JST XH 3-pin (candidate) | Ratiometric potentiometer / sensor powered from +3V3. Mechanism and sensor unresolved. |
| J9 | Generator measurement | GEN_V SENSE | `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` | PROVISIONAL | Phoenix MKDS 1,5/2-5,08 (candidate) | Sense-only connection (no generator power flows through PCB). Pin 2 is board GND: generator/load negative becomes bonded to logic ground - REVIEW. |
| J10 | Generator measurement | GEN_I SENSOR | `Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical` | PROVISIONAL | JST XH 3-pin (candidate) | For an OFF-BOARD current sensor module in the generator/load loop (e.g. hall-effect). Sensor model and range TBD. |
| J11 | HMI, expansion, test | OLED I2C | `Connector_PinSocket_2.54mm:PinSocket_1x04_P2.54mm_Vertical` | CONFIRM | 1x04 2.54 mm socket | Common SSD1306 128x64 module order GND,VCC,SCL,SDA - many modules swap GND/VCC: CONFIRM before insertion. |
| J12 | HMI, expansion, test | I2C EXPANSION | `Connector_JST:JST_XH_B4B-XH-A_1x04_P2.50mm_Vertical` | OPTIONAL | JST XH 4-pin (candidate) | For off-board I2C power monitor (generator or pump). Long cables: add bus buffer - TBD. |
| J13 | HMI, expansion, test | SPARE GPIO | `Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical` | OPTIONAL | 1x06 2.54 mm header | Uncommitted 3.3 V GPIO, unprotected - bench use only |
| J14 | ESP32 DevKitC socket | DevKitC J2 socket | `Connector_PinSocket_2.54mm:PinSocket_1x19_P2.54mm_Vertical` | CONFIRM | 2.54 mm 1x19 female header | Pin order per Espressif DevKitC V4 guide; clone boards differ. Row spacing on PCB = 25.40 mm (CONFIRM). |
| J15 | ESP32 DevKitC socket | DevKitC J3 socket | `Connector_PinSocket_2.54mm:PinSocket_1x19_P2.54mm_Vertical` | CONFIRM | 2.54 mm 1x19 female header | Pin order per Espressif DevKitC V4 guide; clone boards differ. |
| JP1 | Pump switch | PUMP_HW_ENABLE | `Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical` | IMPLEMENTED | 2-pin header + shunt | Hardware disable: remove shunt => gate held off by R4 regardless of firmware. |
| U1 | Logic power | TSR 1-2450 | `Converter_DCDC:Converter_DCDC_TRACO_TSR-1_THT` | PROVISIONAL | TRACO TSR 1-2450 (candidate) | Drop-in 5 V 1 A switching regulator module; input range/derating to be re-verified from current datasheet |
| U3 | Pump switch | INA180A1 | `Package_TO_SOT_SMD:SOT-23-5` | PROVISIONAL | TI INA180A1 (candidate) | Low-side current-sense amplifier; gain suffix (A1..A4) chosen with shunt value. |
| U4 | Servo interface | 74AHCT1G125 | `Package_TO_SOT_SMD:SOT-23-5` | IMPLEMENTED | 74AHCT1G125 SOT-23-5 (candidate) | 3.3 V -> 5 V servo signal buffer (TTL-threshold input). OE tied active. |
| Q1 | Pump switch | AO3400A | `Package_TO_SOT_SMD:SOT-23` | PROVISIONAL | AO3400A (candidate) | Logic-level N-MOSFET, low side. Adequacy (Rds(on) at Vgs=3.3 V, SOT-23 dissipation) depends on unverified pump current. |
| D1 | Logic power | SS34 | `Diode_SMD:D_SMA` | IMPLEMENTED | SS34 (candidate, 40 V 3 A class - verify) | Series reverse-polarity protection for logic input (approx. 0.4-0.5 V drop) |
| D2 | Logic power | SMBJ18CA | `Diode_SMD:D_SMB` | PROVISIONAL | SMBJ18CA (candidate - verify clamp vs U1 abs. max) | Bidirectional TVS; standoff must exceed max supply voltage incl. charger/float voltage |
| D3 | Logic power | SS14 | `Diode_SMD:D_SMA` | IMPLEMENTED | SS14 (candidate) | Prevents carrier +5V and DevKitC USB VBUS from back-feeding each other via the DevKitC 5V pin. Verify DevKitC's own VBUS protection. |
| D4 | Pump switch | SMBJ18CA | `Diode_SMD:D_SMB` | PROVISIONAL | SMBJ18CA (candidate) |  |
| D5 | Pump switch | SS34 | `Diode_SMD:D_SMA` | IMPLEMENTED | SS34 (candidate) | Freewheel diode across inductive pump load |
| D6 | Pump switch | BAT54S | `Package_TO_SOT_SMD:SOT-23` | IMPLEMENTED | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| D7 | Servo interface | TBD (DNP) (DNP) | `Diode_SMD:D_SMB` | DNP |  | Standoff voltage depends on servo supply voltage |
| D8 | Sensor inputs | BAT54S | `Package_TO_SOT_SMD:SOT-23` | IMPLEMENTED | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| D9 | Sensor inputs | BAT54S | `Package_TO_SOT_SMD:SOT-23` | OPTIONAL | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| D10 | Sensor inputs | BAT54S | `Package_TO_SOT_SMD:SOT-23` | OPTIONAL | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| D11 | Generator measurement | TBD (DNP) (DNP) | `Diode_SMD:D_SMB` | DNP |  | Select after generator max open-circuit voltage is known |
| D12 | Generator measurement | BAT54S | `Package_TO_SOT_SMD:SOT-23` | IMPLEMENTED | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| D13 | Generator measurement | BAT54S | `Package_TO_SOT_SMD:SOT-23` | IMPLEMENTED | BAT54S (candidate) | Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise |
| F1 | Logic power | PTC 0.5A hold (TBD) | `Fuse:Fuse_1812_4532Metric` | PROVISIONAL |  | Hold/trip current to be sized from measured logic load; 0.5 A hold is a placeholder |
| F2 | Pump switch | Mini blade TBD A | `Fuse:Fuseholder_Blade_Mini_Keystone_3568` | TBD | Keystone 3568 holder (candidate) | Fuse rating from measured pump running/stall current. Reverse polarity on PUMP_VIN is cleared only by this fuse (via Q1 body diode + D5). |
| F3 | Servo interface | Mini blade TBD A | `Fuse:Fuseholder_Blade_Mini_Keystone_3568` | TBD | Keystone 3568 holder (candidate) | Rating from servo stall current |
| LED1 | Logic power | GREEN | `LED_SMD:LED_0805_2012Metric` | IMPLEMENTED |  | +5 V rail present indicator (hardware, firmware independent) |
| LED2 | Pump switch | RED | `LED_SMD:LED_0805_2012Metric` | IMPLEMENTED |  | Lights when Q1 conducts (hardware indication of pump drive) |
| R1 | Logic power | 2.2k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R2 | Pump switch | 2.2k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R3 | Pump switch | 100 | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Gate series resistor |
| R4 | Pump switch | 10k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Gate pull-down: default OFF at reset, unpowered MCU, missing DevKitC or removed JP1 |
| R5 | Pump switch | TBD | `Resistor_SMD:R_2512_6332Metric` | TBD |  | Shunt value/power from pump current & INA180 gain (e.g. Vshunt full-scale <= ~0.1 V). Kelvin-route sense lines. |
| R6 | Pump switch | 1k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R7 | Pump switch | 56k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Divider 56k/10k: 12 V -> 1.82 V; ADC 11 dB usable range ends ~2.45 V at ~16 V input (verify ESP32 ADC docs) |
| R8 | Pump switch | 10k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R9 | Pump switch | 1k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R10 | Servo interface | 10k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Holds buffer input LOW (no pulses) while MCU pin is high-Z at boot |
| R11 | Servo interface | 330 | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Series protection for cable |
| R12 | Sensor inputs | 10k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Pull-up for open-collector/open-drain sensor outputs (to 3.3 V, never 5 V) |
| R13 | Sensor inputs | 1k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | Series current limit into clamp for 5 V push-pull outputs |
| R14 | Sensor inputs | 10k | `Resistor_SMD:R_0805_2012Metric` | OPTIONAL |  | Pull-up for open-collector/open-drain sensor outputs (to 3.3 V, never 5 V) |
| R15 | Sensor inputs | 1k | `Resistor_SMD:R_0805_2012Metric` | OPTIONAL |  | Series current limit into clamp for 5 V push-pull outputs |
| R16 | Sensor inputs | 1k | `Resistor_SMD:R_0805_2012Metric` | OPTIONAL |  |  |
| R17 | Generator measurement | TBD | `Resistor_SMD:R_0805_2012Metric` | TBD |  | Rtop: choose so Vmax_gen * Rbot/(Rtop+Rbot) <= ~2.4 V; check resistor voltage rating |
| R18 | Generator measurement | TBD | `Resistor_SMD:R_0805_2012Metric` | TBD |  | Rbot |
| R19 | Generator measurement | 1k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| R20 | Generator measurement | 10k | `Resistor_SMD:R_0805_2012Metric` | PROVISIONAL |  | Divider 10k/10k (x0.5) valid only for a sensor output <= 5 V; re-select for chosen sensor |
| R21 | Generator measurement | 10k | `Resistor_SMD:R_0805_2012Metric` | PROVISIONAL |  |  |
| R22 | HMI, expansion, test | 4.7k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  | I2C pull-ups; module may add its own (check combined value) |
| R23 | HMI, expansion, test | 4.7k | `Resistor_SMD:R_0805_2012Metric` | IMPLEMENTED |  |  |
| C1 | Logic power | 10uF 50V X7R | `Capacitor_SMD:C_1210_3225Metric` | IMPLEMENTED |  | Input ceramic per U1 datasheet recommendation (verify) |
| C2 | Logic power | 47uF 35V | `Capacitor_SMD:CP_Elec_6.3x7.7` | IMPLEMENTED |  | Bulk/damping for cable inductance |
| C3 | Logic power | 10uF 10V X7R | `Capacitor_SMD:C_1206_3216Metric` | IMPLEMENTED |  |  |
| C4 | Logic power | 10uF 10V X7R | `Capacitor_SMD:C_1206_3216Metric` | IMPLEMENTED |  |  |
| C5 | ESP32 DevKitC socket | 10uF 10V X7R | `Capacitor_SMD:C_1206_3216Metric` | IMPLEMENTED |  | Local +3V3 reservoir at socket (DevKitC has its own) |
| C6 | ESP32 DevKitC socket | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  |  |
| C7 | Pump switch | 100uF 35V | `Capacitor_SMD:CP_Elec_8x10` | PROVISIONAL |  | Bulk at pump input; ripple rating vs pump PWM (if any) unverified |
| C8 | Pump switch | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  | U3 decoupling |
| C9 | Pump switch | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  | RC anti-alias ~1.6 kHz with R6 |
| C10 | Pump switch | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  |  |
| C11 | Servo interface | TBD (e.g. 470uF) | `Capacitor_SMD:CP_Elec_8x10` | TBD |  | Bulk for servo current pulses; value/voltage from servo spec |
| C12 | Servo interface | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  | U4 decoupling |
| C13 | Sensor inputs | 1nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  | RC ~1 us edge filter; firmware debounce remains separate and unjustified until measured |
| C14 | Sensor inputs | 1nF | `Capacitor_SMD:C_0805_2012Metric` | OPTIONAL |  | RC ~1 us edge filter; firmware debounce remains separate and unjustified until measured |
| C15 | Sensor inputs | 100nF | `Capacitor_SMD:C_0805_2012Metric` | OPTIONAL |  |  |
| C16 | Generator measurement | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  |  |
| C17 | Generator measurement | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  |  |
| C18 | HMI, expansion, test | 100nF | `Capacitor_SMD:C_0805_2012Metric` | IMPLEMENTED |  |  |

## PCB features (not purchased parts)

| Ref | Function | Footprint | Status | Note |
|---|---|---|---|---|
| JP2 | VCC SEL | `Jumper:SolderJumper-3_P1.3mm_Open_RoundedPad1.0x1.5mm` | CONFIRM | Ships OPEN: bridge 1-2 for 5 V or 2-3 for 3.3 V only after sensor supply spec is verified. |
| JP3 | VCC SEL | `Jumper:SolderJumper-3_P1.3mm_Open_RoundedPad1.0x1.5mm` | OPTIONAL | Ships OPEN: bridge 1-2 for 5 V or 2-3 for 3.3 V only after sensor supply spec is verified. |
| JP4 | VCC SEL | `Jumper:SolderJumper-3_P1.3mm_Open_RoundedPad1.0x1.5mm` | CONFIRM | Ships OPEN; set per sensor supply spec |
| H1 | M3 | `MountingHole:MountingHole_3.2mm_M3` | CONFIRM | Non-plated M3; positions provisional (enclosure unknown) |
| H2 | M3 | `MountingHole:MountingHole_3.2mm_M3` | CONFIRM | Non-plated M3; positions provisional (enclosure unknown) |
| H3 | M3 | `MountingHole:MountingHole_3.2mm_M3` | CONFIRM | Non-plated M3; positions provisional (enclosure unknown) |
| H4 | M3 | `MountingHole:MountingHole_3.2mm_M3` | CONFIRM | Non-plated M3; positions provisional (enclosure unknown) |
| NT1 | NetTie | `NetTie:NetTie-2_SMD_Pad2.0mm` | IMPLEMENTED | Single-point join of pump return and logic ground, placed at shunt |
| NT2 | NetTie | `NetTie:NetTie-2_SMD_Pad2.0mm` | IMPLEMENTED | Single-point signal reference join near servo connector |
| TP1 | VIN_PROT | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP2 | +5V | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP3 | +3V3 | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP4 | GND | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP5 | +5V_ESP | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP6 | +12V_PUMP | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP7 | PGND | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP8 | PUMP_GATE | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP9 | PUMP_I_ADC | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP10 | PUMP_V_ADC | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP11 | SERVO_V+ | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP12 | SERVO_GND | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP13 | SERVO_SIG_OUT | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP14 | FLOW_PULSE | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP15 | GEN_V_ADC | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP16 | GEN_I_ADC | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP17 | I2C_SDA | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP18 | I2C_SCL | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP19 | GND | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
| TP20 | PUMP_SW | `TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm` | IMPLEMENTED | Test point - bare THT pad |
