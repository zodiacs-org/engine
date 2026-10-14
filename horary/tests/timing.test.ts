import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createTimingPolicy, evaluateTimingHintsWith, normalizeHoraryInput,
  TIMING_CONVENTIONS, TIMING_SOURCE } from "../src/index.js";
import type { AspectLongitudeAt, HoraryTimingPolicy, TimingPolicyInput } from "../src/index.js";
import type { AspectType, Modality } from "../src/engine.js";
import type { TimingHouseKind, TimingUnit } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
const instant = (days: number) => new Date(epoch + days * DAY).toISOString();
const wrap = (value: number) => ((value % 360) + 360) % 360;
const search = (horizonDays = 8, maxSamples = 2000) => createAspectSearchPolicy({ aspects: ["conjunction"],
  horizonDays, stepDays: 0.25, maxSamples });
const units = { cardinal: { angular: { unit: "weeks", unitsPerDegree: 1 } },
  fixed: { succedent: { unit: "years", unitsPerDegree: 0.5 } },
  mutable: { cadent: { unit: "months", unitsPerDegree: 2 } } } as const;
const enabled = (input: TimingPolicyInput = {}) => createTimingPolicy({ enabled: true, units, ...input });
const unused: AspectLongitudeAt = () => { throw new Error("No provider calls expected."); };
function linear(a = 10, b = 16, as = 2, bs = 1): AspectLongitudeAt {
  return (body, at) => {
    const t = (at.getTime() - epoch) / DAY;
    return body === "Mars" ? wrap(a + as * t) : body === "Venus" ? wrap(b + bs * t) : 180;
  };
}
const run = (policy = enabled()) => evaluateTimingHintsWith(linear(), aspectFixture(10, 16, 2, 1), search(), policy);
const first = (policy = enabled()) => run(policy).assessments[0]!;

describe("explicit symbolic timing policies", () => {
  it("defaults timing and every matrix cell off, with no universal table attributed to the source", () => {
    expect(createTimingPolicy()).toEqual({ schema: "horary.timing-policy/v1", enabled: false, basis: "both", units: {
      cardinal: { angular: false, succedent: false, cadent: false },
      fixed: { angular: false, succedent: false, cadent: false },
      mutable: { angular: false, succedent: false, cadent: false }
    } });
    expect(TIMING_SOURCE.tradition).toContain("Lilly");
    expect(TIMING_CONVENTIONS.units).toContain("caller-table");
    expect(first(createTimingPolicy({ enabled: true })).status).toBe("unit-disabled");
  });

  it.each([null, [], { enabled: null }, { enabled: 1 }, { basis: "fastest" }, { basis: null }, { extra: true },
    { units: null }, { units: { common: {} } }, { units: { cardinal: undefined } },
    { units: { fixed: { angle: false } } }, { units: { fixed: { angular: undefined } } },
    { units: { fixed: { angular: true } } }, { units: { fixed: { angular: { unit: "seconds", unitsPerDegree: 1 } } } },
    ...[0, -1, NaN, Infinity, 1_000_001, "1", null, undefined].map(unitsPerDegree =>
      ({ units: { cardinal: { angular: { unit: "days", unitsPerDegree } } } })),
    { units: { cardinal: { angular: { unit: "days" } } } },
    { units: { cardinal: { angular: { unit: "days", unitsPerDegree: 1, custom: true } } } }
  ])("rejects malformed options %j", input => {
    expect(() => createTimingPolicy(input as never)).toThrow(RangeError);
  });

  it("rejects non-data slots at each nesting level without invoking accessors", () => {
    let calls = 0;
    for (const input of [
      { get enabled() { calls++; return true; } },
      { units: { get cardinal() { calls++; return {}; } } },
      { units: { cardinal: { get angular() { calls++; return false; } } } },
      { units: { cardinal: { angular: { unit: "weeks", get unitsPerDegree() { calls++; return 1; } } } } },
      { [Symbol("unknown")]: true }, Object.create({ enabled: true })
    ]) expect(() => createTimingPolicy(input as never)).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it("accepts bounded scales, rejects incomplete restored snapshots, and copies nested configuration", () => {
    const table = { cardinal: { angular: { unit: "hours" as const, unitsPerDegree: 1_000_000 } } };
    const policy = enabled({ units: table });
    table.cardinal.angular.unitsPerDegree = 2;
    expect(first(policy).hints[0]!.symbolic).toEqual({ unit: "hours", unitsPerDegree: 1_000_000,
      quantity: 6_000_000, origin: "caller-mapping" });
    expect(first(enabled({ units: { cardinal: { angular: { unit: "days", unitsPerDegree: Number.MIN_VALUE } } } }))
      .hints[0]!.symbolic!.quantity).toBe(6 * Number.MIN_VALUE);
    expect(run(JSON.parse(JSON.stringify(policy))).policy).toEqual(policy);
    for (const bad of [{ ...policy, schema: "other" }, { ...policy, enabled: undefined }, { schema: policy.schema },
      { ...policy, units: { cardinal: policy.units.cardinal } },
      { ...policy, units: { ...policy.units, fixed: { angular: false } } }]) {
      expect(() => run(bad as HoraryTimingPolicy)).toThrow(RangeError);
    }
  });
});

describe("hand-derived degree-based timing hints", () => {
  it("keeps the angular gap distinct from travelled arcs and sampled elapsed time", () => {
    const report = run(), item = report.assessments[0]!;
    // Mars=10+2t, Venus=16+t. Contact t=6 at 22: Mars travels 12, Venus 6, current gap 6.
    expect(item).toMatchObject({ status: "hint", degreesToPerfection: 6,
      contact: { kind: "candidate", at: instant(6), elapsedDays: 6 } });
    expect(item.hints.map(hint => hint.symbolic)).toEqual([
      { unit: "weeks", unitsPerDegree: 1, quantity: 6, origin: "caller-mapping" },
      { unit: "weeks", unitsPerDegree: 1, quantity: 6, origin: "caller-mapping" }
    ]);
    expect(item.hints[0]).toMatchObject({ planet: { planet: "Mars", roles: ["querent"] }, longitude: 10,
      sign: "aries", modality: "cardinal", house: 1, houseKind: "angular" });
    expect(item.explanation).toContain("elapsed UTC days");
    expect(item.hints[0]!.explanation).toContain("not elapsed UTC time");
    expect(report.aspects.search.clock).toBe("caller-longitude-provider");
    // Change relative speed, retain gap: contact t=3, symbolic duration stays six weeks.
    const faster = evaluateTimingHintsWith(linear(10, 16, 3, 1), aspectFixture(10, 16, 3, 1), search(), enabled());
    expect(faster.assessments[0]!.contact!.elapsedDays).toBe(3);
    expect(faster.assessments[0]!.hints[0]!.symbolic!.quantity).toBe(6);
  });

  it("retains competing sign/house bases and half-degree gaps without rounding into whole units", () => {
    // Mars 29 Aries (angular), Venus 30.5 Taurus (succedent). Relative rate 1 => t=1.5.
    const item = evaluateTimingHintsWith(linear(29, 30.5), aspectFixture(29, 30.5, 2, 1), search(), enabled()).assessments[0]!;
    expect(item.degreesToPerfection).toBe(1.5);
    expect(item.hints.map(hint => [hint.sign, hint.houseKind, hint.symbolic?.quantity, hint.symbolic?.unit])).toEqual([
      ["aries", "angular", 1.5, "weeks"], ["taurus", "succedent", 0.75, "years"]
    ]);
    expect(item.hints.every(hint => hint.explanation.includes("caller"))).toBe(true);
    // A future sign exit does not change the question-time basis or assert perfection.
    expect(item.hints[0]!.longitude).toBe(29);
    expect(item.explanation).toContain("can interrupt");
  });

  it("selects roles explicitly, keeps shared roles, and substitutes no unrelated basis", () => {
    for (const [basis, planet] of [["querent", "Mars"], ["quesited", "Venus"]] as const) {
      const item = first(enabled({ basis }));
      expect(item.hints.map(hint => hint.planet.planet)).toEqual([planet]);
    }
    expect(first(enabled({ basis: "moon" }))).toMatchObject({ status: "no-selected-basis", hints: [] });
    const fixture = aspectFixture(10, 16, 2, 1);
    const shared = { ...fixture, input: normalizeHoraryInput({ ...questionInput,
      question: { id: "shared-timing", quesitedHouse: 1, naturalSignificators: ["Venus", "Mars"] } }) };
    const report = evaluateTimingHintsWith(linear(), shared, search(), enabled({ basis: "quesited" }));
    const item = report.assessments.find(row => row.a.planet === "Mars" && row.b.planet === "Venus")!;
    expect(item.hints).toHaveLength(1);
    expect(item.hints[0]!.planet.roles).toEqual(["querent", "quesited", "natural"]);
    expect(report.assessments.some(row => row.a.planet === row.b.planet)).toBe(false);
  });

  it("uses canonical longitude and actual cusp placement, ignoring stale sign/degree/house labels", () => {
    // Conjunction distance 6 within each sign; both question-time positions remain in that sign.
    const expectedSigns = ["aries", "taurus", "gemini", "cancer", "leo", "virgo",
      "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
    const modalities = ["cardinal", "fixed", "mutable"];
    const kinds = ["angular", "succedent", "cadent"];
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 10, b = a + 6;
      const item = evaluateTimingHintsWith(linear(a, b), aspectFixture(a, b, 2, 1), search(), enabled()).assessments[0]!;
      expect(item.hints[0]).toMatchObject({ sign: expectedSigns[i], modality: modalities[i % 3],
        house: i + 1, houseKind: kinds[i % 3] });
    }
    // Unequal rotated cusp circuit: house 1 starts at 20, house 12 wraps from 355 to 20.
    const fixture = aspectFixture(10, 16, 2, 1);
    fixture.chart.houses.cusps = [20, 50, 85, 115, 145, 175, 205, 235, 265, 295, 325, 355];
    const item = evaluateTimingHintsWith(linear(), fixture, search(), enabled({ units: {
      cardinal: { cadent: { unit: "days", unitsPerDegree: 2 } }
    } })).assessments[0]!;
    expect(item.hints[0]).toMatchObject({ house: 12, houseKind: "cadent", symbolic: { quantity: 12, unit: "days" } });
    expect(item.a.planet).toBe("Mars");
  });

  it("addresses every sign-modality/house-kind cell independently on rotated cusp circuits", () => {
    const modalities: Modality[] = ["cardinal", "fixed", "mutable"];
    const kinds: TimingHouseKind[] = ["angular", "succedent", "cadent"];
    const table = Object.fromEntries(modalities.map((modality, m) => [modality,
      Object.fromEntries(kinds.map((kind, h) => [kind, { unit: "days" as TimingUnit, unitsPerDegree: 1 + m * 3 + h }]))])) as
      NonNullable<TimingPolicyInput["units"]>;
    for (let m = 0; m < 3; m++) for (let h = 0; h < 3; h++) {
      const a = m * 30 + 10, b = a + 6;
      const fixture = aspectFixture(a, b, 2, 1);
      fixture.chart.houses.cusps = Array.from({ length: 12 }, (_, i) => wrap((m - h + i) * 30));
      const result = { ...fixture, input: normalizeHoraryInput({ ...questionInput,
        question: { id: "cell-timing", quesitedHouse: 2, naturalSignificators: ["Mars", "Venus"] } }) };
      const report = evaluateTimingHintsWith(linear(a, b), result, search(), enabled({ units: table }));
      const item = report.assessments.find(row => [row.a.planet, row.b.planet].includes("Mars") &&
        [row.a.planet, row.b.planet].includes("Venus"))!;
      const hint = item.hints.find(row => row.planet.planet === "Mars")!;
      expect(hint).toMatchObject({ modality: modalities[m], house: h + 1, houseKind: kinds[h],
        symbolic: { quantity: 6 * (1 + m * 3 + h), unit: "days" } });
    }
  });

  it("retains circle-wrap, retrograde and nonconjunction branch evidence with the same gap arithmetic", () => {
    for (const [a, b, as, bs] of [[358, 4, 2, 1], [2, 356, -2, -1]] as const) {
      const item = evaluateTimingHintsWith(linear(a, b, as, bs), aspectFixture(a, b, as, bs), search(), enabled()).assessments[0]!;
      expect(item).toMatchObject({ status: "hint", degreesToPerfection: 6, contact: { elapsedDays: 6 } });
      expect(item.hints.find(hint => hint.sign === "pisces")!.symbolic).toMatchObject({ quantity: 12, unit: "months" });
      expect(item.hints.find(hint => hint.sign === "aries")!.symbolic).toMatchObject({ quantity: 6, unit: "weeks" });
    }
    for (const [type, angle] of [["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]] as const) {
      const a = 10, b = a + angle + 6;
      const item = evaluateTimingHintsWith(linear(a, b), aspectFixture(a, b, 2, 1), createAspectSearchPolicy({
        aspects: [type as AspectType], orbs: { [type]: 8 }, horizonDays: 8, maxSamples: 2000
      }), enabled({ basis: "querent" })).assessments[0]!;
      expect(item).toMatchObject({ type, status: "hint", degreesToPerfection: 6, contact: { elapsedDays: 6,
        directedLongitude: type === "opposition" ? 180 : 360 - angle } });
      expect(item.hints[0]!.symbolic).toMatchObject({ quantity: 6, unit: "weeks" });
    }
  });

  it("distinguishes exact geometry, stationary/separating/outside-orb states and independent cell toggles", () => {
    const noSearch = createAspectSearchPolicy({ search: false, aspects: ["conjunction"] });
    const exact = evaluateTimingHintsWith(unused, aspectFixture(10, 10), noSearch, enabled()).assessments[0]!;
    expect(exact).toMatchObject({ status: "exact-now", degreesToPerfection: 0,
      contact: { kind: "exact-now", at: instant(0), elapsedDays: 0 }, hints: [] });
    for (const fixture of [aspectFixture(10, 16, 1, 1), aspectFixture(16, 10), aspectFixture(10, 19)]) {
      expect(evaluateTimingHintsWith(unused, fixture, noSearch, enabled()).assessments[0])
        .toMatchObject({ status: "no-current-application", degreesToPerfection: null, contact: null, hints: [] });
    }
    const item = evaluateTimingHintsWith(linear(29, 30.5), aspectFixture(29, 30.5, 2, 1), search(), enabled({
      units: { cardinal: { angular: false }, fixed: units.fixed }
    })).assessments[0]!;
    expect(item.status).toBe("hint");
    expect(item.hints[0]).toMatchObject({ status: "unit-disabled", symbolic: null });
    expect(item.hints[1]!.symbolic!.unit).toBe("years");
  });

  it("makes no symbolic hint when the search is disabled, refused or finds no contact in its horizon", () => {
    const fixture = aspectFixture(10, 16, 2, 1);
    const disabled = evaluateTimingHintsWith(unused, fixture,
      createAspectSearchPolicy({ search: false, aspects: ["conjunction"] }), enabled());
    expect(disabled.assessments[0]).toMatchObject({ status: "search-disabled", degreesToPerfection: null,
      contact: null, hints: [] });
    const refused = evaluateTimingHintsWith(unused, fixture, search(8, 1), enabled());
    expect(refused.assessments[0]).toMatchObject({ status: "aspect-search-refused", contact: null, hints: [] });
    expect(refused.aspects.search.samples).toBe(0);
    const absent = evaluateTimingHintsWith(linear(), fixture, search(2), enabled());
    expect(absent.assessments[0]).toMatchObject({ status: "contact-not-found", contact: null, hints: [] });
    expect(absent.aspects.search.status).toBe("complete");
    expect(evaluateTimingHintsWith(unused, fixture, createAspectSearchPolicy({ aspects: [] }), enabled()).assessments).toEqual([]);
  });

  it("disabled timing calls no future provider, returns no hints and skips placement-only cusp checks", () => {
    const fixture = aspectFixture(10, 16, 2, 1);
    fixture.chart.houses.cusps[2] = fixture.chart.houses.cusps[3]!; // Valid selected ruler cusps, unusable placement circuit.
    const report = evaluateTimingHintsWith(unused, fixture, search(), createTimingPolicy({ units }));
    expect(report.aspects.search).toMatchObject({ status: "disabled", samples: 0 });
    expect(report.cusps).toEqual([]);
    expect(report.assessments.every(item => item.status === "disabled" && item.contact === null && item.hints.length === 0)).toBe(true);
    expect(() => evaluateTimingHintsWith(unused, fixture, search(), enabled())).toThrow(RangeError);
  });

  it("owns deeply frozen JSON-friendly snapshots and leaves chart and policy inputs mutable", () => {
    const fixture = aspectFixture(10, 16, 2, 1), before = structuredClone(fixture);
    const report = evaluateTimingHintsWith(linear(), fixture, search(), JSON.parse(JSON.stringify(enabled())));
    const check = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(check);
      }
    };
    check(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(fixture).toEqual(before);
    fixture.chart.bodies.find(row => row.body === "Mars")!.lon = 90;
    fixture.chart.houses.cusps[0] = 5;
    expect(report.assessments[0]!.hints[0]!.longitude).toBe(10);
    expect(report.cusps[0]).toBe(0);
  });

  it("rejects invalid enabled geometry before sampling and propagates provider failures", () => {
    for (const cusps of [[0, 30, 90, 60, 120, 150, 180, 210, 240, 270, 300, 330],
      [0, 30, 60, 60, 120, 150, 180, 210, 240, 270, 300, 330],
      [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 360]]) {
      const fixture = aspectFixture(10, 16, 2, 1);
      fixture.chart.houses.cusps = cusps;
      expect(() => evaluateTimingHintsWith(unused, fixture, search(), enabled())).toThrow(RangeError);
    }
    for (const value of [NaN, Infinity, -1, 360]) {
      expect(() => evaluateTimingHintsWith(() => value, aspectFixture(10, 16, 2, 1), search(), enabled())).toThrow(RangeError);
    }
    const failure = new Error("Synthetic provider failure");
    expect(() => evaluateTimingHintsWith(() => { throw failure; }, aspectFixture(10, 16, 2, 1), search(), enabled())).toThrow(failure);
    expect(() => evaluateTimingHintsWith(null as never, aspectFixture(), search(), enabled())).toThrow(RangeError);
    const gap = 2 ** -20;
    expect(() => evaluateTimingHintsWith(linear(10, 10 + gap, gap, 0), aspectFixture(10, 10 + gap, gap, 0),
      search(), enabled({ units: { cardinal: { angular: { unit: "days", unitsPerDegree: Number.MIN_VALUE } } } })))
      .toThrow(/underflowed/);
  });

  it("refuses atomically across pairs when an earlier candidate used part of the global budget", () => {
    let calls = 0;
    const law = linear(10, 16.125);
    const report = evaluateTimingHintsWith((body, date) => { calls++; return law(body, date); },
      aspectFixture(10, 16.125, 2, 1), search(8, 58), enabled());
    // First pair: 33 grid evaluations + 24 refinements. The next pair cannot preflight with the remaining one.
    expect(report.aspects.search).toMatchObject({ status: "refused", samples: 57, reason: "sample-budget" });
    expect(calls).toBe(114);
    expect(report.assessments.every(item => item.hints.length === 0 && item.contact === null)).toBe(true);
    expect(report.aspects.aspects.every(item => item.contacts.length === 0)).toBe(true);
  });
});
