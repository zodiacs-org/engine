import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createTranslationPolicy, evaluateTranslationWith } from "../src/index.js";
import type { TranslationPolicyInput } from "../src/index.js";
import type { AspectType } from "../src/engine.js";
import { DAY, instant, translationFixture } from "./translation.fixture.js";

const aspects = createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 5, stepDays: 0.25 });
const run = (law = translationFixture(), options: TranslationPolicyInput = {}) => evaluateTranslationWith(law.longitudeAt, law.fixture,
  aspects, createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 2, ...options }));
const check = (report: ReturnType<typeof run>, rule: string) => report.translations[0]!.checks.find(row => row.rule === rule)!;

describe("configurable sourced translation eligibility", () => {
  it("can relax principal separation independently of carrier contacts", () => {
    const law = translationFixture("Moon", { Venus: [t => 16 + 0.5 * t, 0.5] }); // Principals approach; Moon still bridges them.
    const report = run(law);
    expect(report.translations[0]!.status).toBe("rejected");
    expect(check(report, "principal-separation")).toMatchObject({ enabled: true, passed: false });
    expect(run(law, { principalSeparation: false }).translations[0]!.status).toBe("translation-candidate");
    expect(run(translationFixture(), { principalAspects: [] }).translations[0]!.status).toBe("rejected");
  });
  it("can require a chosen principal aspect and respects the aspect policy's enabled types", () => {
    const law = translationFixture();
    const report = run(law, { principalAspects: ["trine"] });
    expect(check(report, "principal-separation").passed).toBe(false);
    expect(check(run(law, { principalAspects: ["conjunction"] }), "principal-separation").passed).toBe(true);
  });
  it("evaluates source hosting at the question, allows dignity selection, and never demands reciprocal hosting", () => {
    const normal = run();
    expect(check(normal, "source-reception").passed).toBe(true);
    expect(normal.translations[0]!.sourceReception).toMatchObject({ host: "Mars", guest: "Moon", dignities: ["domicile"] });
    const absent = run(translationFixture(), { receptionDignities: ["exaltation"] });
    expect(absent.translations[0]!.status).toBe("rejected");
    expect(check(absent, "source-reception").passed).toBe(false);
    const disabled = run(translationFixture(), { receptionDignities: [] });
    expect(disabled.translations[0]!.status).toBe("translation-candidate");
    expect(check(disabled, "source-reception")).toMatchObject({ enabled: false, passed: null });
  });
  it("keeps traditional weight independent of measured speed", () => {
    const law = translationFixture("Saturn"); // Saturn assigned the same artificial swift motion as Moon.
    const report = run(law, { carriers: ["Saturn"] });
    expect(check(report, "lighter-planet").passed).toBe(false);
    expect(check(report, "swifter-planet").passed).toBe(true);
    expect(report.translations[0]!.status).toBe("rejected");
    expect(run(law, { carriers: ["Saturn"], lighterPlanet: false }).translations[0]!.status).toBe("translation-candidate");
  });
  it("treats equal speed magnitudes as failing the strict swiftness proxy and permits its disabling", () => {
    // Moon=12+3t, retrograde Venus=16-3t. Future conjunction t=2/3.
    const law = translationFixture("Moon", { Venus: [t => 16 - 3 * t, -3] });
    const report = run(law, { principalSeparation: false });
    expect(check(report, "swifter-planet").passed).toBe(false);
    expect(report.translations[0]!.status).toBe("rejected");
    expect(run(law, { principalSeparation: false, swifterPlanet: false }).translations[0]!.status).toBe("translation-candidate");
  });
});

describe("ordered carrier contacts with every classical planet", () => {
  it.each([11, 18])("flags an unassigned Jupiter at %s between source separation and destination contact", jupiter => {
    // Moon 12+3t hits 11 at t=-1/3 or 18 at t=2, after source t=-1 and before receiver t=4.
    const law = translationFixture("Moon", { Jupiter: [() => jupiter, 0] });
    const report = run(law), item = report.translations[0]!;
    expect(item.status).toBe("rejected");
    expect(item.intervening).toHaveLength(1);
    expect(item.intervening[0]).toMatchObject({ relation: "between", contact: { carrier: "Moon", other: "Jupiter", type: "conjunction" } });
    expect(check(report, "uninterrupted").passed).toBe(false);
    expect(run(law, { uninterrupted: false }).translations[0]!.status).toBe("translation-candidate");
    expect(run(law, { uninterrupted: false }).translations[0]!.intervening).toEqual(item.intervening);
  });
  it.each([9, 24])("leaves coincident Jupiter contact at %s unresolved", jupiter => {
    // Source contact Moon=Mars=9 at -1; destination contact Moon=Venus=24 at 4.
    const report = run(translationFixture("Moon", { Jupiter: [() => jupiter, 0] }));
    expect(report.translations[0]).toMatchObject({ status: "requires-review", intervening: [{ relation: "coincident" }] });
    expect(check(report, "uninterrupted").passed).toBeNull();
  });
  it("distinguishes contacts just outside and inside the step-derived ordering resolution", () => {
    const resolution = Math.ceil(0.25 * DAY / 2 ** 24) + 1;
    for (const [milliseconds, expected] of [[resolution, "requires-review"], [1000, "rejected"]] as const) {
      const law = translationFixture("Moon", { Jupiter: [() => 24 - 3 * milliseconds / DAY, 0] });
      expect(run(law).translations[0]!.status).toBe(expected);
    }
    expect(run(translationFixture("Moon", { Jupiter: [() => 24 + 3 * 1000 / DAY, 0] })).translations[0]!.status)
      .toBe("translation-candidate");
  });
  it("preserves later unrelated contacts without treating them as interruption", () => {
    const report = run(translationFixture("Moon", { Jupiter: [() => 27, 0] })); // t=5, beyond the receiver t=4.
    expect(report.contacts).toContainEqual(expect.objectContaining({ other: "Jupiter", at: instant(5) }));
    expect(report.translations[0]).toMatchObject({ status: "translation-candidate", intervening: [] });
  });
  it("includes exact question-time third-party contacts in the combined historical/future scan", () => {
    const report = run(translationFixture("Moon", { Jupiter: [() => 12, 0] }));
    expect(report.translations[0]!.intervening).toContainEqual(expect.objectContaining({ relation: "between",
      contact: expect.objectContaining({ other: "Jupiter", at: instant(0) }) }));
    expect(report.translations[0]!.status).toBe("rejected");
  });
  it("does not confidently order a near-question source contact", () => {
    const resolution = Math.ceil(0.25 * DAY / 2 ** 24) + 1;
    const law = translationFixture("Moon", { Mars: [t => 12 - 2 * resolution / DAY + t, 1] });
    const report = run(law);
    expect(report.translations[0]!.status).toBe("requires-review");
  });
});

describe("aspect branches and longitude wraps from independent laws", () => {
  const angles: readonly [AspectType, number][] = [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]];
  it.each(angles.flatMap(([type, angle]) => [1, -1].map(side => [type, angle, side] as const)))(
    "retains %s branch with angle %s and side %s", (type, angle, side) => {
      // C=12+3t, S=10-side*A+t, D=16-side*A+2t. Both directed gaps are side*A+2+2t and side*A-4+t.
      const law = translationFixture("Moon", { Mars: [t => 10 - side * angle + t, 1], Venus: [t => 16 - side * angle + 2 * t, 2],
        Sun: [() => 50, 0], Mercury: [() => 50, 0], Jupiter: [() => 50, 0], Saturn: [() => 50, 0] });
      const report = evaluateTranslationWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: [type],
        horizonDays: 5, stepDays: 0.25 }), createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 2,
        principalSeparation: false, receptionDignities: [] }));
      expect(report.translations).toHaveLength(1);
      expect(report.translations[0]).toMatchObject({ status: "translation-candidate",
        separationContact: { at: instant(-1), directedLongitude: side > 0 || angle === 0 || angle === 180 ? angle : 360 - angle },
        applicationContact: { at: instant(4) } });
    });
  it("handles mixed contact modes without demanding the same aspect on both legs", () => {
    const law = translationFixture("Moon", { Venus: [t => 76 + 2 * t, 2] });
    const report = evaluateTranslationWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: ["conjunction", "sextile"], orbs: { sextile: 6 },
      horizonDays: 5, stepDays: 0.25 }), createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 2, receptionDignities: [] }));
    expect(report.translations[0]).toMatchObject({ status: "translation-candidate", separationContact: { type: "conjunction", at: instant(-1) },
      applicationContact: { type: "sextile", directedLongitude: 300, at: instant(4) } });
  });
  it.each([[-12, 3], [12, -3]])("wraps a carrier starting at %s with signed speed %s", (start, rate) => {
    // Shift or reflect the basic laws. The roots stay t=-1 and t=4.
    const reflection = rate / 3;
    const offset = start - reflection * 12;
    const law = translationFixture("Moon", { Moon: [t => offset + reflection * (12 + 3 * t), rate],
      Mars: [t => offset + reflection * (10 + t), reflection], Venus: [t => offset + reflection * (16 + 2 * t), reflection * 2] });
    const item = run(law, { receptionDignities: [] }).translations[0]!;
    expect(item).toMatchObject({ status: "translation-candidate", separationContact: { at: instant(-1), relativeDirection: rate > 0 ? "increasing" : "decreasing" },
      applicationContact: { at: instant(4) } });
  });
  it("keeps carrier-specific evidence when more than one carrier has a current pattern", () => {
    const law = translationFixture("Moon", { Mercury: [t => 13 + 3 * t, 3] });
    const report = run(law, { carriers: ["Moon", "Mercury"] });
    expect(report.translations.map(row => row.carrier.planet)).toEqual(["Moon", "Mercury"]);
    expect(report.translations.every(row => row.status === "translation-candidate")).toBe(true);
    for (const row of report.translations) {
      expect(row.separationContact!.carrier).toBe(row.carrier.planet);
      expect(row.applicationContact!.carrier).toBe(row.carrier.planet);
    }
  });
});
