# Synthetic dynamic scenarios

These scenarios exercise the corrected illustrative model and shared controller.
They are software experiments with assumed parameters, not physical validation,
field measurements, network benchmarks or evidence of mechanical protection.
Read [model.md](model.md) for the generator boundary, speed law and model limitations.

## Run, configuration and output

```sh
bun scripts/simulate-dynamics.ts results/corrected-dynamics-v1
bun scripts/simulate-dynamics.ts results/my-new-dynamic-run path/to/config.json
```

The output directory must be new. The optional JSON file is a complete configuration
with exactly `schemaVersion`, `id`, `model`, `controller`, `seeds`, `controllerIds`
and `scenarios`. Its schema version is `taph.dynamic-run-config.v1`. Start from a
generated `config.json` to make an explicit variant; never overwrite a previous
run. The model and controller configurations retain their independently validated
schemas. Scenarios use `taph.dynamic-scenario.v1`. Seeds must be distinct unsigned
32-bit integers; scenario IDs and selected comparator IDs must be unique. Invalid
inputs are rejected before creating the output directory.

| Output | Purpose |
| --- | --- |
| `config.json` | Complete assumed settings, profiles, seeds and controller selection |
| `manifest.json` | Configuration/source/output SHA-256 values, Git commit/dirty status, Bun version/revision, windows, schemas, row count and limitations |
| `samples.csv` | Full-precision samples; nested measurement window is quoted JSON |
| `comparison.json` / `comparison.csv` | One descriptive record per scenario, seed and controller; nested step response is JSON |
| `deliveries.json` | Issuance and delivery times of commands actually delivered within each run |
| `timeseries-<scenario-id>.svg` | Full-run flow, speed, power and pitch plots, all selected comparators, first declared seed |
| `comparison-power-versus-speed.svg` | All runs' time-weighted mean load power against mean speed |

The manifest starts as `incomplete` and becomes `complete` only after all outputs
and their hashes exist. A partial directory must not be analyzed as a completed
run. A Git commit without the source hashes does not identify dirty source files.
The SVG files are deterministic for the same configuration and source; the manifest
creation timestamp describes execution time. Every plot includes zero on its axes
and states its units. Pitch axes also retain negative physical coordinates when
an explicitly configured mapping and model permit them; the defaults are nonnegative.
Coincident points can overlap, especially duplicate noise-free
runs and fixed comparators; the comparison files preserve every row. There are no
fabricated error bars, significance tests or confidence intervals.

## Four default scenarios

Every default scenario uses the same plant, initial speed 0 rpm, initial actual
pitch 42°, dt 0.1 s, duration 60 s, and inclusive measurement window [10, 60] s.
The window includes startup and event-related transients; it is not labeled a
steady-state window. Two seeds, 20260827 and 20260828, are evaluated for each of
the four comparators from `model.md`. Thus the default run has 32 runs and 19,232
rows (601 rows per run, including the initial state).

| Scenario ID | Prescribed true flow | Sensor noise half-width |
| --- | --- | ---: |
| `constant-sensor-noise-v1` | 3.5 L/min throughout | 0.03 L/min |
| `noise-free-step-v1` | 1 L/min before 15 s, 6 L/min at and after 15 s | 0 L/min |
| `ramp-sensor-noise-v1` | 1 L/min until 10 s, linear rise to 6 L/min at 40 s, then hold | 0.03 L/min |
| `profile-sensor-noise-v1` | Piecewise-linear knots (s, L/min): (0,2), (10,2), (20,5.5), (35,2.5), (45,6), (60,3.5) | 0.03 L/min |

The noise-free step deliberately supplies a well-defined final target for the
conditional step-response metrics. Its two seeds produce duplicate deterministic
results; they are not two independent experiments. Direct `runDynamic()` defaults
retain the noisy `exampleDynamics` step; the CLI explicitly overrides that noise
parameter for its named noise-free scenario. The full saved configuration resolves
this distinction. A custom configuration can declare other validated profiles or
subsets of the comparators; plots and row counts reflect that selection.

## Sensing, communication and actuation assumptions

| Parameter | Default | Interpretation |
| --- | ---: | --- |
| Sensor period | 0.5 s | Sample at t=0 and each declared period; hold between samples |
| Communication delay | 0.2 s | Fixed queue delay; no loss, jitter, corruption, reconnection or queue overload model |
| Sensor noise | Uniform additive ±0.03 L/min where enabled | Assumed half-width, not a measured standard deviation |
| Actuator time constant | 0.4 s | Assumed first-order response of modeled physical pitch |
| Actuator rate limit | 45 degrees/s | Assumed maximum pitch change rate |
| Response band fraction | 0.02 | Step settling band of 2% of absolute final model speed target |

The CLI controller uses the shared increasing schedule with an explicit `clamp`
policy and a distinct configuration ID `increasing-pitch-clamp-v1`. Its physical
pitch/servo mapping is still the unverified identity example. Sensor noise can
move an input outside the controller's nominal 1–6 L/min domain: the configured
clamp handles that case. The sensor reading is first clipped to the model's
physical flow envelope [0, `flowMaxLMin`]. Clipping can bias readings near a bound.
After that, the controller's own domain policy applies. Neither clipping rule is
an actual sensor specification or calibration.

Each scenario/seed/controller starts a fresh Mulberry32 stream. Identical seeds
and sensor schedules give identical raw sensor-noise draws to every comparator;
there is no per-controller advantage from different random inputs. No random draws
are consumed when noise is zero. The true flow remains the specified profile;
sensor noise affects its reported reading, not the physical flow input. This
differs from the optional output-speed perturbation in the constant runner.
Dynamic rows have a speed-perturbation multiplier of 1.

At grid time t, the speed and actual pitch are the states resulting from the
preceding interval. Sampling, command issuance and due deliveries occur at t,
then the row is logged. These events can affect only the following interval.
The t=0 row preserves the common initial speed and actual pitch even if a command
is sampled or delivered at t=0. The requested command, delivered target and actual
modeled pitch are distinct quantities. Before the first delivery the applied
target remains the initial pitch. Commands queued beyond run end are not counted
as delivered.

The next actual pitch follows the first-order target change, limited by the
configured maximum degrees per interval. A zero actuator time constant means
instantaneous response before any rate limit; a null rate limit means no rate
limit. Only the combination of zero time constant and null rate limit is the
ideal instantaneous actuator. For finite actuator dynamics, speed integration
uses left-held flow and actual pitch while pitch advances separately. This is a
discrete coupling approximation, not an exact solution of coupled mechanical
dynamics. The first-order speed transition is exact only for its held target
within that interval. A physically justified solver requires additional model
and measurement evidence; changing dt is a numerical sensitivity study, not
physical validation.

Duration, window start, sensor period, communication delay, event times and
profile-knot times must align with the dt grid. Profile events and command delays
are resolved by integer grid indices, avoiding a late event caused by floating-point
representations such as 0.3 times 3. The sensor period is at least dt;
the window start is positive and before duration; delays are nonnegative; noise
and actuator parameters must satisfy explicit finite bounds. A step occurs at
its event timestamp; a ramp and a profile interpolate their supplied true-flow
values. Flow samples govern subsequent intervals, so a step never changes an
already elapsed interval.

## Reading the schema

Every row retains `schemaVersion: taph.simulation-row.v2` and
`category: corrected-synthetic-simulation`, with the extension field
`dynamicsSchemaVersion: taph.dynamic-row.v1`. Provenance includes scenario, run,
controller, model version, configuration ID and seed. No dynamic row is relabeled
as a physical measurement.

- `nominalFlowLMin` is the initial profile value, a fixed reference for the run.
  `trueFlowLMin` is the prescribed profile at the row timestamp. `sensedFlowLMin`
  is the latest clipped, sampled-and-held reading, which can be older than true flow.
- `sensorSampleTimeS` identifies that reading's sampling time. `sensorNoiseLMin`
  is its raw noise draw before physical clipping; it need not equal sensed flow
  minus current true flow, because clipping and holding both matter.
- `requestedPitchDeg`, `servoCommandDeg` and `commandIssuedTimeS` describe the
  latest issued command. They may differ from the last delivered target.
- `appliedTargetPitchDeg`, `appliedServoCommandDeg` and
  `lastCommandDeliveryTimeS` describe the latest delivery. A null delivery time
  means no command has been delivered yet. `actualModeledPitchDeg` is the actuator
  state, not an encoder measurement.
- `rpm`, `voltageV`, `currentA`, `pLoadW`, `emfV`, `internalCopperLossW` and
  `emfPowerW` are model calculations. Load power is VI at the load boundary.
  `hydraulicEfficiency` remains null because the hydraulic/shaft balance is absent.

## Descriptive comparison and conditional step metrics

The comparison uses each scenario's explicit inclusive window. Mean rpm and mean
load power are trapezoidal time-weighted means; load energy is the power integral
in joules. Maxima and minima refer to sampled values. `rpmCv` is the square root
of the time-weighted integral of squared deviations from the window mean, divided
by that mean; it is null for zero mean. It describes that whole window, including
any prescribed transients. It does not isolate controller-induced variability
or establish a noise-rejection advantage.

Step metrics are available only for a changed step input with zero sensor noise.
The final target comes from the same assumed plant and comparator, not a measured
steady-state operating point. Settling time is the first sampled point after the
last out-of-band sample, measured from the event, provided the observed in-band
suffix starts before run end. A null value means the finite record does not supply
that result. Staying in the band through this record is not proof of asymptotic
stability. If the final target is zero, the relative band has zero width.

Overshoot is the greatest sampled excursion beyond the final target in the
direction from the actual modeled speed at the event to the final equilibrium
target, divided by the absolute displacement between those two values. It is null
when that displacement is zero. `referenceRpmAtEvent` states the actual event-state
reference; `nominalPreStepTargetRpm` separately records the theoretical pre-event
equilibrium. The metric does not assume that the rotor reached equilibrium before
the event, and `overshootBasis` records the definition. Command response delay is the
time from the step to the first delivered post-event command whose pitch differs
from the pre-event command. It is null when no such command is delivered or the
fixed comparator has no changed pitch command. This quantity includes sampling
alignment plus the modeled communication delay; it is not a wall-clock benchmark.
No tracking target or settling result is invented for noisy or continuously
changing profiles, so their `stepResponse` is null.

`safetyThresholdRpm` is null and `protectionValidated` is false. A lower maximum
speed, smaller coefficient of variation, greater mean load power, lower energy,
shorter response delay and improved physical protection are distinct claims.
The power-versus-speed scatter is descriptive: electrical power is derived from
speed by the assumed resistive model, so the association is built in. None of
these simulations supplies hydraulic efficiency, wear, lifespan, a validated
safe-speed threshold, a physically optimized pitch schedule or prototype readiness.
