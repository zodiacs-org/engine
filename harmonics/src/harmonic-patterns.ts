import { ASPECTS, matchAspect, STATIONARY_RELATIVE_SPEED } from "../../src/aspects.js";
import type { AspectDefinition } from "../../src/aspects.js";
import { createAspectPolicy } from "../../src/configured-aspects.js";
import type { AspectOrbLimits, AspectPolicyInput } from "../../src/configured-aspects.js";
import { aspectPatterns, PATTERN_BODIES, patternContainment } from "../../src/techniques/aspect-patterns.js";
import type { AspectPatterns, PatternContainment, PatternEdgeInput } from "../../src/techniques/aspect-patterns.js";
import { harmonicChart } from "./harmonic-chart.js";
import type { HarmonicChart, HarmonicOptions, LongitudePoint } from "./types.js";

export type {
  AspectPattern, AspectPatterns, PatternBody, PatternContainment, PatternEdge, PatternKind
} from "../../src/techniques/aspect-patterns.js";
export { PATTERN_BODIES } from "../../src/techniques/aspect-patterns.js";

export interface HarmonicPatternOptions extends HarmonicOptions {
  /** Subsets of the engine's physical bodies and fixed major-aspect rules only. */
  readonly policy?: AspectPolicyInput;
  /** The pattern detector supports fixed harmonic-circle orbs only. */
  readonly orbScaling?: "fixed";
}

export interface HarmonicPatternPolicy {
  readonly bodies: readonly string[];
  readonly aspects: readonly AspectDefinition[];
  readonly arithmetic: "engine-historical-binary64";
}

/** Pure derivation of supplied longitudes; contains no astronomical receipt. */
export interface HarmonicPatternResult {
  readonly harmonicChart: HarmonicChart;
  /** Fixed harmonic-circle allowances, not source-circle or N=1 allowances. */
  readonly policy: HarmonicPatternPolicy;
  readonly orbScaling: "fixed";
  /** Historical engine matcher records passed to the engine pattern detector. */
  readonly aspects: readonly PatternEdgeInput[];
  readonly analysis: AspectPatterns;
  readonly containment: PatternContainment;
}

const uniform = (limits: AspectOrbLimits | undefined, value: number): boolean =>
  limits !== undefined && limits.applying === value &&
  limits.separating === value && limits.stationary === value;

function supportedPolicy(input: AspectPolicyInput | undefined): HarmonicPatternPolicy {
  const policy = createAspectPolicy(input);
  if (policy.bodies.some((body) => !(PATTERN_BODIES as readonly string[]).includes(body)) ||
    Object.keys(policy.bodyOrbs).length !== 0 ||
    policy.stationaryRelativeSpeed !== STATIONARY_RELATIVE_SPEED ||
    policy.aspects.some((rule) => {
      const definition = ASPECTS.find((candidate) => candidate.type === rule.type);
      return !definition || rule.angle !== definition.angle ||
        !uniform(rule.orb, definition.orb) || !uniform(rule.luminaryOrb, definition.luminaryOrb);
    })) {
    throw new RangeError("Pattern policies require physical bodies and fixed engine major-aspect limits without caps or motion customization.");
  }
  return Object.freeze({
    bodies: policy.bodies,
    aspects: Object.freeze(policy.aspects.map((rule) => ASPECTS.find((definition) => definition.type === rule.type)!)),
    arithmetic: "engine-historical-binary64"
  });
}

/**
 * Transform original supplied longitudes, then use the engine's historical
 * matcher, pattern detector and containment helper. Speeds are not needed.
 * This separate entry inherits the detector's static ephemeris imports, but
 * does not call chart casting or the ephemeris.
 */
export function findHarmonicPatterns(
  positions: readonly LongitudePoint[],
  harmonic: number,
  options: HarmonicPatternOptions = {}
): HarmonicPatternResult {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    Reflect.ownKeys(options).some((key) =>
      typeof key !== "string" || !["maxHarmonic", "policy", "orbScaling"].includes(key))) {
    throw new RangeError("Harmonic pattern options must contain supported fields only.");
  }
  if (options.orbScaling !== undefined && options.orbScaling !== "fixed") {
    throw new RangeError("Harmonic patterns support fixed harmonic-circle orbs only.");
  }
  const transformed = harmonicChart(positions, harmonic, options);
  const policy = supportedPolicy(options.policy);
  const selected = new Set(policy.bodies);
  const types = new Set(policy.aspects.map((rule) => rule.type));
  const points = transformed.points.filter((point) => selected.has(point.body));
  const records: PatternEdgeInput[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i]!;
      const b = points[j]!;
      const match = matchAspect(a.body, a.lon, b.body, b.lon);
      if (match && types.has(match.definition.type)) {
        records.push(Object.freeze({ a: a.body, b: b.body, type: match.definition.type, orb: match.orb }));
      }
    }
  }
  const aspects = Object.freeze(records);
  // The engine rejects an empty eligible selection. Its graph is trivially
  // empty here, including when the source contains only supplemental points.
  const analysis: AspectPatterns = points.length
    ? aspectPatterns(points, aspects)
    : Object.freeze({ points: Object.freeze([]), patterns: Object.freeze([]) });
  return Object.freeze({
    harmonicChart: transformed,
    policy,
    orbScaling: "fixed",
    aspects,
    analysis,
    containment: patternContainment(analysis.patterns)
  });
}
