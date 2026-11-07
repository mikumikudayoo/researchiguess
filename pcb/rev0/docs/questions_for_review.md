# Questions for the research adviser and consultant (meeting 2026-11-08)

Ordered roughly by how much each answer unblocks. References use schematic designators.

## A. Power and grounding

1. **Supplies.** Which DC sources will power `VIN_LOGIC` (J1), `PUMP_VIN` (J2) and `SERVO_VIN` (J4)?
   Is it one bench supply, separate supplies, a battery, or a charger? What are the minimum and maximum
   voltages, including float/charge voltage and transients?
2. **Ground loop.** PGND and SERVO_GND each join logic GND at one point (NT1, NT2). If one supply with a
   common negative feeds both J1 and J2 (or J4), part of the pump or servo return current will flow back
   through the logic negative wire and bypass the single-point join. Should rev 1 have a single power
   entry with an on-board star point, keep separate supplies, or require one negative wire per supply?
3. **External interlock.** What physical isolation or emergency-stop device should sit in series with
   `PUMP_VIN` (and `SERVO_VIN`)? The board provides the separate entry, fuse and hardware enable
   jumper JP1, but it is not a safety controller.
4. **Logic input protection.** Is the PTC + series Schottky + bidirectional TVS (SMBJ18CA class) chain on
   VIN_LOGIC appropriate for the expected supply? Is the TVS clamp voltage compatible with U1's
   absolute-maximum input?
5. **DevKitC powering.** The carrier feeds the DevKitC 5 V pin through SS14 (D3) to block back-feed to and
   from USB. The resulting ~4.6 V input may leave little headroom for the DevKitC's 3.3 V LDO during Wi-Fi
   current peaks. Is a diode acceptable, or should rev 1 use an ideal-diode/power-path IC, or a
   documented rule "never connect USB while carrier-powered"?

## B. Pump

6. What are the pump's model, rated voltage, running current, stall current and inrush?
7. Is a low-side logic-level MOSFET (AO3400A class, SOT-23) with gate pull-down acceptable for the measured
   current, or should rev 1 use a larger package or a gate driver? Is a mechanical relay preferred for
   galvanic separation?
8. Is "pump OFF by hardware unless IO26 actively drives high and JP1 is fitted" the correct
   default-off definition for this rig? Should JP1 be replaced by a panel switch or interlock connector?
9. Reverse polarity on `PUMP_VIN` is currently cleared only by fuse F2 (through Q1's body diode and D5).
   Is that acceptable, or is a series or ideal-diode reverse-polarity stage required?
10. Should pump current sensing stay on-board (shunt R5 + INA180), or move to an external module? What
    full-scale current and resolution are needed for the energy-balance claims?

## C. Servo and blade pitch

11. Which servo will be used (voltage, stall current, analog/digital, signal-level tolerance)?
12. **Mechanical safe state.** What should the blade do on fault, loss of PWM, or loss of servo power?
    The board only guarantees "no pulses while the MCU pin is high-Z". It does not define a safe pitch.
13. Is a 5 V buffered servo signal (U4) appropriate, or does the servo accept 3.3 V directly?
14. Should actual blade pitch be measured (J8 pitch-feedback input), and with what sensor?

## D. Generator measurement

15. What is the generator: brushed DC, or a permanent-magnet machine with a rectifier? What are its
    open-circuit voltage at maximum flow and its maximum load current?
16. Is it acceptable to bond the generator/load negative to logic GND (J9 pin 2 = GND), or must the
    measurement be isolated?
17. Preferred current measurement: an off-board hall sensor on J10, or an I2C power monitor
    (INA219/INA226 class) on J12 that measures V and I together? Which terminals define "generator
    output power" for the manuscript?
18. Is the planned RPM measurement (J7: hall, optical or back-EMF) needed for the protection objective?

## E. Controller and layout

19. Which exact ESP32 board will be used? Can we measure its row spacing, pin order and antenna overhang
    so J14/J15 and the keep-out can be fixed?
20. Do you agree with the proposed GPIO map (`gpio_map.md`), in particular moving I2C off IO2/IO0 and the
    servo off IO5?
21. What enclosure and mounting does the rig need (board size, connector edge, cable entry, splash
    protection near the water circuit)?
22. Which fabrication service and design rules should rev 1 target (minimum track/space, copper weight)?
23. Should rev 1 move from a socketed dev board to a module-on-board design, or stay modular for the
    research phase?

## F. Process

24. Which of the open items must be closed before a first **unpowered** assembly, and which before first
    energization of logic only (no pump or servo power)?
25. Who signs off the bench protocol (supervised power-up sequence, current-limited supply settings,
    isolation checks) before the pump or servo is connected?
