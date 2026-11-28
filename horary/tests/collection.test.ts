import { describe, expect, it } from "vitest";
import { COLLECTION_METHOD, COLLECTION_SOURCE, COLLECTION_WEIGHT_ORDER, createAspectSearchPolicy,
  createCollectionPolicy, evaluateCollectionWith } from "../src/index.js";
import type { HoraryCollectionPolicy } from "../src/index.js";
import { collectionFixture, instant } from "./collection.fixture.js";

const aspects = (horizonDays = 8) => createAspectSearchPolicy({ aspects: ["conjunction", "sextile"], horizonDays, stepDays: 0.25, orbs: { sextile: 6 }, luminaryOrbs: { sextile: 6 } });
const policy = () => createCollectionPolicy({ collectors: ["Saturn"] });
const run = (law = collectionFixture(), options = policy(), horizonDays = 8) =>
  evaluateCollectionWith(law.longitudeAt, law.fixture, aspects(horizonDays), options);

describe("collection policy", () => {
  it("records Lilly's reading and independent project choices", () => {
    expect(createCollectionPolicy()).toEqual({ schema: "horary.collection-policy/v1", collectionOfLight: true,
      collectors: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"], heavierPlanet: true, slowerPlanet: true,
      principalsNotAspecting: true, receptionDirection: "principals-receive-collector",
      receptionDignities: ["domicile", "exaltation", "triplicity", "term", "face"], maxSamples: 200_000 });
    expect(COLLECTION_SOURCE.tradition).toContain("Lilly");
    expect(COLLECTION_SOURCE.locator).toContain("126");
    expect(COLLECTION_WEIGHT_ORDER).toEqual(["Moon", "Mercury", "Venus", "Sun", "Mars", "Jupiter", "Saturn"]);
    expect(COLLECTION_METHOD.receptionEpoch).toBe("question-instant;question-chart-sect");
    expect(createCollectionPolicy({ collectors: ["Saturn", "Saturn"] }).collectors).toEqual(["Saturn"]);
  });
  it.each([null, [], { extra: 1 }, { collectionOfLight: null }, { heavierPlanet: 1 }, { slowerPlanet: "yes" },
    { principalsNotAspecting: null }, { collectors: ["Pluto"] }, { collectors: Array(1) }, { collectors: new Set(["Saturn"]) },
    { receptionDignities: ["fall"] }, { receptionDirection: "mutual" }, { maxSamples: 0 }, { maxSamples: 1.5 },
    { maxSamples: Infinity }, { maxSamples: 1_000_001 }])("rejects %j", input => {
    expect(() => createCollectionPolicy(input as never)).toThrow(RangeError);
  });
  it("validates complete restored policies, rejecting accessors without executing them", () => {
    let calls = 0;
    expect(() => createCollectionPolicy({ get heavierPlanet() { calls++; return true; } })).toThrow(RangeError);
    const list = ["Saturn"];
    Object.defineProperty(list, "0", { get() { calls++; return "Saturn"; } });
    expect(() => createCollectionPolicy({ collectors: list as never })).toThrow(RangeError);
    expect(calls).toBe(0);
    const good = policy();
    expect(run(collectionFixture(), JSON.parse(JSON.stringify(good))).policy).toEqual(good);
    for (const bad of [{ ...good, schema: "other" }, { ...good, collectors: undefined }, { schema: good.schema }, Object.create(good)]) {
      expect(() => run(collectionFixture(), bad as HoraryCollectionPolicy)).toThrow(RangeError);
    }
  });
});

describe("hand-derived converging contacts", () => {
  it("collects Mars's conjunction and Venus's sextile at a moving Saturn with principal-to-collector reception", () => {
    const report = run(), item = report.collections[0]!;
    expect(report.assessment).toBe("patterns-found");
    expect(report.search).toMatchObject({ status: "complete", from: instant(0), to: instant(8), clock: "caller-longitude-provider" });
    expect(report.collections).toHaveLength(1);
    expect(item).toMatchObject({ status: "collection-candidate", collector: { planet: "Saturn", roles: [] },
      contactOrder: "quesited-first", completion: { at: instant(6), elapsedDays: 6 } });
    expect(item.applications[0]).toMatchObject({ principal: { planet: "Mars", roles: ["querent"] }, type: "conjunction",
      contact: { at: instant(6), directedLongitude: 0, relativeDirection: "increasing" } });
    expect(item.applications[1]).toMatchObject({ principal: { planet: "Venus", roles: ["quesited"] }, type: "sextile",
      contact: { at: instant(4), directedLongitude: 60, relativeDirection: "decreasing" } });
    expect(item.receptions.filter(row => row.required)).toEqual([
      { host: "Mars", guest: "Saturn", longitude: 220, sect: "night", dignities: ["domicile", "triplicity"], required: true },
      { host: "Venus", guest: "Saturn", longitude: 220, sect: "night", dignities: ["term"], required: true }
    ]);
    expect(item.checks.every(row => row.enabled && row.passed === true)).toBe(true);
    expect(item.explanation).toContain("No outcome judgement");
  });
  it("preserves reverse reception evidence and only requires the selected direction", () => {
    const item = run(collectionFixture(), createCollectionPolicy({ collectors: ["Saturn"], receptionDirection: "collector-receives-principals" })).collections[0]!;
    expect(item.status).toBe("rejected");
    expect(item.receptions.filter(row => row.required).map(row => [row.host, row.guest, row.dignities])).toEqual([
      ["Saturn", "Mars", []], ["Saturn", "Venus", ["domicile"]]
    ]);
    expect(item.checks.find(row => row.rule === "both-receptions")!.passed).toBe(false);
    expect(run(collectionFixture(), createCollectionPolicy({ collectors: ["Saturn"], receptionDignities: ["domicile"] })).collections[0]!.status).toBe("rejected");
    const disabled = run(collectionFixture(), createCollectionPolicy({ collectors: ["Saturn"], receptionDignities: [] })).collections[0]!;
    expect(disabled.status).toBe("collection-candidate");
    expect(disabled.checks.find(row => row.rule === "both-receptions")).toMatchObject({ enabled: false, passed: null });
  });
  it("keeps reception epoch at the question instead of inferring the later contact's dignity", () => {
    const law = collectionFixture({ Saturn: [t => 221 + t / 4, 0.25], Mars: [t => 215 + 1.25 * t, 1.25], Venus: [t => 286 - t, -1] });
    expect(run(law).collections[0]!.status).toBe("rejected"); // Venus term ends at Scorpio 11, excluded.
    expect(run(law).collections[0]!.receptions.find(row => row.host === "Venus" && row.guest === "Saturn")!.dignities).toEqual([]);
  });
  it("allows either arrival order and treats simultaneous contact as unresolved evidence", () => {
    const first = run(collectionFixture({ Mars: [t => 218 + 1.25 * t, 1.25] })).collections[0]!;
    expect(first).toMatchObject({ status: "collection-candidate", contactOrder: "querent-first", completion: { at: instant(4) } });
    const together = run(collectionFixture({ Mars: [t => 216 + 1.25 * t, 1.25] })).collections[0]!;
    expect(together).toMatchObject({ status: "requires-review", contactOrder: "coincident-or-unresolved", completion: null });
    expect(together.applications.map(row => row.contact!.at)).toEqual([instant(4), instant(4)]);
  });
  it("includes the future endpoint and distinguishes bounded absence from searching disabled", () => {
    expect(run(collectionFixture(), policy(), 6).collections[0]!.status).toBe("collection-candidate");
    expect(run(collectionFixture(), policy(), 5).collections[0]).toMatchObject({ status: "contact-not-found", completion: null });
    expect(run(collectionFixture(), policy(), 5).collections[0]!.applications[0]!.contact).toBeNull();
    const law = collectionFixture();
    const report = evaluateCollectionWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: ["conjunction", "sextile"], horizonDays: 8, search: false, orbs: { sextile: 6 } }), policy());
    expect(report.collections[0]!.status).toBe("search-disabled");
  });
  it("does not assign collection for exact, separating, stationary or out-of-orb branches", () => {
    for (const [law, speed] of [[(t: number) => 220 + 1.25 * t, 1.25], [(t: number) => 224 + 1.25 * t, 1.25],
      [(t: number) => 214 + t / 4, 0.25], [(t: number) => 200 + 1.25 * t, 1.25]] as const) {
      expect(run(collectionFixture({ Mars: [law, speed] })).assessment).toBe("no-current-pattern");
    }
  });
  it("reports conflicting current and future motion evidence for an unauthenticated provider", () => {
    const law = collectionFixture();
    const report = evaluateCollectionWith((body, at) => body === "Mars" ? 230 - (at.getTime() - Date.parse(instant(0))) / 86_400_000 : law.longitudeAt(body, at),
      law.fixture, aspects(), policy());
    expect(report.collections[0]!.status).toBe("requires-review");
    expect(report.collections[0]!.checks.find(row => row.rule === "converging-contacts")!.passed).toBe(false);
  });
  it("retains overlapping natural/Moon roles once and never creates self-collection for shared principals", () => {
    const law = collectionFixture();
    law.fixture = { ...law.fixture, input: { ...law.fixture.input, question: { ...law.fixture.input.question, naturalSignificators: ["Saturn"] } } };
    expect(run(law).collections[0]!.collector.roles).toEqual(["natural"]);
    expect(run(law).collections).toHaveLength(1);
    const moon = collectionFixture({ Moon: [t => 220 + t / 4, 0.25] });
    moon.fixture = { ...moon.fixture, input: { ...moon.fixture.input, question: { ...moon.fixture.input.question, naturalSignificators: ["Moon"] } } };
    const moonReport = run(moon, createCollectionPolicy({ collectors: ["Moon"], heavierPlanet: false }));
    expect(moonReport.collections[0]!.collector.roles).toEqual(["moon", "natural"]);
    expect(moonReport.collections[0]!.status).toBe("collection-candidate");
    const shared = collectionFixture();
    shared.fixture.chart.houses.cusps[1] = 20;
    let calls = 0;
    const report = evaluateCollectionWith(() => { calls++; return 0; }, shared.fixture, aspects(), policy());
    expect(report).toMatchObject({ assessment: "shared-principals", collections: [], contacts: [], search: { status: "not-needed", samples: 0 } });
    expect(calls).toBe(0);
    expect(run(collectionFixture(), createCollectionPolicy({ collectors: ["Mars", "Venus"] })).collections).toEqual([]);
  });
  it("disables collection, selections and each eligibility requirement independently", () => {
    const law = collectionFixture();
    law.fixture.chart.bodies = [];
    let calls = 0;
    const report = evaluateCollectionWith(() => { calls++; return 0; }, law.fixture, aspects(), createCollectionPolicy({ collectionOfLight: false }));
    expect(report).toMatchObject({ assessment: "disabled", collections: [], search: { status: "disabled", samples: 0 } });
    expect(calls).toBe(0);
    expect(run(law, createCollectionPolicy({ collectors: [] })).search.status).toBe("not-needed");
    expect(evaluateCollectionWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: [] }), policy()).assessment).toBe("no-current-pattern");
    const behold = collectionFixture({ Mars: [t => 219 + 1.25 * t, 1.25], Venus: [t => 284 - t, -1] }); // rulers 65 apart.
    expect(run(behold).collections[0]!.status).toBe("rejected");
    expect(run(behold, createCollectionPolicy({ collectors: ["Saturn"], principalsNotAspecting: false })).collections[0]!.status).toBe("collection-candidate");
    const light = collectionFixture({ Moon: [t => 220 + t / 4, 0.25] });
    expect(run(light, createCollectionPolicy({ collectors: ["Moon"] })).collections[0]!.status).toBe("rejected");
    expect(run(light, createCollectionPolicy({ collectors: ["Moon"], heavierPlanet: false })).collections[0]!.status).toBe("collection-candidate");
    const fast = collectionFixture({ Saturn: [t => 220 + 2 * t, 2], Mars: [t => 226 + t, 1], Venus: [t => 275 + 3 * t, 3] });
    expect(run(fast).collections[0]!.checks.find(row => row.rule === "slower-planet")!.passed).toBe(false);
    expect(run(fast, createCollectionPolicy({ collectors: ["Saturn"], slowerPlanet: false, principalsNotAspecting: false })).collections[0]!.status).toBe("collection-candidate");
  });
  it("handles every major directed branch with independently solved relative gaps", () => {
    for (const [type, angle] of [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]] as const) {
      for (const side of [1, -1]) {
        const law = collectionFixture({ Mars: [t => 220 + side * angle - 6 + 1.25 * t, 1.25],
          Venus: [t => 220 + side * angle - 4 + 1.25 * t, 1.25] });
        const report = evaluateCollectionWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: [type],
          orbs: { [type]: 8 }, horizonDays: 8 }), createCollectionPolicy({ collectors: ["Saturn"],
          principalsNotAspecting: false, receptionDignities: [] }));
        const item = report.collections[0]!;
        expect(item.status).toBe("collection-candidate");
        expect(item.applications.map(row => row.contact!.at)).toEqual([instant(6), instant(4)]);
        expect(item.applications.map(row => row.contact!.directedLongitude)).toEqual([
          side > 0 || angle === 0 || angle === 180 ? angle : 360 - angle,
          side > 0 || angle === 0 || angle === 180 ? angle : 360 - angle
        ]);
      }
    }
  });
  it("requires review for a future root within numerical question-time ordering resolution", () => {
    const law = collectionFixture({ Mars: [t => 220 - 1e-7 + 1.25 * t, 1.25] });
    const report = evaluateCollectionWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: ["conjunction", "sextile"],
      orbs: { sextile: 6 }, stepDays: 1, horizonDays: 8 }), createCollectionPolicy({ collectors: ["Saturn"], principalsNotAspecting: false }));
    const item = report.collections[0]!;
    expect(item.status).toBe("requires-review");
    expect(item.applications[0]!.contact).not.toBeNull();
    expect(item.applications[0]!.contact!.elapsedDays * 86_400_000).toBeLessThanOrEqual(2 * report.search.rootResolutionMs);
    expect(item.checks.find(row => row.rule === "converging-contacts")!.passed).toBeNull();
  });
  it("retains Moon's house-ruler and co-significator roles on one physical application", () => {
    const law = collectionFixture({ Moon: [t => 214 + 1.25 * t, 1.25] });
    law.fixture.chart.houses.cusps = [90, 120, 150, 180, 210, 240, 270, 300, 330, 0, 30, 60];
    law.fixture.chart.angles.asc = 95;
    law.fixture = { ...law.fixture, input: { ...law.fixture.input, question: { ...law.fixture.input.question, quesitedHouse: 11 } } };
    const item = run(law, createCollectionPolicy({ collectors: ["Saturn"], receptionDignities: [] })).collections[0]!;
    expect(item.status).toBe("collection-candidate");
    expect(item.applications[0]!.principal).toMatchObject({ planet: "Moon", roles: ["querent", "moon"] });
    expect(item.applications).toHaveLength(2);
  });
  it("returns a detached deeply frozen JSON report without mutating the chart", () => {
    const law = collectionFixture(), before = structuredClone(law.fixture), report = run(law);
    const frozen = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    };
    frozen(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(law.fixture).toEqual(before);
    law.fixture.chart.bodies.find(row => row.body === "Saturn")!.lon = 0;
    expect(report.collections[0]!.receptions[0]!.longitude).toBe(220);
  });
});
