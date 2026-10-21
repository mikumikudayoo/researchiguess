# TAPH research software

TAPH investigates flow-dependent blade-pitch control for hydropower generators.
The revised software implements a fixed fuzzy schedule, an HTTP controller,
**uncalibrated synthetic simulations**, a disabled-by-default ESP32 adapter and a
reproducible historical data analysis. It does not establish physical protection,
hydraulic efficiency, optimized pitch, longer component life or prototype readiness.

The researchers' design requirement is **increasing intended physical blade pitch
with increasing volumetric flow**. Servo rotation, actual blade pitch and angle of
attack are different quantities. The configurable affine linkage remains physically
unverified; a reversed linkage can require decreasing servo commands for increasing
pitch. The example identity transform is not a calibration.

## Install and verify

Use the Bun version pinned in `package.json` (1.4.3), Git, and a C++17-capable `g++`
for host-only firmware tests. TypeScript is pinned to 5.9.3. GitHub Actions runs the
same software checks on Ubuntu.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

Build is a bundling check. Use the source-based commands below from the repository
root to run research workflows; generated bundles are not standalone deployment
packages with embedded source/data manifests. No test flashes firmware, opens a
serial device or energizes equipment. Passing tests verifies the stated software
specification, not physical calibration or scientific validation.

## Choose an explicit evidence pathway

Every output directory must be new. Generated files are excluded from Git by
`results/`; retain completed run directories and their manifests together.

```sh
# Historical software replay, preserving original arithmetic and timing defects:
bun run legacy:simulate -- results/my-legacy-replay

# New corrected constant-flow illustration:
bun run simulate -- results/my-corrected-constant-run

# New dynamic-flow comparisons and plots:
bun run simulate:dynamics -- results/my-dynamic-run

# Reanalysis of the unchanged historical manuscript table:
bun run analyze:historical --input /path/to/power-table.csv \
  --source-manifest /path/to/source-manifest.json --out results/my-historical-reanalysis
```

The constant and dynamic commands accept an optional second positional argument
containing a complete JSON configuration. Their generated `config.json` can serve
as an explicit starting point for a new run. Configurations, source and output
hashes, runtime and software revision are recorded. Do not analyze an incomplete
manifest or treat a dirty source tree as identified solely by its commit hash.

| Evidence category | Meaning |
|---|---|
| `historical-reported-unverified` | Locally supplied reported power values; physical versus simulation origin remains unresolved |
| `historical-simulator-replay` | New execution of the byte-preserved audited synthetic code; not proof of the historical table's source |
| `corrected-synthetic-simulation` | Newly generated outputs from explicit assumed model/scenario/controller configurations |
| `physical-measurement` | Reserved for future documented acquisitions with raw records, instruments and calibration; none supplied here |

Firmware status/acquisition telemetry is labeled unverified bench telemetry and
must not be promoted to a validated physical experiment without a separate run and
calibration record. See [data provenance and analysis](docs/reproducibility.md).

## Historical preservation and entry points

The inspected default branch matched audited commit
`a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce` exactly before these six development
milestones. No intervening historical change was found. All original files remain
in that immutable commit. Byte-identical server/simulator archives, baseline
constants, rule schedules, RNG behavior and all 25 replay CSV fingerprints are
preserved and tested. See [baseline inventory](docs/baseline.md).

The historical server commands 10°,25°,40°,58°,75° at the five nominal flows;
the historical simulator uses 70°,55°,40°,25°,10°. Those records are not changed.
`simulator.ts` now refuses ambiguous direct execution and points to the explicit
commands above. It does not silently substitute a new schedule into an old run.
Legacy CSV `Measured_RPM` is synthetic speed; historical `Generated_Wattage_W`
includes the unexplained additional 0.65 factor after terminal VI.

`bun server.ts` starts the new versioned controller API on localhost with the
unverified identity mapping and hardware eligibility false. The retired numeric-only
route returns 410. Server and new simulations call the same fixed zero-order
Sugeno-style schedule; they do not learn, adapt parameters or discover an optimum.
See [physical coordinates, memberships, rules and protocol](docs/controller.md).

## What the new simulations establish

The corrected electrical boundary uses `PL = VI = I²RL = V²/RL`, with internal
copper loss separate. The initial row is the initial state at t=0, followed by
exact first-order transitions for held targets and explicit measurement windows.
The assumed 42° speed peak is built into the default plant law, not experimentally
discovered. No hydraulic head, torque or closed mechanical energy balance is modeled.
See [constant model assumptions and schema](docs/model.md).

Dynamic scenarios prescribe constant, step, ramp and bounded profile flow. True
flow reaches the plant; separately noisy sampled flow reaches the controller.
Communication delay, actuator time constant and rate limit are uncalibrated
settings. Fixed5, fixed42, increasing fuzzy and increasing linear comparisons
share inputs, initial conditions and windows. Requested, delivered and actual
modeled pitch remain separate. See [dynamic assumptions and metric definitions](docs/dynamics.md).

Outputs include unit-labeled CSV/JSON and reproducible SVGs. Speed, power, energy,
variability and finite-record settling describe the model. Seeds and correlated
time points are not independent physical observations. The model cannot establish
wear, lifespan, overspeed protection, real-time hardware performance or efficiency.

## Historical table reanalysis

The public repository intentionally does not bundle manuscript data, private source
links or their acquisition records. Supply the exact CSV and source manifest locally
as described in [the input schema](docs/reproducibility.md). The tool preserves all
listed values, records byte hashes and produces descriptive tables, SD denominators,
plots and a conditional paired calculation on five flow means. It does not infer
physical provenance, independent sampling or preserved output from a nonsignificant
result. The 25 listed values per condition are described separately; column positions
are not verified trial IDs. Automated tests use explicitly artificial fixtures,
never invented research observations.

## Firmware boundary

The root `sketch_aug3a.ino` stops compilation and points to the separate target
`firmware/esp32/taph_reliability/`. Default configuration initializes serial status
only: no GPIO, sensor, network, servo or relay. The optional operational path needs
private reviewed configuration, calibration records, fresh eligible commands,
explicit local arming and a separate pump command. It never automatically starts
the pump. No zero-angle or hold-last behavior is declared safe.

Portable C++ tests and fake adapter interfaces verify software timing, message
validation, stale data, latching and actuator/pump sequencing. Both firmware paths
also compile with the pinned real ESP32 toolchain, using an illustrative target
and a non-production fixture. This establishes build compatibility only; the
as-built board, wiring, PWM startup, measured linkage, sensor calibration and
supervised bench validation remain unverified. See the versions, target and limits in
[firmware gates and remaining work](docs/firmware.md). The unrelated `badapple.ino`
demo remains unchanged and is not part of the TAPH sketch or validation.

## Review status and next work

Six stacked PRs propose these changes; they were not merged automatically. Review
the PR chain in order. The complete software/documentation/model versus physical
validation classification is in [engineering traceability](docs/engineering-traceability.md).

Before physical deployment, resolve the historical data source, as-built board and
wiring, measured command-to-pitch transform, sensor calibration, physically justified
fault action, external interlock and compile compatibility with the confirmed
as-built board. Then perform a supervised,
recorded bench protocol and a fair fixed-pitch sweep with a predefined speed/power
objective. Narrow claims to the evidence available while those steps remain open.
