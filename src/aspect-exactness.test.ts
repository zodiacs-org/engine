/**
 * Exact binary semantics for configured aspects and declination parallels,
 * checked against an exact rational oracle (./fixtures/rational.ts) that
 * evaluates the README's rules on the exact values of the input doubles. The
 * same harness is run on a verbatim copy of the rc.11 arithmetic to show that
 * it detects the defect this candidate repairs.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_ASPECT_POLICY, createAspectPolicy, findConfiguredAspects } from "./configured-aspects.js";
import type {
  AspectPolicy,
  AspectPolicyInput,
  AspectPosition,
  ConfiguredAspect,
  ConfiguredAspectMotion
} from "./configured-aspects.js";
import { declinationsForBodies, findDeclinationAspects } from "./declination.js";
import type { DeclinationAspect, DeclinationBody, DeclinationOrbPolicy, DeclinationRow } from "./declination.js";
import { abs, cmp, describe as digits, isRoundedHalfEven, min, rational, sign, sub, sum } from "./fixtures/rational.js";
import type { Rational } from "./fixtures/rational.js";

// ---------------------------------------------------------------------------
// Oracle: the documented configured-aspect rules in exact rational arithmetic.

interface ExpectedAspect {
  a: string;
  b: string;
  type: string;
  angle: number;
  orb: Rational;
  maximumOrb: number;
  motion: ConfiguredAspectMotion;
}

const LUMINARIES = new Set(["Sun", "Moon"]);

function oracleAspects(rows: readonly AspectPosition[], policy: AspectPolicy): ExpectedAspect[] {
  const selected = rows.filter((row) => policy.bodies.includes(row.body));
  const threshold = rational(policy.stationaryRelativeSpeed);
  const found: ExpectedAspect[] = [];
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const first = selected[i]!;
      const second = selected[j]!;
      // Signed separation in (−180, 180].
      let separation = sub(first.lon, second.lon);
      if (cmp(separation, 180) > 0) separation = sub(separation, 360);
      else if (cmp(separation, -180) <= 0) separation = sum(separation, 360);
      const distance = abs(separation);
      const relative = sub(first.speed, second.speed);
      const stationary = sign(relative) === 0 || cmp(abs(relative), threshold) < 0;
      const luminary = LUMINARIES.has(first.body) || LUMINARIES.has(second.body);
      let best: ExpectedAspect | null = null;
      for (const rule of policy.aspects) {
        const deviation = sub(distance, rule.angle);
        const orb = abs(deviation);
        let motion: ConfiguredAspectMotion;
        if (stationary) motion = "stationary";
        else if (sign(deviation) === 0) motion = "separating";
        else {
          const rate = sign(distance) === 0 ? 1 : cmp(distance, 180) === 0 ? -1 : sign(separation) * sign(relative);
          motion = sign(deviation) * rate < 0 ? "applying" : "separating";
        }
        const limits = luminary && rule.luminaryOrb ? rule.luminaryOrb : rule.orb;
        const maximumOrb = Math.min(limits[motion], policy.bodyOrbs[first.body]?.[motion] ?? 180,
          policy.bodyOrbs[second.body]?.[motion] ?? 180);
        if (cmp(orb, maximumOrb) <= 0 && (best === null || cmp(orb, best.orb) < 0)) {
          best = { a: first.body, b: second.body, type: rule.type, angle: rule.angle, orb, maximumOrb, motion };
        }
      }
      if (best) found.push(best);
    }
  }
  return found.sort((x, y) => cmp(x.orb, y.orb));
}

function aspectDisagreement(actual: readonly ConfiguredAspect[], expected: readonly ExpectedAspect[]): string | null {
  if (actual.length !== expected.length) {
    return `returned ${actual.length} aspects, exact rules give ${expected.length}` +
      (expected[0] ? ` (exact orb ${digits(expected[0].orb)})` : "");
  }
  for (let k = 0; k < actual.length; k += 1) {
    const got = actual[k]!;
    const want = expected[k]!;
    for (const key of ["a", "b", "type", "angle", "maximumOrb", "motion"] as const) {
      if (got[key] !== want[key]) return `aspect ${k}: ${key} ${String(got[key])}, exact rules give ${String(want[key])}`;
    }
    if (got.applying !== (want.motion === "applying")) return `aspect ${k}: applying disagrees with motion`;
    if (!isRoundedHalfEven(got.orb, want.orb)) return `aspect ${k}: orb ${got.orb} is not exact orb ${digits(want.orb)} rounded`;
  }
  return null;
}

type Finder = (rows: readonly AspectPosition[], policy: AspectPolicy) => readonly ConfiguredAspect[];
const current: Finder = (rows, policy) => findConfiguredAspects(rows, policy).aspects;

interface AspectCase {
  label: string;
  rows: AspectPosition[];
  policy: AspectPolicy;
  wrapped: boolean;
}

function aspectMismatches(find: Finder, cases: readonly AspectCase[]): { label: string; wrapped: boolean; why: string }[] {
  const out: { label: string; wrapped: boolean; why: string }[] = [];
  for (const entry of cases) {
    const why = aspectDisagreement(find(entry.rows, entry.policy), oracleAspects(entry.rows, entry.policy));
    if (why !== null) out.push({ label: entry.label, wrapped: entry.wrapped, why });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The rc.11 arithmetic (engine be3585b, unchanged through rc.12), kept verbatim
// in substance: direct float subtraction folded outside ±180, float orbs.

function rc11SignedSeparation(a: number, b: number): number {
  const difference = a - b;
  return difference > 180 ? difference - 360 : difference < -180 ? difference + 360 : difference;
}

function rc11MotionAt(a: AspectPosition, b: AspectPosition, angle: number, threshold: number): ConfiguredAspectMotion {
  const relative = a.speed - b.speed;
  if (relative === 0 || Math.abs(relative) < threshold) return "stationary";
  const signed = rc11SignedSeparation(a.lon, b.lon);
  const distance = Math.abs(signed);
  const deviation = distance - angle;
  if (deviation === 0) return "separating";
  const distanceRateSign = distance === 0 ? 1 : distance === 180 ? -1
    : Math.sign(signed) * Math.sign(relative);
  return Math.sign(deviation) * distanceRateSign < 0 ? "applying" : "separating";
}

const rc11: Finder = (positions, policy) => {
  const selected = new Set(policy.bodies);
  const candidates = positions.filter((row) => selected.has(row.body));
  const aspects: ConfiguredAspect[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]!, b = candidates[j]!;
      const distance = Math.abs(rc11SignedSeparation(a.lon, b.lon));
      let best: ConfiguredAspect | null = null;
      for (const definition of policy.aspects) {
        const orb = Math.abs(distance - definition.angle);
        const motion = rc11MotionAt(a, b, definition.angle, policy.stationaryRelativeSpeed);
        const luminary = a.body === "Sun" || a.body === "Moon" || b.body === "Sun" || b.body === "Moon";
        const limits = luminary && definition.luminaryOrb ? definition.luminaryOrb : definition.orb;
        const maximumOrb = Math.min(limits[motion], policy.bodyOrbs[a.body]?.[motion] ?? 180, policy.bodyOrbs[b.body]?.[motion] ?? 180);
        if (orb <= maximumOrb && (!best || orb < best.orb)) {
          best = { a: a.body, b: b.body, type: definition.type, angle: definition.angle, orb, maximumOrb, motion, applying: motion === "applying" };
        }
      }
      if (best) aspects.push(best);
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb);
};

// ---------------------------------------------------------------------------
// Case grids. Decimal inputs are built from integer hundredths, so each input
// is the double nearest its decimal, as a caller would write it.

let seed = 0x20260928;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const hundredths = (value: number) => value / 100;
const policies = new Map<string, AspectPolicy>();
function cachedPolicy(input: AspectPolicyInput): AspectPolicy {
  const key = JSON.stringify(input);
  let policy = policies.get(key);
  if (!policy) policies.set(key, (policy = createAspectPolicy(input)));
  return policy;
}

const NAMED: Record<string, number> = { conjunction: 0, semisextile: 30, semisquare: 45, sextile: 60, quintile: 72,
  square: 90, trine: 120, sesquiquadrate: 135, biquintile: 144, quincunx: 150, opposition: 180 };
const ANGLES: { type: string; hundredths: number }[] = [
  ...Object.entries(NAMED).map(([type, angle]) => ({ type, hundredths: angle * 100 })),
  ...[10, 2250, 5143, 10010, 17990].map((value) => ({ type: "custom", hundredths: value }))
];
const ORBS = [0, 10, 30, 100, 110, 250, 730, 800];
const BASES = [1, 10, 330, 4578, 9886, 17990, 18001, 27050, 31400, 35970, 35999];
const SPEEDS: { a: number; b: number; threshold?: number }[] = [
  { a: 0, b: 0 }, { a: 1, b: 0 }, { a: -1, b: 0.5 }, { a: 0.7, b: 0.1, threshold: 0.6 }, { a: 0.3, b: 0.2, threshold: 0.1 }
];

/** a = b ± (angle ± orb) on a hundredths grid, b ≠ 0, wrapped and unwrapped, both row orders. */
function decimalGrid(): AspectCase[] {
  const cases: AspectCase[] = [];
  for (const angle of ANGLES) for (const orb of ORBS) for (const base of BASES) {
    for (const orbSign of [1, -1]) {
      const separation = angle.hundredths + orbSign * orb;
      if (separation < 0 || separation > 18000) continue;
      for (const direction of [1, -1]) {
        const other = (((base + direction * separation) % 36000) + 36000) % 36000;
        const wrapped = Math.abs(other - base) > 18000;
        for (const speeds of SPEEDS) {
          const policy = cachedPolicy({ bodies: ["A", "B"],
            aspects: [angle.type === "custom" ? { type: "custom", angle: hundredths(angle.hundredths), orb: hundredths(orb) }
              : { type: angle.type, orb: hundredths(orb) }],
            ...(speeds.threshold === undefined ? {} : { stationaryRelativeSpeed: speeds.threshold }) });
          const rows = [{ body: "A", lon: hundredths(other), speed: speeds.a }, { body: "B", lon: hundredths(base), speed: speeds.b }];
          const label = `${angle.type} ${hundredths(angle.hundredths)} orb ${hundredths(orb)}: A ${rows[0]!.lon}/${speeds.a}, B ${rows[1]!.lon}/${speeds.b}`;
          cases.push({ label, rows, policy, wrapped });
          cases.push({ label: `${label} (reversed)`, rows: [rows[1]!, rows[0]!], policy, wrapped });
        }
      }
    }
  }
  return cases;
}

/** Several bodies, several rules, caps and luminaries on the same decimal grid. */
function multiBodyGrid(count: number): AspectCase[] {
  const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Chiron"];
  const cases: AspectCase[] = [];
  for (let n = 0; n < count; n += 1) {
    const bodies = names.filter(() => random() < 0.7);
    if (bodies.length < 2) continue;
    const anchor = 1 + Math.floor(random() * 35998);
    const rows = bodies.map((body) => {
      const angle = ANGLES[Math.floor(random() * ANGLES.length)]!.hundredths;
      const offset = ORBS[Math.floor(random() * ORBS.length)]! * (random() < 0.5 ? -1 : 1);
      const lon = (((anchor + (random() < 0.5 ? 1 : -1) * (angle + offset)) % 36000) + 36000) % 36000;
      return { body, lon: hundredths(lon), speed: hundredths(Math.round((random() - 0.3) * 200)) };
    });
    const types = Object.keys(NAMED).filter(() => random() < 0.4);
    const aspects = types.map((type) => ({ type, orb: hundredths(ORBS[Math.floor(random() * ORBS.length)]!),
      ...(random() < 0.4 ? { luminaryOrb: hundredths(ORBS[Math.floor(random() * ORBS.length)]!) } : {}) }));
    const bodyOrbs = Object.fromEntries(bodies.filter(() => random() < 0.2).map((body) => [body, hundredths(ORBS[Math.floor(random() * ORBS.length)]!)]));
    const policy = createAspectPolicy({ bodies, aspects, bodyOrbs, stationaryRelativeSpeed: random() < 0.5 ? 1e-9 : 0.1 });
    const wrapped = rows.some((x) => rows.some((y) => Math.abs(x.lon - y.lon) > 180));
    cases.push({ label: `multi ${n}: ${JSON.stringify(rows)}`, rows, policy, wrapped });
  }
  return cases;
}

const REPRODUCTIONS: AspectCase[] = [
  { label: "square A=188.86 B=98.86 at zero orb", wrapped: false,
    rows: [{ body: "A", lon: 188.86, speed: 0 }, { body: "B", lon: 98.86, speed: 0 }],
    policy: createAspectPolicy({ bodies: ["A", "B"], aspects: [{ type: "square", orb: 0 }] }) },
  { label: "Jupiter 6.3 / Sun 314, semisquare orb 7.3", wrapped: true,
    rows: [{ body: "Jupiter", lon: 6.3, speed: 0 }, { body: "Sun", lon: 314, speed: 0 }],
    policy: createAspectPolicy({ bodies: ["Jupiter", "Sun"], aspects: [{ type: "semisquare", orb: 7.3 }] }) },
  { label: "Mars 7.6999999999999895 / Saturn 359.7, default policy", wrapped: true,
    rows: [{ body: "Mars", lon: 7.6999999999999895, speed: 1 }, { body: "Saturn", lon: 359.7, speed: 0 }],
    policy: DEFAULT_ASPECT_POLICY }
];

const GRID = decimalGrid();
const MULTI = multiBodyGrid(1_500);

describe("configured aspects under exact binary semantics", () => {
  it("decide the three review reproductions as exact arithmetic does", () => {
    const [square, semisquare, conjunction] = REPRODUCTIONS.map((entry) => current(entry.rows, entry.policy));
    // 188.86 − 98.86 is exactly 90 + 2^-46 in binary: no zero-orb square.
    expect(cmp(sub(188.86, 98.86), sum(90, 2 ** -46))).toBe(0);
    expect(square).toEqual([]);
    expect(current(REPRODUCTIONS[0]!.rows, createAspectPolicy({ bodies: ["A", "B"], aspects: [{ type: "square", orb: 2 ** -46 }] })))
      .toMatchObject([{ type: "square", orb: 2 ** -46 }]);
    // 6.3 − 314 + 360 − 45 is exactly the double 7.3: an inclusive match.
    expect(cmp(sum(6.3, -314, 360, -45), 7.3)).toBe(0);
    expect(semisquare).toMatchObject([{ type: "semisquare", orb: 7.3, maximumOrb: 7.3, motion: "stationary" }]);
    expect(current([{ body: "Jupiter", lon: 52.3, speed: 0 }, { body: "Sun", lon: 0, speed: 0 }], REPRODUCTIONS[1]!.policy))
      .toMatchObject([{ type: "semisquare", orb: 7.299999999999997 }]);
    // 7.6999999999999895 − 359.7 + 360 is 8 + 2^-50: outside the inclusive 8° orb.
    expect(cmp(sum(7.6999999999999895, -359.7, 360), sum(8, 2 ** -50))).toBe(0);
    expect(conjunction).toEqual([]);
    for (const entry of REPRODUCTIONS) {
      expect(aspectDisagreement(current(entry.rows, entry.policy), oracleAspects(entry.rows, entry.policy)), entry.label).toBeNull();
      const reversed = [entry.rows[1]!, entry.rows[0]!];
      expect(aspectDisagreement(current(reversed, entry.policy), oracleAspects(reversed, entry.policy)), entry.label).toBeNull();
    }
  });

  it("agree with the exact rational oracle on a decimal grid, wrapped and unwrapped, in both row orders", () => {
    // Deterministic sizes, cited in docs/evidence/rc13-20260928.
    expect(GRID.length).toBe(50_600);
    expect(GRID.filter((entry) => entry.wrapped).length).toBe(16_270);
    expect(GRID.every((entry) => entry.rows.find((row) => row.body === "B")!.lon !== 0)).toBe(true);
    const mismatches = aspectMismatches(current, GRID);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it("agree with the oracle with several bodies, rules, caps and luminaries", () => {
    expect(MULTI.length).toBe(1_497);
    const mismatches = aspectMismatches(current, MULTI);
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it("would fail the same oracle harness on the rc.11 arithmetic", () => {
    const grid = aspectMismatches(rc11, GRID);
    expect(grid).toHaveLength(20_754);
    const kind = (pattern: RegExp, wrapped: boolean) =>
      grid.filter((entry) => entry.wrapped === wrapped && pattern.test(entry.why)).length;
    // Every kind of disagreement appears on both sides of the 0° fold:
    // membership at the inclusive boundary, motion at the exact threshold,
    // and orbs that are float differences rather than the exact orb rounded.
    for (const wrapped of [false, true]) {
      expect(kind(/aspects, exact rules/, wrapped)).toBeGreaterThan(0);
      expect(kind(/motion/, wrapped)).toBeGreaterThan(0);
      expect(kind(/is not exact orb/, wrapped)).toBeGreaterThan(0);
    }
    expect(aspectMismatches(rc11, MULTI)).toHaveLength(437);
    // Two review reproductions fail on rc.11; it already decided the 188.86/98.86 square exactly.
    expect(aspectMismatches(rc11, REPRODUCTIONS).map((entry) => entry.label)).toEqual([
      "Jupiter 6.3 / Sun 314, semisquare orb 7.3",
      "Mars 7.6999999999999895 / Saturn 359.7, default policy"
    ]);
  });

  it("uses a faithful rc.11 copy: away from boundaries its decisions match the oracle", () => {
    // Generic doubles, not decimal boundaries: rc.11 then makes the same
    // decisions, so the failures above are its arithmetic, not its rules.
    const policy = createAspectPolicy({ bodies: ["Sun", "Moon", "Mars", "Venus", "Saturn"], stationaryRelativeSpeed: 1e-9,
      aspects: [{ type: "conjunction", orb: 8, luminaryOrb: 10 }, { type: "sextile", orb: 4 }, { type: "square", orb: { applying: 7, separating: 5, stationary: 1 } },
        { type: "trine", orb: 7 }, { type: "quincunx", orb: 2 }, { type: "opposition", orb: 8 }, { type: "custom", angle: 360 / 7, orb: 1.5 }] });
    let decisions = 0;
    for (let n = 0; n < 2_000; n += 1) {
      const rows = policy.bodies.map((body) => ({ body, lon: random() * 360, speed: (random() - 0.3) * 15 }));
      const actual = rc11(rows, policy);
      const expected = oracleAspects(rows, policy);
      expect(actual.map(({ a, b, type, motion, maximumOrb }) => ({ a, b, type, motion, maximumOrb })))
        .toEqual(expected.map(({ a, b, type, motion, maximumOrb }) => ({ a, b, type, motion, maximumOrb })));
      decisions += expected.length;
    }
    expect(decisions).toBeGreaterThan(2_000);
  });
});

// ---------------------------------------------------------------------------
// Declination parallels and contraparallels.

interface ExpectedParallel {
  a: string;
  b: string;
  type: "parallel" | "contraparallel";
  orb: Rational;
  maximumOrb: number;
}

function oracleParallels(rows: readonly DeclinationRow[], policy: DeclinationOrbPolicy): ExpectedParallel[] {
  const found: ExpectedParallel[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const first = rows[i]!;
      const second = rows[j]!;
      const parallel = abs(sub(first.dec, second.dec));
      const contraparallel = abs(sum(first.dec, second.dec));
      const maximumOrb = LUMINARIES.has(first.body) || LUMINARIES.has(second.body) ? policy.luminaryOrb : policy.orb;
      const orb = min(parallel, contraparallel);
      if (cmp(orb, maximumOrb) > 0) continue;
      found.push({ a: first.body, b: second.body, type: cmp(parallel, contraparallel) <= 0 ? "parallel" : "contraparallel", orb, maximumOrb });
    }
  }
  return found.sort((x, y) => cmp(x.orb, y.orb));
}

function parallelDisagreement(actual: readonly DeclinationAspect[], expected: readonly ExpectedParallel[]): string | null {
  if (actual.length !== expected.length) return `returned ${actual.length} aspects, exact rules give ${expected.length}`;
  for (let k = 0; k < actual.length; k += 1) {
    const got = actual[k]!;
    const want = expected[k]!;
    for (const key of ["a", "b", "type", "maximumOrb"] as const) {
      if (got[key] !== want[key]) return `aspect ${k}: ${key} ${String(got[key])}, exact rules give ${String(want[key])}`;
    }
    if (!isRoundedHalfEven(got.orb, want.orb)) return `aspect ${k}: orb ${got.orb} is not exact orb ${digits(want.orb)} rounded`;
  }
  return null;
}

type ParallelFinder = (bodies: readonly DeclinationBody[], obliquity: number, policy: DeclinationOrbPolicy) => readonly DeclinationAspect[];
const currentParallels: ParallelFinder = (bodies, obliquity, policy) => findDeclinationAspects(bodies, obliquity, policy);

/** The rc.11 declination matching (engine be3585b, unchanged through rc.12), on the same rows. */
const rc11Parallels: ParallelFinder = (bodies, obliquity, policy) => {
  const rows = declinationsForBodies(bodies, obliquity, policy).rows;
  const found: DeclinationAspect[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]!;
      const b = rows[j]!;
      const parallel = Math.abs(a.dec - b.dec);
      const contraparallel = Math.abs(a.dec + b.dec);
      const orb = Math.min(parallel, contraparallel);
      const maximumOrb = LUMINARIES.has(a.body) || LUMINARIES.has(b.body) ? policy.luminaryOrb : policy.orb;
      if (orb > maximumOrb) continue;
      const difference = Math.abs(a.lon - b.lon);
      found.push({ a: a.body, b: b.body, type: parallel <= contraparallel ? "parallel" : "contraparallel",
        orb, maximumOrb, decA: a.dec, decB: b.dec, separation: Math.min(difference, 360 - difference) });
    }
  }
  return found.sort((a, b) => a.orb - b.orb);
};

interface ParallelCase {
  label: string;
  bodies: DeclinationBody[];
  obliquity: number;
  policy: DeclinationOrbPolicy;
}

function parallelMismatches(find: ParallelFinder, cases: readonly ParallelCase[]): string[] {
  const out: string[] = [];
  for (const entry of cases) {
    const rows = declinationsForBodies(entry.bodies, entry.obliquity, entry.policy).rows;
    const why = parallelDisagreement(find(entry.bodies, entry.obliquity, entry.policy), oracleParallels(rows, entry.policy));
    if (why !== null) out.push(`${entry.label}: ${why}`);
  }
  return out;
}

/** Zero obliquity makes declination exactly the latitude: decimal boundaries |x ∓ y| = orb, both orders. */
function parallelGrid(): ParallelCase[] {
  const cases: ParallelCase[] = [];
  const latitudes = [1, 10, 30, 40, 70, 120, 730, 1230, 2220, 2344, 4578, 8900];
  const orbs = [0, 10, 50, 100, 150, 220, 330];
  for (const x of latitudes) for (const orb of orbs) for (const sx of [1, -1]) for (const kind of [1, -1]) for (const direction of [1, -1]) {
    const first = sx * x;
    const second = kind * first + direction * orb;
    if (Math.abs(second) > 9000) continue;
    for (const names of [["Mars", "Saturn"], ["Sun", "Saturn"]]) {
      const policy = { orb: hundredths(orb), luminaryOrb: hundredths(orb) };
      const bodies = [{ body: names[0]!, lon: 359, lat: hundredths(first) }, { body: names[1]!, lon: 1.5, lat: hundredths(second) }];
      const label = `${bodies[0]!.lat}/${bodies[1]!.lat} orb ${policy.orb}`;
      cases.push({ label, bodies, obliquity: 0, policy });
      cases.push({ label: `${label} (reversed)`, bodies: [bodies[1]!, bodies[0]!], obliquity: 0, policy });
    }
  }
  // Rotated rows: the oracle takes the engine's own computed declinations as exact inputs.
  for (let n = 0; n < 1_000; n += 1) {
    const bodies = Array.from({ length: 2 + Math.floor(random() * 6) }, (_, index) => ({
      body: ["Sun", "Moon", "Mars", "Venus", "North Node", "South Node", "P"][index]!,
      lon: hundredths(Math.floor(random() * 36000)), lat: hundredths(Math.round((random() - 0.5) * 1600)) }));
    const policy = { orb: hundredths(Math.floor(random() * 300)), luminaryOrb: hundredths(Math.floor(random() * 300)) };
    cases.push({ label: `rotated ${n}`, bodies, obliquity: 23.4392911, policy });
  }
  return cases;
}

const PARALLELS = parallelGrid();

describe("declination parallels under exact binary semantics", () => {
  it("decide the reviewed decimal boundaries exactly", () => {
    const at = (x: number, y: number) => findDeclinationAspects([{ body: "A", lon: 0, lat: x }, { body: "B", lon: 10, lat: y }], 0);
    expect(at(12.3, 13.3)).toMatchObject([{ type: "parallel", orb: 1 }]); // 13.3 − 12.3 is exactly 1
    expect(at(7.3, 8.3)).toEqual([]); // 8.3 − 7.3 is 1 + 2^-50
    expect(at(0.1, 1.1)).toEqual([]); // 1.1 − 0.1 is 1 + 3·2^-55, although it rounds to 1
    expect(at(22.2, -23.2)).toMatchObject([{ type: "contraparallel", orb: 1 }]);
    expect(at(-0.4, 0.6)).toMatchObject([{ type: "contraparallel", orb: 0.19999999999999996 }]);
    expect(cmp(sub(1.1, 0.1), 1)).toBe(1);
  });

  it("agree with the exact rational oracle on decimal and rotated declinations", () => {
    expect(PARALLELS.length).toBe(3_640);
    expect(PARALLELS.filter((entry) => entry.obliquity === 0)).toHaveLength(2_640);
    const mismatches = parallelMismatches(currentParallels, PARALLELS);
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("would fail the same oracle harness on the rc.11 arithmetic", () => {
    const mismatches = parallelMismatches(rc11Parallels, PARALLELS);
    expect(mismatches).toHaveLength(176);
    expect(mismatches.some((entry) => entry.startsWith("0.1/1.1 orb 1:"))).toBe(true);
  });
});
