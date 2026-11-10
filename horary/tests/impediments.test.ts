import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createImpedimentPolicy, evaluateImpedimentsWith, IMPEDIMENT_METHOD, IMPEDIMENT_SOURCES } from "../src/index.js";
import type { HoraryImpedimentPolicy, ImpedimentPolicyInput, ImpedimentRule } from "../src/index.js";
import { impedimentFixture, instant } from "./impediments.fixture.js";

const aspects = createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, stepDays: 0.25, maxSamples: 4000 });
const run = (law = impedimentFixture(), options: ImpedimentPolicyInput = {}, aspectPolicy = aspects) =>
  evaluateImpedimentsWith(law.longitudeAt, law.speedAt, law.fixture, aspectPolicy, createImpedimentPolicy(options));
const rule = (report: ReturnType<typeof run>, name: ImpedimentRule) => report.applications[0]!.observations.find(row => row.rule === name)!;

describe("sourced impediment policy", () => {
  it("sets explicit resource defaults and independent interpretation choices", () => {
    expect(createImpedimentPolicy()).toEqual({ schema: "horary.impediment-policy/v1", prohibition: true,
      frustration: true, refranation: true, thirdPlanets: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"],
      prohibitionScope: "either-principal", frustrationScope: "conjunction-only", swifterApplicant: true,
      maxSamples: 200_000, stationMaxSamples: 20_000 });
    for (const source of Object.values(IMPEDIMENT_SOURCES)) expect(source.tradition).toContain("Lilly");
    expect(IMPEDIMENT_METHOD.verification).toBe("sampled;not-proven-complete");
    expect(createImpedimentPolicy({ thirdPlanets: ["Saturn", "Moon", "Saturn"], prohibition: false,
      frustrationScope: "enabled-aspects", prohibitionScope: "both-principals", swifterApplicant: false }))
      .toMatchObject({ thirdPlanets: ["Moon", "Saturn"], prohibition: false, swifterApplicant: false });
  });
  it.each([null, [], { extra: true }, { prohibition: null }, { frustration: 1 }, { refranation: "yes" },
    { swifterApplicant: 0 }, { thirdPlanets: ["Pluto"] }, { thirdPlanets: new Array(1) }, { thirdPlanets: "Moon" },
    { prohibitionScope: "any" }, { frustrationScope: null }, { maxSamples: 0 }, { maxSamples: 1.5 },
    { maxSamples: Infinity }, { stationMaxSamples: NaN }, { stationMaxSamples: 1_000_001 }])("rejects %j", options => {
    expect(() => createImpedimentPolicy(options as never)).toThrow(RangeError);
  });
  it("revalidates restored snapshots, rejects non-data fields, and freezes owned arrays", () => {
    let calls = 0;
    expect(() => createImpedimentPolicy({ get refranation() { calls++; return true; } })).toThrow(RangeError);
    expect(calls).toBe(0);
    const law = impedimentFixture(), policy = createImpedimentPolicy();
    for (const bad of [{ ...policy, schema: "bad" }, { ...policy, prohibition: undefined }, { schema: policy.schema }, Object.create(policy)]) {
      expect(() => evaluateImpedimentsWith(law.longitudeAt, law.speedAt, law.fixture, aspects, bad as HoraryImpedimentPolicy)).toThrow(RangeError);
    }
    expect(evaluateImpedimentsWith(law.longitudeAt, law.speedAt, law.fixture, aspects, JSON.parse(JSON.stringify(policy))).policy).toEqual(policy);
    expect(Object.isFrozen(policy.thirdPlanets)).toBe(true);
  });
});

describe("independent third-contact sequences and competing interpretations", () => {
  it("orders a third planet's two contacts before a moving principal conjunction", () => {
    // Venus=10+2t, Mars=16+t, Mercury=8+4t: contacts t=1, 8/3, 6.
    const report = run(impedimentFixture({ Mercury: [t => 8 + 4 * t, () => 4] }), { thirdPlanets: ["Mercury"] });
    expect(report.contacts.map(row => row.principal)).toEqual(["Venus", "Mars"]);
    expect(report.contacts[0]!.elapsedDays).toBe(1);
    expect(report.contacts[1]!.elapsedDays).toBeCloseTo(8 / 3, 6);
    expect(report.applications[0]).toMatchObject({ applicant: { planet: "Venus", roles: ["quesited"] }, recipient: { planet: "Mars", roles: ["querent"] },
      aspect: { timeToPerfection: { at: instant(6) } } });
    expect(rule(report, "prohibition")).toMatchObject({ status: "candidate", evidence: [
      { kind: "third-contact", relation: "before", contact: { principal: "Venus", at: instant(1) } },
      { kind: "third-contact", relation: "before", contact: { principal: "Mars" } }
    ] });
    expect(rule(run(impedimentFixture({ Mercury: [t => 8 + 4 * t, () => 4] }), {
      thirdPlanets: ["Mercury"], prohibitionScope: "both-principals" }), "prohibition").status).toBe("candidate");
  });
  it("lets the stricter prohibition reading change a single-contact label", () => {
    // Mercury=14+4t contacts Mars at 2/3, but never Venus in this window.
    const law = impedimentFixture({ Mercury: [t => 14 + 4 * t, () => 4] });
    expect(rule(run(law, { thirdPlanets: ["Mercury"] }), "prohibition").status).toBe("candidate");
    const strict = rule(run(law, { thirdPlanets: ["Mercury"], prohibitionScope: "both-principals" }), "prohibition");
    expect(strict).toMatchObject({ status: "not-triggered", evidence: [] });
    expect(strict.explanation).toContain("both-principals");
  });
  it("retains overlapping frustration and general prohibition without choosing a verdict", () => {
    // Recipient Mars joins Saturn=18+t/2 at t=4 before joining Venus at t=6.
    const report = run(impedimentFixture({ Saturn: [t => 18 + t / 2, () => 0.5] }), { thirdPlanets: ["Saturn"] });
    expect(rule(report, "frustration")).toMatchObject({ status: "candidate", evidence: [
      { contact: { principal: "Mars", third: "Saturn", at: instant(4), current: { motion: "applying", withinOrb: true } } }
    ] });
    expect(rule(report, "prohibition").status).toBe("candidate");
    expect(rule(report, "prohibition").explanation).toContain("overlap frustration");
    expect(JSON.stringify(report)).not.toMatch(/"verdict"/);
  });
  it("supports bodily versus broader aspect frustration choices and aspect prohibition", () => {
    // Saturn=78+t/2 is sextile Mars at t=4 and Venus at t=16/3.
    const law = impedimentFixture({ Saturn: [t => 78 + t / 2, () => 0.5] });
    const policy = createAspectSearchPolicy({ aspects: ["conjunction", "sextile"], horizonDays: 8, maxSamples: 8000 });
    const report = run(law, { thirdPlanets: ["Saturn"] }, policy);
    expect(rule(report, "prohibition").status).toBe("candidate");
    expect(rule(report, "frustration").status).toBe("not-triggered");
    const broad = run(law, { thirdPlanets: ["Saturn"], frustrationScope: "enabled-aspects" }, policy);
    expect(rule(broad, "frustration")).toMatchObject({ status: "candidate", evidence: [{ contact: { type: "sextile", at: instant(4) } }] });
  });
  it("does not invent order for coincident contacts, including the stricter interpretation", () => {
    // All three meet at t=6: Saturn=22, Venus=10+2t, Mars=16+t.
    const law = impedimentFixture({ Saturn: [() => 22, () => 0] });
    for (const prohibitionScope of ["either-principal", "both-principals"] as const) {
      const report = run(law, { thirdPlanets: ["Saturn"], prohibitionScope });
      expect(rule(report, "prohibition").status).toBe("requires-review");
      expect(rule(report, "frustration").status).toBe("requires-review");
      expect(rule(report, "prohibition").evidence.every(row => row.kind === "third-contact" && row.relation === "coincident")).toBe(true);
    }
  });
  it("does not count contacts after perfection, out-of-orb principal patterns, or self-intervention", () => {
    const report = run(impedimentFixture({ Saturn: [() => 26, () => 0] }), { thirdPlanets: ["Mars", "Venus", "Saturn"] });
    expect(rule(report, "prohibition")).toMatchObject({ status: "not-triggered", evidence: [] });
    expect(report.contacts.every(row => row.third === "Saturn" && row.elapsedDays === 8)).toBe(true);
    expect(run(impedimentFixture({ Mars: [t => 40 + t, () => 1] })).assessment).toBe("no-current-application");
    const shared = impedimentFixture();
    shared.fixture.chart.houses.cusps = [0, 1, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
    const answer = run(shared);
    expect(answer).toMatchObject({ assessment: "shared-principals", contacts: [], applications: [], search: { samples: 0 } });
    expect(answer.motion.aspects.significators.planets[0]!.roles).toEqual(["querent", "quesited"]);
  });
  it("preserves bounded absence rather than ordering against an extrapolated contact", () => {
    const law = impedimentFixture({ Mercury: [t => 8 + 4 * t, () => 4] });
    const report = run(law, { thirdPlanets: ["Mercury"] }, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 2 }));
    expect(report.contacts).toHaveLength(1);
    expect(rule(report, "prohibition")).toMatchObject({ status: "contact-not-found", evidence: [] });
  });
  it("checks both directed branches of every major aspect through longitude wrapping", () => {
    for (const [type, angle] of [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]] as const) {
      for (const side of angle === 0 || angle === 180 ? [1] : [1, -1]) {
        const m0 = 358 + side * angle + 6;
        const law = impedimentFixture({ Venus: [t => 358 + 2 * t, () => 2], Mars: [t => m0 + t, () => 1],
          Saturn: [t => m0 + side * angle + 2 + t / 2, () => 0.5] });
        const report = run(law, { thirdPlanets: ["Saturn"], frustration: false, refranation: false },
          createAspectSearchPolicy({ aspects: [type], orbs: { [type]: 8 }, horizonDays: 8 }));
        expect(report.applications[0]!.aspect.timeToPerfection).toMatchObject({ at: instant(6), elapsedDays: 6 });
        expect(rule(report, "prohibition").status).toBe("candidate");
        expect(rule(report, "prohibition").evidence.some(row => row.kind === "third-contact" &&
          row.contact.principal === "Mars" && row.contact.at === instant(4))).toBe(true);
      }
    }
  });
  it("lets callers disable the instantaneous swiftness proxy without changing sphere order", () => {
    // Venus=10-t, Mars=16-2t: contact t=6. Mars-Saturn=2-t/2: contact t=4.
    const law = impedimentFixture({ Venus: [t => 10 - t, () => -1], Mars: [t => 16 - 2 * t, () => -2],
      Saturn: [t => 14 - 1.5 * t, () => -1.5] });
    expect(rule(run(law, { thirdPlanets: ["Saturn"] }), "frustration").status).toBe("not-triggered");
    const report = run(law, { thirdPlanets: ["Saturn"], swifterApplicant: false });
    expect(report.applications[0]).toMatchObject({ applicant: { planet: "Venus" }, swifterApplicant: false });
    expect(rule(report, "frustration")).toMatchObject({ status: "candidate", evidence: [{ contact: { at: instant(4) } }] });
  });
  it("preserves natural and lunar roles without reassigning them as principal house rulers", () => {
    const law = impedimentFixture({ Moon: [t => 8 + 4 * t, () => 4] });
    const fixture = { ...law.fixture, input: { ...law.fixture.input, question: { ...law.fixture.input.question, naturalSignificators: ["Moon"] as const } } };
    const report = run({ ...law, fixture }, { thirdPlanets: ["Moon"] });
    expect(report.applications).toHaveLength(1);
    expect(report.motion.aspects.significators.planets.find(row => row.planet === "Moon")!.roles).toEqual(["moon", "natural"]);
    expect(rule(report, "prohibition").status).toBe("candidate");
  });
});

describe("station-associated loss of application", () => {
  it("identifies reversal without requiring a later principal contact", () => {
    // Venus-Mars=-6+t-t^2, discriminant negative; Venus station t=1.
    const report = run(impedimentFixture({ Venus: [t => 10 + 2 * t - t * t, t => 2 - 2 * t] }), { thirdPlanets: [] });
    expect(report.applications[0]!.aspect.timeToPerfection).toBeNull();
    expect(rule(report, "refranation")).toMatchObject({ status: "candidate", evidence: [{ kind: "station", status: "candidate",
      relation: "contact-not-found", event: { planet: { planet: "Venus" }, at: instant(1), transition: "reversal" }, after: { motion: "separating" } }] });
    expect(rule(report, "refranation").explanation).toContain("bounded, partial evidence");
    const evidence = rule(report, "refranation").evidence[0]!;
    expect(evidence.kind === "station" && evidence.explanation).toContain("causal attribution is not established");
  });
  it("keeps a later contact when an earlier reversal loses the current application", () => {
    // Venus speed=(t-1)(t-2), difference=-4.5+t-1.5t^2+t^3/3, first positive root t=4.5.
    const report = run(impedimentFixture({ Venus: [t => 10 + 2 * t - 1.5 * t * t + t ** 3 / 3, t => 2 - 3 * t + t * t],
      Mars: [t => 14.5 + t, () => 1] }), { thirdPlanets: [] });
    expect(report.applications[0]!.aspect.timeToPerfection!.elapsedDays).toBeCloseTo(4.5, 6);
    expect(rule(report, "refranation")).toMatchObject({ status: "candidate", evidence: [
      { relation: "before-contact", status: "candidate", event: { elapsedDays: 1 } },
      { relation: "before-contact", status: "not-triggered", event: { elapsedDays: 2 } }
    ] });
  });
  it("requires review for station/contact coincidence and an unresolved horizon endpoint", () => {
    // Venus=14-(t-2)^2 and Mars=14 touch at t=2, Venus reverses there too.
    const law = impedimentFixture({ Venus: [t => 14 - (t - 2) ** 2, t => 4 - 2 * t], Mars: [() => 14, () => 0] });
    expect(rule(run(law, { thirdPlanets: [] }), "refranation").status).toBe("requires-review");
    const end = run(law, { thirdPlanets: [] }, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 2 }));
    expect(rule(end, "refranation").evidence[0]).toMatchObject({ event: { transition: "unresolved" }, status: "requires-review" });
  });
  it("does not turn touches, recipient reversals or ongoing post-station application into refranation", () => {
    const touchLaw = impedimentFixture({ Venus: [t => 10 + (t - 1) ** 3 / 3 + 1 / 3, t => (t - 1) ** 2], Mars: [t => 16 - t, () => -1] });
    const touch = run(touchLaw, { thirdPlanets: [] });
    expect(rule(touch, "refranation").status).toBe("not-triggered"); // Speed equality fails the enabled swift-applicant proxy.
    expect(rule(run(touchLaw, {
      thirdPlanets: [], swifterApplicant: false }), "refranation").status).toBe("requires-review");
    const recipient = run(impedimentFixture({ Mars: [t => 16 + t - t * t, t => 1 - 2 * t] }), { thirdPlanets: [] });
    expect(rule(recipient, "refranation").status).toBe("not-triggered");
    const ongoing = run(impedimentFixture({ Venus: [t => 10 + 2 * t - t * t, t => 2 - 2 * t], Mars: [t => 16 - t, () => -1] }), { thirdPlanets: [] });
    expect(rule(ongoing, "refranation").evidence[0]).toMatchObject({ after: { motion: "applying" }, status: "not-triggered" });
  });
  it("does not classify an applicant station after the first principal contact as an impediment", () => {
    // Venus=10+4t-t^2, Mars=11+t; first contact (3-sqrt(5))/2 precedes station t=2.
    const report = run(impedimentFixture({ Venus: [t => 10 + 4 * t - t * t, t => 4 - 2 * t], Mars: [t => 11 + t, () => 1] }), { thirdPlanets: [] });
    expect(report.applications[0]!.aspect.timeToPerfection!.elapsedDays).toBeCloseTo((3 - Math.sqrt(5)) / 2, 6);
    expect(rule(report, "refranation")).toMatchObject({ status: "not-triggered", evidence: [{ relation: "after-contact", status: "not-triggered" }] });
  });
});
