import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal } from "../../src/calc.js";
import { HORIZON_PHENOMENA, HORIZON_TERMINOLOGY, VISIBILITY_BODIES, horizonPhenomena } from "../src/index.js";
import type { HorizonPhenomenaOptions } from "../src/index.js";
import * as windows from "../src/windows.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const FROM = "2001-02-03";
const TO = "2001-02-06";
afterEach(() => vi.restoreAllMocks());

// These tests check engine delegation, result integrity and failure propagation.
// They use no pinned engine output and are not independent accuracy evidence.
describe("geometric horizon phenomena integration", () => {
  it("retains lunar order reversals, original position receipts and null event epochs", () => {
    const result = horizonPhenomena("Moon", SITE, "2001-02-01", "2001-03-15");
    expect(result.status).toBe("complete");
    expect(new Set(result.events.map((event) => event.kind))).toEqual(new Set(HORIZON_PHENOMENA));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.opportunities)).toBe(true);
    for (const event of result.events) {
      expect(event.at).toBeNull();
      expect(event.bracket.kind).toBe("successive-horizon-pairs");
      expect(event.terminology).toBe(HORIZON_TERMINOLOGY);
      expect(event.receiptScope).toBe("event-positions");
      const { before, after } = event.bracket;
      expect(Math.sign(before.lagMilliseconds)).toBe(-Math.sign(after.lagMilliseconds));
      expect(Date.parse(event.bracket.from)).toBeGreaterThanOrEqual(Date.parse(result.from));
      expect(Date.parse(event.bracket.to)).toBeLessThan(Date.parse(result.to));
      for (const row of [before, after]) {
        expect(row.lagMilliseconds).toBe(row.targetCrossing.at.getTime() - row.sunCrossing.at.getTime());
        expect(row.sunCrossing.kind).toBe(event.sunKind);
        expect(row.targetCrossing.kind).toBe(event.targetKind);
        expect(result.observing.horizons.sun?.events).toContain(row.sunCrossing);
        expect(result.observing.horizons.target?.events).toContain(row.targetCrossing);
        for (const crossing of [row.sunCrossing, row.targetCrossing]) {
          expect(crossing.position.status).toBe("ok");
          if (crossing.position.status !== "ok") throw new Error("Expected a position");
          expect(crossing.position.receipt.engine.name).toBe("@zodiacs/engine");
        }
      }
    }
  });

  it.each(VISIBILITY_BODIES)("accepts %s and delegates airless centre crossings", (body) => {
    const result = horizonPhenomena(body, SITE, FROM, TO);
    expect(result.status).toBe("complete");
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.kinds).toEqual(HORIZON_PHENOMENA);
    for (const search of [result.observing.horizons.sun, result.observing.horizons.target]) {
      expect(search?.conventions).toEqual({ limb: "centre", refraction: "none", refractionArcmin: 0 });
    }
    for (const row of result.opportunities) {
      expect(row).toMatchObject(HORIZON_TERMINOLOGY.definitions[row.kind]);
    }
  });

  it.each(["2024-06-20", "2024-12-20"])("keeps missing Sun crossings at polar date %s as gaps", (date) => {
    const result = horizonPhenomena("Moon", { latitude: 80, longitude: 0 }, date, Date.parse(date) + 3 * 86_400_000);
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((row) => row.status === "unavailable" && row.reason === "missing-sun-crossing")).toBe(true);
  });

  it("snapshots kind selection, canonicalizes its order and shares the existing sky budget", () => {
    const support = windows.observingWindows("Moon", SITE, FROM, TO);
    const kinds: (typeof HORIZON_PHENOMENA)[number][] = ["acronychal-setting", "cosmical-rising"];
    const spy = vi.spyOn(windows, "observingWindows").mockImplementation(() => {
      kinds.splice(0, kinds.length, "cosmical-setting");
      return support;
    });
    const result = horizonPhenomena("Moon", SITE, FROM, TO, { kinds, maxSamples: 20_000 });
    expect(result.kinds).toEqual(["cosmical-rising", "acronychal-setting"]);
    expect(result.opportunities.every((row) => result.kinds.includes(row.kind))).toBe(true);
    expect(Object.isFrozen(result.kinds)).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![4]).toEqual({ maxSamples: 20_000 });
  });
});

describe("horizon phenomena refusals", () => {
  it.each([
    [SITE, FROM, "2002-02-05", {}, "range-budget"],
    [{ latitude: 90, longitude: 0 }, FROM, TO, {}, "geographic-pole"],
    [SITE, "1800-01-01", "1800-01-02", {}, "support-outside-reference-span"],
    [SITE, FROM, TO, { maxSamples: 1 }, "sample-budget"]
  ] as const)("propagates bounded support refusal %s %s", (site, from, to, options, reason) => {
    const result = horizonPhenomena("Venus", site, from, to, options);
    expect(result).toMatchObject({ status: "refused", reason, events: [], opportunities: [] });
  });

  it("preserves engine refusal identity and unresolved support without partial events", () => {
    const support = windows.observingWindows("Moon", SITE, FROM, TO);
    const positionRefusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic refusal" };
    const refused = { ...support, status: "refused", reason: "engine-position", positionRefusal, windows: [] } as const;
    const spy = vi.spyOn(windows, "observingWindows").mockReturnValue(refused);
    const result = horizonPhenomena("Moon", SITE, FROM, TO);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", events: [], opportunities: [] });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.positionRefusal).toBe(positionRefusal);
    expect(result.observing).toBe(refused);
    const unresolved = { ...support, status: "unresolved", reason: "event-sequence", detail: "Synthetic sequence gap", windows: [] } as const;
    spy.mockReturnValue(unresolved);
    expect(horizonPhenomena("Moon", SITE, FROM, TO)).toMatchObject({
      status: "unresolved", reason: "event-sequence", detail: unresolved.detail, events: [], opportunities: []
    });
    if (support.status !== "complete") throw new Error("Expected complete support");
    spy.mockReturnValue({ ...support, horizons: { sun: null, target: null } });
    expect(horizonPhenomena("Moon", SITE, FROM, TO)).toMatchObject({ status: "unresolved", events: [], opportunities: [] });
    const sun = support.horizons.sun;
    if (sun?.status !== "complete") throw new Error("Expected Sun events");
    spy.mockReturnValue({ ...support, horizons: { ...support.horizons, sun: { ...sun, events: [] } } });
    expect(horizonPhenomena("Moon", SITE, FROM, TO)).toMatchObject({ status: "unresolved", events: [], opportunities: [] });
  });

  it.each([
    null, { kinds: [] }, { kinds: null }, { kinds: "cosmical-rising" }, { kinds: ["cosmic-rising"] },
    { kinds: ["cosmical-rising", "cosmical-rising"] }, { kinds: new Array(1) },
    { kinds: Array(5).fill("cosmical-rising") }, { refraction: "standard" }, { model: "visible" }
  ])("rejects unsupported options before engine work: %j", (options) => {
    const spy = vi.spyOn(windows, "observingWindows");
    expect(() => horizonPhenomena("Moon", SITE, FROM, TO, options as HorizonPhenomenaOptions)).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses accessor kind slots without executing them", () => {
    const getter = vi.fn(() => "cosmical-rising");
    const kinds = Object.defineProperty(new Array(1), "0", { get: getter });
    expect(() => horizonPhenomena("Moon", SITE, FROM, TO, { kinds })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "5"])("refuses invalid budget %s", (value) => {
    expect(() => horizonPhenomena("Moon", SITE, FROM, TO, { maxSamples: value as number })).toThrow(RangeError);
  });

  it("validates body, observer and range before support searches", () => {
    const spy = vi.spyOn(windows, "observingWindows");
    expect(() => horizonPhenomena("Sun" as "Moon", SITE, FROM, TO)).toThrow(RangeError);
    expect(() => horizonPhenomena("Moon", { latitude: NaN, longitude: 0 }, FROM, TO)).toThrow(RangeError);
    expect(() => horizonPhenomena("Moon", SITE, FROM, FROM)).toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });
});
