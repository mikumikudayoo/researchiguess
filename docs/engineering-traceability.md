# Engineering remediation and remaining research evidence

Inspected on 21 October 2026 (Asia/Manila). The repository default branch matched
historical audit commit `a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce` exactly before this
work. Six dependent development branches preserve that history. These changes do
not become default-branch behavior until the researchers review and merge the PRs.
No PR was automatically merged; no Drive manuscript, Canva design or historical
research record was edited as part of this repository task.

## Scope of closure

“Software corrected” means the named implementation now passes its stated checks.
It does not mean the complete research finding is resolved. “Physical validation
required” means records or supervised measurements are still missing. The four
supplied review/manuscript PDFs guided the work. Their private source links and
reported data are not committed to this public repository. Exact historical inputs
were analyzed locally; a researcher must supply the CSV and source manifest to
reproduce that result. Public tests use explicitly artificial fixtures. The input
provenance remains unresolved even when the arithmetic is reproducible.

| Finding | Implemented change | Classification and remaining requirement |
|---|---|---|
| F01 | Separate historical-reported, legacy-replay, corrected-synthetic and future physical data categories; hash-linked manifests | Documentation/data handling corrected. Historical origin blocked pending original logs, acquisition configuration and processing code. |
| F02 | Reproducible conditional five-flow paired calculation | Arithmetic corrected. Independent sampling, meaningful pairing and population inference still require research records. |
| F03 | Historical analysis reports signed per-flow and overall differences; no equivalence claim from nonsignificance | Interpretation corrected in repository output; physical effect remains unverified. |
| F04 | No protection, efficiency, lifespan or durability assertion; absent safety threshold is explicit | Documentation corrected. Mechanical/load/overspeed/durability validation required. |
| F05 | One increasing physical-pitch schedule used by HTTP server and simulator; affine linkage configurable; old schedules archived | Software inconsistency corrected under the new design decision. Physical mapping and pitch convention require measurement. |
| F06 | Versioned assumed plant; built-in peak disclosed; all comparators retained | Model/documentation improved under explicit assumptions. Measured pitch sweep and plant identification required. |
| F07 | True step/ramp/profile flow reaches plant and sampled controller input; noise/delay/actuation separated | Dynamic model behavior implemented and tested. No hardware transient validation. |
| F08 | Load power uses VI=I²RL=V²/RL; internal loss separated; historical scaling untouched | Electrical arithmetic/boundary corrected. Generator characterization and mechanical energy balance required. |
| F09 | Raw ADC, optional calibrated current and missing rpm/voltage channels distinguished; structured telemetry | Software/data labels corrected. Measurement hardware and calibration remain incomplete. |
| F10 | Explicit ESP32 adapter, separate sketch target, review gates and incomplete private configuration template | Documentation/configuration improved. Actual board, schematic and wiring remain researcher decisions. |
| F11 | Disabled default, explicit local arm/pump commands, strict bounded HTTP parser, freshness checks and latched faults | Host-tested software behavior corrected. Real board build, fault policy, external interlock and bench validation remain required. |
| F12 | Hydraulic efficiency stays null; missing head/torque/shaft power documented | Documentation corrected; physical hydraulic/electrical input measurements required. |
| F13 | Fixed memberships, singleton rules and weighted-average inference documented; no ML/adaptation/optimization claim | Controller specification corrected. Schedule performance/optimality remains unestablished. |
| F14 | Physical pitch and servo command separated, configurable reversed linkage and travel checks | Software transform implemented; as-built geometry, actual pitch, backlash, torque and latency calibration remain open. |
| F15 | Historical analysis refuses invented rpm/voltage series; new synthetic channels are separately labeled | Documentation/schema corrected. Historical raw multichannel records remain unavailable. |
| F16 | Both n−1 sample SD and n finite-list SD computed at explicit aggregation levels | Arithmetic corrected. Low dispersion does not establish physical accuracy; calibration uncertainty remains unknown. |
| F17 | Listed column index is not a trial identifier; five flow means are distinct from 25 listed values and time samples | Analysis boundaries documented. Original independence/pairing/run-order design remains unverified. |
| F26 | Separate unit-labeled historical power plots and synthetic time histories | Repository visuals corrected. Historical time-domain stability cannot be recovered without raw time series. |
| F29 | Measured pulse-window duration, brief spinlock, counter-overflow and stale checks | Software timing corrected. Pulse coefficient, debounce, low-flow quantization and actual timing need bench calibration. |
| F30 | Initial state before transitions; explicit grid, measurement window and time-weighted summaries | New model timing corrected. Historical timing/aggregation remains unresolved. |
| F31 | Fixed 5°, fixed 42°, fuzzy and simple increasing linear comparators share inputs/windows/assumptions | Computational comparison improved. Physical baseline sweep and prospective speed/power objective remain required. |

Other findings about authorship, bibliography, school formatting, presentation and
research governance are outside this code-change scope. They are not declared
resolved by these PRs. F18's friction/latency explanation is not promoted to a cause:
configurable modeled actuator lag is an assumption, not measured attribution.

## Historical versus corrected behavior

| Aspect | Preserved audited pathway | New pathway |
|---|---|---|
| Fuzzy pitch schedule at five nominal flows | simulator: 70, 55, 40, 25, 10; server: 10, 25, 40, 58, 75 | requested physical pitch: 10, 25, 40, 58, 75; servo direction depends on explicit mapping |
| Electrical power | additional 0.65 multiplier after terminal VI | load VI; internal copper loss at its own boundary |
| First row | state already advanced but labeled t=0 | initial speed/pitch emitted before transition |
| Speed integration | exponential first-order update using `1 - Math.exp(-dt/tau)` | same exponential first-order update using `-Math.expm1(-dt/tau)` |
| Perturbation | post-state synthetic speed noise; constant flow | constant mode labels optional speed perturbation; dynamic mode varies true flow and separately samples noisy flow |
| Initial conditions/windows | original inclusive historical loop and full-row averages | explicit scenario initial state, integer time grid and declared acquisition window |
| RNG | historical seed/stream/order preserved byte-for-byte | independent per-run seeded streams, common exogenous inputs across comparators |
| Physical status | uncalibrated synthetic code | still uncalibrated synthetic code; improved consistency is not calibration |

Both speed updates solve the assumed first-order response exactly for a target held
constant over an interval; the historical update is not forward Euler. `expm1`
improves numerical evaluation when `dt/tau` is small by avoiding subtraction of
nearly equal values. Separately, the historical loop advances the state before
recording its row labeled time zero; the new pathway records the initial state
before the first transition. These are distinct numerical-evaluation and timing
changes, not a transition from Euler to exact integration.

The corrected power is not simply a universal rescaling of historical summaries:
timing, controller direction, numerical evaluation and optional perturbation also differ.
Never overwrite the historical table with a new simulation result.

## Required researcher decisions and measurements

1. Identify the original source of the fifty reported power values, with run IDs,
   timestamps, equipment/software version and exact aggregation window.
2. Define the as-built blade reference radius/datum and positive pitch direction;
   measure command versus actual pitch in both directions and under relevant load.
3. Confirm the ESP32 board, pins, sensor voltage levels, relay inactive polarity,
   PWM pulse range/attachment transient and independent shutdown arrangement.
4. Establish a supervised fault policy. Removing PWM, holding a command or moving
   to a chosen pitch cannot be called safe without physical justification.
5. Calibrate pulses against timed collected volume; characterize current/voltage,
   rpm and pitch acquisition with uncertainty and synchronized timestamps.
6. Characterize generator EMF/resistance/load response, head/flow and torque or
   shaft power if efficiency is a research outcome. Include pump/actuator/control
   consumption in any net energy claim.
7. Measure a fixed-pitch sweep and define the speed-versus-power objective before
   tuning a schedule. Establish speed ratings/limits before protection claims.
8. Confirm the as-built board and recheck the pinned toolchain against that target
   before a supervised bench protocol with power isolation and recorded calibration.
   The illustrative-target compile and host mocks cannot settle hardware behavior.

## Review and reproducibility

The retained legacy test hashes every generated CSV. Controller tests exercise
nominal/intermediate/boundary inputs, reversed mapping and actual HTTP parity.
Model tests cover analytic integration, electrical identities, schema and manifest
output. Dynamic tests cover causal sampling/delivery, integer-grid events, actuator
limits, comparator-order independence and startup-aware metrics. Firmware tests
compile portable C++ and the actual disabled/enabled adapter against fake APIs.
A separate compile-only check builds both paths with a pinned real ESP32 toolchain
and a non-production fixture; see [firmware documentation](firmware.md) for versions
and target limitations.
Historical-analysis tests use explicitly artificial fixtures and analytic/distribution oracles, and reject malformed
or mislabeled data. Type checking and builds run with pinned Bun/TypeScript.

Each CLI refuses existing output directories and records configuration, software,
runtime and source/output hashes. Review a completed manifest together with its
files; a dirty-tree flag requires the recorded source hashes, not only a commit ID.
New stochastic seeds and correlated timestamps are computational repetitions, not
independent physical experiments. No confidence interval for a nonexistent physical
experiment is generated.
