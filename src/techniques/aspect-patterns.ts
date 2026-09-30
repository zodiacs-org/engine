/*
 * Aspect patterns among the Sun to Pluto: the grand trine, the T-square, the
 * grand cross and the kite, found as complete graphs of the chart's own
 * aspect records. Definitions: Robert Hand, Horoscope Symbols (1981), ch. 6,
 * "Aspect Patterns or Harmonic Syndromes". Ported from the Zodiacs.org site
 * (src/lib/engine/aspect-patterns.ts, and the containment of
 * src/lib/aspect-pattern-model.ts); see docs/techniques.md.
 */
import { resolvedChart } from "../api.js";
import type { NatalSource } from "../api.js";
import { ASPECTS, matchAspect } from "../aspects.js";
import type { AspectType } from "../types.js";

export const PATTERN_BODIES = /*#__PURE__*/ Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type PatternBody = (typeof PATTERN_BODIES)[number];
export type PatternKind = "grand-trine" | "t-square" | "grand-cross" | "kite";

/** A position; bodies other than the Sun to Pluto are ignored. */
export interface PatternPoint {
  readonly body: string;
  readonly lon: number;
}

/** An aspect record, as a chart's `aspects` hold them. */
export interface PatternEdgeInput {
  readonly a: string;
  readonly b: string;
  readonly type: AspectType;
  readonly orb: number;
  /** `aspect:<a>-<type>-<b>` by default. */
  readonly sourceId?: string | undefined;
}

/** An aspect of a pattern, its bodies in `PATTERN_BODIES` order. */
export interface PatternEdge {
  readonly a: PatternBody;
  readonly b: PatternBody;
  readonly type: AspectType;
  readonly orb: number;
  /** The orb limit that admitted it. */
  readonly limit: number;
  /** `<a>|<b>|<type>`. */
  readonly key: string;
  readonly sourceIds: readonly string[];
}

export interface AspectPattern {
  /** `<kind>:<members>`, and the roles of a T-square, grand cross or kite. */
  readonly id: string;
  readonly kind: PatternKind;
  readonly members: readonly PatternBody[];
  readonly edges: readonly PatternEdge[];
  readonly oppositions: readonly (readonly [PatternBody, PatternBody])[];
  /** T-square: the body square both ends of the opposition. */
  readonly apex?: PatternBody;
  /** Kite: its grand trine; `axisVertex`, the trine body opposed by `opposedVertex`, the fourth. */
  readonly triangle?: readonly PatternBody[];
  readonly axisVertex?: PatternBody;
  readonly opposedVertex?: PatternBody;
}

export interface AspectPatterns {
  /** The Sun to Pluto, normalized, in `PATTERN_BODIES` order. */
  readonly points: readonly { readonly body: PatternBody; readonly lon: number }[];
  /** Every pattern, sorted by id. */
  readonly patterns: readonly AspectPattern[];
}

const rank = (body: string): number => (PATTERN_BODIES as readonly string[]).indexOf(body);
/** Code-unit order: no body name is a prefix of another, so ids and keys never depend on the host's locale. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ordered = (bodies: readonly PatternBody[]): PatternBody[] => [...bodies].sort((a, b) => rank(a) - rank(b));
const pair = (a: PatternBody, b: PatternBody): [PatternBody, PatternBody] => (rank(a) < rank(b) ? [a, b] : [b, a]);
const pairKey = (a: PatternBody, b: PatternBody): string => pair(a, b).join("|");
const normalize = (lon: number): number => ((lon % 360) + 360) % 360;
const LUMINARIES = new Set(["Sun", "Moon"]);

interface MutableEdge {
  a: PatternBody;
  b: PatternBody;
  type: AspectType;
  orb: number;
  limit: number;
  key: string;
  sourceIds: string[];
}

/**
 * The grand trines, T-squares, grand crosses and kites (Hand, 1981) that the
 * aspect records form among the Sun to Pluto. Every aspect of a pattern must
 * be among the records, each checked with `matchAspect`; none is inferred.
 * Malformed or contradictory input throws RangeError.
 */
export function aspectPatterns(points: readonly PatternPoint[], aspects: readonly PatternEdgeInput[]): AspectPatterns {
  if (!Array.isArray(points) || !Array.isArray(aspects)) throw new RangeError("points and aspects must be arrays.");
  const seen = new Set<string>();
  for (const point of points) {
    if (!point || !point.body || seen.has(point.body) || !Number.isFinite(point.lon)) {
      throw new RangeError("Invalid or duplicate body positions.");
    }
    seen.add(point.body);
  }
  const admitted = points
    .filter((point): point is { body: PatternBody; lon: number } => rank(point.body) >= 0)
    .map((point) => ({ body: point.body, lon: normalize(point.lon) }))
    .sort((a, b) => rank(a.body) - rank(b.body));
  if (!admitted.length) throw new RangeError("No eligible body positions.");
  const byBody = new Map(admitted.map((point) => [point.body, point.lon]));
  const graph = new Map<string, MutableEdge>();
  for (const aspect of aspects) {
    if (!aspect || !Number.isFinite(aspect.orb) || aspect.orb < 0 || !ASPECTS.some((definition) => definition.type === aspect.type)) {
      throw new RangeError("Invalid aspect data.");
    }
    if (rank(aspect.a) < 0 || rank(aspect.b) < 0) continue;
    const a = aspect.a as PatternBody;
    const b = aspect.b as PatternBody;
    if (a === b || !byBody.has(a) || !byBody.has(b)) throw new RangeError("An aspect has missing or repeated members.");
    const match = matchAspect(a, byBody.get(a)!, b, byBody.get(b)!);
    // The tolerance only allows for the record's own floating-point arithmetic.
    if (!match || match.definition.type !== aspect.type || Math.abs(match.orb - aspect.orb) > 1e-9) {
      throw new RangeError("Aspect records disagree with the positions.");
    }
    const key = pairKey(a, b);
    const previous = graph.get(key);
    const sourceId = aspect.sourceId ?? `aspect:${aspect.a}-${aspect.type}-${aspect.b}`;
    if (previous) {
      if (previous.type !== aspect.type || previous.orb !== aspect.orb) throw new RangeError("Contradictory duplicate aspect records.");
      previous.sourceIds = [...new Set([...previous.sourceIds, sourceId])].sort();
    } else {
      const [first, second] = pair(a, b);
      graph.set(key, {
        a: first,
        b: second,
        type: aspect.type,
        orb: aspect.orb,
        limit: LUMINARIES.has(a) || LUMINARIES.has(b) ? match.definition.luminaryOrb : match.definition.orb,
        key: `${key}|${aspect.type}`,
        sourceIds: [sourceId]
      });
    }
  }
  const edge = (a: PatternBody, b: PatternBody, type: AspectType): MutableEdge | undefined => {
    const found = graph.get(pairKey(a, b));
    return found?.type === type ? found : undefined;
  };
  const patterns = new Map<string, AspectPattern>();
  const add = (
    kind: PatternKind,
    members: PatternBody[],
    required: (MutableEdge | undefined)[],
    roles: { apex?: PatternBody; triangle?: PatternBody[]; axisVertex?: PatternBody; opposedVertex?: PatternBody } = {}
  ): void => {
    if (required.some((candidate) => !candidate)) return;
    const edges = (required as MutableEdge[]).slice().sort((x, y) => compare(x.key, y.key));
    const sorted = ordered(members);
    const oppositions = edges
      .filter((candidate) => candidate.type === "opposition")
      .map((candidate) => pair(candidate.a, candidate.b))
      .sort((x, y) => rank(x[0]) - rank(y[0]) || rank(x[1]) - rank(y[1]));
    const suffix =
      kind === "t-square"
        ? `apex:${roles.apex}`
        : kind === "grand-cross"
          ? `oppositions:${oppositions.map((p) => p.join(",")).join(";")}`
          : kind === "kite"
            ? `triangle:${roles.triangle?.join(",")};axis:${roles.axisVertex};opposed:${roles.opposedVertex}`
            : "";
    const id = `${kind}:${sorted.join(",")}${suffix ? `:${suffix}` : ""}`;
    patterns.set(
      id,
      Object.freeze({
        id,
        kind,
        members: Object.freeze(sorted),
        edges: Object.freeze(edges.map((row) => Object.freeze({ ...row, sourceIds: Object.freeze([...row.sourceIds]) }))),
        oppositions: Object.freeze(oppositions.map((p) => Object.freeze(p))),
        ...(roles.apex === undefined ? {} : { apex: roles.apex }),
        ...(roles.triangle === undefined ? {} : { triangle: Object.freeze([...roles.triangle]) }),
        ...(roles.axisVertex === undefined ? {} : { axisVertex: roles.axisVertex }),
        ...(roles.opposedVertex === undefined ? {} : { opposedVertex: roles.opposedVertex })
      })
    );
  };
  const bodies = admitted.map((point) => point.body);
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      for (let k = j + 1; k < bodies.length; k += 1) {
        const triangle = [bodies[i]!, bodies[j]!, bodies[k]!];
        const [a, b, c] = triangle as [PatternBody, PatternBody, PatternBody];
        const trines = [edge(a, b, "trine"), edge(a, c, "trine"), edge(b, c, "trine")];
        add("grand-trine", triangle, trines);
        for (const apex of triangle) {
          const [left, right] = triangle.filter((body) => body !== apex) as [PatternBody, PatternBody];
          add("t-square", triangle, [edge(left, right, "opposition"), edge(left, apex, "square"), edge(right, apex, "square")], { apex });
        }
        if (trines.every(Boolean)) {
          for (const axisVertex of triangle) {
            for (const opposedVertex of bodies.filter((body) => !triangle.includes(body))) {
              const others = triangle.filter((body) => body !== axisVertex);
              add(
                "kite",
                [...triangle, opposedVertex],
                [...trines, edge(axisVertex, opposedVertex, "opposition"), ...others.map((body) => edge(body, opposedVertex, "sextile"))],
                { triangle, axisVertex, opposedVertex }
              );
            }
          }
        }
        for (let l = k + 1; l < bodies.length; l += 1) {
          const d = bodies[l]!;
          for (const opposite of [b, c, d]) {
            const [left, right] = [b, c, d].filter((body) => body !== opposite) as [PatternBody, PatternBody];
            add("grand-cross", [a, b, c, d], [
              edge(a, opposite, "opposition"), edge(left, right, "opposition"),
              edge(a, left, "square"), edge(a, right, "square"), edge(opposite, left, "square"), edge(opposite, right, "square")
            ]);
          }
        }
      }
    }
  }
  return Object.freeze({
    points: Object.freeze(admitted.map((point) => Object.freeze(point))),
    patterns: Object.freeze([...patterns.values()].sort((x, y) => compare(x.id, y.id)))
  });
}

/** The aspect patterns of a chart or birth, from its own bodies and aspects. */
export function chartAspectPatterns(natal: NatalSource): AspectPatterns {
  const { chart } = resolvedChart(natal);
  return aspectPatterns(
    chart.bodies.map((row) => ({ body: row.body, lon: row.lon })),
    chart.aspects.map((row) => ({ a: row.a, b: row.b, type: row.type, orb: row.orb }))
  );
}

const KIND_ORDER: readonly PatternKind[] = ["grand-cross", "kite", "grand-trine", "t-square"];

/** `roots`: the patterns inside no other. `included[id]`: those inside `id`. */
export interface PatternContainment {
  readonly roots: readonly AspectPattern[];
  readonly included: Readonly<Record<string, readonly AspectPattern[]>>;
}

/**
 * A pattern lies inside another with fewer members, all of them and all its
 * aspects the other's: a grand cross holds four T-squares. Sorted by size,
 * kind, then id.
 */
export function patternContainment(patterns: readonly AspectPattern[]): PatternContainment {
  const presentation = (a: AspectPattern, b: AspectPattern): number =>
    b.members.length - a.members.length || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || compare(a.id, b.id);
  const sorted = [...patterns].sort(presentation);
  const included: Record<string, readonly AspectPattern[]> = {};
  const contained = new Set<string>();
  for (const outer of sorted) {
    const keys = new Set(outer.edges.map((row) => row.key));
    const inner = sorted.filter(
      (candidate) =>
        candidate.members.length < outer.members.length &&
        candidate.members.every((body) => outer.members.includes(body)) &&
        candidate.edges.every((row) => keys.has(row.key))
    );
    included[outer.id] = Object.freeze(inner);
    for (const pattern of inner) contained.add(pattern.id);
  }
  return Object.freeze({ roots: Object.freeze(sorted.filter((pattern) => !contained.has(pattern.id))), included: Object.freeze(included) });
}
