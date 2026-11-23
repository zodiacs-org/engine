type Sample = (time: number) => number;

type BudgetRefusal = {
  status: "refused";
  reason: "sample-budget";
  samples: number;
  maxSamples: number;
  crossings: [];
};

/** Run a crossing scan under one budget, including refinement and confirmation probes. */
export function sampleCrossings<T>(
  count: number, maxSamples: number, valueAt: Sample, invalid: string,
  solve: (sample: Sample) => T[]
) {
  let samples = 0;
  // A private sentinel for this scan. Errors from the caller still propagate.
  const refused: BudgetRefusal = { status: "refused", reason: "sample-budget", samples, maxSamples, crossings: [] };
  if (count > maxSamples) return refused;
  const sample = (time: number) => {
    if (samples >= maxSamples) throw refused;
    samples += 1;
    const value = valueAt(time);
    if (!Number.isFinite(value)) throw new RangeError(invalid);
    return value;
  };
  try {
    const crossings = count === 0 ? [] : solve(sample);
    return { status: "complete" as const, crossings, samples };
  } catch (error) {
    if (error !== refused) throw error;
    refused.samples = samples;
    return refused;
  }
}
