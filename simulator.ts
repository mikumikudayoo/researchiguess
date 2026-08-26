import { write } from "bun";
import { mkdirSync } from "node:fs";

// ============================================================
// SIMULATION PARAMETERS
// ============================================================

// These are ASSUMED parameters for a synthetic simulation.
// Replace them with measured generator/turbine specifications
// if this is intended to represent a real physical system.

const VOLTS_PER_RPM = 0.015; // Generator open-circuit voltage per RPM
const R_LOAD = 10;           // External electrical load (ohms)
const R_INTERNAL = 1.0;      // Generator internal resistance (ohms)
const GENERATOR_EFFICIENCY = 0.65;

// Mechanical response.
const TIME_STEP_S = 0.1;
const RPM_TIME_CONSTANT_S = 3.0;

// Simulation duration
const SIMULATION_TIME_S = 60;
const TOTAL_STEPS = Math.round(SIMULATION_TIME_S / TIME_STEP_S);

// Flow levels in L/min
const flowLevels = [1.00, 2.25, 3.50, 4.75, 6.00];

// ============================================================
// CONTROLLER PARAMETERS
// ============================================================

// Fixed-angle comparison groups.
const FIXED_CONTROL_ANGLE = 5;
const FIXED_OPTIMAL_ANGLE = 42;

// Conventional proportional controller.
// The controller adjusts blade angle according to flow error
// relative to a nominal reference flow.
//
// This is a simplified conventional baseline and should be
// replaced with a tuned controller if measured system data
// are available.
const PROPORTIONAL_REFERENCE_FLOW = 3.5;
const PROPORTIONAL_KP = 12;

// Blade-angle limits.
const MIN_BLADE_ANGLE = 5;
const MAX_BLADE_ANGLE = 70;

// ============================================================
// REPRODUCIBLE RANDOM NUMBER GENERATOR
// ============================================================

function createRng(seed: number) {
    let state = seed >>> 0;

    return function random() {
        state += 0x6D2B79F5;

        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ============================================================
// GENERATOR MODEL
// ============================================================

function calculateElectricalOutput(rpm: number) {
    if (rpm <= 0) {
        return {
            voltage: 0,
            current: 0,
            power: 0,
        };
    }

    // Approximate generator EMF.
    const emf = rpm * VOLTS_PER_RPM;

    // Simple Thevenin-equivalent generator model:
    //
    //     E ---- R_INTERNAL ---- R_LOAD
    //
    const current = emf / (R_INTERNAL + R_LOAD);

    // Actual voltage across the external load.
    const loadVoltage = current * R_LOAD;

    // Electrical power delivered to the load.
    const loadPower = loadVoltage * current;

    // Approximate generator/mechanical losses.
    const usefulPower = loadPower * GENERATOR_EFFICIENCY;

    return {
        voltage: loadVoltage,
        current,
        power: usefulPower,
    };
}

// ============================================================
// FUZZY CONTROLLER
// ============================================================

function triangularMembership(
    x: number,
    left: number,
    center: number,
    right: number
) {
    if (x <= left || x >= right) return 0;

    if (x === center) return 1;

    if (x < center) {
        return (x - left) / (center - left);
    }

    return (right - x) / (right - center);
}

function getFuzzyAngle(flow: number) {
    // Three overlapping fuzzy flow regions.
    const low = triangularMembership(flow, 0.5, 1.0, 3.5);
    const medium = triangularMembership(flow, 1.0, 3.5, 6.0);
    const high = triangularMembership(flow, 3.5, 6.0, 8.0);

    // Singleton outputs for each fuzzy rule.
    const LOW_ANGLE = 70;
    const MEDIUM_ANGLE = 40;
    const HIGH_ANGLE = 10;

    const denominator = low + medium + high;

    if (denominator === 0) {
        return 40;
    }

    const angle =
        (low * LOW_ANGLE +
            medium * MEDIUM_ANGLE +
            high * HIGH_ANGLE) /
        denominator;

    return Math.round(angle);
}

// ============================================================
// CONVENTIONAL PROPORTIONAL CONTROLLER
// ============================================================

function getProportionalAngle(flow: number) {
    // Flow error relative to the nominal operating point.
    const error =
        PROPORTIONAL_REFERENCE_FLOW - flow;

    // Proportional control action.
    const angle =
        FIXED_OPTIMAL_ANGLE +
        PROPORTIONAL_KP * error;

    // Constrain angle to physically allowed limits.
    return Math.round(
        Math.max(
            MIN_BLADE_ANGLE,
            Math.min(MAX_BLADE_ANGLE, angle)
        )
    );
}

// ============================================================
// TURBINE / RPM MODEL
// ============================================================

function getBaseRpm(flow: number) {
    // Simplified relationship between flow and unloaded turbine speed.
    // Replace with measured turbine data where available.
    return flow * 120;
}

function getBladeAngleEfficiency(angle: number) {
    // Approximate efficiency curve around a nominal optimum angle.

    const optimumAngle = FIXED_OPTIMAL_ANGLE;
    const width = 35;

    const normalizedError =
        Math.abs(angle - optimumAngle) / width;

    return Math.max(
        0.35,
        1 - 0.45 * Math.min(normalizedError, 1)
    );
}

// ============================================================
// FIRST-ORDER RPM RESPONSE
// ============================================================

function updateRpm(
    currentRpm: number,
    targetRpm: number
) {
    const response =
        1 - Math.exp(-TIME_STEP_S / RPM_TIME_CONSTANT_S);

    return currentRpm +
        (targetRpm - currentRpm) * response;
}

// ============================================================
// SIMULATION HELPER
// ============================================================

function simulateController(
    systemType: string,
    flow: number,
    rep: number,
    waterNoiseProfile: number[],
    getAngle: (flow: number) => number
) {
    let currentRpm = 0;

    const baseRpm = getBaseRpm(flow);

    let csvRows = "";

    for (let step = 0; step <= TOTAL_STEPS; step++) {
        const timestampMs =
            Math.round(step * TIME_STEP_S * 1000);

        // Controller determines blade angle.
        const bladeAngle = getAngle(flow);

        // Blade angle affects turbine efficiency.
        const bladeEfficiency =
            getBladeAngleEfficiency(bladeAngle);

        // Target RPM depends on flow and blade efficiency.
        const targetRpm =
            baseRpm * bladeEfficiency;

        // First-order mechanical response.
        currentRpm = updateRpm(
            currentRpm,
            targetRpm
        );

        // Apply the SAME water disturbance profile
        // to every controller for a fair paired comparison.
        const finalRpm = Math.max(
            0,
            currentRpm * waterNoiseProfile[step]
        );

        const electrical =
            calculateElectricalOutput(finalRpm);

        csvRows +=
            `${timestampMs},` +
            `${flow.toFixed(2)},` +
            `${rep},` +
            `${systemType},` +
            `${bladeAngle},` +
            `${finalRpm.toFixed(1)},` +
            `${electrical.voltage.toFixed(4)},` +
            `${electrical.current.toFixed(4)},` +
            `${electrical.power.toFixed(4)}\n`;
    }

    return csvRows;
}

// ============================================================
// MAIN SIMULATION
// ============================================================

console.log(
    "Generating reproducible turbine simulation data..."
);

for (let rep = 1; rep <= 5; rep++) {
    const folderName = `replicate_${rep}`;

    mkdirSync(folderName, {
        recursive: true,
    });

    // Each replicate gets its own deterministic RNG.
    const rng = createRng(20260826 + rep);

    for (let trialIdx = 0; trialIdx < flowLevels.length; trialIdx++) {
        const flow = flowLevels[trialIdx];
        const trialNum = trialIdx + 1;

        let csvData =
            "Timestamp_ms,Flow_LPM,Trial_Rep,System_Type,Blade_Angle_Deg,Measured_RPM,Generated_Voltage_V,Generated_Current_A,Generated_Wattage_W\n";

        // --------------------------------------------------------
        // Generate one common water-flow disturbance profile.
        //
        // Every controller receives exactly the same disturbance
        // within this trial for a fair paired comparison.
        // --------------------------------------------------------

        const waterNoiseProfile: number[] = [];

        for (let step = 0; step <= TOTAL_STEPS; step++) {
            // ±3% flow disturbance.
            const noise =
                1 + (rng() * 0.06 - 0.03);

            waterNoiseProfile.push(noise);
        }

        // ========================================================
        // GROUP 1: FIXED 5° CONTROL
        // ========================================================

        csvData += simulateController(
            "Control_5Deg",
            flow,
            rep,
            waterNoiseProfile,
            () => FIXED_CONTROL_ANGLE
        );

        // ========================================================
        // GROUP 2: FIXED OPTIMAL 42° CONTROL
        // ========================================================

        csvData += simulateController(
            "Control_42Deg",
            flow,
            rep,
            waterNoiseProfile,
            () => FIXED_OPTIMAL_ANGLE
        );

        // ========================================================
        // GROUP 3: FUZZY CONTROLLER
        // ========================================================

        csvData += simulateController(
            "Fuzzy_Controller",
            flow,
            rep,
            waterNoiseProfile,
            getFuzzyAngle
        );

        // ========================================================
        // GROUP 4: CONVENTIONAL PROPORTIONAL CONTROLLER
        // ========================================================

        csvData += simulateController(
            "Proportional_Controller",
            flow,
            rep,
            waterNoiseProfile,
            getProportionalAngle
        );

        // ========================================================
        // SAVE CSV
        // ========================================================

        const fileName =
            `${folderName}/trial_${trialNum}_flow_${flow.toFixed(2)}.csv`;

        await write(fileName, csvData);
    }
}

console.log(
    "Simulation complete. Check the replicate folders."
);
