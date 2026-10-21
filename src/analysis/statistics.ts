/** Numerical utilities, not a claim that a sampling design is valid. */
export function describe(values: readonly number[]) {
  if (values.length === 0 || values.some((v) => !Number.isFinite(v))) {
    throw new RangeError("Descriptive inputs must be a nonempty list of finite numbers");
  }
  // Compensated sum and centered second pass avoid the E[x²] - E[x]² cancellation.
  const mean = sum(values) / values.length;
  const squaredDeviations = sum(values.map((v) => (v - mean) ** 2));
  if (!Number.isFinite(mean) || !Number.isFinite(squaredDeviations)) {
    throw new RangeError("Descriptive calculation exceeded the finite numeric range");
  }
  return {
    count: values.length,
    mean,
    sampleSd: values.length > 1 ? Math.sqrt(squaredDeviations / (values.length - 1)) : null,
    finiteListSd: Math.sqrt(squaredDeviations / values.length),
    minimum: values.reduce((a, b) => Math.min(a, b)),
    maximum: values.reduce((a, b) => Math.max(a, b)),
  };
}

function sum(values: readonly number[]): number {
  let total = 0;
  let correction = 0;
  for (const value of values) {
    const next = total + value;
    correction += Math.abs(total) >= Math.abs(value)
      ? (total - next) + value : (value - next) + total;
    total = next;
  }
  return total + correction;
}

/** Two-sided Student t tail ONLY for df=4. See docs/reproducibility.md for derivation. */
export function studentTTwoSidedDf4(t: number): number {
  if (!Number.isFinite(t)) throw new RangeError("t must be finite");
  const magnitude = Math.abs(t);
  const h = Math.hypot(magnitude, 2);
  const u = magnitude / h;
  // 1-u = (2/h)^2 / (1+u), avoiding catastrophic cancellation for large |t|.
  const delta = (2 / h) ** 2 / (1 + u);
  return 0.5 * delta ** 2 * (u + 2);
}

/** Invert the df=4 two-sided tail at .05; not a generic quantile routine. */
export function studentTCritical95Df4(): number {
  let low = 0;
  let high = 8; // tail(0)=1, tail(8)<.05; proven bracket for this fixed quantile.
  for (let iteration = 0; iteration < 80; iteration++) {
    const middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    if (studentTTwoSidedDf4(middle) > 0.05) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Reconstruct the historical FIVE-flow calculation, never a 25-row/time-sample test. */
export function conditionalFiveFlowComparison(
  fixedMeans: readonly number[], taphMeans: readonly number[],
) {
  if (fixedMeans.length !== 5 || taphMeans.length !== 5) {
    throw new RangeError("This historical calculation requires exactly five matched flow means");
  }
  if ([...fixedMeans, ...taphMeans].some((v) => !Number.isFinite(v))) {
    throw new RangeError("Flow means must be finite");
  }
  const differences = taphMeans.map((value, i) => value - fixedMeans[i]!);
  const summary = describe(differences);
  const common = {
    calculationUnit: "flow-condition mean" as const,
    differenceDirection: "TAPH minus fixed-42" as const,
    numberOfPairs: 5,
    degreesOfFreedom: 4,
    assumptionsVerified: false,
    physicalInferenceEstablished: false,
    differencesW: differences,
    meanDifferenceW: summary.mean,
    sampleSdDifferencesW: summary.sampleSd!,
    limitation: "Conditional arithmetic reconstruction on a deliberately selected flow grid; independence, sampling target and distributional assumptions are unverified. Nonsignificance does not establish equivalence.",
  };
  if (summary.sampleSd === 0) {
    return {
      ...common, status: "unavailable" as const,
      reason: "Zero difference variance makes the reconstructed t statistic undefined",
      standardErrorW: 0, t: null, twoSidedP: null,
      nominal95CiW: null, pairedStandardizedDifferenceDz: null,
    };
  }
  const standardErrorW = summary.sampleSd! / Math.sqrt(5);
  const t = summary.mean / standardErrorW;
  const margin = studentTCritical95Df4() * standardErrorW;
  return {
    ...common, status: "conditional-only" as const,
    standardErrorW, t, twoSidedP: studentTTwoSidedDf4(t),
    nominal95CiW: [summary.mean - margin, summary.mean + margin] as const,
    pairedStandardizedDifferenceDz: summary.mean / summary.sampleSd!,
  };
}
