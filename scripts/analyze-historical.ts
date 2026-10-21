import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANALYSIS_VERSION, HISTORICAL_CATEGORY, analyzeHistorical, parseHistoricalPowerTable, validateHistoricalSourceManifest } from "../src/analysis/historical.ts";
import { renderHistoricalPlots } from "../src/analysis/svg.ts";

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function canonicalProspectivePath(path: string): string {
  const suffix: string[] = [];
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("Cannot resolve output ancestor");
    suffix.unshift(relative(parent, ancestor));
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}

/** Writes a new derived result set only; does not overwrite any existing directory. */
export function runHistoricalAnalysis(options: { inputPath: string; sourceManifestPath: string; outputPath: string }) {
  const root = realpathSync(ROOT);
  const output = canonicalProspectivePath(options.outputPath);
  const withinRoot = relative(root, output);
  const isInsideRoot = withinRoot === "" || (!withinRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && withinRoot !== ".." && !isAbsolute(withinRoot));
  if (isInsideRoot && !withinRoot.startsWith(`results${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("Repository outputs must be under results/; source directories are protected");
  }
  if (existsSync(output)) throw new Error("Output directory already exists; choose a new result directory");

  const dataPath = resolve(options.inputPath);
  const manifestPath = resolve(options.sourceManifestPath);
  const csvBytes = readFileSync(dataPath);
  const sourceManifestBytes = readFileSync(manifestPath);
  const inputSha256 = sha256(csvBytes);
  const decode = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const sourceManifest = validateHistoricalSourceManifest(JSON.parse(decode(sourceManifestBytes)), inputSha256);
  if (sourceManifest.dataFile !== basename(dataPath)) throw new Error("Manifest dataFile does not match the supplied input filename");
  const analysis = analyzeHistorical(parseHistoricalPowerTable(decode(csvBytes)), sourceManifest.datasetId);
  const plots = renderHistoricalPlots(analysis, inputSha256);
  const artifacts = {
    "statistics.json": `${JSON.stringify({ ...analysis, inputSha256 }, null, 2)}\n`,
    "mean-power.svg": plots.meanPower,
    "power-differences.svg": plots.differences,
  };
  const commitResult = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]);
  if (commitResult.exitCode !== 0) throw new Error("A Git checkout is required to record the analysis software commit");
  const softwareCommit = commitResult.stdout.toString().trim();
  const statusResult = Bun.spawnSync(["git", "-C", root, "status", "--porcelain"]);
  if (statusResult.exitCode !== 0) throw new Error("Could not record working-tree status");
  const sourceFiles = ["scripts/analyze-historical.ts", "src/analysis/historical.ts", "src/analysis/statistics.ts", "src/analysis/svg.ts"];
  const manifest = {
    schemaVersion: "taph.analysis-result-manifest.v1",
    resultKind: "historical-reanalysis",
    evidenceCategory: HISTORICAL_CATEGORY,
    analysisVersion: ANALYSIS_VERSION,
    software: { commit: softwareCommit, workingTreeDirty: statusResult.stdout.length > 0, runtime: `Bun ${Bun.version}`,
      sourceSha256: Object.fromEntries(sourceFiles.map((file) => [file, sha256(readFileSync(join(root, file)))])) },
    source: { datasetId: sourceManifest.datasetId, dataFile: basename(dataPath), dataSha256: inputSha256,
      manifestFile: basename(manifestPath), manifestSha256: sha256(sourceManifestBytes),
      sourceLocations: sourceManifest.sourceLocations },
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([file, content]) => [file, { sha256: sha256(content), bytes: Buffer.byteLength(content) }])),
    reproducibility: "Statistics and SVG bytes are deterministic for the same source and analysis version. Manifest records software/runtime/working-tree state, not an acquisition date. No timestamp is manufactured.",
    limitations: analysis.limitations,
  };
  // Manifest is written last, marking a complete result set. No overwrite flag exists.
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  for (const [name, content] of Object.entries(artifacts)) writeFileSync(join(output, name), content, { flag: "wx" });
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { outputDirectory: output, sourceSha256: inputSha256, evidenceCategory: HISTORICAL_CATEGORY };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const flags = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i]!, value = args[i + 1];
      if (!["--input", "--source-manifest", "--out"].includes(flag) || flags.has(flag) || !value || value.startsWith("--")) break;
      flags.set(flag, value);
    }
    if (args.length !== 6 || flags.size !== 3) throw new Error("Usage: bun scripts/analyze-historical.ts --input <local.csv> --source-manifest <local.json> --out <new-result-directory>");
    console.log(JSON.stringify(runHistoricalAnalysis({ inputPath: flags.get("--input")!, sourceManifestPath: flags.get("--source-manifest")!, outputPath: flags.get("--out")! }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
