import { conditionalFiveFlowComparison, describe } from "./statistics.ts";

export const HISTORICAL_CATEGORY = "historical-reported-unverified" as const;
export const ANALYSIS_VERSION = "taph.historical-analysis.v2" as const;
export const NOMINAL_FLOWS = [1, 2.25, 3.5, 4.75, 6] as const;
export const CONDITIONS = ["fixed-42", "taph"] as const;
export type HistoricalCondition = typeof CONDITIONS[number];

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Validate supplied local provenance; no research dataset or private locator is bundled. */
export function validateHistoricalSourceManifest(value: unknown, actualDataSha256: string) {
  const manifest = object(value, "Historical manifest");
  if (manifest.schemaVersion !== "taph.historical-reported.v1"
    || !identifier(manifest.datasetId)
    || manifest.evidenceCategory !== HISTORICAL_CATEGORY
    || !nonempty(manifest.dataFile) || /[/\\]/.test(manifest.dataFile) || [".", ".."].includes(manifest.dataFile)
    || !sha256(actualDataSha256)
    || manifest.dataSha256 !== actualDataSha256) {
    throw new Error("Historical manifest identity/category/schema/hash does not match the supplied input");
  }
  const units = object(manifest.units, "Historical units");
  if (units.nominalFlowLpm !== "L/min" || units.reportedPowerW !== "W") throw new Error("Historical units must be L/min and W");
  const acquisition = object(manifest.acquisition, "Historical acquisition");
  if (acquisition.origin !== "unverified") throw new Error("Historical acquisition origin must remain unverified");
  for (const key of ["recordedAt", "runIds", "independence", "crossConditionPairing", "instrumentConfiguration", "calibrationRecords", "generatingSoftwareCommit", "modelVersion", "seeds", "measurementWindow"]) {
    if (acquisition[key] !== null) throw new Error(`Historical acquisition.${key} must remain explicitly unknown`);
  }
  if (!Array.isArray(manifest.sourceLocations) || manifest.sourceLocations.length === 0) throw new Error("Historical manifest requires at least one supplied source locator");
  const sourceIds = new Set<string>();
  const sourceLocations = manifest.sourceLocations.map((item) => {
    const source = object(item, "Source location");
    if (!identifier(source.sourceId) || sourceIds.has(source.sourceId)) throw new Error("Invalid or duplicate source ID");
    sourceIds.add(source.sourceId);
    if (source.renderedPages !== undefined && (!Array.isArray(source.renderedPages) || source.renderedPages.length === 0
      || source.renderedPages.some((page) => !Number.isInteger(page) || page < 1))) throw new Error("Source pages must be positive integers");
    if (!nonempty(source.location)) throw new Error("Source location description is required");
    if (source.filename !== undefined && !nonempty(source.filename)) throw new Error("Source filename must be nonempty");
    if (source.sha256 !== undefined && !sha256(source.sha256)) throw new Error("Invalid source SHA-256");
    if (source.url !== undefined && (!nonempty(source.url) || !/^https?:\/\/[^\s]+$/.test(source.url))) throw new Error("Source URL must use HTTP(S)");
    return source;
  });
  return { datasetId: manifest.datasetId as string, dataFile: manifest.dataFile as string, sourceLocations };
}

export interface HistoricalPowerRecord {
  readonly evidenceCategory: typeof HISTORICAL_CATEGORY;
  readonly nominalFlowLpm: number;
  readonly condition: HistoricalCondition;
  /** Column order only; not a verified run ID, independent replicate, timestamp or seed. */
  readonly listedValueIndex: number;
  readonly reportedPowerW: number;
}

const HEADER = "nominalFlowLpm,condition,listedValueIndex,reportedPowerW";

/** Strict, documented unquoted CSV dialect; no silent coercion or dropped rows. */
export function parseHistoricalPowerTable(csv: string): readonly HistoricalPowerRecord[] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== HEADER) throw new Error(`Expected exact CSV header: ${HEADER}`);
  const records = lines.map((line, index): HistoricalPowerRecord => {
    const fields = line.split(",");
    if (fields.length !== 4) throw new Error(`CSV line ${index + 2}: expected four unquoted fields`);
    const [flow, condition, position, power] = fields as [string, string, string, string];
    if (!/^(1\.00|2\.25|3\.50|4\.75|6\.00)$/.test(flow)) {
      throw new Error(`CSV line ${index + 2}: invalid nominal flow`);
    }
    if (!CONDITIONS.includes(condition as HistoricalCondition)) throw new Error(`CSV line ${index + 2}: invalid condition`);
    if (!/^[1-5]$/.test(position)) throw new Error(`CSV line ${index + 2}: invalid listed value index`);
    if (!/^(0|[1-9]\d*)\.\d{4}$/.test(power)) throw new Error(`CSV line ${index + 2}: expected a nonnegative four-decimal power`);
    const scaledPower = Number(power.replace(".", ""));
    if (!Number.isSafeInteger(scaledPower)) throw new Error(`CSV line ${index + 2}: power exceeds supported decimal range`);
    return {
      evidenceCategory: HISTORICAL_CATEGORY,
      nominalFlowLpm: Number(flow), condition: condition as HistoricalCondition,
      listedValueIndex: Number(position), reportedPowerW: scaledPower / 10_000,
    };
  });
  validateHistoricalPowerRecords(records);
  return canonicalOrder(records);
}

export function validateHistoricalPowerRecords(records: readonly HistoricalPowerRecord[]): void {
  if (records.length !== 50) throw new Error("Historical table must contain exactly fifty listed values");
  const seen = new Set<string>();
  for (const record of records) {
    if (record.evidenceCategory !== HISTORICAL_CATEGORY) throw new Error("Historical analysis cannot accept another evidence category");
    if (!(NOMINAL_FLOWS as readonly number[]).includes(record.nominalFlowLpm)) throw new Error("Unexpected nominal flow");
    if (!CONDITIONS.includes(record.condition)) throw new Error("Unexpected condition");
    if (!Number.isInteger(record.listedValueIndex) || record.listedValueIndex < 1 || record.listedValueIndex > 5) throw new Error("Invalid listed value index");
    if (!Number.isFinite(record.reportedPowerW) || record.reportedPowerW < 0) throw new Error("Power must be finite and nonnegative");
    const key = `${record.nominalFlowLpm}/${record.condition}/${record.listedValueIndex}`;
    if (seen.has(key)) throw new Error(`Duplicate historical entry ${key}`);
    seen.add(key);
  }
  // Fifty unique keys from the validated 5×2×5 domain imply that every required key exists.
}

function canonicalOrder(records: readonly HistoricalPowerRecord[]) {
  return [...records].sort((a, b) => a.nominalFlowLpm - b.nominalFlowLpm
    || CONDITIONS.indexOf(a.condition) - CONDITIONS.indexOf(b.condition)
    || a.listedValueIndex - b.listedValueIndex);
}

function summarizeW(values: readonly number[]) {
  const stats = describe(values);
  return { numberOfListedValues: stats.count, meanW: stats.mean,
    sampleSdW: stats.sampleSd!, finiteListSdW: stats.finiteListSd,
    minimumListedW: stats.minimum, maximumListedW: stats.maximum };
}

export function analyzeHistorical(records: readonly HistoricalPowerRecord[], datasetId = "user-supplied-historical-table") {
  if (!identifier(datasetId)) throw new Error("Invalid dataset ID");
  validateHistoricalPowerRecords(records);
  const sorted = canonicalOrder(records);
  const groups = NOMINAL_FLOWS.flatMap((nominalFlowLpm) => CONDITIONS.map((condition) => ({
    nominalFlowLpm, condition,
    ...summarizeW(sorted.filter((r) => r.nominalFlowLpm === nominalFlowLpm && r.condition === condition).map((r) => r.reportedPowerW)),
  })));
  const overall = CONDITIONS.map((condition) => ({
    condition, ...summarizeW(sorted.filter((r) => r.condition === condition).map((r) => r.reportedPowerW)),
  }));
  const byFlow = NOMINAL_FLOWS.map((nominalFlowLpm) => {
    const fixed = groups.find((g) => g.nominalFlowLpm === nominalFlowLpm && g.condition === "fixed-42")!;
    const taph = groups.find((g) => g.nominalFlowLpm === nominalFlowLpm && g.condition === "taph")!;
    const differenceW = taph.meanW - fixed.meanW;
    return { nominalFlowLpm, fixedMeanW: fixed.meanW, taphMeanW: taph.meanW,
      differenceTaphMinusFixedW: differenceW,
      relativeChangePercent: fixed.meanW === 0 ? null : 100 * differenceW / fixed.meanW };
  });
  const grandDifference = overall[1]!.meanW - overall[0]!.meanW;
  return {
    analysisVersion: ANALYSIS_VERSION, datasetId,
    evidenceCategory: HISTORICAL_CATEGORY,
    units: { nominalFlowLpm: "L/min", power: "W", relativeChange: "%" },
    count: { totalListedValues: 50, listedValuesPerCondition: 25, nominalFlows: 5, valuesPerFlowCondition: 5, verifiedIndependentPhysicalRuns: null },
    groups, overall, byFlow,
    equallyWeightedMeanDifferenceW: grandDifference,
    equallyWeightedRelativeChangePercent: overall[0]!.meanW === 0 ? null : 100 * grandDifference / overall[0]!.meanW,
    conditionalFiveFlow: conditionalFiveFlowComparison(byFlow.map((g) => g.fixedMeanW), byFlow.map((g) => g.taphMeanW)),
    limitations: [
      "Physical or simulation provenance is unverified; table copies are not independent evidence.",
      "Listed value indices preserve column order, not demonstrated pairing or run independence.",
      "Overall SD combines deliberately different flows; it does not establish temporal stability or measurement accuracy.",
      "The percentage uses equally weighted group means, not the average of flow-specific percentages or annual energy yield.",
      "The conditional interval is not a confidence interval from verified physical experiments, nor evidence of equivalent power.",
      "This power-table input does not contain raw RPM, voltage, current, actual pitch or hydraulic input series; it does not establish whether these records exist elsewhere.",
    ],
  };
}

export type HistoricalAnalysis = ReturnType<typeof analyzeHistorical>;
