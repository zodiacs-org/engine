import { describe, expect, it } from "vitest";
import { ASPECT_TYPES } from "../src/engine.js";
import { createAspectSearchPolicy, evaluateSignificatorAspectsWith, normalizeHoraryInput } from "../src/index.js";
import type { AspectLongitudeAt, HoraryAspectPolicy } from "../src/index.js";
import type { AspectType } from "../src/engine.js";
import { aspectFixture, questionInput } from "./fixtures.js";

const unused: AspectLongitudeAt = () => { throw new Error("Searching must be disabled."); };
const classify = (a: number, b: number, as = 1, bs = 0, type: AspectType = "conjunction", orb = 8) =>
  evaluateSignificatorAspectsWith(unused, aspectFixture(a, b, as, bs), createAspectSearchPolicy({
    search: false, aspects: [type], orbs: { [type]: orb }
  })).aspects[0]!;

describe("hand-derived instantaneous significator aspects", () => {
  it("uses exact angular and speed decisions, ignoring mutable chart aspect/retrograde/sign labels", () => {
    expect(classify(0, 6).current).toMatchObject({ motion: "applying", withinOrb: true, orb: 6, exact: false });
    expect(classify(6, 0).current.motion).toBe("separating");
    expect(classify(359, 1).current).toMatchObject({ motion: "applying", orb: 2 });
    expect(classify(1, 359).current).toMatchObject({ motion: "separating", orb: 2 });
    expect(classify(0, 6, 0, -1).current.motion).toBe("applying"); // Retrograde target approaches.
    expect(classify(6, 0, -2, -1).current.motion).toBe("applying"); // Both retrograde.
    const item = classify(188.86, 98.86, -1, 0, "square", 0);
    // Literal doubles differ by exactly 90 + 2^-46; naive circular wrapping loses the residue.
    expect(((188.86 - 98.86 + 360) % 360)).toBe(90);
    expect(item.current).toMatchObject({ orb: 2 ** -46, withinOrb: false, exact: false, motion: "applying" });
    // Exact orb is 8 + 2^-50, but the reported orb rounds to 8. Eligibility must remain false.
    expect(classify(7.6999999999999895, 359.7).current).toMatchObject({ orb: 8, withinOrb: false, exact: false });
  });

  it("includes orb boundaries without rounding into eligibility", () => {
    expect(classify(0, 8).current.withinOrb).toBe(true);
    expect(classify(0, 8.000000000000002).current.withinOrb).toBe(false);
    expect(classify(0, 0).current).toMatchObject({ exact: true, motion: "separating", orb: 0 });
    expect(classify(0, 0).timeToPerfection).toMatchObject({ kind: "exact-now", elapsedDays: 0 });
    expect(classify(0, 0, 1, 1).current.motion).toBe("stationary");
    expect(classify(0, 180, 1, 0, "opposition").current).toMatchObject({ motion: "separating", exact: true });
    expect(classify(0, 0, 1, 0, "sextile", 180).current.motion).toBe("applying");
    expect(classify(0, 180, 1, 0, "trine", 180).current.motion).toBe("applying");
  });

  it("uses an inclusive nonstationary threshold and treats exact equal speeds as stationary", () => {
    for (const [speed, motion] of [[0, "stationary"], [0.0625, "stationary"], [0.125, "applying"]] as const) {
      const report = evaluateSignificatorAspectsWith(unused, aspectFixture(0, 6, speed),
        createAspectSearchPolicy({ search: false, stationaryRelativeSpeed: 0.125 }));
      expect(report.aspects[0]!.current.motion).toBe(motion);
    }
    const equal = evaluateSignificatorAspectsWith(unused, aspectFixture(0, 6, 1, 1),
      createAspectSearchPolicy({ search: false, stationaryRelativeSpeed: 0 }));
    expect(equal.aspects[0]!.current.motion).toBe("stationary");
  });

  it("reports each physical pair once, retaining shared and natural roles without self-aspects", () => {
    const result = aspectFixture();
    const report = evaluateSignificatorAspectsWith(unused, { ...result, input: normalizeHoraryInput({ ...questionInput,
      question: { id: "shared", quesitedHouse: 1, naturalSignificators: ["Mars", "Venus"] }
    }) }, createAspectSearchPolicy({ search: false }));
    expect(report.aspects).toHaveLength(15); // Three unique planets, three pairs, five aspect rules.
    expect(report.aspects.some(row => row.a.planet === row.b.planet)).toBe(false);
    expect(report.aspects[0]!.a.roles).toEqual(["querent", "quesited", "natural"]);
    expect(report.aspects[0]!.b.roles).toEqual(["moon"]);
    expect(report.search.status).toBe("disabled");
  });

  it("uses the luminary allowance as a replacement and records outside-orb motion too", () => {
    const report = evaluateSignificatorAspectsWith(unused, aspectFixture(0, 6), createAspectSearchPolicy({ search: false,
      aspects: ["conjunction"], orbs: { conjunction: 8 }, luminaryOrbs: { conjunction: 1 } }));
    expect(report.aspects[0]!.current.maximumOrb).toBe(8);
    expect(report.aspects[1]!.current).toMatchObject({ maximumOrb: 1, withinOrb: false });
    expect(classify(0, 9).current).toMatchObject({ withinOrb: false, motion: "applying" });
  });

  it("owns frozen JSON-friendly snapshots and leaves supplied chart arrays mutable", () => {
    const result = aspectFixture();
    const before = structuredClone(result);
    const policy = createAspectSearchPolicy({ search: false });
    const report = evaluateSignificatorAspectsWith(unused, result, JSON.parse(JSON.stringify(policy)) as HoraryAspectPolicy);
    expect(report.policy).toEqual(policy);
    expect(result).toEqual(before);
    const check = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(check);
      }
    };
    check(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    result.chart.bodies.find(row => row.body === "Mars")!.lon = 90;
    expect(report.aspects[0]!.current.aLongitude).toBe(0);
  });

  it("rejects missing, duplicate and invalid selected positions but ignores unused rows", () => {
    for (const change of ["missing", "duplicate", "longitude", "speed"] as const) {
      const result = aspectFixture();
      const mars = result.chart.bodies.find(row => row.body === "Mars")!;
      if (change === "missing") result.chart.bodies = result.chart.bodies.filter(row => row !== mars);
      if (change === "duplicate") result.chart.bodies.push({ ...mars });
      if (change === "longitude") mars.lon = 360;
      if (change === "speed") mars.speed = NaN;
      expect(() => evaluateSignificatorAspectsWith(unused, result, createAspectSearchPolicy({ search: false }))).toThrow(RangeError);
    }
    const result = aspectFixture();
    result.chart.bodies.find(row => row.body === "Sun")!.speed = NaN;
    expect(() => evaluateSignificatorAspectsWith(unused, result, createAspectSearchPolicy({ search: false }))).not.toThrow();
  });
});

describe("bounded aspect policy", () => {
  it("enforces engine orb defaults and project search defaults", () => {
    expect(createAspectSearchPolicy()).toEqual({ schema: "horary.aspect-policy/v1", aspects: ASPECT_TYPES,
      orbs: { conjunction: 8, sextile: 4, square: 7, trine: 7, opposition: 8 },
      luminaryOrbs: { conjunction: 10, sextile: 5, square: 8, trine: 8, opposition: 10 },
      stationaryRelativeSpeed: 1e-9, search: true, horizonDays: 30, stepDays: 0.25, maxSamples: 20_000 });
    const types: AspectType[] = ["square", "square", "conjunction"];
    const orbs = { square: 2 };
    const policy = createAspectSearchPolicy({ aspects: types, orbs });
    types.length = 0; orbs.square = 5;
    expect(policy.aspects).toEqual(["conjunction", "square"]);
    expect(policy.orbs.square).toBe(2);
    const report = evaluateSignificatorAspectsWith(unused, aspectFixture(), createAspectSearchPolicy({ aspects: [] }));
    expect(report.aspects).toEqual([]); expect(report.search.status).toBe("disabled");
  });

  it.each([null, { aspects: ["quincunx"] }, { aspects: [undefined] }, { aspects: new Array(1) },
    { orbs: { square: -1 } }, { luminaryOrbs: { trine: 181 } }, { orbs: { square: null } },
    { horizonDays: 0 }, { horizonDays: 367 }, { stepDays: 0 }, { stepDays: 2 },
    { maxSamples: 0 }, { maxSamples: 1.5 }, { maxSamples: Infinity }, { maxSamples: 1_000_001 },
    { search: null }, { stationaryRelativeSpeed: -1 }, { future: true }])("rejects malformed policy %j", (value) => {
    expect(() => createAspectSearchPolicy(value as never)).toThrow(RangeError);
  });

  it("rejects accessors without evaluating them and rejects incomplete restored policies", () => {
    let read = false;
    const getter = { get horizonDays() { read = true; return 1; } };
    expect(() => createAspectSearchPolicy(getter)).toThrow(RangeError); expect(read).toBe(false);
    const policy = { ...createAspectSearchPolicy({ search: false }), orbs: { conjunction: 8 } };
    expect(() => evaluateSignificatorAspectsWith(unused, aspectFixture(), policy as HoraryAspectPolicy)).toThrow(RangeError);
  });

  it("accepts the documented operational endpoints and refuses an unrepresentable horizon", () => {
    const limits = createAspectSearchPolicy({ horizonDays: 366, stepDays: 1 / 86_400_000, maxSamples: 1_000_000, search: false });
    expect(limits).toMatchObject({ horizonDays: 366, stepDays: 1 / 86_400_000, maxSamples: 1_000_000 });
    expect(createAspectSearchPolicy({ horizonDays: 1 / 86_400_000, stepDays: 1, maxSamples: 1 })).toMatchObject({
      horizonDays: 1 / 86_400_000, stepDays: 1, maxSamples: 1
    });
    const result = aspectFixture();
    const far = { ...result, input: normalizeHoraryInput({ ...questionInput, instant: 8_640_000_000_000_000 }) };
    expect(() => evaluateSignificatorAspectsWith(unused, far, createAspectSearchPolicy())).toThrow("representable later instant");
  });
});
