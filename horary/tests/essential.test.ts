import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import {
  createEssentialPolicy, DEFAULT_ESSENTIAL_WEIGHTS, ESSENTIAL_SCORE_RULES,
  evaluateEssentialCondition, normalizeHoraryInput
} from "../src/index.js";
import type { ClassicalPlanet, EssentialPolicyInput, HoraryCast, HoraryEssentialPolicy } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

// All expectations below come from the published tables and arithmetic
// detailed in fixtures.md. These schematic positions are not an ephemeris.
function fixture(overrides: Partial<Record<ClassicalPlanet, number>> = {}, asc = 15): HoraryCast {
  const chart = schematicChart();
  chart.angles!.asc = asc;
  for (const row of chart.bodies) row.lon = overrides[row.body as ClassicalPlanet] ?? row.lon;
  return {
    schema: "horary.cast/v1",
    input: normalizeHoraryInput({ ...questionInput, houseSystem: "whole", question: {
      id: "essential-schematic", quesitedHouse: 2,
      naturalSignificators: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]
    } }),
    chart: { ...chart, houses: chart.houses!, angles: chart.angles! }
  };
}

describe("sourced configurable essential policy", () => {
  it("defaults to the independently transcribed Lilly weights and all reception dignities", () => {
    expect(DEFAULT_ESSENTIAL_WEIGHTS).toEqual({ domicile: 5, exaltation: 4, triplicity: 3, term: 2,
      face: 1, detriment: -5, fall: -4, peregrine: -5 });
    expect(createEssentialPolicy()).toEqual({ schema: "horary.essential-policy/v1",
      weights: DEFAULT_ESSENTIAL_WEIGHTS, receptionDignities: ["domicile", "exaltation", "triplicity", "term", "face"] });
  });

  it.each(ESSENTIAL_SCORE_RULES)("disables the %s score independently of condition facts", (rule) => {
    const policy = createEssentialPolicy({ weights: { [rule]: false } });
    const report = evaluateEssentialCondition(fixture({ Sun: 200 }), policy);
    for (const row of report.conditions) {
      expect(row.contributions.find((item) => item.rule === rule)).toMatchObject({ status: "disabled", points: 0, weight: false });
    }
    for (const other of ESSENTIAL_SCORE_RULES.filter((id) => id !== rule)) {
      expect(policy.weights[other]).toBe(DEFAULT_ESSENTIAL_WEIGHTS[other]);
    }
  });

  it("canonicalizes reception selection and snapshots caller options", () => {
    const input: { weights: { domicile: number }; receptionDignities: ("face" | "domicile")[] } = {
      weights: { domicile: 2.5 }, receptionDignities: ["face", "domicile", "face"]
    };
    const policy = createEssentialPolicy(input);
    input.weights.domicile = 100;
    input.receptionDignities.length = 0;
    expect(policy.weights.domicile).toBe(2.5);
    expect(policy.receptionDignities).toEqual(["domicile", "face"]);
    expect(Object.isFrozen(policy.weights)).toBe(true);
    expect(Object.isFrozen(policy.receptionDignities)).toBe(true);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it.each([null, [], true, { unknown: 1 }, { weights: null }, { weights: [] },
    { weights: { domicle: 5 } }, { weights: { domicile: undefined } }, { weights: { domicile: true } },
    { weights: { face: NaN } }, { weights: { fall: Infinity } }, { weights: { [Symbol("x")]: 2 } },
    { receptionDignities: null }, { receptionDignities: "domicile" }, { receptionDignities: ["fall"] },
    { receptionDignities: Array(1) }])("rejects malformed policy %j", (input) => {
    expect(() => createEssentialPolicy(input as EssentialPolicyInput)).toThrow(RangeError);
  });

  it("revalidates JSON-restored policies and refuses incomplete snapshots", () => {
    const policy = createEssentialPolicy({ weights: { peregrine: false }, receptionDignities: [] });
    const restored = JSON.parse(JSON.stringify(policy)) as HoraryEssentialPolicy;
    expect(evaluateEssentialCondition(fixture(), restored).policy).toEqual(policy);
    for (const malformed of [null, { ...policy, schema: "unknown" }, { ...policy, extra: true },
      { ...policy, weights: { domicile: 5 } }, { ...policy, receptionDignities: undefined }]) {
      expect(() => evaluateEssentialCondition(fixture(), malformed as HoraryEssentialPolicy)).toThrow(RangeError);
    }
  });
});

describe("essential condition and own-position scores", () => {
  it.each([
    ["Mercury", 150, "day", ["domicile", "exaltation", "term"], [], false, 11],
    ["Mercury", 60, "night", ["domicile", "triplicity", "term"], [], false, 10],
    ["Saturn", 10, "day", [], ["fall"], true, -9],
    ["Saturn", 25, "day", ["term"], ["fall"], false, -2],
    ["Mars", 35, "day", [], ["detriment"], true, -10],
    ["Venus", 150, "day", ["triplicity"], ["fall"], false, -1],
    ["Mercury", 330, "day", [], ["detriment", "fall"], true, -14],
    ["Moon", 40, "night", ["exaltation", "triplicity", "face"], [], false, 8],
    ["Jupiter", 10, "night", ["triplicity"], [], false, 3],
    ["Moon", 215, "night", [], ["fall"], true, -9]
  ] as const)("derives %s at %s degrees in %s sect", (planet, lon, sect, dignities, debilities, peregrine, score) => {
    const report = evaluateEssentialCondition(fixture({ Sun: sect === "day" ? 200 : 100, [planet]: lon }));
    expect(report.sect.value).toBe(sect);
    expect(report.conditions.find((row) => row.planet === planet)).toMatchObject({ lon, sect, dignities, debilities, peregrine, score });
  });

  it.each([
    [6 - 2 ** -40, false], [6, true], [12 - 2 ** -40, true], [12, false]
  ])("uses half-open Egyptian Venus terms in Aries at %s", (lon, present) => {
    const venus = evaluateEssentialCondition(fixture({ Venus: lon, Sun: 200 })).conditions.find((row) => row.planet === "Venus")!;
    expect(venus.dignities.includes("term")).toBe(present);
  });

  it.each([[0, true], [10 - 2 ** -40, true], [10, false], [30, false]])(
    "uses half-open first Aries face for Mars at %s", (lon, present) => {
      const mars = evaluateEssentialCondition(fixture({ Mars: lon, Sun: 200 })).conditions.find((row) => row.planet === "Mars")!;
      expect(mars.dignities.includes("face")).toBe(present);
    }
  );

  it.each([[15, "night"], [195 - 2 ** -40, "night"], [195, "day"], [360 - 2 ** -40, "day"],
    [0, "day"]] as const)("derives sect from Sun %s with Ascendant fifteen", (sun, sect) => {
    expect(evaluateEssentialCondition(fixture({ Sun: sun })).sect).toMatchObject({ value: sect, ascendant: 15, sunLongitude: sun });
  });

  it("counts simultaneous dignities, supports signed fractional caller weights and records each contribution", () => {
    const report = evaluateEssentialCondition(fixture({ Mercury: 150, Sun: 200 }),
      createEssentialPolicy({ weights: { domicile: 2.5, exaltation: 0, term: false } }));
    const mercury = report.conditions.find((row) => row.planet === "Mercury")!;
    expect(mercury.dignities).toEqual(["domicile", "exaltation", "term"]);
    expect(mercury.score).toBe(2.5);
    expect(mercury.contributions.find(({ rule }) => rule === "exaltation")).toMatchObject({ present: true, status: "applied", points: 0 });
    expect(mercury.contributions.find(({ rule }) => rule === "term")).toMatchObject({ present: true, status: "disabled" });
    expect(mercury.contributions.find(({ rule }) => rule === "domicile")).toMatchObject({
      weightOrigin: "caller-override", points: 2.5, source: { id: "lilly-essential-weights", locator: expect.stringContaining("p. 115") }
    });
    const negative = evaluateEssentialCondition(fixture({ Mercury: 150, Sun: 200 }),
      createEssentialPolicy({ weights: { domicile: -2.5 } }));
    expect(negative.conditions.find((row) => row.planet === "Mercury")!.score).toBe(3.5);
    expect(() => evaluateEssentialCondition(fixture({ Mercury: 150, Sun: 200 }),
      createEssentialPolicy({ weights: { domicile: Number.MAX_VALUE, exaltation: Number.MAX_VALUE } }))).toThrow(RangeError);
  });

  it("does not change peregrine status when the caller disables its penalty", () => {
    const saturn = evaluateEssentialCondition(fixture({ Saturn: 10, Sun: 200 }),
      createEssentialPolicy({ weights: { peregrine: false } })).conditions.find((row) => row.planet === "Saturn")!;
    expect(saturn).toMatchObject({ peregrine: true, debilities: ["fall"], score: -4 });
  });
});

describe("directional and mutual reception", () => {
  it("labels the host at the guest longitude and reports both directions of mutual domicile", () => {
    const report = evaluateEssentialCondition(fixture({ Mars: 40, Venus: 10, Sun: 200 }),
      createEssentialPolicy({ receptionDignities: ["domicile"] }));
    expect(report.directionalReceptions.find(({ host, guest }) => host === "Mars" && guest === "Venus")).toMatchObject({
      guestLongitude: 10, guestSign: "aries", dignities: ["domicile"], status: "received",
      explanation: expect.stringContaining("Mars receives Venus by domicile")
    });
    expect(report.directionalReceptions.find(({ host, guest }) => host === "Venus" && guest === "Mars")).toMatchObject({
      guestLongitude: 40, guestSign: "taurus", dignities: ["domicile"], status: "received"
    });
    expect(report.mutualReceptions).toContainEqual(expect.objectContaining({
      a: "Venus", b: "Mars", aReceivesB: ["domicile"], bReceivesA: ["domicile"]
    }));
    // Mars is peregrine and in detriment. Venus has her own Aries term,
    // contributing +2 against detriment -5, so she is not peregrine.
    expect(report.conditions.find(({ planet }) => planet === "Mars")!.score).toBe(-10);
    expect(report.conditions.find(({ planet }) => planet === "Venus")!.score).toBe(-3);
  });

  it("reports one-way hosting without inventing mutual reception", () => {
    const report = evaluateEssentialCondition(fixture({ Venus: 10, Mars: 130 }), createEssentialPolicy({ receptionDignities: ["domicile"] }));
    expect(report.directionalReceptions.find(({ host, guest }) => host === "Mars" && guest === "Venus")!.dignities).toEqual(["domicile"]);
    expect(report.directionalReceptions.find(({ host, guest }) => host === "Venus" && guest === "Mars")!.status).toBe("not-received");
    expect(report.mutualReceptions.some(({ a, b }) => a === "Venus" && b === "Mars")).toBe(false);
  });

  it("permits mixed domicile/exaltation and retains every selected hosting dignity", () => {
    const report = evaluateEssentialCondition(fixture({ Sun: 300, Saturn: 10 }, 110));
    expect(report.sect.value).toBe("day");
    expect(report.mutualReceptions).toContainEqual(expect.objectContaining({
      a: "Sun", b: "Saturn", aReceivesB: ["exaltation", "triplicity", "face"], bReceivesA: ["domicile", "triplicity"]
    }));
    const restricted = evaluateEssentialCondition(fixture({ Sun: 300, Saturn: 10 }, 110),
      createEssentialPolicy({ receptionDignities: ["domicile"] }));
    expect(restricted.mutualReceptions.some(({ a, b }) => a === "Sun" && b === "Saturn")).toBe(false);
  });

  it("distinguishes day and night triplicity hosting and excludes the participating lord", () => {
    const day = evaluateEssentialCondition(fixture({ Sun: 40, Venus: 10 }, 200), createEssentialPolicy({ receptionDignities: ["triplicity"] }));
    const night = evaluateEssentialCondition(fixture({ Sun: 40, Venus: 10 }, 15), createEssentialPolicy({ receptionDignities: ["triplicity"] }));
    expect(day.mutualReceptions).toContainEqual(expect.objectContaining({ a: "Sun", b: "Venus",
      aReceivesB: ["triplicity"], bReceivesA: ["triplicity"] }));
    expect(night.mutualReceptions.some(({ a, b }) => a === "Sun" && b === "Venus")).toBe(false);
    expect(night.directionalReceptions.find(({ host, guest }) => host === "Saturn" && guest === "Venus")!.dignities).toEqual([]);
  });

  it("uses Egyptian term reception with half-open boundaries", () => {
    const policy = createEssentialPolicy({ receptionDignities: ["term"] });
    const report = evaluateEssentialCondition(fixture({ Venus: 23, Mars: 75 }), policy);
    expect(report.mutualReceptions).toContainEqual(expect.objectContaining({
      a: "Venus", b: "Mars", aReceivesB: ["term"], bReceivesA: ["term"]
    }));
    const boundary = evaluateEssentialCondition(fixture({ Venus: 25, Mars: 75 }), policy);
    expect(boundary.directionalReceptions.find(({ host, guest }) => host === "Mars" && guest === "Venus")!.dignities).toEqual([]);
  });

  it("disables all receptions without running the mutual reception API", () => {
    const spy = vi.spyOn(engine, "mutualReceptions");
    try {
      const report = evaluateEssentialCondition(fixture(), createEssentialPolicy({ receptionDignities: [] }));
      expect(spy).not.toHaveBeenCalled();
      expect(report.mutualReceptions).toEqual([]);
      expect(report.directionalReceptions.every(({ status, dignities }) => status === "disabled" && dignities.length === 0)).toBe(true);
      expect(report.conditions.length).toBeGreaterThan(0);
    } finally { spy.mockRestore(); }
  });

  it("groups shared roles once and never creates self-reception", () => {
    const result = { ...fixture({ Moon: 40 }),
      input: normalizeHoraryInput({ ...questionInput, question: { id: "moon-only", quesitedHouse: 1, naturalSignificators: ["Moon"] } }) };
    result.chart.houses.cusps[0] = 90;
    const report = evaluateEssentialCondition(result);
    expect(report.conditions).toHaveLength(1);
    expect(report.conditions[0]).toMatchObject({ planet: "Moon", roles: ["querent", "quesited", "moon", "natural"] });
    expect(report.directionalReceptions).toEqual([]);
    expect(report.mutualReceptions).toEqual([]);
  });
});

describe("chart boundary and ownership", () => {
  it.each([NaN, Infinity, -1, 360, "10", null, undefined])("refuses noncanonical required longitude %s", (lon) => {
    const result = fixture();
    result.chart.bodies[0]!.lon = lon as number;
    expect(() => evaluateEssentialCondition(result)).toThrow(RangeError);
    const angle = fixture();
    angle.chart.angles.asc = lon as number;
    expect(() => evaluateEssentialCondition(angle)).toThrow(RangeError);
  });

  it("rejects missing and duplicate required rows and missing geometry", () => {
    for (const planet of ["Sun", "Mars", "Moon"] as const) {
      const missing = fixture();
      missing.chart.bodies = missing.chart.bodies.filter(({ body }) => body !== planet);
      expect(() => evaluateEssentialCondition(missing)).toThrow(RangeError);
      const duplicate = fixture();
      duplicate.chart.bodies.push({ ...duplicate.chart.bodies.find(({ body }) => body === planet)! });
      expect(() => evaluateEssentialCondition(duplicate)).toThrow(RangeError);
    }
    expect(() => evaluateEssentialCondition(null as unknown as HoraryCast)).toThrow(RangeError);
    const missing = fixture();
    missing.chart.angles = null as unknown as typeof missing.chart.angles;
    expect(() => evaluateEssentialCondition(missing)).toThrow(RangeError);
  });

  it("ignores unused body fields and unselected rows without trusting sign annotations", () => {
    const result = fixture({ Sun: 200 });
    // M5 uses longitude, not annotations, speeds, retrograde or latitude.
    const mercury = result.chart.bodies.find(({ body }) => body === "Mercury")!;
    mercury.lon = 150;
    mercury.sign = "pisces";
    mercury.speed = NaN;
    expect(evaluateEssentialCondition(result).conditions.find(({ planet }) => planet === "Mercury")).toMatchObject({ sign: "virgo", score: 11 });
    const selected = { ...result, input: normalizeHoraryInput(questionInput) };
    selected.chart.bodies = selected.chart.bodies.filter(({ body }) => body !== "Mercury");
    expect(() => evaluateEssentialCondition(selected)).not.toThrow();
  });

  it("returns deeply frozen JSON-friendly snapshots and does not mutate the cast", () => {
    const result = fixture({ Sun: 200 });
    const before = structuredClone(result);
    const report = evaluateEssentialCondition(result);
    expect(result).toEqual(before);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    function frozen(value: unknown): void {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) frozen(child);
      }
    }
    frozen(report);
    result.chart.bodies.find(({ body }) => body === "Mars")!.lon = 0;
    expect(report.conditions[0]!.lon).toBe(130);
    expect(Object.isFrozen(result.chart.bodies)).toBe(false);
  });
});
