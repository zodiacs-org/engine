import { describe, expect, it } from "vitest";
import {
  ACCIDENTAL_SCORE_RULES, createAccidentalPolicy, DEFAULT_ACCIDENTAL_WEIGHTS, DEFAULT_MEAN_DAILY_MOTION,
  evaluateAccidentalCondition, normalizeHoraryInput
} from "../src/index.js";
import type { AccidentalPolicyInput, ClassicalPlanet, HoraryAccidentalPolicy, HoraryCast } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

// Invented geometry, not a sky at the question instant. See fixtures.md for
// each expected house, motion, sect and score, derived without engine output.
function fixture(): HoraryCast {
  const chart = schematicChart();
  return { schema: "horary.cast/v1", input: normalizeHoraryInput({ ...questionInput, houseSystem: "whole",
    question: { id: "accidental-schematic", quesitedHouse: 2,
      naturalSignificators: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] } }),
  chart: { ...chart, angles: chart.angles!, houses: chart.houses! } };
}
function body(result: HoraryCast, planet: ClassicalPlanet) {
  return result.chart.bodies.find(({ body }) => body === planet)!;
}
function condition(result: HoraryCast, planet: ClassicalPlanet, policy = createAccidentalPolicy()) {
  return evaluateAccidentalCondition(result, policy).conditions.find((row) => row.planet === planet)!;
}

describe("accidental scoring policy", () => {
  it("uses the independently transcribed weights and historical comparison rates", () => {
    expect(DEFAULT_ACCIDENTAL_WEIGHTS).toEqual({
      "house-1": 5, "house-2": 3, "house-3": 1, "house-4": 4, "house-5": 3, "house-6": -2,
      "house-7": 4, "house-8": -2, "house-9": 2, "house-10": 5, "house-11": 4, "house-12": -5,
      direct: 4, retrograde: -5, swift: 2, slow: -2, "in-sect": false, "out-of-sect": false
    });
    expect(DEFAULT_MEAN_DAILY_MOTION).toEqual({ Sun: 3548 / 3600, Moon: 47436 / 3600,
      Mercury: 3548 / 3600, Venus: 3548 / 3600, Mars: 1887 / 3600, Jupiter: 299 / 3600, Saturn: 121 / 3600 });
    expect(createAccidentalPolicy()).toEqual({ schema: "horary.accidental-policy/v1",
      weights: DEFAULT_ACCIDENTAL_WEIGHTS, meanDailyMotion: DEFAULT_MEAN_DAILY_MOTION, stationarySpeed: 0 });
  });

  it.each(ACCIDENTAL_SCORE_RULES)("disables %s without changing other weights or facts", (rule) => {
    const baseline = evaluateAccidentalCondition(fixture());
    const policy = createAccidentalPolicy({ weights: { [rule]: false } });
    const report = evaluateAccidentalCondition(fixture(), policy);
    for (const [index, row] of report.conditions.entries()) {
      expect(row.house).toBe(baseline.conditions[index]!.house);
      expect(row.motion).toBe(baseline.conditions[index]!.motion);
      expect(row.contributions.find((item) => item.rule === rule)).toMatchObject({ status: "disabled", points: 0 });
    }
    for (const other of ACCIDENTAL_SCORE_RULES.filter((id) => id !== rule)) {
      expect(policy.weights[other]).toBe(DEFAULT_ACCIDENTAL_WEIGHTS[other]);
    }
  });

  it("copies caller settings and accepts complete JSON policy snapshots", () => {
    const input = { weights: { direct: 2.5 }, meanDailyMotion: { Mars: 0.5 }, stationarySpeed: 0.01 };
    const policy = createAccidentalPolicy(input);
    input.weights.direct = 999;
    input.meanDailyMotion.Mars = 999;
    expect(policy.weights.direct).toBe(2.5);
    expect(policy.meanDailyMotion.Mars).toBe(0.5);
    expect(evaluateAccidentalCondition(fixture(), JSON.parse(JSON.stringify(policy))).policy).toEqual(policy);
  });

  it.each([null, [], true, { extra: 1 }, { weights: null }, { weights: [] },
    { weights: { direct: undefined } }, { weights: { direct: true } }, { weights: { direct: NaN } },
    { weights: { slow: Infinity } }, { weights: { angular: 5 } }, { weights: { [Symbol("x")]: 1 } },
    { meanDailyMotion: null }, { meanDailyMotion: [] }, { meanDailyMotion: { Pluto: 1 } },
    { meanDailyMotion: { Mars: 0 } }, { meanDailyMotion: { Mars: -1 } }, { meanDailyMotion: { Mars: false } },
    { meanDailyMotion: { Mars: undefined } }, { meanDailyMotion: { Mars: Infinity } },
    { stationarySpeed: null }, { stationarySpeed: -1 }, { stationarySpeed: NaN }, { stationarySpeed: Infinity }])(
    "rejects invalid policy %j", (input) => {
      expect(() => createAccidentalPolicy(input as AccidentalPolicyInput)).toThrow(RangeError);
    }
  );

  it("refuses unknown schemas, extra keys and incomplete policy snapshots", () => {
    const policy = createAccidentalPolicy();
    for (const malformed of [null, { ...policy, schema: "other" }, { ...policy, extra: 1 },
      { ...policy, weights: { direct: 4 } }, { ...policy, meanDailyMotion: { Mars: 1 } },
      { ...policy, stationarySpeed: undefined }]) {
      expect(() => evaluateAccidentalCondition(fixture(), malformed as HoraryAccidentalPolicy)).toThrow(RangeError);
    }
  });
});

describe("independently derived accidental conditions", () => {
  it.each([[1, 5], [2, 3], [3, 1], [4, 4], [5, 3], [6, -2],
    [7, 4], [8, -2], [9, 2], [10, 5], [11, 4], [12, -5]])(
    "applies only house %s weight %s at its cusp and interior", (house, points) => {
      for (const offset of [0, 15, 30 - 2 ** -40]) {
        const result = fixture();
        body(result, "Mars").lon = (house - 1) * 30 + offset;
        const row = condition(result, "Mars", createAccidentalPolicy({
          weights: { direct: false, retrograde: false, swift: false, slow: false }
        }));
        expect(row.house).toBe(house);
        expect(row.score).toBe(points);
        expect(row.contributions.filter(({ present, rule }) => present && rule.startsWith("house-")))
          .toEqual([expect.objectContaining({ rule: `house-${house}`, points })]);
      }
    }
  );

  it("honors unequal and wrapping cusp intervals without anticipation", () => {
    const result = fixture();
    result.chart.houses.cusps = [350, 20, 45, 80, 110, 140, 170, 200, 225, 260, 290, 320];
    for (const [lon, house] of [[0, 1], [20 - 2 ** -40, 1], [20, 2], [320, 12], [350 - 2 ** -40, 12], [350, 1]]) {
      body(result, "Mars").lon = lon!;
      expect(condition(result, "Mars").house).toBe(house);
    }
  });

  it.each([
    [0.75, "direct", "swift", 9], [0.25, "direct", "slow", 5],
    [-0.75, "retrograde", "swift", 0], [-0.25, "retrograde", "slow", -4],
    [0, "stationary", "stationary", 3], [-0, "stationary", "stationary", 3],
    [0.5, "direct", "mean", 7], [-0.5, "retrograde", "mean", -2]
  ])("derives Mars speed %s as %s/%s and score %s", (speed, motion, rate, score) => {
    const result = fixture();
    body(result, "Mars").speed = speed as number;
    // Mars at 130 belongs to house 5: +3. Mean comparison 0.5 is exact binary.
    expect(condition(result, "Mars", createAccidentalPolicy({ meanDailyMotion: { Mars: 0.5 } })))
      .toMatchObject({ motion, rate, score, rateOrigin: "caller-override" });
  });

  it.each([[0.125, "stationary"], [-0.125, "stationary"], [0.125 + 2 ** -40, "direct"],
    [-0.125 - 2 ** -40, "retrograde"]])("includes the configured stationary boundary at %s", (speed, motion) => {
    const result = fixture();
    body(result, "Mars").speed = speed as number;
    const row = condition(result, "Mars", createAccidentalPolicy({ stationarySpeed: 0.125 }));
    expect(row.motion).toBe(motion);
    if (motion === "stationary") {
      expect(row.rate).toBe("stationary");
      expect(row.contributions.filter(({ status }) => status === "applied")).toHaveLength(1);
    }
  });

  it("derives the full schematic totals without rewarding luminary direction", () => {
    const report = evaluateAccidentalCondition(fixture());
    expect(Object.fromEntries(report.conditions.map(({ planet, score }) => [planet, score])))
      .toEqual({ Sun: 7, Moon: 1, Mercury: 7, Venus: 10, Mars: 5, Jupiter: -5, Saturn: 10 });
    for (const planet of ["Sun", "Moon"] as const) {
      expect(condition(fixture(), planet).contributions.filter(({ rule }) => rule === "direct" || rule === "retrograde"))
        .toEqual([expect.objectContaining({ present: false, status: "not-applicable", points: 0 }),
          expect.objectContaining({ present: false, status: "not-applicable", points: 0 })]);
    }
  });

  it.each([[15, "night"], [195 - 2 ** -40, "night"], [195, "day"], [0, "day"]] as const)(
    "derives chart sect with Sun at %s", (sun, expectedSect) => {
      const result = fixture();
      body(result, "Sun").lon = sun;
      expect(evaluateAccidentalCondition(result).sect.value).toBe(expectedSect);
    }
  );

  it("makes sect points opt-in, with independently derived planetary membership", () => {
    const result = fixture();
    body(result, "Sun").lon = 200; // day chart with Ascendant 15
    const baseline = evaluateAccidentalCondition(result);
    const enabled = evaluateAccidentalCondition(result, createAccidentalPolicy({ weights: { "in-sect": 1, "out-of-sect": -1 } }));
    for (const row of enabled.conditions) {
      const diurnal = ["Sun", "Jupiter", "Saturn", "Mercury"].includes(row.planet);
      expect(row.planetarySect).toBe(diurnal ? "day" : "night");
      expect(row.sectMatch).toBe(diurnal);
      expect(row.score).toBe(baseline.conditions.find(({ planet }) => planet === row.planet)!.score + (diurnal ? 1 : -1));
      expect(row.contributions.find(({ present, rule }) => present && rule.endsWith("sect")))
        .toMatchObject({ source: { id: "ptolemy-planetary-sect" }, weightOrigin: "caller-override" });
    }
  });

  it.each([[350, 10, "day"], [10, 350, "night"], [10, 10, "indeterminate"],
    [190, 10, "indeterminate"], [10, 190, "indeterminate"]] as const)(
    "derives Mercury %s relative to Sun %s as %s", (mercury, sun, sect) => {
      const result = fixture();
      body(result, "Mercury").lon = mercury;
      body(result, "Sun").lon = sun;
      const row = condition(result, "Mercury", createAccidentalPolicy({ weights: { "in-sect": 1, "out-of-sect": -1 } }));
      expect(row.planetarySect).toBe(sect);
      if (sect === "indeterminate") {
        expect(row.sectMatch).toBeNull();
        expect(row.contributions.filter(({ rule }) => rule.endsWith("sect")))
          .toEqual([expect.objectContaining({ status: "not-applicable", points: 0 }),
            expect.objectContaining({ status: "not-applicable", points: 0 })]);
      }
    }
  );

  it("supports zero and signed custom weights, and rejects score overflow", () => {
    const policy = createAccidentalPolicy({ weights: { "house-5": -1.5, direct: 0, slow: false } });
    const row = condition(fixture(), "Mars", policy);
    expect(row.score).toBe(-1.5);
    expect(row.contributions.find(({ rule }) => rule === "direct")).toMatchObject({ status: "applied", points: 0 });
    expect(() => condition(fixture(), "Mars", createAccidentalPolicy({
      weights: { "house-5": Number.MAX_VALUE, direct: Number.MAX_VALUE }
    }))).toThrow(RangeError);
  });

  it.each([[Number.MIN_VALUE, 0, "night"], [0, Number.MIN_VALUE, "day"],
    [180, Number.MIN_VALUE, "night"], [Number.MIN_VALUE, 180, "day"]] as const)(
    "preserves nonzero Mercury separations for %s relative to %s", (mercury, sun, sect) => {
      const result = fixture();
      body(result, "Mercury").lon = mercury;
      body(result, "Sun").lon = sun;
      expect(condition(result, "Mercury").planetarySect).toBe(sect);
    }
  );

  it("disables every weight without discarding condition facts", () => {
    const policy = createAccidentalPolicy({ weights: Object.fromEntries(ACCIDENTAL_SCORE_RULES.map((rule) => [rule, false])) });
    const report = evaluateAccidentalCondition(fixture(), policy);
    for (const row of report.conditions) {
      expect(row.score).toBe(0);
      expect(row.contributions.every(({ status, points }) => status === "disabled" && points === 0)).toBe(true);
    }
    expect(report.conditions.find(({ planet }) => planet === "Mars")).toMatchObject({ house: 5, motion: "direct", rate: "slow" });
  });

  it.each([[0.5 - 2 ** -40, "slow"], [0.5 + 2 ** -40, "swift"],
    [-0.5 + 2 ** -40, "slow"], [-0.5 - 2 ** -40, "swift"]])(
    "compares speed magnitude strictly at the mean boundary %s", (speed, rate) => {
      const result = fixture();
      body(result, "Mars").speed = speed as number;
      expect(condition(result, "Mars", createAccidentalPolicy({ meanDailyMotion: { Mars: 0.5 } })).rate).toBe(rate);
    }
  );

  it("retains shared roles and scores the Moon once", () => {
    const result = { ...fixture(), input: normalizeHoraryInput({ ...questionInput,
      question: { id: "shared-moon", quesitedHouse: 1, naturalSignificators: ["Moon"] } }) };
    result.chart.houses.cusps = [90, 120, 150, 180, 210, 240, 270, 300, 330, 0, 30, 60];
    const report = evaluateAccidentalCondition(result);
    expect(report.conditions).toHaveLength(1);
    expect(report.conditions[0]).toMatchObject({ planet: "Moon", roles: ["querent", "quesited", "moon", "natural"], house: 11, score: 2 });
  });
});

describe("accidental validation and snapshot ownership", () => {
  it.each([NaN, Infinity, null, undefined, "1"])("rejects non-finite selected speed %s", (speed) => {
    const result = fixture();
    body(result, "Mars").speed = speed as number;
    expect(() => evaluateAccidentalCondition(result)).toThrow(RangeError);
  });

  it("rejects retrograde luminaries and ignores contradictory row annotations", () => {
    for (const planet of ["Sun", "Moon"] as const) {
      const result = fixture();
      body(result, planet).speed = -1;
      expect(() => evaluateAccidentalCondition(result)).toThrow(RangeError);
    }
    const result = fixture();
    body(result, "Mars").retrograde = true;
    body(result, "Mars").lat = NaN;
    body(result, "Mars").sign = "pisces";
    expect(condition(result, "Mars")).toMatchObject({ longitude: 130, motion: "direct", house: 5, score: 5 });
  });

  it("ignores unselected rows and the unselected Sun's speed", () => {
    const result = { ...fixture(), input: normalizeHoraryInput(questionInput) };
    body(result, "Mercury").speed = NaN;
    body(result, "Sun").speed = NaN;
    expect(() => evaluateAccidentalCondition(result)).not.toThrow();
  });

  it("rejects unavailable geometry, invalid longitudes and duplicate required rows", () => {
    expect(() => evaluateAccidentalCondition(null as unknown as HoraryCast)).toThrow(RangeError);
    for (const planet of ["Mars", "Moon", "Sun"] as const) {
      const missing = fixture();
      missing.chart.bodies = missing.chart.bodies.filter(({ body }) => body !== planet);
      expect(() => evaluateAccidentalCondition(missing)).toThrow(RangeError);
      const duplicate = fixture();
      duplicate.chart.bodies.push({ ...body(duplicate, planet) });
      expect(() => evaluateAccidentalCondition(duplicate)).toThrow(RangeError);
      for (const lon of [-1, 360, NaN, Infinity]) {
        const invalid = fixture();
        body(invalid, planet).lon = lon;
        expect(() => evaluateAccidentalCondition(invalid)).toThrow(RangeError);
      }
    }
    const angle = fixture();
    angle.chart.angles.asc = NaN;
    expect(() => evaluateAccidentalCondition(angle)).toThrow(RangeError);
    for (const cusps of [[0, 0, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
      [0, 60, 30, 90, 120, 150, 180, 210, 240, 270, 300, 330], Array(12), [0, 30]]) {
      const result = fixture();
      result.chart.houses.cusps = cusps;
      expect(() => evaluateAccidentalCondition(result)).toThrow(RangeError);
    }
  });

  it("returns frozen JSON-friendly snapshots without mutating or retaining chart arrays", () => {
    const result = fixture();
    const before = structuredClone(result);
    const report = evaluateAccidentalCondition(result);
    expect(result).toEqual(before);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    function frozen(value: unknown): void {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) frozen(child);
      }
    }
    frozen(report);
    result.chart.houses.cusps[0] = 10;
    body(result, "Mars").speed = -1;
    expect(report.cusps[0]).toBe(0);
    expect(report.conditions[0]!.speed).toBe(0.5);
    expect(Object.isFrozen(result.chart.bodies)).toBe(false);
  });
});
