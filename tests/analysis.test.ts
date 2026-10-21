import { afterAll, describe as suite, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeHistorical, parseHistoricalPowerTable, validateHistoricalSourceManifest, type HistoricalPowerRecord } from "../src/analysis/historical.ts";
import { conditionalFiveFlowComparison, describe, studentTCritical95Df4, studentTTwoSidedDf4 } from "../src/analysis/statistics.ts";
import { renderHistoricalPlots } from "../src/analysis/svg.ts";
import { runHistoricalAnalysis } from "../scripts/analyze-historical.ts";

// SYNTHETIC TEST FIXTURE NOT RESEARCH DATA. i=0..4 identifies flow; j=1..5 is listed index.
// Fixed = 10+2i+j; TAPH = 12+3i+j. No manuscript values are embedded in this test suite.
const flows = ["1.00", "2.25", "3.50", "4.75", "6.00"];
const csv = "nominalFlowLpm,condition,listedValueIndex,reportedPowerW\n" + flows.flatMap((flow, i) =>
  ["fixed-42", "taph"].flatMap((condition) => Array.from({ length: 5 }, (_, k) =>
    `${flow},${condition},${k + 1},${((condition === "fixed-42" ? 10 + 2 * i : 12 + 3 * i) + k + 1).toFixed(4)}`))).join("\n") + "\n";
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const SHA = digest(csv);
const records = parseHistoricalPowerTable(csv);
const temp = mkdtempSync(join(tmpdir(), "taph-synthetic-analysis-test-"));
const inputPath = join(temp, "synthetic-test.csv"), sourceManifestPath = join(temp, "synthetic-source.json");
const source = {
  schemaVersion: "taph.historical-reported.v1", datasetId: "synthetic-test-not-research-data",
  evidenceCategory: "historical-reported-unverified", dataFile: "synthetic-test.csv", dataSha256: SHA,
  units: { nominalFlowLpm: "L/min", reportedPowerW: "W" },
  acquisition: { origin: "unverified", recordedAt: null, runIds: null, independence: null,
    crossConditionPairing: null, instrumentConfiguration: null, calibrationRecords: null,
    generatingSoftwareCommit: null, modelVersion: null, seeds: null, measurementWindow: null },
  sourceLocations: [{ sourceId: "synthetic-test", location: "SYNTHETIC TEST FIXTURE NOT RESEARCH DATA: arithmetic construction for software tests" }],
};
writeFileSync(inputPath, csv); writeFileSync(sourceManifestPath, JSON.stringify(source));
const run = (outputPath: string) => runHistoricalAnalysis({ inputPath, sourceManifestPath, outputPath });
afterAll(() => rmSync(temp, { recursive: true, force: true }));

function close(actual: number, expected: number, tolerance = 1e-12) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

suite("supplied table parsing and provenance, using synthetic test data only", () => {
  test("all fifty generated entries preserve the documented synthetic formula", () => {
    expect(records).toHaveLength(50);
    for (const record of records) {
      const i = flows.map(Number).indexOf(record.nominalFlowLpm), j = record.listedValueIndex;
      expect(record.reportedPowerW).toBe(record.condition === "fixed-42" ? 10 + 2 * i + j : 12 + 3 * i + j);
    }
    expect(validateHistoricalSourceManifest(source, SHA).sourceLocations).toEqual(source.sourceLocations);
  });

  test("CRLF and shuffled records preserve statistics without inventing within-row pairing", () => {
    expect(parseHistoricalPowerTable(csv.replaceAll("\n", "\r\n"))).toEqual(records);
    const [header, ...rows] = csv.trimEnd().split("\n");
    expect(analyzeHistorical(parseHistoricalPowerTable([header!, ...rows.reverse()].join("\n")))).toEqual(analyzeHistorical(records));
    expect(analyzeHistorical(records).conditionalFiveFlow.numberOfPairs).toBe(5);
  });

  test("malformed, missing, duplicate and extra rows fail closed", () => {
    for (const invalid of [
      csv.replace("reportedPowerW", "measuredPowerW"),
      csv.replace("1.00,fixed-42,1", "1.00,fixed-42,2"),
      csv.replace("1.00,fixed-42,1", "1.00,fixed-42,0"),
      csv.replace("1.00,fixed-42,1", "1.00,physical,1"),
      csv.replace("1.00,fixed-42,1", "1.01,fixed-42,1"),
      ...["NaN", "Infinity", "-11.0000", "11.0000junk", " 11.0000", '"11.0000"', "11.00", "9007199254740992.0000", "11.0000,extra"].map(value => csv.replace("11.0000", value)),
      csv.split("\n").slice(0, -2).join("\n"), csv + "6.00,taph,5,29.0000\n", csv + "\n",
    ]) expect(() => parseHistoricalPowerTable(invalid)).toThrow();
  });

  test("record API rejects invalid categories, values and unsupported grid", () => {
    for (const replacement of [
      { evidenceCategory: "physical-measurement" }, { evidenceCategory: "corrected-synthetic-simulation" },
      { evidenceCategory: "historical-simulator-replay" }, { reportedPowerW: NaN },
      { reportedPowerW: Infinity }, { reportedPowerW: -1 },
      { nominalFlowLpm: 0 }, { condition: "new-fuzzy" }, { listedValueIndex: 1.5 },
    ]) expect(() => analyzeHistorical([{ ...records[0]!, ...replacement }, ...records.slice(1)] as HistoricalPowerRecord[])).toThrow();
    expect(() => analyzeHistorical(records.slice(1))).toThrow();
    expect(() => analyzeHistorical([records[1]!, ...records.slice(1)])).toThrow();
    expect(() => analyzeHistorical(records, "invalid dataset id")).toThrow();
  });

  test("local metadata allows different datasets but cannot relabel origin, units or unknown acquisition", () => {
    const alternate = { ...source, datasetId: "another-local-table", sourceLocations: [{ sourceId: "local-note", location: "A locally supplied table", renderedPages: [1], filename: "local.pdf", sha256: "a".repeat(64) }] };
    expect(validateHistoricalSourceManifest(alternate, SHA).datasetId).toBe("another-local-table");
    for (const invalid of [
      null, { ...source, datasetId: "" }, { ...source, evidenceCategory: "physical-measurement" },
      { ...source, evidenceCategory: "historical-simulator-replay" }, { ...source, evidenceCategory: "corrected-synthetic-simulation" },
      { ...source, dataFile: "../replacement.csv" }, { ...source, dataSha256: "0".repeat(64) },
      { ...source, units: { nominalFlowLpm: "m/s", reportedPowerW: "W" } },
      { ...source, acquisition: { ...source.acquisition, origin: "physical" } },
      { ...source, acquisition: { ...source.acquisition, seeds: [1] } },
      { ...source, acquisition: { ...source.acquisition, generatingSoftwareCommit: "claimed-commit" } },
      { ...source, acquisition: { origin: "unverified" } }, { ...source, sourceLocations: [] },
      { ...source, sourceLocations: [...source.sourceLocations, ...source.sourceLocations] },
      ...[{ renderedPages: [0] }, { url: "javascript:alert(1)" }, { sha256: "bad" }, { location: "" }].map(patch => ({ ...source, sourceLocations: [{ ...source.sourceLocations[0], ...patch }] })),
    ]) expect(() => validateHistoricalSourceManifest(invalid, SHA)).toThrow();
    expect(() => validateHistoricalSourceManifest(source, "0".repeat(64))).toThrow();
    expect(() => validateHistoricalSourceManifest(source, "bad hash")).toThrow();
  });
});

suite("analytic synthetic-data and public-distribution oracles", () => {
  test("means and both SD conventions, including constant and singleton data", () => {
    const s = describe([1, 2, 3, 4, 5]);
    expect(s.mean).toBe(3); close(s.sampleSd!, Math.sqrt(2.5)); close(s.finiteListSd, Math.sqrt(2));
    expect(describe([4, 4, 4]).sampleSd).toBe(0); expect(describe([4]).sampleSd).toBeNull();
    for (const invalid of [[], [NaN], [Infinity], [1e308, 1e308]]) expect(() => describe(invalid)).toThrow();
  });

  test("all group and overall statistics match the linear-fixture analytic variance", () => {
    const result = analyzeHistorical(records);
    result.groups.forEach((g) => {
      const i = flows.map(Number).indexOf(g.nominalFlowLpm);
      close(g.meanW, g.condition === "fixed-42" ? 13 + 2 * i : 15 + 3 * i);
      close(g.sampleSdW, Math.sqrt(2.5)); close(g.finiteListSdW, Math.sqrt(2)); expect(g.numberOfListedValues).toBe(5);
    });
    // Independent finite grid indices each have population variance2; Var(ai+j)=2a²+2.
    close(result.overall[0]!.meanW, 17); close(result.overall[1]!.meanW, 21);
    close(result.overall[0]!.sampleSdW, Math.sqrt(125 / 12)); close(result.overall[1]!.sampleSdW, Math.sqrt(125 / 6));
    close(result.overall[0]!.finiteListSdW, Math.sqrt(10)); close(result.overall[1]!.finiteListSdW, Math.sqrt(20));
    expect(result.overall[0]!.maximumListedW).toBe(23); expect(result.overall[1]!.maximumListedW).toBe(29);
    close(result.equallyWeightedMeanDifferenceW, 4); close(result.equallyWeightedRelativeChangePercent!, 400 / 17);
    result.byFlow.forEach((g, i) => { close(g.differenceTaphMinusFixedW, 2 + i); close(g.relativeChangePercent!, 100 * (2 + i) / (13 + 2 * i)); });
    const averagePercent = result.byFlow.reduce((total, g) => total + g.relativeChangePercent!, 0) / 5;
    expect(Math.abs(averagePercent - result.equallyWeightedRelativeChangePercent!)).toBeGreaterThan(.1);
  });

  test("df4 tails agree with public-distribution high-precision oracles", () => {
    // Universal Student-t distribution values; none is a manuscript statistic.
    const oracles = [[0,1],[.1,.9251558409394533],[1,.3739009663000589],
      [2,.1161165235168156],[10,.0005620036227159912],
      [100,5.996002098992462e-8],[1e6,5.99999999996e-24]] as const;
    for (const [t, p] of oracles) {
      expect(Math.abs(studentTTwoSidedDf4(t) / p - 1)).toBeLessThan(1e-12);
      expect(studentTTwoSidedDf4(-t)).toBe(studentTTwoSidedDf4(t));
    }
    for (const invalid of [NaN, Infinity, -Infinity]) expect(() => studentTTwoSidedDf4(invalid)).toThrow();
    for (let t = 0; t < 10; t += .1) expect(studentTTwoSidedDf4(t + .1)).toBeLessThan(studentTTwoSidedDf4(t));
    close(studentTCritical95Df4(), 2.7764451051977944); close(studentTTwoSidedDf4(studentTCritical95Df4()), .05);
  });

  test("five-flow t, CI and effect follow analytic differences [2,3,4,5,6]", () => {
    const p = analyzeHistorical(records).conditionalFiveFlow;
    expect(p.status).toBe("conditional-only"); expect(p.numberOfPairs).toBe(5); expect(p.degreesOfFreedom).toBe(4);
    close(p.meanDifferenceW, 4); close(p.sampleSdDifferencesW, Math.sqrt(2.5));
    close(p.standardErrorW, Math.sqrt(.5)); close(p.t!, 4 * Math.sqrt(2));
    close(p.twoSidedP!, 1 - 19 * Math.sqrt(2) / 27);
    const margin = 2.7764451051977944 / Math.sqrt(2);
    close(p.nominal95CiW![0], 4 - margin); close(p.nominal95CiW![1], 4 + margin);
    close(p.pairedStandardizedDifferenceDz!, 4 / Math.sqrt(2.5));
    expect(p.assumptionsVerified).toBe(false); expect(p.physicalInferenceEstablished).toBe(false);
    expect(() => conditionalFiveFlowComparison(Array(25).fill(1), Array(25).fill(2))).toThrow();
    expect(() => conditionalFiveFlowComparison([1, 2, 3, 4, NaN], [1, 2, 3, 4, 5])).toThrow();
    const degenerate = conditionalFiveFlowComparison([1,2,3,4,5], [2,3,4,5,6]);
    expect(degenerate.status).toBe("unavailable"); expect(degenerate.twoSidedP).toBeNull(); expect(degenerate.nominal95CiW).toBeNull();
    expect(conditionalFiveFlowComparison([1,2,3,4,5], [1,2,3,4,5]).status).toBe("unavailable");
  });
});

suite("reproducible figures and local-input CLI", () => {
  test("SVGs encode means/differences, units and provenance deterministically", () => {
    const a = analyzeHistorical(records), one = renderHistoricalPlots(a, SHA);
    expect(one).toEqual(renderHistoricalPlots(a, SHA));
    expect(one.meanPower.match(/data-condition=/g)).toHaveLength(10); expect(one.differences.match(/data-panel=/g)).toHaveLength(10);
    for (const point of a.byFlow) {
      expect(one.meanPower).toContain(`data-power-w="${point.fixedMeanW.toFixed(5)}"`);
      expect(one.meanPower).toContain(`data-power-w="${point.taphMeanW.toFixed(5)}"`);
      expect(one.differences).toContain(`data-value="${point.differenceTaphMinusFixedW.toFixed(5)}"`);
      expect(one.differences).toContain(`data-value="${point.relativeChangePercent!.toFixed(5)}"`);
    }
    for (const svg of Object.values(one)) {
      expect(svg).toContain("Physical or simulated provenance is unverified"); expect(svg).toContain("L/min"); expect(svg).toContain(SHA);
      expect(svg).not.toMatch(/NaN|Infinity|<script|href=/);
    }
    expect(one.meanPower).toContain("not a time-response trace"); expect(one.differences).toContain("Mean difference (W)");
    expect(one.differences).toContain("Relative change (%)"); expect(() => renderHistoricalPlots(a, "bad hash")).toThrow();
  });

  test("zero baselines remain unavailable and fractional tick labels stay accurate", () => {
    const zeros = records.map(r => ({ ...r, reportedPowerW: 0 }));
    const result = analyzeHistorical(zeros), plots = renderHistoricalPlots(result, SHA);
    expect(result.equallyWeightedRelativeChangePercent).toBeNull();
    expect(plots.differences.match(/data-unavailable="zero-baseline"/g)).toHaveLength(5);
    expect(plots.differences).not.toMatch(/NaN|Infinity/);
    const small = records.map(r => ({ ...r, reportedPowerW: r.condition === "fixed-42" ? 100 : 100.5 }));
    const smallPlots = renderHistoricalPlots(analyzeHistorical(small), SHA);
    expect(smallPlots.differences).toContain('class="tick">0.25</text>');
    expect(smallPlots.differences).toContain('class="tick">0.5</text>');
  });

  test("fresh outputs are byte-identical, local metadata is copied and sources cannot be overwritten", () => {
    const first = join(temp, "first"), second = join(temp, "second"); run(first); run(second);
    expect(readdirSync(first).sort()).toEqual(["manifest.json", "mean-power.svg", "power-differences.svg", "statistics.json"]);
    for (const name of readdirSync(first)) expect(readFileSync(join(first, name))).toEqual(readFileSync(join(second, name)));
    const manifest = JSON.parse(readFileSync(join(first, "manifest.json"), "utf8"));
    expect(manifest.resultKind).toBe("historical-reanalysis"); expect(manifest.evidenceCategory).toBe("historical-reported-unverified");
    expect(manifest.software.commit).toMatch(/^[a-f0-9]{40}$/); expect(manifest.source.dataSha256).toBe(SHA);
    expect(manifest.source.sourceLocations).toEqual(source.sourceLocations);
    expect(JSON.parse(readFileSync(join(first, "statistics.json"), "utf8")).datasetId).toBe(source.datasetId);
    for (const [name, info] of Object.entries(manifest.artifacts) as [string, {sha256: string}][]) expect(digest(readFileSync(join(first, name)))).toBe(info.sha256);
    expect(() => run(first)).toThrow("already exists");
    const sourceDir = resolve(new URL("../src/analysis", import.meta.url).pathname);
    expect(() => run(join(sourceDir, "must-not-write"))).toThrow("protected");
    symlinkSync(sourceDir, join(temp, "source-link")); expect(() => run(join(temp, "source-link", "must-not-write"))).toThrow("protected");
    expect(readFileSync(inputPath, "utf8")).toBe(csv);
  });

  test("exact input bytes control the hash and mismatched supplied manifests fail", () => {
    const crlf = csv.replaceAll("\n", "\r\n"), crlfPath = join(temp, "crlf.csv"), mPath = join(temp, "crlf-source.json");
    writeFileSync(crlfPath, crlf); writeFileSync(mPath, JSON.stringify({ ...source, dataFile: "crlf.csv", dataSha256: digest(crlf) }));
    const result = runHistoricalAnalysis({ inputPath: crlfPath, sourceManifestPath: mPath, outputPath: join(temp, "crlf-output") });
    expect(result.sourceSha256).toBe(digest(crlf)); expect(result.sourceSha256).not.toBe(SHA);
    writeFileSync(mPath, JSON.stringify(source));
    expect(() => runHistoricalAnalysis({ inputPath: crlfPath, sourceManifestPath: mPath, outputPath: join(temp, "bad-hash-output") })).toThrow("hash");
    writeFileSync(mPath, JSON.stringify({ ...source, dataSha256: digest(crlf) }));
    expect(() => runHistoricalAnalysis({ inputPath: crlfPath, sourceManifestPath: mPath, outputPath: join(temp, "bad-name-output") })).toThrow("filename");
  });

  test("CLI requires supplied input, manifest and new output; rejects unknown/duplicate arguments", () => {
    const script = new URL("../scripts/analyze-historical.ts", import.meta.url).pathname;
    for (const args of [[], ["--overwrite"], ["--out", temp], ["--input", inputPath, "--input", inputPath, "--out", temp], ["--input", inputPath, "--source-manifest", sourceManifestPath, "--unknown", temp]]) {
      const result = Bun.spawnSync([process.execPath, script, ...args]); expect(result.exitCode).toBe(1); expect(result.stderr.toString()).toContain("Usage:");
    }
    const result = Bun.spawnSync([process.execPath, script, "--source-manifest", sourceManifestPath, "--out", join(temp, "cli-success"), "--input", inputPath]);
    expect(result.exitCode).toBe(0);
  });
});
