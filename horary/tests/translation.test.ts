import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createTranslationPolicy, evaluateTranslationWith, TRANSLATION_METHOD,
  TRANSLATION_SOURCE, TRANSLATION_WEIGHT_ORDER } from "../src/index.js";
import type { HoraryTranslationPolicy } from "../src/index.js";
import { instant, translationFixture } from "./translation.fixture.js";

const aspects = (horizonDays = 5) => createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays, stepDays: 0.25 });
const policy = () => createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 2 });
const run = (law = translationFixture(), options = policy(), horizonDays = 5) =>
  evaluateTranslationWith(law.longitudeAt, law.fixture, aspects(horizonDays), options);

describe("translation policy and source snapshots", () => {
  it("enforces the historical baseline and explicit project defaults", () => {
    expect(createTranslationPolicy()).toEqual({ schema: "horary.translation-policy/v1", translationOfLight: true,
      carriers: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"], lighterPlanet: true,
      swifterPlanet: true, principalSeparation: true, principalAspects: ["conjunction", "sextile", "trine"],
      receptionDignities: ["domicile", "triplicity", "term"], uninterrupted: true, lookbackDays: 7, maxSamples: 200_000 });
    expect(TRANSLATION_WEIGHT_ORDER).toEqual(["Moon", "Mercury", "Venus", "Sun", "Mars", "Jupiter", "Saturn"]);
    expect(TRANSLATION_SOURCE.tradition).toContain("Lilly");
    expect(TRANSLATION_SOURCE.locator).toContain("125-126");
    expect(TRANSLATION_METHOD.receptionEpoch).toBe("question-instant;question-chart-sect");
    expect(createTranslationPolicy({ carriers: ["Moon", "Moon"], receptionDignities: [] }).carriers).toEqual(["Moon"]);
  });
  it.each([null, [], { extra: 1 }, { translationOfLight: null }, { swifterPlanet: 1 }, { lighterPlanet: "yes" },
    { uninterrupted: null }, { principalSeparation: 0 }, { carriers: ["Pluto"] }, { carriers: [undefined] },
    { carriers: new Set(["Moon"]) }, { principalAspects: ["quintile"] }, { receptionDignities: ["fall"] },
    { lookbackDays: 0 }, { lookbackDays: Infinity }, { lookbackDays: NaN }, { lookbackDays: 367 },
    { maxSamples: 0 }, { maxSamples: 1.5 }, { maxSamples: Infinity }, { maxSamples: 1_000_001 }])("rejects %j", input => {
    expect(() => createTranslationPolicy(input as never)).toThrow(RangeError);
  });
  it("rejects accessors, sparse lists and malformed restored snapshots without invoking getters", () => {
    let calls = 0;
    expect(() => createTranslationPolicy({ get uninterrupted() { calls++; return true; } })).toThrow(RangeError);
    const carriers = ["Moon"];
    Object.defineProperty(carriers, "0", { get() { calls++; return "Moon"; } });
    expect(() => createTranslationPolicy({ carriers: carriers as never })).toThrow(RangeError);
    expect(() => createTranslationPolicy({ carriers: Array(1) })).toThrow(RangeError);
    expect(calls).toBe(0);
    const law = translationFixture(), complete = policy();
    for (const bad of [{ ...complete, schema: "other" }, { ...complete, carriers: undefined }, { schema: complete.schema }, Object.create(complete)]) {
      expect(() => run(law, bad as HoraryTranslationPolicy)).toThrow(RangeError);
    }
    expect(run(law, JSON.parse(JSON.stringify(complete))).policy).toEqual(complete);
  });
});

describe("hand-derived translation from source Mars to receiver Venus", () => {
  it("uses a true past contact, a moving receiver, question-time reception and all enabled checks", () => {
    const report = run(), item = report.translations[0]!;
    expect(report.assessment).toBe("patterns-found");
    expect(report.search).toMatchObject({ status: "complete", from: instant(-2), to: instant(5), clock: "caller-longitude-provider",
      rootResolutionMs: Math.ceil(0.25 * 86_400_000 / 2 ** 24) + 1 });
    expect(report.translations).toHaveLength(1);
    expect(item).toMatchObject({ status: "translation-candidate", carrier: { planet: "Moon", roles: ["moon"] },
      from: { planet: "Mars", roles: ["querent"] }, to: { planet: "Venus", roles: ["quesited"] },
      separationContact: { at: instant(-1), elapsedDays: -1, directedLongitude: 0, relativeDirection: "increasing" },
      applicationContact: { at: instant(4), elapsedDays: 4, directedLongitude: 0, relativeDirection: "increasing" },
      sourceReception: { host: "Mars", guest: "Moon", longitude: 12, dignities: ["domicile"] }, intervening: [] });
    expect(item.checks.every(check => check.enabled && check.passed === true)).toBe(true);
    expect(item.explanation).toContain("partial translation evidence");
    expect(item.explanation).toContain("No outcome judgement");
  });
  it("admits an unassigned Mercury carrier and preserves declared natural roles when present", () => {
    const law = translationFixture("Mercury"), options = createTranslationPolicy({ carriers: ["Mercury"], lookbackDays: 2 });
    expect(run(law, options).translations[0]).toMatchObject({ status: "translation-candidate", carrier: { planet: "Mercury", roles: [] } });
    const declared = { ...law.fixture, input: { ...law.fixture.input, question: { ...law.fixture.input.question, naturalSignificators: ["Mercury"] as const } } };
    expect(run({ ...law, fixture: declared }, options).translations[0]!.carrier.roles).toEqual(["natural"]);
    const shared = translationFixture();
    const sharedMoon = { ...shared.fixture, input: { ...shared.fixture.input, question: { ...shared.fixture.input.question, naturalSignificators: ["Moon"] as const } } };
    expect(run({ ...shared, fixture: sharedMoon }).translations).toHaveLength(1);
    expect(run({ ...shared, fixture: sharedMoon }).translations[0]!.carrier.roles).toEqual(["moon", "natural"]);
  });
  it("keeps the two directional transfers distinct", () => {
    const law = translationFixture("Moon", { Mars: [t => 46 + 2 * t, 2], Venus: [t => 40 + t, 1], Moon: [t => 42 + 3 * t, 3] });
    const item = run(law).translations[0]!;
    expect(item).toMatchObject({ status: "translation-candidate", from: { planet: "Venus" }, to: { planet: "Mars" },
      separationContact: { at: instant(-1) }, applicationContact: { at: instant(4) }, sourceReception: { host: "Venus", guest: "Moon", dignities: ["domicile"] } });
  });
  it("reports a shared principal ruler without inventing another planet or self-contact", () => {
    const law = translationFixture();
    law.fixture.chart.houses.cusps[1] = 20; // Aries belongs to Mars on both cusps.
    let calls = 0;
    const report = evaluateTranslationWith(() => { calls++; return 0; }, law.fixture, aspects(), policy());
    expect(report).toMatchObject({ assessment: "shared-principals", translations: [], contacts: [], search: { status: "not-needed", samples: 0 } });
    expect(calls).toBe(0);
    expect(run(translationFixture(), createTranslationPolicy({ carriers: ["Mars", "Venus"] })).translations).toEqual([]);
  });
  it.each([10, 16])("does not label current exact contact at Moon longitude %s a separating/application sequence", lon => {
    expect(run(translationFixture("Moon", { Moon: [t => lon + 3 * t, 3] })).assessment).toBe("no-current-pattern");
  });
  it("excludes stationary and out-of-orb current contacts without scanning", () => {
    expect(run(translationFixture("Moon", { Moon: [t => 12 + t, 1] })).assessment).toBe("no-current-pattern");
    expect(run(translationFixture("Moon", { Moon: [t => 30 + 3 * t, 3] })).search.status).toBe("not-needed");
  });
  it("distinguishes a short lookback from a short future horizon and includes the future endpoint", () => {
    expect(run(translationFixture(), createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 0.5 })).translations[0])
      .toMatchObject({ status: "contact-not-found", separationContact: null, applicationContact: { at: instant(4) } });
    expect(run(translationFixture(), policy(), 2).translations[0])
      .toMatchObject({ status: "contact-not-found", separationContact: { at: instant(-1) }, applicationContact: null });
    expect(run(translationFixture(), policy(), 4).translations[0]!.status).toBe("translation-candidate");
    expect(run(translationFixture(), createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 1 })).translations[0]!.separationContact).toBeNull();
  });
  it("can disable translation, searching and carrier selection independently", () => {
    let calls = 0;
    const law = translationFixture();
    const report = evaluateTranslationWith(() => { calls++; return 0; }, law.fixture, aspects(), createTranslationPolicy({ translationOfLight: false }));
    expect(report).toMatchObject({ assessment: "disabled", translations: [], search: { status: "disabled", samples: 0 } });
    expect(calls).toBe(0);
    const disabled = evaluateTranslationWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 5, search: false }), policy());
    expect(disabled.translations[0]!.status).toBe("search-disabled");
    expect(run(law, createTranslationPolicy({ carriers: [] })).search.status).toBe("not-needed");
    expect(evaluateTranslationWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: [] }), policy()).assessment).toBe("no-current-pattern");
  });
  it("returns frozen detached JSON-friendly evidence and preserves mutable caller data", () => {
    const law = translationFixture(), before = structuredClone(law.fixture), report = run(law);
    expect(law.fixture).toEqual(before);
    const assertFrozen = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) assertFrozen(child);
    };
    assertFrozen(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    law.fixture.chart.bodies.find(row => row.body === "Moon")!.lon = 90;
    expect(report.translations[0]!.sourceReception.longitude).toBe(12);
  });
});
