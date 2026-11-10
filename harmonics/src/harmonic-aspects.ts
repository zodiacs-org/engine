import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import type {
  AspectOrbLimits, AspectPolicy, AspectPolicyInput, ConfiguredAspectResult
} from "../../src/configured-aspects.js";
import { harmonicChart } from "./harmonic-chart.js";
import type { HarmonicChart, HarmonicOptions, HarmonicPoint, LongitudePoint } from "./types.js";

export interface HarmonicAspectPosition extends LongitudePoint {
  /** Required source longitude speed in degrees/day on a common time basis. */
  readonly speed: number;
}

export type HarmonicOrbScaling = "inverse-harmonic" | "fixed";

export interface HarmonicAspectOptions extends HarmonicOptions {
  /** Engine policy input. Orb limits are N=1 allowances, in degrees. */
  readonly policy?: AspectPolicyInput;
  /** Divide every orb limit by N (default), or keep it fixed. */
  readonly orbScaling?: HarmonicOrbScaling;
}

export interface HarmonicAspectPoint extends HarmonicPoint {
  readonly sourceSpeed: number;
  /** Unwrapped harmonic longitude speed in harmonic degrees/day. */
  readonly speed: number;
}

export interface HarmonicAspectChart extends HarmonicChart {
  readonly points: readonly HarmonicAspectPoint[];
}

/** Derived analysis of supplied rows; contains no astronomical chart receipt. */
export interface HarmonicAspectResult {
  readonly harmonicChart: HarmonicAspectChart;
  readonly sourcePolicy: AspectPolicy;
  readonly orbScaling: HarmonicOrbScaling;
  readonly orbScale: number;
  /** Engine matcher result. Its policy contains effective harmonic-circle limits. */
  readonly analysis: ConfiguredAspectResult;
}

function scaledLimits(limits: AspectOrbLimits, divisor: number): AspectOrbLimits {
  return {
    applying: limits.applying / divisor,
    separating: limits.separating / divisor,
    stationary: limits.stationary / divisor
  };
}

/**
 * Transform source longitudes and known speeds, then delegate matching to the
 * engine. Policy angles stay fixed on the harmonic circle. Every supplied row
 * requires a finite speed, including rows outside the policy body selection.
 */
export function findHarmonicAspects(
  positions: readonly HarmonicAspectPosition[],
  harmonic: number,
  options: HarmonicAspectOptions = {}
): HarmonicAspectResult {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    Object.keys(options).some((key) => !["maxHarmonic", "policy", "orbScaling"].includes(key))) {
    throw new RangeError("Harmonic aspect options must contain supported fields only.");
  }
  const orbScaling = options.orbScaling === undefined ? "inverse-harmonic" : options.orbScaling;
  if (orbScaling !== "inverse-harmonic" && orbScaling !== "fixed") {
    throw new RangeError("orbScaling must be inverse-harmonic or fixed.");
  }
  const transformed = harmonicChart(positions, harmonic, options);
  const sourcePolicy = createAspectPolicy(options.policy);
  const divisor = orbScaling === "inverse-harmonic" ? harmonic : 1;
  // Scaling the threshold along with speeds preserves the source motion cutoff.
  const policy = createAspectPolicy({
    aspects: sourcePolicy.aspects.map((rule) => ({
      type: rule.type,
      angle: rule.angle,
      orb: scaledLimits(rule.orb, divisor),
      ...(rule.luminaryOrb === undefined ? {} : { luminaryOrb: scaledLimits(rule.luminaryOrb, divisor) })
    })),
    bodies: sourcePolicy.bodies,
    bodyOrbs: Object.fromEntries(Object.entries(sourcePolicy.bodyOrbs)
      .map(([body, limits]) => [body, scaledLimits(limits, divisor)])),
    stationaryRelativeSpeed: sourcePolicy.stationaryRelativeSpeed * harmonic
  });
  const points = transformed.points.map((point, index): HarmonicAspectPoint => {
    const sourceSpeed = positions[index]!.speed;
    if (typeof sourceSpeed !== "number" || !Number.isFinite(sourceSpeed)) {
      throw new RangeError("Every aspect position requires a finite source and harmonic longitude speed.");
    }
    const speed = sourceSpeed * harmonic;
    if (!Number.isFinite(speed)) {
      throw new RangeError("Every aspect position requires a finite source and harmonic longitude speed.");
    }
    return Object.freeze({ ...point, sourceSpeed, speed });
  });
  const analysis = findConfiguredAspects(points, policy);
  return Object.freeze({
    harmonicChart: Object.freeze({ ...transformed, points: Object.freeze(points) }),
    sourcePolicy,
    orbScaling,
    orbScale: 1 / divisor,
    analysis
  });
}
