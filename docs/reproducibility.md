# Local-input analysis and research evidence categories

This repository supplies analysis software, not a public research dataset. To analyze
a reported power table, supply your own local CSV and provenance manifest. Neither
the table's generating method nor physical validity is established by reproducing its
arithmetic. A model replay must never replace reported values whose origin is unresolved.
The public tests contain a **SYNTHETIC TEST FIXTURE NOT RESEARCH DATA**, generated from
a simple linear formula solely to test software behavior.

## Four source categories

| Source category | Meaning | Required separation |
| --- | --- | --- |
| `historical-reported-unverified` | Previously reported values with unresolved generating provenance | Preserve supplied values and labels; never invent acquisition times, seeds, run independence or calibration |
| `historical-simulator-replay` | Newly executed reproduction of preserved historical code | Record exact code, assumptions, seeds and historical conventions; distinguish replay output from reported research data |
| `corrected-synthetic-simulation` | Output from a separately versioned corrected model | Record model, scenario, controller, mapping, parameters, seeds and time conventions; identify uncalibrated assumptions |
| `physical-measurement` | An actual acquired physical record supplied separately | Require instrument/acquisition provenance and explicit calibration/validation status; never populate this category from simulation |

`historical-reanalysis` is the **derived result kind**, not a fifth source category.
Its `evidenceCategory` remains `historical-reported-unverified`. The analysis parser
rejects the other categories. Firmware telemetry is not automatically a physical
performance dataset: ADC counts are not amperes and commanded angle is not measured pitch.

## Prepare the local input

Keep research inputs and generated results outside the public repository unless their
publication has been separately authorized. The software does not download sources,
upload data, or publish results. It copies supplied source metadata into the generated
local result manifest; that output may therefore contain private source locations.

The supported historical-table shape is five nominal flows, two condition labels and
five listed entries in each flow/condition cell: fifty values total. This is a specific
analysis contract, not a generic experimental-design inference. Use this exact unquoted
CSV header:

```csv
nominalFlowLpm,condition,listedValueIndex,reportedPowerW
```

- `nominalFlowLpm`: one of `1.00`, `2.25`, `3.50`, `4.75`, `6.00`, in L/min.
- `condition`: `fixed-42` or `taph`. These labels do not verify actual pitch or controller implementation.
- `listedValueIndex`: 1–5, preserving within-row column order only; not a verified run ID, seed, time, independent replicate or cross-condition pairing.
- `reportedPowerW`: a nonnegative decimal with four places, in watts. Trailing zeros normalize transcription without increasing physical precision.

LF and CRLF line endings and an optional final newline are accepted. The parser rejects
missing, extra or duplicate records; unknown flows or conditions; invalid indices;
quoted/extra fields; whitespace coercions; malformed, nonfinite or negative powers;
and unsupported decimal ranges. Sorting is deterministic. The SHA-256 is calculated
from **original input bytes**, before line-ending normalization or parsing.

Prepare a separate UTF-8 JSON manifest. This example contains placeholders, not research
records; replace the hash and local locator with the actual supplied file information:

```json
{
  "schemaVersion": "taph.historical-reported.v1",
  "datasetId": "local-reported-power-table",
  "evidenceCategory": "historical-reported-unverified",
  "dataFile": "power-table.csv",
  "dataSha256": "REPLACE_WITH_SHA256_OF_THE_EXACT_CSV_BYTES",
  "units": {"nominalFlowLpm": "L/min", "reportedPowerW": "W"},
  "acquisition": {
    "origin": "unverified",
    "recordedAt": null,
    "runIds": null,
    "independence": null,
    "crossConditionPairing": null,
    "instrumentConfiguration": null,
    "calibrationRecords": null,
    "generatingSoftwareCommit": null,
    "modelVersion": null,
    "seeds": null,
    "measurementWindow": null
  },
  "sourceLocations": [
    {"sourceId": "local-table", "location": "Describe the exact local table/section"}
  ]
}
```

`dataFile` must be the supplied CSV's filename, without a directory. Dataset/source IDs
use letters, numbers, dots, underscores or hyphens, start with a letter or number and
have at most 128 characters. Supply at least one source location with a unique ID and
nonempty description. Optional `renderedPages` must be positive integers; optional
`filename`, `sha256` and HTTP(S) `url` describe a source without retrieving it. Existing
additional source metadata can be retained locally. No specific manuscript, source
count, document link, source-PDF hash or dataset hash is built into the software.

This unresolved-provenance pathway requires every acquisition field shown above to
remain explicitly null, with origin `unverified`. If acquisition becomes established,
prepare a separate evidence package and appropriate analysis rather than silently
relabeling this table as a validated physical experiment. A matching hash demonstrates
file identity, not truth or calibration.

Compute a local file hash with Bun, for example:

```sh
bun -e 'import {createHash} from "node:crypto"; import {readFileSync} from "node:fs"; console.log(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' ../private-input/power-table.csv
```

## Run with Bun

Use the repository-pinned Bun version and pinned dependencies:

```sh
bun install --frozen-lockfile
bun test tests/analysis.test.ts
bun run typecheck
bun scripts/analyze-historical.ts --input ../private-input/power-table.csv --source-manifest ../private-input/manifest.json --out ../private-results/reanalysis-001
```

All three flags are required, in any order. Unknown, missing or repeated flags fail.
No Python, plotting service or statistical package is required at runtime. Importing
the analysis modules does not launch a server or simulation. A Git checkout is required
to record the analysis software commit. The CLI refuses any existing output directory
and has no overwrite flag. Inside the repository, outputs must be below `results/`;
source-directory writes, including symlink aliases, are rejected. A new directory
outside the repository is also allowed. Inputs are read without modification.

| Output file | Content |
| --- | --- |
| `statistics.json` | Dataset ID, input hash, descriptive summaries, signed differences and conditional five-flow calculation |
| `mean-power.svg` | Static reported means across nominal flows, separate condition markers and provenance labels |
| `power-differences.svg` | TAPH-minus-fixed contrasts with watts and percentages in separate panels |
| `manifest.json` | Result kind/category, supplied source locations and hashes, software commit, dirty state, runtime, analysis-source hashes and output hashes |

The manifest is written last to mark a complete result set. A failed write may leave
an incomplete directory; inspect it and choose a new destination. No acquisition date
is manufactured. Statistics and SVG bytes are deterministic for the same data and
analysis version. The manifest also records runtime, software commit and working-tree
state. Source hashes identify the actual analysis files during a modified-tree run.

The callable API is:

```ts
runHistoricalAnalysis({ inputPath, sourceManifestPath, outputPath });
```

`parseHistoricalPowerTable`, `validateHistoricalSourceManifest` and `analyzeHistorical`
provide validation and calculations separately from file I/O. The last function accepts
an optional dataset ID; the CLI supplies the validated ID from the local manifest.

## Calculation definitions

For listed values x, mean = Σx/n. Sample SD uses denominator n−1; finite-list descriptive
SD uses denominator n. Compensated summation and a centered second pass avoid the
cancellation of subtracting large squared moments. Within each flow/condition n=5;
overall descriptive summaries use n=25. Overall variability includes deliberately
different flows and cannot establish temporal stability, calibration or accuracy.
A singleton's sample SD is unavailable rather than zero.

Differences consistently mean **TAPH minus fixed-42**. Each flow-specific percentage
uses that flow's fixed-angle mean as denominator. The overall percentage uses the
difference of equally weighted grand means divided by the fixed-angle grand mean.
It is not the average of flow-specific percentages or annual energy yield. A zero
fixed-angle denominator produces an unavailable relative change, not infinity.
The relative plot marks that flow as `N/A`, while retaining absolute differences and
other defined descriptive results.

The conditional calculation uses exactly five matched **flow-condition means**:

```text
d_j = mean_TAPH,j − mean_fixed,j                 j = 1,...,5
t = mean(d) / (sampleSD(d) / sqrt(5))             df = 4
nominal 95% CI = mean(d) ± t_(.975,4) × sampleSD(d) / sqrt(5)
d_z = mean(d) / sampleSD(d)
```

It does not offer a 25-row paired test or a time-sample test. Zero variance in differences
returns an unavailable test, with null p and CI fields. The selected flow grid does
not establish independent sampling, natural pairing, a target population or required
distributional assumptions. The interval and p value are conditional arithmetic, not
verified physical-experiment inference. Nonsignificance does not establish equivalence,
noninferiority or an acceptable power loss.

### Dependency-free Student t calculation for df = 4

From the Student t density at df=4:

```text
f(t) = (3/8) (1 + t²/4)^(-5/2)
u = t / sqrt(t² + 4)
F(t) = 1/2 + 3u/4 − u³/4
```

The CDF follows by substituting `t=2u/sqrt(1−u²)` into the integral. For nonnegative
magnitude, the two-sided tail is `p=(1/2)(1−u)²(u+2)`. The implementation computes
`1−u` as `(2/h)²/(1+u)`, with `h=hypot(|t|,2)`, avoiding cancellation in small tails.
IEEE-754 rounding/underflow still applies at extremes. Bisection of `p(t)=.05` on [0,8]
gives the fixed 95% critical value. These functions are only for df=4, not a generic
Student t implementation for other sample sizes or confidence levels.

Distribution and paired-observation references:

- NIST/SEMATECH, [t Distribution](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3664.htm).
- NIST/SEMATECH, [Analysis of paired observations](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm).

### Public software tests

Tests construct fifty artificial values with `fixed=10+2i+j` and `TAPH=12+3i+j`,
where i=0,...,4 and j=1,...,5. They are explicitly labeled **SYNTHETIC TEST FIXTURE NOT
RESEARCH DATA** and are never evidence about turbine performance. Independent analytic
oracles use the finite-grid mean/variance and differences `[2,3,4,5,6]`. Universal
Student t tail values and the fixed critical value test the distribution algorithm.
No private research values, summary-result oracles, source links or fixed input hashes
are present in public tests.

Checks cover parser failures, all group/overall statistics, both SD denominators,
signed contrasts, degenerate inputs, tail symmetry/monotonicity, source-category and
hash validation, original input bytes, deterministic plots/results and overwrite
refusal. Passing software tests validates tested behavior; it does not authenticate
any subsequently supplied research data.

## Missing channels and separate evidence packages

These plots are static flow comparisons, not response traces. They do not invent
physical-error bars, significance stars or missing RPM/voltage series. A power-only
CSV does not contain those channels and cannot establish whether they exist elsewhere.
Recover exact original records instead of reading approximate graph pixels or deriving
unmeasured channels from power. Lower RPM, unchanged power, energy efficiency and
mechanical protection require different evidence.

Historical replay and corrected simulation writers need their own manifests and files:
software commit/source hashes, source category, model version/units, full parameters,
controller and mapping, calibration status, scenarios, seed policy, solver/time step,
initial conditions, measurement windows, comparators, exclusions and artifact hashes.
Keep electrical boundaries and time conventions explicit. Do not present correlated
time samples as independent runs. Preserve all declared relevant comparison groups;
record exclusions and reasons. An assumed response maximum is not a verified optimum.

No physical dataset is manufactured here. A future `physical-measurement` package needs:

1. Unchanged raw files and hashes; acquisition source/date; instrument identifiers, raw units and channel map.
2. Actual hardware/load/hydraulic/sensor configuration; calibration records, coefficients, uncertainty and explicit missing-status fields.
3. Run/block IDs, timestamps, sampling rate and applicable simultaneous flow, head, voltage/current, RPM and pitch records; settling/inclusion windows, reset/order details and justified pairing.
4. Processing code/version, formulas, exclusions and aggregation. Derived power, energy or efficiency must link to real channels and defined boundaries.
5. Independent-run and target-population definitions suited to the question; correlated time samples are not independent physical trials.

These are evidence requirements, not a claim that such records exist. Neither physical
origin alone nor successful software execution proves calibration, efficiency,
overspeed protection, reduced wear or longer service life.
