# taph research software

TAPH investigates flow-dependent blade-pitch control for hydropower generators. this repository contains historical ESP32 firmware, a fixed fuzzy rule server and an **uncalibrated synthetic simulator**. it is not evidence of validated protection, efficiency or durability.

the researchers' future design requirement is **increasing intended physical blade pitch with increasing volumetric flow**. servo command direction and the mechanical linkage remain unverified. the historical server and simulator disagree; both are preserved for reproducibility.

## baseline commands

use the Bun version pinned in `package.json`:

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun run legacy:simulate -- results/my-new-legacy-replay
```

replay output is a new execution of historical synthetic code, not a physical experiment or proof of the manuscript table's source. existing output directories are rejected to protect earlier records. `Measured_RPM` and `Generated_Wattage_W` in legacy CSVs are historical column names: the former is modeled rpm; the latter includes an unexplained 0.65 scale after terminal VI.

see [baseline inventory](docs/baseline.md) and [baseline manifest](data/baselines/a37d1d5.manifest.json). source hashes and all 25 output files have regression tests. no repository test establishes hardware calibration or scientific validation. the immutable historical firmware contains unreviewed actuator/relay behavior and old network settings; the current replacement is disabled by default.

## controller v1

`bun server.ts` starts the new localhost-only versioned API using the explicitly unverified identity mapping. see [physical coordinates and protocol](docs/controller.md). the shared controller requests increasing physical pitch; reverse servo linkages are supported by an explicit transform. the numeric-only legacy HTTP route is retired to avoid accidental incompatible actuation. archived legacy files and replay outputs are unchanged.

## corrected illustrative model

`bun run simulate -- results/new-constant-run` writes a new, separately versioned
synthetic result set and complete reproducibility manifest. Load power now obeys
`PL = VI = I²RL`; the first row is the actual initial state at t=0. The default
measurement window excludes the first 30 seconds. See [model assumptions and output
schema](docs/model.md). These changes do not validate the assumed turbine law,
the built-in 42° peak, generator constants, or historical manuscript provenance.

## dynamic synthetic comparisons

`bun run simulate:dynamics -- results/new-dynamic-run` compares four controllers
on constant, step, ramp and bounded profile flow. True flow, noisy sampled flow,
communication delay and modeled actuator motion are separate. Outputs include
CSV/JSON, deterministic SVG plots and a reproducibility manifest. See
[dynamic assumptions and metric definitions](docs/dynamics.md). Timing and response
metrics describe this discrete model; they do not certify real-time hardware or
mechanical protection.

## firmware reliability

The root `sketch_aug3a.ino` now stops compilation and points to the separate ESP32
sketch under `firmware/esp32/taph_reliability/`. Its default build initializes no
actuator, relay, sensor or network. The optional operational path requires explicit
private configuration review, fresh eligible commands and local arming; it never
automatically starts the pump. See [firmware gates, host tests and remaining bench
work](docs/firmware.md). `bun test` requires a C++17-capable `g++` for host mocks.
Both firmware paths pass the pinned real ESP32 compile-only check (`bash scripts/compile-esp32.sh`); see [versions, nondeployable fixture, warnings and limits](docs/firmware.md#real-esp32-compile-only-verification). The actual physical board and configuration remain unverified, and physical validation remains outstanding.
