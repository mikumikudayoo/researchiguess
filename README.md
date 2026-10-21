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

see [baseline inventory](docs/baseline.md) and [baseline manifest](data/baselines/a37d1d5.manifest.json). source hashes and all 25 output files have regression tests. no repository test establishes hardware calibration or scientific validation. legacy firmware contains historical network settings and unreviewed actuator/relay behavior: do not deploy it without configuration review and supervised bench validation.
