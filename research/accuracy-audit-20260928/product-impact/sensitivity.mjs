/**
 * Empirical local input-time sensitivity, not an event-time error or error bound.
 * These predeclared display gates are heuristics, not validated derivative bounds.
 */
export const SENSITIVITY_POLICY = Object.freeze({
  id: 'sampled-longitude-linearization-v1',
  conventionStatus: 'aligned-with-documented-model-differences',
  minimumAbsoluteRateArcsecPerSecond: 1e-5,
  maximumRelativeRateSpread: 0.10,
  maximumAbsoluteLongitudeDifferenceArcsecExclusive: 648000,
  relativeSpreadDenominator: 'maximum of the two absolute rates',
  primaryRate: 'longitudeRateArcsecPerSecond60s',
});

const WARNINGS = Object.freeze([
  'This is a local equivalent change in assumed input time, not a measured event-time error or a timing bound.',
  'The range uses only two sampled derivative estimates; it is not a validated enclosure or confidence interval.',
  'Measured positional differences are not physical error bounds or probabilities.',
  'Minimum-rate and rate-spread gates are predeclared heuristics; passing them does not prove linearity between samples.',
]);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/**
 * @param {{body?:string, utc?:string, longitudeDifferenceArcsec:number,
 * longitudeRateArcsecPerSecond60s:number, longitudeRateArcsecPerSecond300s:number,
 * conventionStatus:string}} row
 * @returns {{body:string|null, utc:string|null, status:string, reason:string|null,
 * equivalentInputTimeSeconds:{estimate:number,range:[number,number]}|null,
 * sampledNeighborhoodHalfWidthSeconds:number,
 * extrapolatesBeyondDerivativeSamples:boolean|null,
 * diagnostics:object, policy:object, warnings:string[]}}
 */
export function assessInputTimeSensitivity(row) {
  const result = {
    body: typeof row?.body === 'string' ? row.body : null,
    utc: typeof row?.utc === 'string' ? row.utc : null,
    status: 'unstable-rate',
    reason: null,
    equivalentInputTimeSeconds: null,
    sampledNeighborhoodHalfWidthSeconds: 300,
    extrapolatesBeyondDerivativeSamples: null,
    diagnostics: {
      signedLongitudeDifferenceArcsec: finite(row?.longitudeDifferenceArcsec) ? row.longitudeDifferenceArcsec : null,
      longitudeRateArcsecPerSecond60s: finite(row?.longitudeRateArcsecPerSecond60s) ? row.longitudeRateArcsecPerSecond60s : null,
      longitudeRateArcsecPerSecond300s: finite(row?.longitudeRateArcsecPerSecond300s) ? row.longitudeRateArcsecPerSecond300s : null,
      relativeRateSpread: null,
    },
    policy: { ...SENSITIVITY_POLICY },
    warnings: [...WARNINGS],
  };
  if (row?.conventionStatus !== SENSITIVITY_POLICY.conventionStatus) {
    result.status = 'unsupported-conventions';
    result.reason = 'comparison-conventions-not-aligned';
    return result;
  }
  const difference = row.longitudeDifferenceArcsec;
  const rate60 = row.longitudeRateArcsecPerSecond60s;
  const rate300 = row.longitudeRateArcsecPerSecond300s;
  if (!finite(difference)) { result.reason = 'nonfinite-positional-difference'; return result; }
  if (Math.abs(difference) >= SENSITIVITY_POLICY.maximumAbsoluteLongitudeDifferenceArcsecExclusive) {
    result.reason = Math.abs(difference) === SENSITIVITY_POLICY.maximumAbsoluteLongitudeDifferenceArcsecExclusive
      ? 'ambiguous-half-circle-difference' : 'difference-outside-principal-circular-range';
    return result;
  }
  if (!finite(rate60) || !finite(rate300)) { result.reason = 'nonfinite-rate'; return result; }
  if (rate60 === 0 || rate300 === 0) { result.reason = 'zero-rate'; return result; }
  if (Math.sign(rate60) !== Math.sign(rate300)) { result.reason = 'opposite-rate-signs'; return result; }
  const minimumRate = Math.min(Math.abs(rate60), Math.abs(rate300));
  const maximumRate = Math.max(Math.abs(rate60), Math.abs(rate300));
  const spread = (maximumRate - minimumRate) / maximumRate;
  result.diagnostics.relativeRateSpread = spread;
  if (minimumRate < SENSITIVITY_POLICY.minimumAbsoluteRateArcsecPerSecond) { result.reason = 'below-minimum-rate'; return result; }
  if (spread > SENSITIVITY_POLICY.maximumRelativeRateSpread) { result.reason = 'sampled-rates-disagree'; return result; }
  const absoluteDifference = Math.abs(difference);
  const estimate = absoluteDifference / Math.abs(rate60);
  const range = [absoluteDifference / maximumRate, absoluteDifference / minimumRate];
  if (![estimate, ...range].every(Number.isFinite)) { result.reason = 'numeric-overflow'; return result; }
  result.status = 'sampled-linearization';
  result.equivalentInputTimeSeconds = { estimate, range };
  result.extrapolatesBeyondDerivativeSamples = Math.max(estimate, range[1]) > result.sampledNeighborhoodHalfWidthSeconds;
  if (result.extrapolatesBeyondDerivativeSamples) {
    result.warnings.push('The estimate or upper ratio exceeds the ±300-second derivative-sampling neighborhood. This is a formal ratio, not a demonstrated input-time shift; local linear validity has not been established over the implied shift.');
  }
  return result;
}

/**
 * Pointwise comparison to a fixed sign/cusp boundary. No interval claim.
 * A single discrepancy cannot establish which boundary was crossed; direction,
 * branch ownership and both actual feature labels are still required.
 */
export function compareObservedBoundaryMargin({ signedMarginArcsec, longitudeDifferenceArcsec }) {
  if (!finite(signedMarginArcsec) || !finite(longitudeDifferenceArcsec)) {
    return { status: 'unresolved', absoluteMarginArcsec: null, observedDifferenceArcsec: null,
      differenceExceedsMargin: null, labelChangeEstablished: false,
      warning: 'Finite pointwise margin and difference are required; no interval guarantee is available.' };
  }
  const margin = Math.abs(signedMarginArcsec);
  const discrepancy = Math.abs(longitudeDifferenceArcsec);
  return {
    status: 'observed-point-comparison',
    absoluteMarginArcsec: margin,
    observedDifferenceArcsec: discrepancy,
    differenceExceedsMargin: discrepancy > margin,
    labelChangeEstablished: false,
    warning: 'Magnitude comparison alone does not establish a boundary crossing or stability over any interval; compute both labels with explicit boundary ownership.',
  };
}
