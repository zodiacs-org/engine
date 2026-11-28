import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { analyze, analyzeCast, explain } from "../src/index.js";
import type { AspectLongitudeAt, AspectSpeedAt, ClassicalPlanet, HoraryAnalysisOptions, HoraryCast } from "../src/index.js";
import { collectionFixture } from "./collection.fixture.js";
import { impedimentFixture } from "./impediments.fixture.js";
import { translationFixture, instant } from "./translation.fixture.js";
import { questionInput } from "./fixtures.js";

afterEach(() => vi.restoreAllMocks());
const options = {
  considerations: { rules: { "moon-void-of-course": false } },
  aspects: { aspects: ["conjunction"], horizonDays: 8 },
  translation: { carriers: ["Moon"], lookbackDays: 2 },
  collection: { collectors: ["Saturn"] },
  timing: { enabled: true, units: { cardinal: { angular: { unit: "weeks", unitsPerDegree: 2 } } } }
} as const satisfies HoraryAnalysisOptions;

function compose(fixture: HoraryCast, longitudeAt: AspectLongitudeAt, overrides: HoraryAnalysisOptions = {}, speedAt?: AspectSpeedAt) {
  // The linear-law fixtures' constant derivatives equal their question-time speeds.
  const speeds = new Map(fixture.chart.bodies.map(row => [row.body, row.speed]));
  vi.spyOn(engine, "bodyLongitude").mockImplementation((planet, at) => longitudeAt(planet as ClassicalPlanet, at));
  vi.spyOn(engine, "longitudeSpeed").mockImplementation((planet, at) => speedAt ? speedAt(planet as ClassicalPlanet, at) : speeds.get(planet)!);
  const recast = vi.spyOn(engine, "natalChart"), before = structuredClone(fixture);
  const report = analyzeCast(fixture, { ...options, ...overrides });
  expect(recast).not.toHaveBeenCalled();
  expect(fixture).toEqual(before);
  expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  expect(report).not.toHaveProperty("verdict");
  return report;
}

describe("composed production wrappers on independently derived motion laws", () => {
  it("retains direct contact, overlapping prohibitions and symbolic timing as separate observations", () => {
    const law = impedimentFixture({ Saturn: [t => 18 + t / 2, () => 0.5] });
    const report = compose(law.fixture, law.longitudeAt, {}, law.speedAt);
    const direct = report.direct.direct.find(row => row.a.planet === "Mars" && row.b.planet === "Venus")!;
    expect(direct.status).toBe("direct-contact");
    expect(direct.candidate).toMatchObject({ at: instant(6), elapsedDays: 6 });
    const intervention = report.impediments.applications[0]!;
    expect(intervention).toMatchObject({ applicant: { planet: "Venus" }, recipient: { planet: "Mars" } });
    for (const rule of ["prohibition", "frustration"]) {
      expect(intervention.observations.find(row => row.rule === rule)).toMatchObject({ status: "candidate" });
    }
    expect(report.impediments.contacts.find(row => row.principal === "Mars" && row.third === "Saturn"))
      .toMatchObject({ at: instant(4), elapsedDays: 4 });
    const timing = report.timing.assessments.find(row => row.a.planet === "Mars" && row.b.planet === "Venus")!;
    expect(timing).toMatchObject({ status: "hint", degreesToPerfection: 6, contact: { at: instant(6), elapsedDays: 6 } });
    expect(timing.hints.map(row => row.symbolic)).toEqual([
      { unit: "weeks", unitsPerDegree: 2, quantity: 12, origin: "caller-mapping" },
      { unit: "weeks", unitsPerDegree: 2, quantity: 12, origin: "caller-mapping" }
    ]);
    const output = explain(report);
    expect(output.entries.filter(row => row.section === "impediments" && row.status === "candidate").length).toBeGreaterThanOrEqual(2);
    expect(output.text).toContain("No priority");
  });

  it("carries the historical and future translation endpoints through analysis and explanation", () => {
    const law = translationFixture();
    const report = compose(law.fixture, law.longitudeAt, { aspects: { aspects: ["conjunction"], horizonDays: 5 } });
    expect(report.translation.translations[0]).toMatchObject({ status: "translation-candidate",
      from: { planet: "Mars" }, carrier: { planet: "Moon" }, to: { planet: "Venus" },
      separationContact: { at: instant(-1) }, applicationContact: { at: instant(4) } });
    expect(report.direct.direct.find(row => row.a.planet === "Mars" && row.b.planet === "Venus")?.status)
      .toBe("no-current-application");
    expect(explain(report).entries.find(row => row.section === "translation" && row.status === "translation-candidate"))
      .toMatchObject({ subject: "Mars via Moon to Venus", source: { id: "lilly-translation;project-contact-sequence" } });
  });

  it("preserves collection completion and reception checks while direct application is absent", () => {
    const law = collectionFixture();
    const report = compose(law.fixture, law.longitudeAt, { aspects: { aspects: ["conjunction", "sextile"], orbs: { sextile: 6 }, horizonDays: 8 } });
    expect(report.collection.collections[0]).toMatchObject({ status: "collection-candidate", collector: { planet: "Saturn" },
      contactOrder: "quesited-first", completion: { at: instant(6) } });
    expect(report.collection.collections[0]!.applications.map(row => row.contact?.at)).toEqual([instant(6), instant(4)]);
    expect(report.collection.collections[0]!.checks.find(row => row.rule === "both-receptions")?.passed).toBe(true);
    expect(report.direct.direct.filter(row => row.a.planet === "Mars" && row.b.planet === "Venus")
      .every(row => row.status === "no-current-application")).toBe(true);
    expect(explain(report).entries.find(row => row.section === "collection" && row.status === "collection-candidate"))
      .toMatchObject({ subject: "Saturn" });
  });

  it("retains a station-associated loss of application without inventing a later contact or timing hint", () => {
    const law = impedimentFixture({ Venus: [t => 10 + 2 * t - t * t, t => 2 - 2 * t] });
    const report = compose(law.fixture, law.longitudeAt, { aspects: { aspects: ["conjunction"], horizonDays: 2 } }, law.speedAt);
    const observation = report.impediments.applications[0]!.observations.find(row => row.rule === "refranation")!;
    expect(observation).toMatchObject({ status: "candidate", evidence: [{ kind: "station", relation: "contact-not-found",
      event: { at: instant(1), fromMotion: "direct", toMotion: "retrograde" } }] });
    expect(report.aspects.aspects.find(row => row.a.planet === "Mars" && row.b.planet === "Venus")?.timeToPerfection).toBeNull();
    expect(report.timing.assessments.find(row => row.a.planet === "Mars" && row.b.planet === "Venus"))
      .toMatchObject({ status: "contact-not-found", hints: [] });
  });

  it("keeps refused mode evidence atomic and exposes every scanner's limitations and refusal reason", () => {
    const law = translationFixture();
    const report = compose(law.fixture, law.longitudeAt, { translation: { carriers: ["Moon"], lookbackDays: 2, maxSamples: 1 },
      direct: { maxSamples: 1 } });
    expect(report.translation.search).toMatchObject({ status: "refused", reason: "sample-budget" });
    expect(report.translation.contacts).toEqual([]);
    expect(report.direct.eventSearch.status).toBe("refused");
    expect(report.aspects.search.status).toBe("complete");
    const output = explain(report);
    expect(output.entries.find(row => row.section === "translation" && row.subject === "search" && row.status === "refused")?.text)
      .toContain("Reason: sample-budget");
    for (const [section, method] of [["aspects", report.aspects.search.method], ["direct", report.direct.eventSearch.method],
      ["translation", report.translation.search.method], ["collection", report.collection.search.method],
      ["impediments", report.impediments.method], ["timing", report.timing.aspects.search.method]] as const) {
      for (const limitation of method.limitations) {
        expect(output.entries.some(row => row.section === section && row.status === "limitation" && row.text === limitation)).toBe(true);
      }
    }
    expect(output.entries.find(row => row.section === "impediments" && row.subject === "station search")).toBeDefined();
    expect(output.entries.find(row => row.section === "impediments" && row.subject === "principal aspect search")).toBeDefined();
    for (const limitation of report.timing.conventions.limitations) {
      expect(output.entries.some(row => row.section === "timing" && row.subject === "symbolic convention" && row.text === limitation)).toBe(true);
    }
    expect(explain(JSON.parse(JSON.stringify(report)))).toEqual(output);
  });
});

describe("full composition on an invented question instant, without new sky accuracy claims", () => {
  it("runs enabled engine scans, preserves fallback and retains shared natural roles", () => {
    const recast = vi.spyOn(engine, "natalChart"), lunar = vi.spyOn(engine, "voidOfCourseAt");
    const input = { ...questionInput, houseSystem: "placidus" as const, location: { latitude: 80, longitude: 34 },
      question: { id: "synthetic-relationship", quesitedHouse: 7 as const, naturalSignificators: ["Moon" as const, "Venus" as const] } };
    const before = structuredClone(input);
    const report = analyze(input, { aspects: { horizonDays: 0.5 }, translation: { lookbackDays: 0.5 } });
    expect(recast).toHaveBeenCalledTimes(1);
    expect(lunar).toHaveBeenCalledTimes(1);
    expect(report.chart.flags).toContain("polar-fallback");
    expect(report.significators.houses).toEqual({ requested: "placidus", actual: "whole" });
    expect(report.significators.planets.find(row => row.planet === "Moon")!.roles).toContain("natural");
    expect(report.aspects.search.status).toBe("complete");
    expect(report.direct.eventSearch.status).toBe("complete");
    expect(report.considerations.observations.find(row => row.rule === "moon-void-of-course")!.scan).not.toBeNull();
    expect(input).toEqual(before);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(explain(report).text).toContain("actual whole");
  });
});
