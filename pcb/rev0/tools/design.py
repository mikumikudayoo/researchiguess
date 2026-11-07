"""TAPH carrier board rev 0 -- single source of design intent.

Every part lists: sheet, ref, lib symbol, value, footprint, position, rotation,
pin->net map, and review status. The schematic generator draws it; the
netlist checker compares KiCad's exported netlist against NETS derived here.

STATUS vocabulary (also a symbol field "Status"):
  IMPLEMENTED   circuit and value chosen on stated design grounds; part/datasheet still to be re-verified
  PROVISIONAL   circuit chosen; value/part depends on an unverified external component
  TBD           value cannot be chosen until an external spec is confirmed (placeholder value "TBD")
  OPTIONAL      optional interface; populate only if the function is adopted
  DNP           footprint reserved, do not populate in rev 0
  CONFIRM       mechanical/pinout item that must be checked against the physical part
"""
from __future__ import annotations

from dataclasses import dataclass, field

FP_R = "Resistor_SMD:R_0805_2012Metric"
FP_C = "Capacitor_SMD:C_0805_2012Metric"
FP_C1206 = "Capacitor_SMD:C_1206_3216Metric"
FP_C1210 = "Capacitor_SMD:C_1210_3225Metric"
FP_LED = "LED_SMD:LED_0805_2012Metric"
FP_SOT23 = "Package_TO_SOT_SMD:SOT-23"
FP_SOT23_5 = "Package_TO_SOT_SMD:SOT-23-5"
FP_SMA = "Diode_SMD:D_SMA"
FP_SMB = "Diode_SMD:D_SMB"
FP_SCREW2 = "TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal"
FP_XH3 = "Connector_JST:JST_XH_B3B-XH-A_1x03_P2.50mm_Vertical"
FP_XH4 = "Connector_JST:JST_XH_B4B-XH-A_1x04_P2.50mm_Vertical"
FP_TP = "TestPoint:TestPoint_THTPad_D1.5mm_Drill0.7mm"
FP_SJ3 = "Jumper:SolderJumper-3_P1.3mm_Open_RoundedPad1.0x1.5mm"
FP_BLADE = "Fuse:Fuseholder_Blade_Mini_Keystone_3568"
FP_NETTIE = "NetTie:NetTie-2_SMD_Pad2.0mm"
FP_SOCK19 = "Connector_PinSocket_2.54mm:PinSocket_1x19_P2.54mm_Vertical"

POWER_SYMBOLS = {"GND": "power:GND", "+5V": "power:+5V", "+3V3": "power:+3V3"}


@dataclass
class Part:
    ref: str
    lib: str
    value: str
    fp: str
    x: float
    y: float
    rot: int = 0
    nets: dict = field(default_factory=dict)   # pin number -> net name; None = no-connect
    status: str = "IMPLEMENTED"
    mpn: str = ""
    note: str = ""
    dnp: bool = False
    in_bom: bool = True


@dataclass
class Sheet:
    name: str
    file: str
    title: str
    parts: list = field(default_factory=list)
    texts: list = field(default_factory=list)   # (x, y, text, size)
    boxes: list = field(default_factory=list)   # (x1, y1, x2, y2, caption)
    flags: list = field(default_factory=list)   # (x, y, net) PWR_FLAG placements


SHEETS: list[Sheet] = []


def sheet(*a, **k):
    s = Sheet(*a, **k)
    SHEETS.append(s)
    return s


def R(s, ref, value, x, y, n1, n2, rot=0, status="IMPLEMENTED", fp=FP_R, note="", mpn="", dnp=False):
    s.parts.append(Part(ref, "Device:R", value, fp, x, y, rot, {"1": n1, "2": n2}, status, mpn, note, dnp))


def C(s, ref, value, x, y, n1, n2, rot=0, status="IMPLEMENTED", fp=FP_C, note="", mpn="", dnp=False, pol=False):
    s.parts.append(Part(ref, "Device:C_Polarized" if pol else "Device:C", value, fp, x, y, rot,
                        {"1": n1, "2": n2}, status, mpn, note, dnp))


def CLAMP(s, ref, x, y, sig, note="Schottky clamp of ADC/GPIO node to GND and +3V3; leakage adds ADC error - characterise"):
    s.parts.append(Part(ref, "Diode:BAT54S", "BAT54S", FP_SOT23, x, y, 0,
                        {"1": "GND", "2": "+3V3", "3": sig}, "IMPLEMENTED", "BAT54S (candidate)", note))


def TP(s, ref, x, y, net):
    s.parts.append(Part(ref, "Connector:TestPoint", net, FP_TP, x, y, 90, {"1": net}, "IMPLEMENTED",
                        "", "Test point - bare THT pad", in_bom=False))


# ---------------------------------------------------------------- sheet: power
P = sheet("Logic power", "power.kicad_sch", "Logic power input, protection and +5 V regulation")
P.boxes.append((15.24, 22.86, 281.94, 116.84, "LOGIC SUPPLY  (VIN_LOGIC 12 V nominal, external SELV supply - rating unverified)"))
P.parts += [
    Part("J1", "Connector:Screw_Terminal_01x02", "VIN_LOGIC 12V", FP_SCREW2, 33.02, 50.8, 0,
         {"1": "VIN_RAW", "2": "GND"}, "PROVISIONAL", "Phoenix MKDS 1,5/2-5,08 (candidate)",
         "External low-voltage DC for logic only. Supply voltage/current rating unverified. No mains on PCB."),
    Part("F1", "Device:Polyfuse", "PTC 0.5A hold (TBD)", "Fuse:Fuse_1812_4532Metric", 55.88, 50.8, 90,
         {"1": "VIN_RAW", "2": "VIN_FUSED"}, "PROVISIONAL", "",
         "Hold/trip current to be sized from measured logic load; 0.5 A hold is a placeholder"),
    Part("D1", "Device:D_Schottky", "SS34", FP_SMA, 78.74, 50.8, 180,
         {"1": "VIN_PROT", "2": "VIN_FUSED"}, "IMPLEMENTED", "SS34 (candidate, 40 V 3 A class - verify)",
         "Series reverse-polarity protection for logic input (approx. 0.4-0.5 V drop)"),
    Part("D2", "Device:D_TVS", "SMBJ18CA", FP_SMB, 96.52, 60.96, 90,
         {"2": "VIN_PROT", "1": "GND"}, "PROVISIONAL", "SMBJ18CA (candidate - verify clamp vs U1 abs. max)",
         "Bidirectional TVS; standoff must exceed max supply voltage incl. charger/float voltage"),
    Part("C1", "Device:C", "10uF 50V X7R", FP_C1210, 109.22, 60.96, 0,
         {"1": "VIN_PROT", "2": "GND"}, "IMPLEMENTED", "", "Input ceramic per U1 datasheet recommendation (verify)"),
    Part("C2", "Device:C_Polarized", "47uF 35V", "Capacitor_SMD:CP_Elec_6.3x7.7", 121.92, 60.96, 0,
         {"1": "VIN_PROT", "2": "GND"}, "IMPLEMENTED", "", "Bulk/damping for cable inductance"),
    Part("U1", "Converter_DCDC:TSR_1-2450", "TSR 1-2450", "Converter_DCDC:Converter_DCDC_TRACO_TSR-1_THT", 154.94, 55.88, 0,
         {"1": "VIN_PROT", "2": "GND", "3": "+5V"}, "PROVISIONAL", "TRACO TSR 1-2450 (candidate)",
         "Drop-in 5 V 1 A switching regulator module; input range/derating to be re-verified from current datasheet"),
    Part("C3", "Device:C", "10uF 10V X7R", FP_C1206, 182.88, 60.96, 0,
         {"1": "+5V", "2": "GND"}, "IMPLEMENTED"),
    Part("D3", "Device:D_Schottky", "SS14", FP_SMA, 203.2, 50.8, 180,
         {"2": "+5V", "1": "+5V_ESP"}, "IMPLEMENTED", "SS14 (candidate)",
         "Prevents carrier +5V and DevKitC USB VBUS from back-feeding each other via the DevKitC 5V pin. Verify DevKitC's own VBUS protection."),
    Part("C4", "Device:C", "10uF 10V X7R", FP_C1206, 223.52, 60.96, 0,
         {"1": "+5V_ESP", "2": "GND"}, "IMPLEMENTED"),
    Part("R1", "Device:R", "2.2k", FP_R, 243.84, 58.42, 0, {"1": "+5V", "2": "LED_5V_A"}, "IMPLEMENTED"),
    Part("LED1", "Device:LED", "GREEN", FP_LED, 243.84, 76.2, 90, {"2": "LED_5V_A", "1": "GND"}, "IMPLEMENTED",
         "", "+5 V rail present indicator (hardware, firmware independent)"),
]
P.flags += [(33.02, 76.2, "VIN_PROT"), (63.5, 76.2, "+5V_ESP"), (93.98, 76.2, "GND")]
P.texts += [
    (20.32, 88.9, "VIN_RAW -> F1 -> D1 (reverse polarity) -> D2 TVS + C1/C2 -> U1 (5 V module) -> +5V rail.\n"
     "+5V feeds: servo buffer U4 VCC, optional 5 V sensor supplies (via solder jumpers), D3 -> DevKitC 5V pin (+5V_ESP).\n"
     "+3V3 is NOT generated on the carrier: it is the DevKitC on-board regulator output (capacity unverified; keep peripheral load small).\n"
     "PWR_FLAGs mark nets that are genuinely powered from connectors/diodes (ERC driver annotation only).", 1.27),
    (20.32, 106.68, "UNRESOLVED: supply source, max/min voltage, battery/charger presence, logic load current, PTC rating.", 1.27),
]

# ---------------------------------------------------------------- sheet: MCU
M = sheet("ESP32 DevKitC socket", "mcu.kicad_sch", "ESP32-DevKitC V4 socket carrier and GPIO allocation")
M.boxes.append((15.24, 17.78, 281.94, 165.1, "SOCKETED ESP32 DEV BOARD  (provisional target: Espressif ESP32-DevKitC V4, 38-pin, classic ESP32) - CONFIRM BOARD, PINOUT AND ROW SPACING"))
J2NETS = {"1": "+3V3", "2": None, "3": "GEN_V_ADC", "4": "GEN_I_ADC", "5": "PUMP_I_ADC", "6": "PITCH_FB_ADC",
          "7": "PUMP_V_ADC", "8": "EXP_IO33", "9": "SERVO_PWM", "10": "PUMP_EN", "11": "RPM_PULSE",
          "12": None, "13": None, "14": "GND", "15": "EXP_IO13", "16": None, "17": None, "18": None,
          "19": "+5V_ESP"}
J3NETS = {"1": "GND", "2": "EXP_IO23", "3": "I2C_SCL", "4": None, "5": None, "6": "I2C_SDA", "7": "GND",
          "8": "FLOW_PULSE", "9": None, "10": None, "11": None, "12": None, "13": "EXP_IO4", "14": None,
          "15": None, "16": None, "17": None, "18": None, "19": None}
M.parts += [
    Part("J14", "TAPH_Rev0:ESP32-DevKitC-V4_J2", "DevKitC J2 socket", FP_SOCK19, 88.9, 81.28, 0, J2NETS, "CONFIRM",
         "2.54 mm 1x19 female header", "Pin order per Espressif DevKitC V4 guide; clone boards differ. Row spacing on PCB = 25.40 mm (CONFIRM)."),
    Part("J15", "TAPH_Rev0:ESP32-DevKitC-V4_J3", "DevKitC J3 socket", FP_SOCK19, 152.4, 81.28, 0, J3NETS, "CONFIRM",
         "2.54 mm 1x19 female header", "Pin order per Espressif DevKitC V4 guide; clone boards differ."),
    Part("C5", "Device:C", "10uF 10V X7R", FP_C1206, 205.74, 50.8, 0, {"1": "+3V3", "2": "GND"}, "IMPLEMENTED",
         "", "Local +3V3 reservoir at socket (DevKitC has its own)"),
    Part("C6", "Device:C", "100nF", FP_C, 218.44, 50.8, 0, {"1": "+3V3", "2": "GND"}, "IMPLEMENTED"),
]
M.texts += [
    (190.5, 66.04,
     "PROPOSED GPIO MAP (rev 0 proposal - NOT evidence of historical wiring)\n"
     "IO36  GEN_V_ADC     ADC1_CH0 input-only\n"
     "IO39  GEN_I_ADC     ADC1_CH3 input-only\n"
     "IO34  PUMP_I_ADC    ADC1_CH6 input-only\n"
     "IO35  PITCH_FB_ADC  ADC1_CH7 input-only (optional)\n"
     "IO32  PUMP_V_ADC    ADC1_CH4\n"
     "IO19  FLOW_PULSE    interrupt input\n"
     "IO27  RPM_PULSE     interrupt input (optional)\n"
     "IO25  SERVO_PWM     LEDC PWM -> U4 buffer\n"
     "IO26  PUMP_EN       Q1 gate drive (HW pull-down)\n"
     "IO21  I2C_SDA       OLED + I2C expansion\n"
     "IO22  I2C_SCL\n"
     "IO4/13/23/33  EXP_*  uncommitted expansion\n"
     "Not used: IO0/2/5/12/15 (strapping), IO6-11 (flash),\n"
     "IO1/3 (USB-UART), IO14 (boot-time PWM), IO16/17 (PSRAM\n"
     "on WROVER variants), IO18, EN.\n"
     "All analog inputs on ADC1 (ADC2 unusable with Wi-Fi).", 1.27),
    (20.32, 144.78,
     "Historical sketch used OLED on IO2/IO0 (strapping pins), servo on IO5 (strapping) and fed a 5 V ACS712 output\n"
     "directly to IO34. Rev 0 deliberately moves I2C to IO21/22, servo to IO25 and conditions every analog input.\n"
     "Firmware local_config pins must be updated to this map after board confirmation.", 1.27),
]

# ---------------------------------------------------------------- sheet: pump
U = sheet("Pump switch", "pump.kicad_sch", "12 V pump supply, default-off low-side switch, current & voltage sensing")
U.boxes.append((15.24, 17.78, 281.94, 165.1, "PUMP POWER DOMAIN  (PUMP_VIN 12 V nominal, separate input = removable energy isolation point) - PUMP CURRENT UNVERIFIED"))
U.parts += [
    Part("J2", "Connector:Screw_Terminal_01x02", "PUMP_VIN 12V", FP_SCREW2, 33.02, 45.72, 0,
         {"1": "PUMP_VIN_RAW", "2": "PGND"}, "PROVISIONAL", "Phoenix MKDS 1,5/2-5,08 (candidate)",
         "Separate pump supply input. Route through an external, reviewed isolation switch/interlock. Terminal current rating vs pump current: VERIFY."),
    Part("F2", "Device:Fuse", "Mini blade TBD A", FP_BLADE, 55.88, 45.72, 90,
         {"1": "PUMP_VIN_RAW", "2": "+12V_PUMP"}, "TBD", "Keystone 3568 holder (candidate)",
         "Fuse rating from measured pump running/stall current. Reverse polarity on PUMP_VIN is cleared only by this fuse (via Q1 body diode + D5)."),
    Part("D4", "Device:D_TVS", "SMBJ18CA", FP_SMB, 76.2, 55.88, 90,
         {"2": "+12V_PUMP", "1": "PGND"}, "PROVISIONAL", "SMBJ18CA (candidate)"),
    Part("C7", "Device:C_Polarized", "100uF 35V", "Capacitor_SMD:CP_Elec_8x10", 88.9, 55.88, 0,
         {"1": "+12V_PUMP", "2": "PGND"}, "PROVISIONAL", "", "Bulk at pump input; ripple rating vs pump PWM (if any) unverified"),
    Part("J3", "Connector:Screw_Terminal_01x02", "PUMP_OUT", FP_SCREW2, 129.54, 45.72, 0,
         {"1": "+12V_PUMP", "2": "PUMP_SW"}, "PROVISIONAL", "Phoenix MKDS 1,5/2-5,08 (candidate)",
         "To external 12 V pump (+ / -). Pump model, current and inrush unverified."),
    Part("D5", "Device:D_Schottky", "SS34", FP_SMA, 152.4, 50.8, 270,
         {"1": "+12V_PUMP", "2": "PUMP_SW"}, "IMPLEMENTED", "SS34 (candidate)", "Freewheel diode across inductive pump load"),
    Part("R2", "Device:R", "2.2k", FP_R, 170.18, 45.72, 0, {"1": "+12V_PUMP", "2": "PUMP_LED_A"}, "IMPLEMENTED"),
    Part("LED2", "Device:LED", "RED", FP_LED, 170.18, 63.5, 90, {"2": "PUMP_LED_A", "1": "PUMP_SW"}, "IMPLEMENTED",
         "", "Lights when Q1 conducts (hardware indication of pump drive)"),
    Part("Q1", "Transistor_FET:AO3400A", "AO3400A", FP_SOT23, 233.68, 88.9, 0,
         {"1": "PUMP_GATE", "2": "PUMP_SRC", "3": "PUMP_SW"}, "PROVISIONAL", "AO3400A (candidate)",
         "Logic-level N-MOSFET, low side. Adequacy (Rds(on) at Vgs=3.3 V, SOT-23 dissipation) depends on unverified pump current."),
    Part("JP1", "Jumper:Jumper_2_Open", "PUMP_HW_ENABLE", "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
         147.32, 88.9, 0, {"1": "PUMP_EN", "2": "PUMP_EN_J"}, "IMPLEMENTED", "2-pin header + shunt",
         "Hardware disable: remove shunt => gate held off by R4 regardless of firmware."),
    Part("R3", "Device:R", "100", FP_R, 187.96, 88.9, 90, {"1": "PUMP_EN_J", "2": "PUMP_GATE"}, "IMPLEMENTED",
         "", "Gate series resistor"),
    Part("R4", "Device:R", "10k", FP_R, 215.9, 104.14, 0, {"1": "PUMP_GATE", "2": "PUMP_SRC"}, "IMPLEMENTED",
         "", "Gate pull-down: default OFF at reset, unpowered MCU, missing DevKitC or removed JP1"),
    Part("R5", "Device:R", "TBD", "Resistor_SMD:R_2512_6332Metric", 208.28, 121.92, 0,
         {"1": "PUMP_SRC", "2": "PGND"}, "TBD", "",
         "Shunt value/power from pump current & INA180 gain (e.g. Vshunt full-scale <= ~0.1 V). Kelvin-route sense lines."),
    Part("U3", "Amplifier_Current:INA180A1", "INA180A1", FP_SOT23_5, 251.46, 121.92, 0,
         {"1": "PUMP_I_RAW", "2": "GND", "3": "PUMP_SRC", "4": "PGND", "5": "+3V3"}, "PROVISIONAL", "TI INA180A1 (candidate)",
         "Low-side current-sense amplifier; gain suffix (A1..A4) chosen with shunt value."),
    Part("C8", "Device:C", "100nF", FP_C, 271.78, 101.6, 0, {"1": "+3V3", "2": "GND"}, "IMPLEMENTED", "", "U3 decoupling"),
    Part("R6", "Device:R", "1k", FP_R, 271.78, 132.08, 0, {"1": "PUMP_I_RAW", "2": "PUMP_I_ADC"}, "IMPLEMENTED"),
    Part("C9", "Device:C", "100nF", FP_C, 271.78, 152.4, 0, {"1": "PUMP_I_ADC", "2": "GND"}, "IMPLEMENTED",
         "", "RC anti-alias ~1.6 kHz with R6"),
    Part("NT1", "Device:NetTie_2", "NetTie", FP_NETTIE, 233.68, 152.4, 0, {"1": "PGND", "2": "GND"}, "IMPLEMENTED",
         "", "Single-point join of pump return and logic ground, placed at shunt", in_bom=False),
    Part("R7", "Device:R", "56k", FP_R, 33.02, 116.84, 0, {"1": "+12V_PUMP", "2": "PUMP_V_DIV"}, "IMPLEMENTED",
         "", "Divider 56k/10k: 12 V -> 1.82 V; ADC 11 dB usable range ends ~2.45 V at ~16 V input (verify ESP32 ADC docs)"),
    Part("R8", "Device:R", "10k", FP_R, 33.02, 139.7, 0, {"1": "PUMP_V_DIV", "2": "GND"}, "IMPLEMENTED"),
    Part("R9", "Device:R", "1k", FP_R, 55.88, 127.0, 90, {"1": "PUMP_V_DIV", "2": "PUMP_V_ADC"}, "IMPLEMENTED"),
    Part("C10", "Device:C", "100nF", FP_C, 76.2, 139.7, 0, {"1": "PUMP_V_ADC", "2": "GND"}, "IMPLEMENTED"),
]
CLAMP(U, "D6", 119.38, 132.08, "PUMP_V_ADC")
U.texts += [
    (20.32, 71.12,
     "HARDWARE DEFAULT-OFF: Q1 is enhancement-mode; R4 holds Vgs = 0 whenever IO26 is high-Z (reset, boot, unflashed,\n"
     "board removed) or JP1 is open. No inverting stage exists that could turn the pump ON from a floating input.\n"
     "IO26 chosen because it is not a strapping pin and is not driven during boot (verify on actual module).", 1.27),
    (20.32, 157.48,
     "BLOCKED FOR ROUTING: pump current path (J2-F2-J3-Q1-R5-PGND) widths, fuse rating, shunt value and Q1 adequacy\n"
     "require measured pump running/stall current. Layout leaves these connections unrouted (ratsnest) on purpose.", 1.27),
]

# ---------------------------------------------------------------- sheet: servo
V = sheet("Servo interface", "servo.kicad_sch", "Blade-pitch servo: separate supply input and buffered PWM")
V.boxes.append((15.24, 17.78, 281.94, 165.1, "SERVO DOMAIN  (servo supply voltage/current UNVERIFIED; mechanical safe state UNRESOLVED)"))
V.parts += [
    Part("J4", "Connector:Screw_Terminal_01x02", "SERVO_VIN", FP_SCREW2, 33.02, 45.72, 0,
         {"1": "SERVO_VIN_RAW", "2": "SERVO_GND"}, "PROVISIONAL", "Phoenix MKDS 1,5/2-5,08 (candidate)",
         "Dedicated servo supply (voltage per actual servo datasheet). Removable for actuator isolation."),
    Part("F3", "Device:Fuse", "Mini blade TBD A", FP_BLADE, 55.88, 45.72, 90,
         {"1": "SERVO_VIN_RAW", "2": "SERVO_V+"}, "TBD", "Keystone 3568 holder (candidate)", "Rating from servo stall current"),
    Part("D7", "Device:D_TVS", "TBD (DNP)", FP_SMB, 76.2, 55.88, 90, {"2": "SERVO_V+", "1": "SERVO_GND"}, "DNP",
         "", "Standoff voltage depends on servo supply voltage", dnp=True),
    Part("C11", "Device:C_Polarized", "TBD (e.g. 470uF)", "Capacitor_SMD:CP_Elec_8x10", 88.9, 55.88, 0,
         {"1": "SERVO_V+", "2": "SERVO_GND"}, "TBD", "", "Bulk for servo current pulses; value/voltage from servo spec"),
    Part("J5", "Connector_Generic:Conn_01x03", "SERVO (S,+,-)", "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
         129.54, 45.72, 0, {"1": "SERVO_SIG_OUT", "2": "SERVO_V+", "3": "SERVO_GND"}, "CONFIRM", "",
         "Common hobby-servo order S,+,-; CONFIRM against actual servo lead. 2.54 mm pin current vs stall current unverified."),
    Part("NT2", "Device:NetTie_2", "NetTie", FP_NETTIE, 129.54, 76.2, 0, {"1": "SERVO_GND", "2": "GND"}, "IMPLEMENTED",
         "", "Single-point signal reference join near servo connector", in_bom=False),
    Part("U4", "74xGxx:74AHCT1G125", "74AHCT1G125", FP_SOT23_5, 76.2, 104.14, 0,
         {"1": "GND", "2": "SERVO_PWM", "3": "GND", "4": "SERVO_SIG_BUF", "5": "+5V"}, "IMPLEMENTED", "74AHCT1G125 SOT-23-5 (candidate)",
         "3.3 V -> 5 V servo signal buffer (TTL-threshold input). OE tied active."),
    Part("R10", "Device:R", "10k", FP_R, 45.72, 116.84, 0, {"1": "SERVO_PWM", "2": "GND"}, "IMPLEMENTED",
         "", "Holds buffer input LOW (no pulses) while MCU pin is high-Z at boot"),
    Part("R11", "Device:R", "330", FP_R, 132.08, 104.14, 90, {"1": "SERVO_SIG_BUF", "2": "SERVO_SIG_OUT"}, "IMPLEMENTED",
         "", "Series protection for cable"),
    Part("C12", "Device:C", "100nF", FP_C, 99.06, 124.46, 0, {"1": "+5V", "2": "GND"}, "IMPLEMENTED", "", "U4 decoupling"),
]
V.texts += [
    (20.32, 139.7,
     "No servo pulses are produced while IO25 is high-Z (R10). What the servo/blade does WITHOUT pulses, after supply loss,\n"
     "or on a fault is NOT established: the mechanical safe state is UNRESOLVED and is not claimed by this circuit.\n"
     "Servo power is NOT taken from the logic regulator. Servo current path widths are BLOCKED pending servo stall current.", 1.27),
]

# ---------------------------------------------------------------- sheet: sensors
S = sheet("Sensor inputs", "sensors.kicad_sch", "Flow pulse, optional RPM pulse and optional pitch feedback")
S.boxes.append((15.24, 17.78, 281.94, 165.1, "EXTERNAL SENSOR INPUTS  (sensor models, supply voltage and output type UNVERIFIED)"))


def pulse_input(s, y, jref, jpref, rpu, rser, cref, dref, ext, out, vcc, label, status):
    s.parts += [
        Part(jref, "Connector_Generic:Conn_01x03", label, FP_XH3, 33.02, y, 0,
             {"1": vcc, "2": "GND", "3": ext}, "CONFIRM" if status == "IMPLEMENTED" else status, "JST XH 3-pin (candidate)",
             "Pin 1 sensor supply, 2 GND, 3 signal. CONFIRM sensor lead mapping."),
        Part(jpref, "Jumper:SolderJumper_3_Open", "VCC SEL", FP_SJ3, 63.5, y - 12.7, 0,
             {"1": "+5V", "2": vcc, "3": "+3V3"}, "CONFIRM", "",
             "Ships OPEN: bridge 1-2 for 5 V or 2-3 for 3.3 V only after sensor supply spec is verified.", in_bom=False),
        Part(rpu, "Device:R", "10k", FP_R, 88.9, y - 5.08, 0, {"1": "+3V3", "2": ext}, status, "",
             "Pull-up for open-collector/open-drain sensor outputs (to 3.3 V, never 5 V)"),
        Part(rser, "Device:R", "1k", FP_R, 124.46, y + 2.54, 90, {"1": ext, "2": out}, status, "",
             "Series current limit into clamp for 5 V push-pull outputs"),
        Part(cref, "Device:C", "1nF", FP_C, 149.86, y + 12.7, 0, {"1": out, "2": "GND"}, status, "",
             "RC ~1 us edge filter; firmware debounce remains separate and unjustified until measured"),
    ]
    CLAMP(s, dref, 175.26, y + 7.62, out)
    if status == "OPTIONAL":
        for p in s.parts[-6:]:
            p.status = "OPTIONAL"


pulse_input(S, 45.72, "J6", "JP2", "R12", "R13", "C13", "D8", "FLOW_SIG", "FLOW_PULSE", "FLOW_VCC", "FLOW SENSOR", "IMPLEMENTED")
pulse_input(S, 88.9, "J7", "JP3", "R14", "R15", "C14", "D9", "RPM_SIG", "RPM_PULSE", "RPM_VCC", "RPM SENSOR (opt)", "OPTIONAL")
S.parts += [
    Part("J8", "Connector_Generic:Conn_01x03", "PITCH FB (opt)", FP_XH3, 33.02, 132.08, 0,
         {"1": "+3V3", "2": "GND", "3": "PITCH_FB_SIG"}, "OPTIONAL", "JST XH 3-pin (candidate)",
         "Ratiometric potentiometer / sensor powered from +3V3. Mechanism and sensor unresolved."),
    Part("R16", "Device:R", "1k", FP_R, 124.46, 134.62, 90, {"1": "PITCH_FB_SIG", "2": "PITCH_FB_ADC"}, "OPTIONAL"),
    Part("C15", "Device:C", "100nF", FP_C, 149.86, 144.78, 0, {"1": "PITCH_FB_ADC", "2": "GND"}, "OPTIONAL"),
]
CLAMP(S, "D10", 175.26, 139.7, "PITCH_FB_ADC")
S.parts[-1].status = "OPTIONAL"
S.texts += [
    (208.28, 40.64,
     "FLOW: legacy divisor 7.5 is NOT a calibration.\n"
     "Sensor supply voltage/output type unknown,\n"
     "so supply select jumper ships open.\n\n"
     "RPM (optional): generator speed channel does\n"
     "not exist in historical firmware; sensor\n"
     "type (hall, optical, back-EMF) undecided.\n\n"
     "PITCH FB (optional): actual blade pitch is\n"
     "currently unmeasured; servo command is NOT\n"
     "pitch. This input reserves a path to measure it.", 1.27),
]

# ---------------------------------------------------------------- sheet: generator measurement
G = sheet("Generator measurement", "genmeas.kicad_sch", "Generator voltage sense and current-sensor interface")
G.boxes.append((15.24, 17.78, 281.94, 165.1, "GENERATOR MEASUREMENT INTERFACE  (generator type, AC/DC, max voltage/current UNRESOLVED; NON-ISOLATED)"))
G.parts += [
    Part("J9", "Connector:Screw_Terminal_01x02", "GEN_V SENSE", FP_SCREW2, 33.02, 45.72, 0,
         {"1": "GEN_V_IN", "2": "GND"}, "PROVISIONAL", "Phoenix MKDS 1,5/2-5,08 (candidate)",
         "Sense-only connection (no generator power flows through PCB). Pin 2 is board GND: generator/load negative becomes bonded to logic ground - REVIEW."),
    Part("D11", "Device:D_TVS", "TBD (DNP)", FP_SMB, 55.88, 58.42, 90, {"2": "GEN_V_IN", "1": "GND"}, "DNP",
         "", "Select after generator max open-circuit voltage is known", dnp=True),
    Part("R17", "Device:R", "TBD", FP_R, 76.2, 53.34, 0, {"1": "GEN_V_IN", "2": "GEN_V_DIV"}, "TBD",
         "", "Rtop: choose so Vmax_gen * Rbot/(Rtop+Rbot) <= ~2.4 V; check resistor voltage rating"),
    Part("R18", "Device:R", "TBD", FP_R, 76.2, 76.2, 0, {"1": "GEN_V_DIV", "2": "GND"}, "TBD", "", "Rbot"),
    Part("R19", "Device:R", "1k", FP_R, 99.06, 63.5, 90, {"1": "GEN_V_DIV", "2": "GEN_V_ADC"}, "IMPLEMENTED"),
    Part("C16", "Device:C", "100nF", FP_C, 119.38, 76.2, 0, {"1": "GEN_V_ADC", "2": "GND"}, "IMPLEMENTED"),
    Part("J10", "Connector_Generic:Conn_01x03", "GEN_I SENSOR", FP_XH3, 33.02, 116.84, 0,
         {"1": "GENI_VCC", "2": "GND", "3": "GEN_I_SIG"}, "PROVISIONAL", "JST XH 3-pin (candidate)",
         "For an OFF-BOARD current sensor module in the generator/load loop (e.g. hall-effect). Sensor model and range TBD."),
    Part("JP4", "Jumper:SolderJumper_3_Open", "VCC SEL", FP_SJ3, 63.5, 104.14, 0,
         {"1": "+5V", "2": "GENI_VCC", "3": "+3V3"}, "CONFIRM", "", "Ships OPEN; set per sensor supply spec", in_bom=False),
    Part("R20", "Device:R", "10k", FP_R, 88.9, 124.46, 0, {"1": "GEN_I_SIG", "2": "GEN_I_ADC"}, "PROVISIONAL",
         "", "Divider 10k/10k (x0.5) valid only for a sensor output <= 5 V; re-select for chosen sensor"),
    Part("R21", "Device:R", "10k", FP_R, 88.9, 147.32, 0, {"1": "GEN_I_ADC", "2": "GND"}, "PROVISIONAL"),
    Part("C17", "Device:C", "100nF", FP_C, 119.38, 147.32, 0, {"1": "GEN_I_ADC", "2": "GND"}, "IMPLEMENTED"),
]
CLAMP(G, "D12", 144.78, 71.12, "GEN_V_ADC")
CLAMP(G, "D13", 144.78, 142.24, "GEN_I_ADC")
G.texts += [
    (172.72, 40.64,
     "DESIGN INTENT: the PCB measures, it does not\n"
     "carry generator power. Generator output and\n"
     "load stay off-board.\n\n"
     "Divider values are TBD because the generator\n"
     "type (DC / rectified AC / 3-phase), open-circuit\n"
     "voltage and load are not established.\n\n"
     "Alternative path: an I2C power monitor module\n"
     "(e.g. INA219/INA226 breakout) on J12, placed\n"
     "in the generator/load loop, measures V and I\n"
     "together. Bus address/isolation TBD.\n\n"
     "Electrical power must be computed from\n"
     "synchronised V and I samples (P = V*I at the\n"
     "stated terminals), not from raw ADC counts.", 1.27),
]

# ---------------------------------------------------------------- sheet: HMI / expansion / test points
H = sheet("HMI, expansion, test", "hmi.kicad_sch", "OLED, I2C expansion, spare GPIO, test points, mounting")
H.boxes.append((15.24, 17.78, 142.24, 165.1, "OLED / I2C / EXPANSION"))
H.boxes.append((147.32, 17.78, 281.94, 165.1, "TEST POINTS & MECHANICAL"))
H.parts += [
    Part("J11", "Connector_Generic:Conn_01x04", "OLED I2C", "Connector_PinSocket_2.54mm:PinSocket_1x04_P2.54mm_Vertical",
         33.02, 45.72, 0, {"1": "GND", "2": "+3V3", "3": "I2C_SCL", "4": "I2C_SDA"}, "CONFIRM", "1x04 2.54 mm socket",
         "Common SSD1306 128x64 module order GND,VCC,SCL,SDA - many modules swap GND/VCC: CONFIRM before insertion."),
    Part("R22", "Device:R", "4.7k", FP_R, 68.58, 38.1, 0, {"1": "+3V3", "2": "I2C_SCL"}, "IMPLEMENTED",
         "", "I2C pull-ups; module may add its own (check combined value)"),
    Part("R23", "Device:R", "4.7k", FP_R, 81.28, 38.1, 0, {"1": "+3V3", "2": "I2C_SDA"}, "IMPLEMENTED"),
    Part("C18", "Device:C", "100nF", FP_C, 99.06, 38.1, 0, {"1": "+3V3", "2": "GND"}, "IMPLEMENTED"),
    Part("J12", "Connector_Generic:Conn_01x04", "I2C EXPANSION", FP_XH4, 33.02, 83.82, 0,
         {"1": "GND", "2": "+3V3", "3": "I2C_SCL", "4": "I2C_SDA"}, "OPTIONAL", "JST XH 4-pin (candidate)",
         "For off-board I2C power monitor (generator or pump). Long cables: add bus buffer - TBD."),
    Part("J13", "Connector_Generic:Conn_01x06", "SPARE GPIO", "Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
         33.02, 124.46, 0, {"1": "+3V3", "2": "GND", "3": "EXP_IO4", "4": "EXP_IO13", "5": "EXP_IO23", "6": "EXP_IO33"},
         "OPTIONAL", "1x06 2.54 mm header", "Uncommitted 3.3 V GPIO, unprotected - bench use only"),
]
tps = [("TP1", "VIN_PROT"), ("TP2", "+5V"), ("TP3", "+3V3"), ("TP4", "GND"), ("TP5", "+5V_ESP"),
       ("TP6", "+12V_PUMP"), ("TP7", "PGND"), ("TP8", "PUMP_GATE"), ("TP9", "PUMP_I_ADC"), ("TP10", "PUMP_V_ADC"),
       ("TP11", "SERVO_V+"), ("TP12", "SERVO_GND"), ("TP13", "SERVO_SIG_OUT"), ("TP14", "FLOW_PULSE"),
       ("TP15", "GEN_V_ADC"), ("TP16", "GEN_I_ADC"), ("TP17", "I2C_SDA"), ("TP18", "I2C_SCL"), ("TP19", "GND"),
       ("TP20", "PUMP_SW")]
for i, (ref, net) in enumerate(tps):
    col, row = divmod(i, 10)
    TP(H, ref, 167.64 + col * 50.8, 33.02 + row * 12.7, net)
for i in range(4):
    H.parts.append(Part(f"H{i+1}", "Mechanical:MountingHole", "M3", "MountingHole:MountingHole_3.2mm_M3",
                        172.72 + i * 22.86, 157.48, 0, {}, "CONFIRM", "", "Non-plated M3; positions provisional (enclosure unknown)",
                        in_bom=False))
