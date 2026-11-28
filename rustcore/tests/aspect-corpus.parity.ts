import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { positions } from "../../src/api.js";
import * as legacy from "../../src/aspects.js";
import * as configured from "../../src/configured-aspects.js";
import { absolute, compareExact, exactSum, roundedValue } from "../../src/exact.js";
import type { ExactSum } from "../../src/exact.js";
import { findInterAspects } from "../../src/synastry.js";
import type { AspectPolicy, AspectPolicyInput, AspectPosition, ConfiguredAspect } from "../../src/configured-aspects.js";
import type { Aspect, BodyPosition, InterAspect } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { expectSameNumber, neighbors } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

// These are the existing M7 row allowances, not a tolerance in the aspect
// matcher. A distance/orb is 1-Lipschitz in each longitude. Relative speed
// uncertainty is the sum of the two row speed allowances.
const angleLimit = (body: string): number => body.endsWith("Node") ? 0.005 : 1e-7;
const speedLimit = (body: string): number => body.endsWith("Node") ? 0.02 : 1e-4;
const pairAngleLimit = (a: string, b: string): number => angleLimit(a) + angleLimit(b);
const pairSpeedLimit = (a: string, b: string): number => speedLimit(a) + speedLimit(b);
const names = [...configured.DEFAULT_ASPECT_POLICY.bodies, "North Node", "South Node"];
type Policies = { label: string; actual: AspectPolicy; expected: AspectPolicy };
type PairAspect = Pick<ConfiguredAspect, "a" | "b" | "type" | "orb">;
const report = {
  dates: 0, pipelines: 0, independentPairs: 0, exactReplays: 0, boundaryProbes: 0,
  matchesByPolicy: {} as Record<string, number>, matchesByType: {} as Record<string, number>,
  maximumLongitudeArcsec: 0, maximumSpeedArcsecPerDay: 0, maximumOrbArcsec: 0,
  differences: {} as Record<string, number>,
  examples: [] as { category: string; context: string; detail: string }[]
};

function policies(label: string, input: AspectPolicyInput = {}): Policies {
  return { label, actual: rust.createAspectPolicy(input), expected: configured.createAspectPolicy(input) };
}

function sameData(actual: unknown, expected: unknown, context: string): void {
  if (typeof expected === "number") expectSameNumber(actual as number, expected, context);
  else if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", context).toBe(true);
    expect(Object.keys(actual!), context).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) sameData((actual as Record<string, unknown>)[key],
      (expected as Record<string, unknown>)[key], `${context}.${key}`);
  } else expect(actual, context).toBe(expected);
}

function difference(category: string, context: string, detail: string): void {
  report.differences[category] = (report.differences[category] ?? 0) + 1;
  if (report.examples.filter(example => example.category === category).length < 3)
    report.examples.push({ category, context, detail });
}

function distance(a: number, b: number): ExactSum {
  let signed = exactSum(a, -b);
  if (compareExact(signed, 180) > 0) signed = exactSum(signed, -360);
  if (compareExact(signed, -180) <= 0) signed = exactSum(signed, 360);
  return absolute(signed);
}

function orb(a: AspectPosition, b: AspectPosition, angle: number): ExactSum {
  return absolute(exactSum(distance(a.lon, b.lon), -angle));
}

function circular(a: number, b: number): number {
  const value = (a - b) % 360;
  return value > 180 ? value - 360 : value < -180 ? value + 360 : value;
}

function checkRows(actual: readonly BodyPosition[], expected: readonly BodyPosition[], context: string): void {
  expect(actual.map(row => row.body), context).toEqual(expected.map(row => row.body));
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!, b = expected[index]!;
    const longitude = Math.abs(circular(a.lon, b.lon)) * 3600;
    const speed = Math.abs(a.speed - b.speed) * 3600;
    expect(longitude, `${context}, ${a.body} longitude`).toBeLessThanOrEqual(angleLimit(a.body));
    expect(speed, `${context}, ${a.body} speed`).toBeLessThanOrEqual(speedLimit(a.body));
    report.maximumLongitudeArcsec = Math.max(report.maximumLongitudeArcsec, longitude);
    report.maximumSpeedArcsecPerDay = Math.max(report.maximumSpeedArcsecPerDay, speed);
  }
}

/** Necessary decision surfaces, evaluated before any result comparison. */
function motionMargins(a: AspectPosition, b: AspectPosition, angle: number, threshold: number): string[] {
  const speed = absolute(exactSum(a.speed, -b.speed));
  const speedError = pairSpeedLimit(a.body, b.body) / 3600;
  // Within the stationary interval, corners and exact aspect angles cannot
  // affect motion. Equal copied node speeds are covered by the same rule.
  if (compareExact(exactSum(speed, speedError), threshold) < 0) return [];
  const reasons: string[] = [];
  if (compareExact(absolute(exactSum(speed, -threshold)), speedError) <= 0
    || compareExact(speed, speedError) <= 0) reasons.push("relative-speed");
  const separation = distance(a.lon, b.lon);
  const longitudeError = pairAngleLimit(a.body, b.body) / 3600;
  if (compareExact(separation, longitudeError) <= 0
    || compareExact(absolute(exactSum(separation, -180)), longitudeError) <= 0) reasons.push("circular-corner");
  if (compareExact(absolute(exactSum(separation, -angle)), longitudeError) <= 0) reasons.push("exact-angle");
  return reasons;
}

function referenceMotion(a: AspectPosition, b: AspectPosition, angle: number, threshold: number): legacy.AspectMotion {
  const relative = exactSum(a.speed, -b.speed);
  if (compareExact(relative, 0) === 0 || compareExact(absolute(relative), threshold) < 0) return "stationary";
  let signed = exactSum(a.lon, -b.lon);
  if (compareExact(signed, 180) > 0) signed = exactSum(signed, -360);
  if (compareExact(signed, -180) <= 0) signed = exactSum(signed, 360);
  const separation = absolute(signed);
  const deviation = compareExact(separation, angle);
  if (deviation === 0) return "separating";
  const rate = compareExact(separation, 0) === 0 ? 1 : compareExact(separation, 180) === 0 ? -1
    : compareExact(signed, 0) * compareExact(relative, 0);
  return deviation * rate < 0 ? "applying" : "separating";
}

function selectionMargins(a: AspectPosition, b: AspectPosition, policy: AspectPolicy,
  actualType: string | undefined, expectedType: string | undefined): string[] {
  const reasons: string[] = [];
  const error = pairAngleLimit(a.body, b.body) / 3600;
  const hasLuminary = [a.body, b.body].some(name => name === "Sun" || name === "Moon");
  const values = new Map<string, ExactSum>();
  for (const rule of policy.aspects) {
    if (rule.type !== actualType && rule.type !== expectedType) continue;
    const value = orb(a, b, rule.angle);
    values.set(rule.type, value);
    const motion = referenceMotion(a, b, rule.angle, policy.stationaryRelativeSpeed);
    const uncertainMotion = motionMargins(a, b, rule.angle, policy.stationaryRelativeSpeed);
    const limits = hasLuminary && rule.luminaryOrb ? rule.luminaryOrb : rule.orb;
    const maxima = (["applying", "separating", "stationary"] as const).map(mode =>
      Math.min(limits[mode], policy.bodyOrbs[a.body]?.[mode] ?? 180, policy.bodyOrbs[b.body]?.[mode] ?? 180));
    const maximum = Math.min(limits[motion], policy.bodyOrbs[a.body]?.[motion] ?? 180,
      policy.bodyOrbs[b.body]?.[motion] ?? 180);
    if (compareExact(absolute(exactSum(value, -maximum)), error) <= 0) reasons.push("orb-limit");
    // A motion change explains eligibility only if its effective limits can
    // straddle this orb; an exact angle deep inside a constant allowance cannot.
    if (uncertainMotion.length && Math.min(...maxima) !== Math.max(...maxima)
      && compareExact(exactSum(value, error), Math.min(...maxima)) >= 0
      && compareExact(exactSum(value, -error), Math.max(...maxima)) <= 0) {
      reasons.push(`motion-orb-limit:${uncertainMotion.join("+")}`);
    }
  }
  if (actualType !== undefined && expectedType !== undefined && actualType !== expectedType
    && compareExact(absolute(exactSum(values.get(actualType)!, ...values.get(expectedType)!.map(value => -value))),
      2 * error) <= 0) reasons.push("rule-tie");
  return [...new Set(reasons)];
}

const key = (row: Pick<PairAspect, "a" | "b">): string => `${row.a}\0${row.b}`;

function compareOrder(actual: readonly PairAspect[], expected: readonly PairAspect[], context: string): void {
  const indices = new Map(actual.map((row, index) => [key(row), { row, index }]));
  for (let i = 0; i < expected.length; i++) for (let j = i + 1; j < expected.length; j++) {
    const a = expected[i]!, b = expected[j]!;
    const aa = indices.get(key(a)), bb = indices.get(key(b));
    if (!aa || !bb || aa.row.type !== a.type || bb.row.type !== b.type || aa.index < bb.index) continue;
    // Two independently perturbed orbs can reverse only inside the sum of
    // their previously fixed angular allowances. Shared-input order is exact.
    const margin = Math.abs(a.orb - b.orb) * 3600;
    const allowance = pairAngleLimit(a.a, a.b) + pairAngleLimit(b.a, b.b);
    expect(margin, `${context}, result order ${key(a)}/${key(b)}`).toBeLessThanOrEqual(allowance);
    difference("orb-order", context, `${key(a)}/${key(b)}: margin ${margin} arcsec`);
  }
}

function compareConfigured(actualRows: readonly BodyPosition[], expectedRows: readonly BodyPosition[],
  policy: Policies, context: string): void {
  const label = `${context}, ${policy.label}`;
  const actual = rust.findConfiguredAspects(actualRows, policy.actual).aspects;
  const expected = configured.findConfiguredAspects(expectedRows, policy.expected).aspects;
  // Both cross-replays require bit equality: all differences in the independent
  // pipeline must originate before aspect matching, including stable sorting.
  sameData(actual, configured.findConfiguredAspects(actualRows, policy.expected).aspects, `${label}, Rust rows`);
  sameData(rust.findConfiguredAspects(expectedRows, policy.actual).aspects, expected, `${label}, TS rows`);
  report.exactReplays += 2;
  report.pipelines++;
  report.matchesByPolicy[policy.label] = (report.matchesByPolicy[policy.label] ?? 0) + expected.length;
  const actualMap = new Map(actual.map(row => [key(row), row]));
  const expectedMap = new Map(expected.map(row => [key(row), row]));
  const selected = expectedRows.filter(row => policy.expected.bodies.includes(row.body));
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
    const a = selected[i]!, b = selected[j]!;
    const pairKey = key({ a: a.body, b: b.body });
    const found = actualMap.get(pairKey), reference = expectedMap.get(pairKey);
    report.independentPairs++;
    if (found?.type !== reference?.type) {
      const marginReasons = selectionMargins(a, b, policy.expected, found?.type, reference?.type);
      expect(marginReasons.length, `${label}, unexplained selection ${pairKey}`).toBeGreaterThan(0);
      difference("selection", label, `${pairKey}: ${reference?.type ?? "absent"} -> ${found?.type ?? "absent"}; ${marginReasons.join(",")}`);
    }
    if (reference) report.matchesByType[reference.type] = (report.matchesByType[reference.type] ?? 0) + 1;
    if (!found) continue;
    const expectedOrb = roundedValue(orb(a, b, found.angle));
    const error = Math.abs(found.orb - expectedOrb) * 3600;
    expect(error, `${label}, ${pairKey} orb`).toBeLessThanOrEqual(pairAngleLimit(a.body, b.body));
    report.maximumOrbArcsec = Math.max(report.maximumOrbArcsec, error);
    if (!reference || reference.type !== found.type) continue;
    expectSameNumber(found.angle, reference.angle, `${label}, ${pairKey} angle`);
    if (found.motion !== reference.motion) {
      const reasons = motionMargins(a, b, found.angle, policy.expected.stationaryRelativeSpeed);
      expect(reasons.length, `${label}, unexplained motion ${pairKey}`).toBeGreaterThan(0);
      difference("motion", label, `${pairKey}: ${reference.motion} -> ${found.motion}; ${reasons.join(",")}`);
    } else expectSameNumber(found.maximumOrb, reference.maximumOrb, `${label}, ${pairKey} maximumOrb`);
    expect(found.applying, label).toBe(found.motion === "applying");
  }
  compareOrder(actual, expected, label);
}

function compareLegacy(actualRows: readonly BodyPosition[], expectedRows: readonly BodyPosition[],
  context: string, otherActual?: readonly BodyPosition[], otherExpected?: readonly BodyPosition[]): void {
  const actual: readonly (Aspect | InterAspect)[] = otherActual
    ? rust.findInterAspects(actualRows, otherActual) : rust.findAspects(actualRows);
  const expected: readonly (Aspect | InterAspect)[] = otherExpected
    ? findInterAspects(expectedRows, otherExpected) : legacy.findAspects(expectedRows);
  const replay = otherActual ? findInterAspects(actualRows, otherActual) : legacy.findAspects(actualRows);
  sameData(actual, replay, `${context}, legacy shared replay`);
  report.exactReplays++;
  const policy = configured.createAspectPolicy();
  const actualMap = new Map(actual.map(row => [key(row), row]));
  const expectedMap = new Map(expected.map(row => [key(row), row]));
  const selected = expectedRows.filter(row => legacy.ASPECT_BODIES.has(row.body));
  const other = otherExpected?.filter(row => legacy.ASPECT_BODIES.has(row.body)) ?? selected;
  for (let i = 0; i < selected.length; i++) for (let j = otherExpected ? 0 : i + 1; j < other.length; j++) {
    const a = selected[i]!, b = other[j]!;
    const pairKey = key({ a: a.body, b: b.body });
    const found = actualMap.get(pairKey), reference = expectedMap.get(pairKey);
    if (found?.type !== reference?.type) {
      const reasons = selectionMargins(a, b, policy, found?.type, reference?.type);
      expect(reasons.length, `${context}, unexplained legacy selection ${pairKey}`).toBeGreaterThan(0);
      difference("legacy-selection", context, `${pairKey}: ${reasons.join(",")}`);
    }
    if (!found || !reference || found.type !== reference.type) continue;
    const error = Math.abs(found.orb - reference.orb) * 3600;
    expect(error, `${context}, legacy ${pairKey} orb`).toBeLessThanOrEqual(pairAngleLimit(a.body, b.body));
    if ("applying" in found && "applying" in reference && found.applying !== reference.applying) {
      const angle = legacy.ASPECTS.find(rule => rule.type === found.type)!.angle;
      const reasons = motionMargins(a, b, angle, legacy.STATIONARY_RELATIVE_SPEED);
      expect(reasons.length, `${context}, unexplained legacy motion ${pairKey}`).toBeGreaterThan(0);
      difference("legacy-motion", context, `${pairKey}: ${reasons.join(",")}`);
    }
    if ("aLon" in found && "aLon" in reference) for (const field of ["aLon", "bLon"] as const)
      expect(Math.abs(circular(found[field], reference[field])) * 3600, `${context}, ${field}`)
        .toBeLessThanOrEqual(angleLimit(field === "aLon" ? found.a : found.b));
  }
  compareOrder(actual, expected, context);
}

function configurations(): Policies[] {
  const major = new Set<string>(legacy.ASPECT_TYPES);
  const all = Object.keys(configured.CONFIGURED_ASPECT_ANGLES);
  return [policies("default"), policies("major-motion", {
    bodies: names, aspects: legacy.ASPECTS.map(rule => ({ type: rule.type,
      orb: { applying: 3, separating: 2, stationary: 1 }, luminaryOrb: 4 })),
    bodyOrbs: { Sun: 2.5, Moon: 1.5 }, stationaryRelativeSpeed: 0.01
  }), policies("minor-only", { bodies: names,
    aspects: all.filter(type => !major.has(type)).map(type => ({ type, orb: 3 }))
  }), policies("all-named", { bodies: names, aspects: all.map(type => ({ type, orb: 2 })) }),
  policies("custom-capped", { bodies: names,
    aspects: [{ type: "seventh", angle: 360 / 7, orb: 4 }, { type: "decimal", angle: 179.9, orb: 3 },
      { type: "quintile", orb: { applying: 3, separating: 2, stationary: 1 } },
      { type: "quintile-alias", angle: 72, orb: 3 }],
    bodyOrbs: { Sun: 3, Moon: 2, "North Node": 1 }, stationaryRelativeSpeed: 0.25
  })];
}

afterAll(() => {
  if (process.env.RUSTCORE_PARITY_REPORT === "1") console.log(JSON.stringify({ aspectCorpusParity: report }));
});

describe("independent position-to-aspect parity from 1800 through 2200", () => {
  it("rejects missing interior matches, distant rule changes, motion flips and separated-orb reordering", () => {
    const a = { body: "Sun", lon: 0, speed: 1 }, b = { body: "Mars", lon: 2, speed: 0 };
    const policy = configured.createAspectPolicy({ aspects: [{ type: "conjunction", orb: 8 },
      { type: "sextile", orb: 8 }] });
    expect(selectionMargins(a, b, policy, undefined, "conjunction")).toEqual([]);
    expect(selectionMargins(a, b, policy, "sextile", "conjunction")).toEqual([]);
    expect(motionMargins(a, b, 0, policy.stationaryRelativeSpeed)).toEqual([]);
    const coincident = { ...b, lon: a.lon };
    expect(selectionMargins(a, coincident, policy, undefined, "conjunction")).toEqual([]);
    const rows: PairAspect[] = [{ a: "Sun", b: "Mars", type: "conjunction", orb: 1 },
      { a: "Sun", b: "Venus", type: "conjunction", orb: 2 }];
    expect(() => compareOrder(rows.slice().reverse(), rows, "deliberate distant inversion")).toThrow();

    // Positive controls ensure each permitted category has a deliberate probe.
    expect(selectionMargins(a, { ...b, lon: 8 }, policy, undefined, "conjunction")).toContain("orb-limit");
    const tied = configured.createAspectPolicy({ aspects: [{ type: "conjunction", orb: 40 },
      { type: "sextile", orb: 40 }] });
    expect(selectionMargins(a, { ...b, lon: 30 }, tied, "sextile", "conjunction")).toContain("rule-tie");
    expect(motionMargins(a, { ...b, speed: a.speed }, 0, 0)).toContain("relative-speed");
    expect(motionMargins(a, coincident, 0, 0)).toContain("circular-corner");
    expect(motionMargins(a, { ...b, lon: 60 }, 60, 0)).toContain("exact-angle");
    const motionPolicy = configured.createAspectPolicy({ stationaryRelativeSpeed: 1,
      aspects: [{ type: "conjunction", orb: { applying: 3, separating: 3, stationary: 1 } }] });
    expect(selectionMargins(a, b, motionPolicy, undefined, "conjunction"))
      .toContain("motion-orb-limit:relative-speed");
  });

  it("enforces upstream allowances, exact cross-replays and decision margins for every aspect set", () => {
    const dates = [Date.UTC(1800, 0, 1), Date.UTC(2200, 11, 31, 23, 59, 59, 999)];
    for (let year = 1800; year <= 2200; year++) dates.push(Date.UTC(year, year % 12, 13, 7, 19, 23, 137));
    const variants = configurations();
    let previousActual: BodyPosition[] | undefined, previousExpected: BodyPosition[] | undefined;
    for (const ms of dates) {
      const expected = positions(ms), actual = rust.positions(ms);
      const context = new Date(ms).toISOString();
      checkRows(actual, expected, context);
      // Reverse every other input to exercise pair order independently of the
      // factory's body selection order, identically in both implementations.
      if (report.dates % 2 === 0) { actual.reverse(); expected.reverse(); }
      for (const policy of variants) compareConfigured(actual, expected, policy, context);
      compareLegacy(actual, expected, context);
      if (previousActual && previousExpected)
        compareLegacy(actual, expected, `${context}, inter-date`, previousActual, previousExpected);
      previousActual = actual; previousExpected = expected;
      report.dates++;
    }
    expect(report.dates).toBe(403);
    for (const policy of variants) expect(report.matchesByPolicy[policy.label], policy.label).toBeGreaterThan(0);
    for (const type of [...Object.keys(configured.CONFIGURED_ASPECT_ANGLES), "seventh", "decimal", "quintile-alias"])
      expect(report.matchesByType[type], type).toBeGreaterThan(0);
  }, 60_000);

  it("keeps each named and custom zero-orb decision bit-exact on adjacent doubles from both ephemerides", () => {
    const definitions = [...Object.entries(configured.CONFIGURED_ASPECT_ANGLES),
      ["custom-seventh", 360 / 7], ["custom-decimal", 0.1]] as [string, number][];
    for (const year of [1800, 1900, 2000, 2100, 2200]) {
      const ms = Date.UTC(year, 3, 17, 9, 11, 13, 151);
      for (const rows of [positions(ms), rust.positions(ms)]) {
        for (const [type, angle] of definitions) {
          const policy = policies(`zero-${type}`, { bodies: ["Sun", "Mars"], aspects: [{ type, angle, orb: 0 }] });
          for (const longitude of neighbors(angle).filter(value => value >= 0 && value < 360)) {
            const probe = [{ ...rows[0]!, body: "Sun" as const, lon: 0 },
              { ...rows[4]!, body: "Mars" as const, lon: longitude }];
            for (const order of [probe, probe.slice().reverse()]) {
              const actual = rust.findConfiguredAspects(order, policy.actual).aspects;
              const expected = configured.findConfiguredAspects(order, policy.expected).aspects;
              sameData(actual, expected, `${year}, ${type}, ${longitude}`);
              expect(actual.length).toBe(longitude === angle ? 1 : 0);
              report.exactReplays++; report.boundaryProbes++;
            }
          }
        }
      }
    }
  });

  it("diagnoses independently computed longitude and speed branches at reference-selected boundaries", () => {
    for (const year of [1800, 1900, 2000, 2100, 2200]) {
      const ms = Date.UTC(year, 6, 19, 11, 13, 17, 191);
      const actual = rust.positions(ms), expected = positions(ms);
      checkRows(actual, expected, `boundary ${year}`);
      for (const indices of [[0, 4], [1, 10], [10, 11]] as const) {
        const a = expected[indices[0]]!, b = expected[indices[1]]!;
        const referenceDistance = roundedValue(distance(a.lon, b.lon));
        const relative = roundedValue(absolute(exactSum(a.speed, -b.speed)));
        for (const maximum of neighbors(referenceDistance).filter(value => value >= 0 && value <= 180)) {
          const policy = policies("boundary-eligibility", { bodies: [a.body, b.body],
            aspects: [{ type: "conjunction", orb: maximum }] });
          compareConfigured(actual, expected, policy, `eligibility ${year}, ${a.body}/${b.body}, ${maximum}`);
          report.boundaryProbes++;
        }
        for (const threshold of neighbors(relative).filter(value => value >= 0)) {
          const policy = policies("boundary-motion", { bodies: [a.body, b.body],
            aspects: [{ type: "conjunction", orb: 180 }], stationaryRelativeSpeed: threshold });
          compareConfigured(actual, expected, policy, `motion ${year}, ${a.body}/${b.body}, ${threshold}`);
          report.boundaryProbes++;
        }
        const policy = policies("boundary-rule-choice", { bodies: [a.body, b.body],
          aspects: [{ type: "conjunction", orb: 180 }, { type: "custom-opposite", angle: 2 * Math.min(referenceDistance, 90), orb: 180 }] });
        compareConfigured(actual, expected, policy, `rule ${year}, ${a.body}/${b.body}`);
        report.boundaryProbes++;
      }
    }
    // These are diagnostic category coverage checks, not requirements for a
    // particular cross-runtime discrepancy. A future runtime may erase one.
    expect(report.matchesByPolicy["boundary-motion"]).toBeGreaterThan(0);
    expect(report.matchesByPolicy["boundary-eligibility"]).toBeGreaterThan(0);
    expect(report.matchesByPolicy["boundary-rule-choice"]).toBeGreaterThan(0);
  });
});
