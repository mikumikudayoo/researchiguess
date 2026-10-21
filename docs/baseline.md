# preserved baseline

inspected default branch `main` and audited commit are both `a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce` (21 october 2026 review). no intervening change was found. this milestone changes tooling and documentation only; original source behavior is retained.

| original file | responsibility / limitation |
| --- | --- |
| `server.ts` | express flow-to-command endpoint; fixed increasing singleton rules; no feedback/learning; permissive `parseFloat` and unverified below-range zero fallback |
| `simulator.ts` | synthetic four-mode model, five flows/seeds, 25 CSV files; opposite fuzzy schedule, assumed speed/angle response and scaled VI |
| `sketch_aug3a.ino` | ESP32 pulse input, raw current ADC, OLED, external HTTP request, servo and relay; physical configuration unresolved |
| `badapple.ino` | unrelated OLED animation experiment; not part of TAPH validation; unchanged |
| `package.json`, `bun.lock`, `tsconfig.json` | Bun/TypeScript and express dependencies; no existing tests or scripts |
| `.gitattributes`, `.gitignore`, `LICENSE`, `README.md` | repository text handling, exclusions, MIT license and minimal project description |

there are no committed results, calibration records, as-built drawings or independent physical measurements in the baseline repository. the fifty manuscript values are a different evidence category with unresolved provenance. do not infer their origin from resemblance to replay output.

`legacy/a37d1d5/{server,simulator}.ts` are byte-identical source archives. the immutable commit preserves firmware and all original files; new copies of embedded network values are intentionally not made. the archived server is not a recommended deployment entrypoint. firmware remains unchanged in this first PR and must not be flashed as a safety-approved implementation.

`data/baselines/a37d1d5.manifest.json` records every original file hash, model parameters, schedule, seeds, stream order, output format and limitations. `legacy-output-hashes.json` is a new diagnostic Bun replay fingerprint, not evidence of an original experiment. tests run the real archived simulator in a temporary directory and compare every CSV byte hash. they explicitly retain the time-zero defect and 0.65 scaling rather than correcting the historical record.

known issues: F01, F05–F17, F29–F31. later milestones introduce separate corrected pathways; passing regression tests only establishes historical software reproducibility.
