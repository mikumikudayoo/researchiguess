# Corrected illustrative model, version 2

This is a new synthetic simulation. It is not a physical experiment, calibration,
reconstruction of the manuscript's original observations, or a validated hydropower
plant. The byte-preserved historical simulator remains under `legacy/a37d1d5/`.
Its opposite-direction fuzzy controller is an archive reference, not the authority
for this implementation. The changing pitch schedules here increase with flow.

## Run and provenance

With the pinned Bun runtime installed, run:

```sh
bun scripts/simulate.ts results/corrected-constant-v2
# Optional second positional argument: a complete JSON configuration.
bun scripts/simulate.ts results/my-new-run path/to/config.json
```

The output directory must not already exist. `config.json` records the complete
model, scenario and controller configurations and can be reused as the optional
configuration argument. `manifest.json` includes the model/schema versions, runtime,
Git commit and dirty status, canonical configuration SHA-256, source-file SHA-256
values, combined source hash, output hashes, row count, seeds, window and limitations.
An interrupted run retains `status: incomplete`; only a completed run is suitable
for downstream analysis. A commit alone does not identify uncommitted code: check
the recorded source hashes too. `samples.csv` preserves full numerical precision;
its `measurementWindow` column contains quoted JSON. `summaries.json` contains
descriptive run results, not tests of statistical significance.

## Explicit assumptions and units

| Parameter | Default | Unit and status |
| --- | ---: | --- |
| Flow-to-speed coefficient | 120 | rpm / (L/min), assumed |
| Response time constant | 3 | s, assumed |
| EMF coefficient | 0.015 | V/rpm, assumed |
| Internal resistance | 1 | ohm, assumed |
| Load resistance | 10 | ohm, assumed |
| Model speed peak | 42 | degrees of modeled physical pitch, assumed |
| Width of pitch response | 35 | degrees, assumed |
| Maximum speed-multiplier decrease | 0.45 | dimensionless, assumed |
| Common plant pitch envelope | 5–75 | degrees, illustrative operating bound |
| Flow envelope | 0–6 | L/min, illustrative operating bound |

The model configuration is separate from the constant-flow scenario. The default
scenario declares flows 1, 2.25, 3.5, 4.75 and 6 L/min; seeds 20260827–20260831;
time step 0.1 s; duration 60 s; initial speed 0 rpm; common initial pitch 42°;
measurement interval [30, 60] s; and zero speed perturbation. These are explicit
example settings, not measured quantities. Retaining historical coefficient values
allows examination of arithmetic/timing changes without inventing calibration.

Let q be flow in L/min and theta be physical pitch in degrees:

```text
m(theta) = 1 - 0.45 min(|theta - 42| / 35, 1)
n_target = (120 rpm/(L/min)) q m(theta)
n_next = n + (n_target - n) [1 - exp(-dt/tau)]
```

`m` is an assumed speed multiplier (minimum 0.55), not turbine efficiency.
Under the default parameters, the 42° comparator necessarily maximizes target speed
within this chosen model; that result cannot establish a physical optimum. The
fixed-42 comparator remains at 42° if the configured assumed peak is changed;
it then need not coincide with that peak. The old outer floor of 0.35 was
inactive because the inner expression never fell below 0.55; removing the inactive
floor does not change the multiplier. First-order integration is exact for the
assumed constant target within each interval. This is not a torque/inertia model.

The generator is a resistive Thevenin equivalent:

```text
E = k n             [V]
I = E/(Ri + RL)     [A]
V = I RL           [V across the load]
PL = V I = I^2 RL   [W delivered to the load]
P_copper = I^2 Ri   [W internal resistive loss]
E I = PL + P_copper [W electrical power balance]
```

The historical additional 0.65 factor is absent from load power. Multiplying `VI`
by that factor would not represent power at the stated load boundary. This circuit
identity does not supply shaft or hydraulic power. The model has no measured head,
hydraulic input power, torque, generator mechanical losses, or speed response to
electrical loading; it cannot establish hydraulic efficiency or a physically closed
energy balance. `hydraulicEfficiency` is therefore explicitly `null`. Integrating
modeled load power gives synthetic load energy, not proof of recoverable river energy.

## Comparators and coordinates

All comparators use the same model, initial conditions, time grid, nominal/true/sensed
flow, mapping, load and measurement window. All requested/actual pitches must fit
the common plant envelope 5–75°. A controller's actual used range can be a subset:

| Comparator identifier | Rule | Used pitch range |
| --- | --- | --- |
| `fixed-5` | constant historical-reference baseline | 5° |
| `fixed-assumed-peak-42` | constant assumed-model-peak baseline | 42° |
| `fuzzy-increasing` | shared controller API and configured singleton schedule | default 10–75° |
| `linear-increasing` | interpolation between the same low/high flow and pitch endpoints | default 10–75° |

The changing controls use the same configured pitch resolution, output limits,
out-of-range policy, and servo mapping. The fuzzy comparator directly calls
`simulationCommand`, which calls the central `commandForFlow` implementation.
The linear comparator is a feedforward schedule, not a feedback PID controller.
Neither schedule learns or optimizes. The fixed 5° comparator is intentionally
outside the changing schedules' 10–75° subset but inside the common plant envelope.

Requested physical pitch, servo command and modeled actual pitch are separate
columns. The default identity mapping is unverified. At t=0 the row contains the
common initial physical pitch and speed, plus each controller's requested command;
no mechanical integration or random draw has occurred. The command is assumed to
apply instantaneously just after t=0 and governs the first interval (0, dt]. Later
actual modeled pitch is the inverse mapping of the command. This timing convention
is an ideal-actuator assumption, not a tested servo response. No hardware commands
are sent. Changing the configuration cannot by itself establish calibration.

## Time, perturbation and summaries

Duration and measurement-start time must be integer multiples of dt, allowing a
small floating-point quotient tolerance (1e-9). The window start must be strictly
positive and less than duration. There are duration/dt transitions and one extra
initial row: defaults give 600 transitions and 601 rows per run. The final timestamp
is duration exactly. Both declared window endpoints are included; startup samples
outside the window are excluded from the summaries.

Optional `speedPerturbationFraction` a must satisfy 0 <= a < 1. For a > 0, a
Mulberry32 uniform variate u supplies a multiplier `1 + a(2u - 1)` after each
state update. This changes reported speed and its derived electrical quantities;
it does not modify the internal speed state, flow, or controller input. It is
synthetic output-speed perturbation, not water turbulence, a flow disturbance or
a calibrated sensor-noise model. The t=0 multiplier is 1. No variates are drawn
when a=0. Seeds must be unsigned 32-bit integers. Each flow/seed/controller starts
a fresh stream, so matching seeds give identical perturbation profiles to all
comparators and do not depend on execution order. This differs from the historical
stream that continued across flow levels. With a=0, different seeds produce the
same values; they are duplicate deterministic runs, not additional evidence.

Means are time-weighted trapezoidal integrals divided by the exact window duration.
Load energy is the corresponding power integral in joules. Reported maxima/minima
are maxima/minima of sampled speeds within the window, not certified continuous
extrema. No p-values or confidence intervals are fabricated; time points and seeds
are not independent physical experiments. The API rejects mixed run identities,
non-increasing timestamps and missing window endpoints before summarization.

## Reuse and limits

`src/model/plant.ts` exposes the electrical calculation, assumed multiplier,
target-speed law and exact single-interval transition. `src/model/random.ts`
provides an independent deterministic RNG. `comparatorCommand` exposes matching
controller decisions; `runConstant` and `summarizeRun` provide the constant-scenario
runner and descriptive analysis. Future scenarios must explicitly define true flow,
sensed flow, actuation and timing instead of calling this output perturbation a flow
test. All model/scenario coefficients are validated as finite and within their
declared constraints. No hydraulic energy balance, overspeed limit, wear model,
mechanical protection, stability under disturbances or physical readiness is claimed.
