import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import * as geometry from "../src/geometry.js";
import { CRESCENT_SEARCH_LIMITS, crescentEvents } from "../src/index.js";
import type { CrescentSearchPolicy } from "../src/index.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const FROM = "2024-06-01";
const TO = "2024-07-11";
const POLICY = { model: "yallop-1997/1", lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening" } as const;
// Engine results only supply integration/fault-injection scaffolding. No
// astronomical date or criterion expectation is taken from these results.
const support = crescentEvents(SITE, FROM, TO, POLICY);
if (support.status !== "complete") throw new Error("Expected integration support to complete");
afterEach(() => vi.restoreAllMocks());

function reuseHorizons() {
  return vi.spyOn(engine, "horizonEvents").mockImplementation((body) => {
    const result = body === "Sun" ? support.horizons.sun : support.horizons.moon;
    if (!result) throw new Error("Missing integration horizon support");
    return result;
  });
}

describe("crescent search engine integration", () => {
  it("returns bracketed evening and explicitly extended morning results with original position receipts", () => {
    expect(support.events.some((event) => event.appearance === "first-evening")).toBe(true);
    expect(support.events.some((event) => event.appearance === "last-morning")).toBe(true);
    expect(support.samples).toBe(support.horizons.sun!.samples + support.horizons.moon!.samples);
    expect(support.geometrySamples).toBe(support.opportunities.filter((row) => row.status === "evaluated").length);
    expect(support.geometrySamples).toBeLessThanOrEqual(support.maxGeometrySamples);
    for (const result of [support.horizons.sun, support.horizons.moon]) {
      expect(result).toMatchObject({ status: "complete", conventions: { limb: "upper", refraction: "standard", refractionArcmin: 34 } });
    }
    for (const event of support.events) {
      const first = event.appearance === "first-evening";
      expect(event.bracket.before.passesSelection).toBe(!first);
      expect(event.bracket.after.passesSelection).toBe(first);
      expect(event.interpretation).toBe(first ? "evening-criterion" : "morning-symmetry-extension");
      const passing = first ? event.bracket.after : event.bracket.before;
      if (passing.status !== "evaluated") throw new Error("Passing row must be evaluated");
      expect(event.at).toBe(passing.bestTime.at);
      expect(event.at >= event.bracket.from && event.at <= event.bracket.to).toBe(true);
      expect(passing.geometry.at).toBe(event.at);
      for (const pair of [passing.geometry.geocentric, passing.geometry.topocentric]) {
        for (const body of [pair.sun, pair.target]) {
          expect(body.equatorial.receipt.schema).toBe("zodiacs.calc-receipt.v1");
          expect(body.equatorial.receipt.instants[0]!.utc).toBe(event.at);
        }
      }
      expect(event.policy).toBe(support.policy);
      expect(event.modelParameters).toBe(support.modelParameters);
      expect(passing.criterion.parameters).toBe(support.modelParameters);
      expect(passing.criterionGeometry.conventions.widthApproximation).toContain("distant-sun");
      expect(event.receiptScope).toBe("positions");
      expect(Object.isFrozen(event.bracket)).toBe(true);
    }
    expect(Object.isFrozen(support.policy.acceptedCategories)).toBe(true);
    expect(Object.isFrozen(support.events)).toBe(true);
    expect(Object.isFrozen(support.opportunities)).toBe(true);
  });

  it("supports Odeh with its own category selection and no implicit morning timing", () => {
    reuseHorizons();
    const result = crescentEvents(SITE, FROM, TO, { model: "odeh-2006/1", lastAcceptedCategory: "C", maxElongationDeg: 30 });
    expect(result.status).toBe("complete");
    expect(result.policy.acceptedCategories).toEqual(["A", "B", "C"]);
    expect(result.policy.morningTiming).toBe("disabled");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.opportunities.every((row) => row.period === "evening")).toBe(true);
    expect(result.diagnostics.some((row) => row.code === "morning-symmetry-extension")).toBe(false);
    for (const row of result.opportunities) {
      if (row.status !== "evaluated") continue;
      expect(row.criterion.model).toBe("odeh-2006/1");
      expect(row.criterion.sample).toEqual(row.criterionGeometry.odeh);
      expect(row.criterion.crescentWidthArcmin).toBe(row.criterionGeometry.crescentWidthTopocentricArcmin);
    }
  });

  it("delegates upper-limb standard horizon searches with a shared remaining budget", () => {
    const horizon = reuseHorizons();
    const result = crescentEvents(SITE, FROM, TO, POLICY, { maxSamples: 123_456 });
    expect(result.status).toBe("complete");
    expect(horizon).toHaveBeenCalledTimes(2);
    expect(horizon.mock.calls[0]![4]).toEqual({ limb: "upper", refraction: "standard", maxSamples: 123_456 });
    expect(horizon.mock.calls[1]![4]).toEqual({
      limb: "upper", refraction: "standard", maxSamples: 123_456 - support.horizons.sun!.samples
    });
    expect(result.horizons.sun).toBe(support.horizons.sun);
    expect(result.horizons.moon).toBe(support.horizons.moon);
  });

  it.each([80, -80])("retains explicit missing solar crossings in polar conditions at %s degrees", (latitude) => {
    const result = crescentEvents({ latitude, longitude: 0 }, "2024-06-20", "2024-06-23", POLICY);
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((row) => row.status === "unavailable" && row.reason === "missing-sun-crossing")).toBe(true);
    expect(result.diagnostics.some((row) => row.code === "opportunity-gap")).toBe(true);
    expect(result.geometrySamples).toBe(0);
  });

  it("captures caller selection before engine calls", () => {
    const policy = { ...POLICY, maxElongationDeg: 30 };
    const original = reuseHorizons().getMockImplementation()!;
    vi.mocked(engine.horizonEvents).mockImplementation((...args) => {
      policy.maxElongationDeg = 1;
      return original(...args);
    });
    const result = crescentEvents(SITE, FROM, TO, policy);
    expect(result.policy.maxElongationDeg).toBe(30);
    expect(result.policy).not.toBe(policy);
  });
});

describe("crescent search bounded failures", () => {
  it.each([
    [SITE, "2024-01-01", "2025-01-02", "range-budget"],
    [SITE, "1800-01-02", "1800-01-03", "support-outside-reference-span"],
    [SITE, "2199-12-29", "2199-12-30", "support-outside-reference-span"],
    [{ latitude: 90, longitude: 0 }, FROM, TO, "geographic-pole"],
    [{ latitude: -90, longitude: 0 }, FROM, TO, "geographic-pole"]
  ] as const)("refuses before sky work: %j %s to %s (%s)", (site, from, to, reason) => {
    const horizon = vi.spyOn(engine, "horizonEvents");
    const result = crescentEvents(site, from, to, POLICY);
    expect(result).toMatchObject({ status: "refused", reason, samples: 0, geometrySamples: 0, events: [], opportunities: [] });
    expect(horizon).not.toHaveBeenCalled();
  });

  it("propagates a real sky sample-budget refusal", () => {
    const result = crescentEvents(SITE, FROM, TO, POLICY, { maxSamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", geometrySamples: 0, events: [], opportunities: [] });
    expect(result.horizons.sun?.status).toBe("refused");
    expect(result.horizons.moon).toBeNull();
  });

  it("refuses the whole result when the second horizon search exhausts its budget", () => {
    const horizon = reuseHorizons();
    const moon = support.horizons.moon!;
    horizon.mockImplementation((body) => body === "Sun" ? support.horizons.sun! : {
      ...moon, status: "refused", reason: "sample-budget", events: []
    });
    const result = crescentEvents(SITE, FROM, TO, POLICY);
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", geometrySamples: 0, events: [], opportunities: [] });
    expect(result.horizons.moon?.status).toBe("refused");
  });

  it("preflights geometry budget and never returns a prefix", () => {
    reuseHorizons();
    const positions = vi.spyOn(geometry, "sunBodyGeometry");
    const result = crescentEvents(SITE, FROM, TO, POLICY, { maxGeometrySamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "geometry-budget", geometrySamples: 0, events: [], opportunities: [] });
    expect(positions).not.toHaveBeenCalled();
    expect(CRESCENT_SEARCH_LIMITS.defaultMaxGeometrySamples).toBeGreaterThan(support.geometrySamples);
  });

  it("discards already evaluated opportunities when later geometry refuses", () => {
    reuseHorizons();
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic geometry failure" };
    const original = geometry.sunBodyGeometry;
    let calls = 0;
    vi.spyOn(geometry, "sunBodyGeometry").mockImplementation((...args) => ++calls === 2 ? refusal : original(...args));
    const result = crescentEvents(SITE, FROM, TO, POLICY);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", geometrySamples: 2, events: [], opportunities: [] });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.positionRefusal).toBe(refusal);
  });

  it("preserves a failed horizon position receipt", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic receipt failure" };
    const moon = support.horizons.moon!;
    if (moon.status !== "complete") throw new Error("Expected Moon support");
    reuseHorizons().mockImplementation((body) => body === "Sun" ? support.horizons.sun! : {
      ...moon, events: [{ ...moon.events[0]!, position: refusal }, ...moon.events.slice(1)]
    });
    const result = crescentEvents(SITE, FROM, TO, POLICY);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", geometrySamples: 0, events: [], opportunities: [] });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.positionRefusal).toBe(refusal);
  });

  it("refuses to treat a broken transit sequence as complete", () => {
    const sun = support.horizons.sun!;
    if (sun.status !== "complete") throw new Error("Expected Sun support");
    reuseHorizons().mockImplementation((body) => body === "Moon" ? support.horizons.moon! : {
      ...sun, events: sun.events.filter((event) => event.kind !== "lower-transit")
    });
    const result = crescentEvents(SITE, FROM, TO, POLICY);
    expect(result).toMatchObject({ status: "unresolved", reason: "event-sequence", geometrySamples: 0, events: [], opportunities: [] });
  });
});

describe("strict crescent policy and options", () => {
  it.each([
    undefined, null, [], {}, { ...POLICY, model: "yallop" },
    { ...POLICY, lastAcceptedCategory: "E" }, { ...POLICY, lastAcceptedCategory: null },
    { ...POLICY, model: "odeh-2006/1", lastAcceptedCategory: "D" },
    { ...POLICY, maxElongationDeg: undefined }, { ...POLICY, maxElongationDeg: 0 },
    { ...POLICY, maxElongationDeg: -1 }, { ...POLICY, maxElongationDeg: 91 },
    { ...POLICY, maxElongationDeg: NaN }, { ...POLICY, maxElongationDeg: Infinity },
    { ...POLICY, maxElongationDeg: "30" }, { ...POLICY, morningTiming: null },
    { ...POLICY, morningTiming: "automatic" }, { ...POLICY, extinction: 0.2 },
    { ...POLICY, minMoonAltitudeDeg: 1 }, { ...POLICY, magnitudeLimit: 5 }
  ])("rejects invalid selection before engine work %j", (policy) => {
    const horizon = vi.spyOn(engine, "horizonEvents");
    expect(() => crescentEvents(SITE, FROM, TO, policy as CrescentSearchPolicy)).toThrow(RangeError);
    expect(horizon).not.toHaveBeenCalled();
  });

  it.each([
    null, [], { unknown: 1 }, { maxSamples: 0 }, { maxSamples: Infinity },
    { maxSamples: null }, { maxSamples: 1.5 }, { maxGeometrySamples: -1 },
    { maxGeometrySamples: null }, { maxGeometrySamples: Infinity }, { maxGeometrySamples: 1.5 },
    { maxGeometrySamples: Number.MAX_SAFE_INTEGER + 1 }
  ])("rejects invalid options before engine work %j", (options) => {
    const horizon = vi.spyOn(engine, "horizonEvents");
    expect(() => crescentEvents(SITE, FROM, TO, POLICY, options as never)).toThrow(RangeError);
    expect(horizon).not.toHaveBeenCalled();
  });
});
