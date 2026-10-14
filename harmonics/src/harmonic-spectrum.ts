import { createAspectPolicy } from "../../src/configured-aspects.js";
import type { AspectPolicy, ConfiguredAspect } from "../../src/configured-aspects.js";
import { DEFAULT_MAX_HARMONIC, harmonicChart, harmonicLimit } from "./harmonic-chart.js";
import { findHarmonicAspects } from "./harmonic-aspects.js";
import type {
  HarmonicAspectOptions, HarmonicAspectPosition, HarmonicAspectResult, HarmonicOrbScaling
} from "./harmonic-aspects.js";

export interface HarmonicSpectrumOptions extends HarmonicAspectOptions {
  /** Unique positive integers within maxHarmonic. Defaults to 1..min(180, ceiling). */
  readonly harmonics?: readonly number[];
  /** Nonnegative dimensionless weights for selected body labels; omitted labels use 1. */
  readonly bodyWeights?: Readonly<Record<string, number>>;
  /** Nonnegative dimensionless weights for configured aspect types; omitted types use 1. */
  readonly aspectWeights?: Readonly<Record<string, number>>;
}

export interface HarmonicPairContribution {
  readonly aspect: ConfiguredAspect;
  readonly aWeight: number;
  readonly bWeight: number;
  readonly aspectWeight: number;
  readonly pairWeight: number;
  /** Linear falloff from exactness to the effective orb limit, dimensionless. */
  readonly closeness: number;
  readonly contribution: number;
}

export interface HarmonicStrength {
  readonly harmonic: number;
  readonly aspectResult: HarmonicAspectResult;
  /** Matched pairs in canonical body-label order, including zero contributions. */
  readonly contributions: readonly HarmonicPairContribution[];
  readonly totalContribution: number;
  /** totalContribution / weightCapacity, or zero when capacity is zero. */
  readonly score: number;
}

/** An analysis convention, not an empirical measure or an astronomical receipt. */
export interface HarmonicSpectrum {
  readonly formula: "weighted-linear-orb-falloff/v1";
  readonly maxHarmonic: number;
  readonly harmonics: readonly number[];
  readonly sourcePolicy: AspectPolicy;
  readonly orbScaling: HarmonicOrbScaling;
  readonly weights: {
    readonly bodies: Readonly<Record<string, number>>;
    readonly aspects: Readonly<Record<string, number>>;
  };
  /** All unordered pairs of selected labels actually present in the input. */
  readonly possiblePairs: number;
  /** Sum of body-pair weight products times the largest configured aspect weight. */
  readonly weightCapacity: number;
  readonly rows: readonly HarmonicStrength[];
  /** Same row objects, by descending score then ascending harmonic. */
  readonly ranking: readonly HarmonicStrength[];
}

function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finiteWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError("Weights and their products and sums must be finite and nonnegative.");
  }
  return value === 0 ? 0 : value;
}

function weights(input: Readonly<Record<string, number>> | undefined, labels: readonly string[]): Readonly<Record<string, number>> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const label of labels) result[label] = 1;
  if (input !== undefined) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input) as object | null)) {
      throw new RangeError("Weights must be ordinary objects keyed by selected labels.");
    }
    for (const key of Reflect.ownKeys(input)) {
      const slot = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== "string" || !labels.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
        throw new RangeError("Weights must name selected labels in ordinary enumerable data slots.");
      }
      result[key] = finiteWeight(slot.value);
    }
  }
  return Object.freeze(result);
}

/**
 * Rank original source positions through the existing harmonic aspect wrapper.
 * Defaults to conjunction-only matching; an explicit policy follows engine defaults.
 * No speed is fabricated, and no ephemeris is called. See README for the formula.
 */
export function harmonicSpectrum(
  positions: readonly HarmonicAspectPosition[],
  options: HarmonicSpectrumOptions = {}
): HarmonicSpectrum {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    Object.keys(options).some((key) => ![
      "maxHarmonic", "policy", "orbScaling", "harmonics", "bodyWeights", "aspectWeights"
    ].includes(key))) {
    throw new RangeError("Spectrum options must contain supported fields only.");
  }
  const maxHarmonic = harmonicLimit(1, options);
  const selection = options.harmonics === undefined
    ? Array.from({ length: Math.min(DEFAULT_MAX_HARMONIC, maxHarmonic) }, (_, index) => index + 1)
    : options.harmonics;
  if (!Array.isArray(selection) || !selection.length) {
    throw new RangeError("harmonics must be a nonempty array of unique permitted integers.");
  }
  const seen = new Set<number>();
  for (const harmonic of selection) {
    harmonicLimit(harmonic, { maxHarmonic });
    if (seen.has(harmonic)) throw new RangeError("harmonics must not contain duplicates.");
    seen.add(harmonic);
  }
  const harmonics = Object.freeze([...selection].sort((a, b) => a - b));
  const orbScaling = options.orbScaling === undefined ? "inverse-harmonic" : options.orbScaling;
  if (orbScaling !== "inverse-harmonic" && orbScaling !== "fixed") {
    throw new RangeError("orbScaling must be inverse-harmonic or fixed.");
  }
  const sourcePolicy = createAspectPolicy(options.policy === undefined
    ? { aspects: [{ type: "conjunction", orb: 8, luminaryOrb: 10 }] }
    : options.policy);
  const bodyWeights = weights(options.bodyWeights, sourcePolicy.bodies);
  const aspectWeights = weights(options.aspectWeights, sourcePolicy.aspects.map((rule) => rule.type));
  // Validate names and longitudes before ordering; snapshot the original speeds.
  // Canonical ordering fixes floating-point accumulation order across permutations.
  const source = harmonicChart(positions, 1, { maxHarmonic }).points.map((point, index) => ({
    body: point.body, lon: positions[index]!.lon, speed: positions[index]!.speed
  })).sort((a, b) => lexical(a.body, b.body));
  const eligible = source.filter((point) => sourcePolicy.bodies.includes(point.body));
  const largestAspectWeight = Math.max(0, ...Object.values(aspectWeights));
  let possiblePairs = 0;
  let weightCapacity = 0;
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const pairWeight = finiteWeight(bodyWeights[eligible[i]!.body]! * bodyWeights[eligible[j]!.body]!);
      weightCapacity = finiteWeight(weightCapacity + finiteWeight(pairWeight * largestAspectWeight));
      possiblePairs += 1;
    }
  }
  const rows = harmonics.map((harmonic): HarmonicStrength => {
    const aspectResult = findHarmonicAspects(source, harmonic, { maxHarmonic, orbScaling, policy: {
      aspects: sourcePolicy.aspects, bodies: sourcePolicy.bodies, bodyOrbs: sourcePolicy.bodyOrbs,
      stationaryRelativeSpeed: sourcePolicy.stationaryRelativeSpeed
    } });
    const matches = [...aspectResult.analysis.aspects].sort((a, b) => lexical(a.a, b.a) || lexical(a.b, b.b));
    let totalContribution = 0;
    const contributions = matches.map((aspect): HarmonicPairContribution => {
      const aWeight = bodyWeights[aspect.a]!;
      const bWeight = bodyWeights[aspect.b]!;
      const aspectWeight = aspectWeights[aspect.type]!;
      const pairWeight = finiteWeight(aWeight * bWeight);
      const closeness = aspect.maximumOrb === 0 ? 1 : Math.max(0, 1 - aspect.orb / aspect.maximumOrb);
      const contribution = finiteWeight(finiteWeight(pairWeight * aspectWeight) * closeness);
      totalContribution = finiteWeight(totalContribution + contribution);
      return Object.freeze({ aspect, aWeight, bWeight, aspectWeight, pairWeight, closeness, contribution });
    });
    // A zero capacity is an explicit empty/zero-weight case. Clamp only the final
    // quotient for accumulation roundoff; engine eligibility receives no epsilon.
    const score = weightCapacity === 0 ? 0 : Math.min(1, totalContribution / weightCapacity);
    return Object.freeze({ harmonic, aspectResult, contributions: Object.freeze(contributions), totalContribution, score });
  });
  return Object.freeze({
    formula: "weighted-linear-orb-falloff/v1", maxHarmonic, harmonics, sourcePolicy, orbScaling,
    weights: Object.freeze({ bodies: bodyWeights, aspects: aspectWeights }), possiblePairs, weightCapacity,
    rows: Object.freeze(rows), ranking: Object.freeze([...rows].sort((a, b) => b.score - a.score || a.harmonic - b.harmonic))
  });
}
