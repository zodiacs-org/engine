import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { CONSIDERATION_RULE_IDS, createRulePolicy as createFullPolicy,
  evaluateConsiderations as evaluateAll, normalizeHoraryInput } from "../src/index.js";
import type { ConsiderationRuleId, HoraryCast, HoraryRulePolicy, RulePolicyInput } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

// These static geometry sketches have no time-dependent lunar trajectory.
// Void-of-course motion and delegation are covered in their dedicated tests.
function createRulePolicy(input: RulePolicyInput = {}): HoraryRulePolicy {
  return createFullPolicy({ rules: { "moon-void-of-course": false, ...input.rules } });
}
function evaluateConsiderations(result: HoraryCast, policy = createRulePolicy()) {
  return evaluateAll(result, policy);
}

function fixture(): HoraryCast {
  const chart = schematicChart();
  if (!chart.angles || !chart.houses) throw new Error("Missing schematic angles/houses.");
  return { schema: "horary.cast/v1",
    input: normalizeHoraryInput({ ...questionInput, houseSystem: "whole" }),
    chart: { ...chart, angles: chart.angles, houses: chart.houses } };
}

function row(cast: HoraryCast, planet: "Saturn" | "Moon") {
  return cast.chart.bodies.find(({ body }) => body === planet)!;
}

function observation(cast: HoraryCast, rule: ConsiderationRuleId, policy?: HoraryRulePolicy) {
  return evaluateConsiderations(cast, policy).observations.find((item) => item.rule === rule)!;
}

// Literal intervals and circular cusp arithmetic are derived in fixtures.md.
// The sketch is deliberately independent of the engine's ephemeris output.
describe("geometric considerations before judgement", () => {
  it("returns ordered sourced records and measured evidence without changing the chart", () => {
    const result = fixture();
    const before = structuredClone(result);
    const evaluated = evaluateConsiderations(result);
    expect(evaluated.schema).toBe("horary.considerations/v1");
    expect(evaluated.questionId).toBe("lost-object");
    expect(evaluated.observations.map(({ rule, status }) => [rule, status])).toEqual([
      ["early-ascendant", "not-triggered"], ["late-ascendant", "not-triggered"],
      ["saturn-first", "not-triggered"], ["saturn-seventh", "triggered"],
      ["moon-via-combusta", "not-triggered"], ["moon-void-of-course", "disabled"]
    ]);
    expect(evaluated.observations[3]!.evidence).toEqual([
      { fact: "planet", value: "Saturn" }, { fact: "longitude", value: 190, unit: "degrees" },
      { fact: "actual-house-system", value: "whole" }, { fact: "house", value: 7, unit: "house" },
      { fact: "target-house", value: 7, unit: "house" }, { fact: "retrograde", value: false }
    ]);
    for (const item of evaluated.observations) {
      expect(item.source.tradition).toBeTruthy();
      expect(item.explanation).toBeTruthy();
      expect(item).not.toHaveProperty("verdict");
    }
    expect(result).toEqual(before);
  });

  it.each(Array.from({ length: 12 }, (_, i) => i * 30))("checks exact early and late boundaries in sign starting at %s", (start) => {
    // 2^-40 is exactly representable and remains visible at every tested longitude.
    const delta = 2 ** -40;
    const cases = [
      [0, true, false], [3 - delta, true, false], [3, false, false],
      [3 + delta, false, false], [27 - delta, false, false], [27, false, true],
      [27 + delta, false, true], [30 - delta, false, true]
    ] as const;
    for (const [degree, early, late] of cases) {
      const result = fixture();
      result.chart.angles.asc = start + degree;
      expect(observation(result, "early-ascendant").status).toBe(early ? "triggered" : "not-triggered");
      expect(observation(result, "late-ascendant").status).toBe(late ? "triggered" : "not-triggered");
    }
  });

  it("uses the Ascendant angle even when the first cusp is different", () => {
    const result = fixture();
    result.chart.angles.asc = 62;
    result.chart.houses.cusps[0] = 0;
    expect(observation(result, "early-ascendant")).toMatchObject({ status: "triggered", evidence: [
      { fact: "ascendant-longitude", value: 62, unit: "degrees" },
      { fact: "degree-in-sign", value: 2, unit: "degrees" },
      { fact: "exclusive-upper-bound", value: 3, unit: "degrees" }
    ] });
    result.chart.angles.asc = 15;
    expect(observation(result, "early-ascendant").status).toBe("not-triggered");
  });

  it.each([
    [195 - 2 ** -40, false], [195, true], [195 + 2 ** -40, true],
    [210, true], [225 - 2 ** -40, true], [225, false], [225 + 2 ** -40, false],
    [0, false], [359, false]
  ] as const)("checks Moon Via Combusta at %s degrees", (lon, triggered) => {
    const result = fixture();
    row(result, "Moon").lon = lon;
    // Deliberately stale sign/degree annotations must not drive the rule.
    expect(row(result, "Moon").sign).toBe("taurus");
    expect(observation(result, "moon-via-combusta").status).toBe(triggered ? "triggered" : "not-triggered");
  });

  it.each([
    [359, false, false], [0, true, false], [30 - 2 ** -40, true, false], [30, false, false],
    [180 - 2 ** -40, false, false], [180, false, true], [210 - 2 ** -40, false, true], [210, false, false]
  ] as const)("assigns Saturn on half-open cusp boundaries at %s", (lon, first, seventh) => {
    const result = fixture();
    row(result, "Saturn").lon = lon;
    expect(observation(result, "saturn-first").status).toBe(first ? "triggered" : "not-triggered");
    expect(observation(result, "saturn-seventh").status).toBe(seventh ? "triggered" : "not-triggered");
  });

  it("uses actual unequal cusps across Aries rather than signs or requested houses", () => {
    const result = fixture();
    result.chart.houses.system = "regiomontanus";
    result.chart.houses.cusps = [350, 15, 45, 80, 120, 150, 170, 195, 225, 260, 300, 330];
    result.chart.angles.asc = 15;
    row(result, "Saturn").lon = 0;
    expect(observation(result, "saturn-first").status).toBe("triggered");
    row(result, "Saturn").lon = 15;
    expect(observation(result, "saturn-first").status).toBe("not-triggered");
    row(result, "Saturn").lon = 170;
    expect(observation(result, "saturn-seventh").status).toBe("triggered");
    row(result, "Saturn").lon = 195;
    expect(observation(result, "saturn-seventh").status).toBe("not-triggered");
  });

  it.each([false, true])("records Saturn retrograde=%s without making direction an eligibility test", (retrograde) => {
    const result = fixture();
    Object.assign(row(result, "Saturn"), { lon: 10, retrograde });
    const item = observation(result, "saturn-first");
    expect(item.status).toBe("triggered");
    expect(item.evidence).toContainEqual({ fact: "retrograde", value: retrograde });
    expect(item.explanation).toContain("either direction");
  });

  it("leaves the Saturn seventh placement rule toggleable for seventh-house questions", () => {
    const result = fixture();
    Object.assign(result, { input: normalizeHoraryInput({ ...questionInput, question: { id: "relationship", quesitedHouse: 7 } }) });
    expect(observation(result, "saturn-seventh").status).toBe("triggered");
    const policy = createRulePolicy({ rules: { "saturn-seventh": false } });
    expect(observation(result, "saturn-seventh", policy).status).toBe("disabled");
  });

  it.each(CONSIDERATION_RULE_IDS)("reports %s as disabled, independently of other rules", (rule) => {
    const result = fixture();
    result.chart.angles.asc = 2;
    row(result, "Moon").lon = 200;
    const before = evaluateConsiderations(result);
    const policy = createRulePolicy({ rules: { [rule]: false } });
    const after = evaluateConsiderations(result, policy);
    expect(after.observations.find((item) => item.rule === rule)).toMatchObject({ status: "disabled", evidence: [] });
    expect(after.observations.filter((item) => item.rule !== rule)).toEqual(before.observations.filter((item) => item.rule !== rule));
  });

  it("skips unavailable geometric data when its dependent rules are disabled", () => {
    const result = fixture();
    result.chart.angles.asc = NaN;
    result.chart.houses.cusps = [];
    result.chart.bodies = [];
    const policy = createRulePolicy({ rules: Object.fromEntries(CONSIDERATION_RULE_IDS.map((id) => [id, false])) });
    expect(evaluateConsiderations(result, policy).observations.every((item) => item.status === "disabled")).toBe(true);
    const moonOnly = createRulePolicy({ rules: { ...policy.rules, "moon-via-combusta": true } });
    result.chart.bodies = [schematicChart().bodies[1]!];
    expect(observation(result, "moon-via-combusta", moonOnly).status).toBe("not-triggered");
  });

  it("returns a deeply frozen, JSON-safe snapshot that does not retain chart data", () => {
    const result = fixture();
    const evaluated = evaluateConsiderations(result);
    expect(JSON.parse(JSON.stringify(evaluated))).toEqual(evaluated);
    expect(evaluateConsiderations(result, JSON.parse(JSON.stringify(evaluated.policy)))).toEqual(evaluated);
    for (const value of [evaluated, evaluated.policy, evaluated.policy.rules, evaluated.observations,
      ...evaluated.observations.flatMap((item) => [item, item.source, item.evidence, ...item.evidence])]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    row(result, "Saturn").lon = 10;
    expect(observation(result, "saturn-seventh").status).toBe("not-triggered");
    expect(evaluated.observations[3]!.status).toBe("triggered");
  });

  it("delegates Saturn house membership to the engine without recasting", () => {
    const houseSpy = vi.spyOn(engine, "houseOf");
    const castSpy = vi.spyOn(engine, "natalChart");
    try {
      evaluateConsiderations(fixture());
      expect(houseSpy.mock.calls).toEqual([
        [190, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]],
        [190, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]]
      ]);
      expect(castSpy).not.toHaveBeenCalled();
    } finally { houseSpy.mockRestore(); castSpy.mockRestore(); }
  });

  it.each([NaN, Infinity, -1, 360, "2", undefined])("refuses invalid required longitudes %s", (value) => {
    for (const target of ["asc", "Moon", "Saturn", "cusp"] as const) {
      const result = fixture();
      if (target === "asc") Object.assign(result.chart.angles, { asc: value });
      else if (target === "cusp") result.chart.houses.cusps[5] = value as number;
      else Object.assign(row(result, target), { lon: value });
      expect(() => evaluateConsiderations(result)).toThrow(RangeError);
    }
  });

  it("refuses missing, repeated, sparse or unordered required data", () => {
    const mutations = [
      (r: HoraryCast) => { r.chart.bodies = r.chart.bodies.filter(({ body }) => body !== "Moon"); },
      (r: HoraryCast) => { r.chart.bodies.push({ ...row(r, "Saturn") }); },
      (r: HoraryCast) => { delete r.chart.houses.cusps[5]; },
      (r: HoraryCast) => { r.chart.houses.cusps[1] = 0; },
      (r: HoraryCast) => { r.chart.houses.cusps[1] = 100; },
      (r: HoraryCast) => { r.chart.houses.cusps.pop(); },
      (r: HoraryCast) => { Object.assign(r.chart.houses, { system: "unknown" }); },
      (r: HoraryCast) => { Object.assign(row(r, "Saturn"), { retrograde: undefined }); },
      (r: HoraryCast) => { Object.assign(r, { input: { ...r.input, question: { ...r.input.question, quesitedHouse: 0 } } }); }
    ];
    for (const mutate of mutations) {
      const result = fixture(); mutate(result);
      expect(() => evaluateConsiderations(result)).toThrow(RangeError);
    }
    expect(() => evaluateConsiderations(null as unknown as HoraryCast)).toThrow(RangeError);
    expect(() => evaluateConsiderations({ ...fixture(), schema: "other" } as unknown as HoraryCast)).toThrow(RangeError);
  });

  it.each([null, {}, { schema: "other", rules: {} }, { schema: "horary.rule-policy/v1", rules: {} },
    { ...createRulePolicy(), extra: false },
    { ...createRulePolicy(), rules: { ...createRulePolicy().rules, "saturn-first": null } }
  ])("revalidates policy snapshots %j", (policy) => {
    expect(() => evaluateConsiderations(fixture(), policy as HoraryRulePolicy)).toThrow(RangeError);
  });
});
