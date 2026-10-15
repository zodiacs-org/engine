import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import * as ephemeris from "../../src/ephemeris.js";
import * as returns from "../../src/returns.js";
import { normalizeLongitude } from "../../src/signs.js";
import * as ingressSearch from "../src/ingresses.js";
import * as lunationSearch from "../src/lunations.js";
import { searchIngresses, searchLunations, searchMundaneReport } from "../src/index.js";
import type { MundaneReportOptions, MundaneRequest } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const epoch = Date.parse("2000-01-01T00:00:00Z");
const DAY = 86_400_000;
const atDay = (day: number) => new Date(epoch + day * DAY).toISOString();
afterEach(() => vi.restoreAllMocks());

// Hand-defined Sun = d and Moon = 13d modulo 360, where d is elapsed
// days from epoch. Ingresses are d = 90k; New Moons d = 30k; Full Moons
// d = 15 + 30k. At day 90, Cancer and a New Moon coincide exactly.
// These are synthetic solver checks, not astronomical timing references.
// Both real crossing solvers and real chart casting remain in use.
function syntheticMotion() {
  vi.spyOn(returns, "searchLongitudeCrossings").mockImplementation((body, target, from, to, options) =>
    searchLongitudeCrossingsWith((_, date) => normalizeLongitude((date.getTime() - epoch) / DAY),
      body, target, new Date(from), new Date(to), options));
  vi.spyOn(ephemeris, "bodyLongitude").mockImplementation((body, date) => {
    const day = (date.getTime() - epoch) / DAY;
    if (body === "Sun") return normalizeLongitude(day);
    if (body === "Moon") return normalizeLongitude(13 * day);
    throw new Error("lunation timing must evaluate only Sun and Moon");
  });
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

describe("combined reports with hand-derived motion", () => {
  it("orders different kinds chronologically and retains coincident events deterministically", () => {
    syntheticMotion();
    const result = searchMundaneReport({ place, from: epoch, to: epoch + 105 * DAY });
    expect(result.status).toBe("complete");
    expect(result.events.map(event => [event.kind, event.at,
      event.kind === "solar-ingress" ? event.sign : event.phase])).toEqual([
      ["lunation", atDay(15), "full"], ["lunation", atDay(30), "new"],
      ["lunation", atDay(45), "full"], ["lunation", atDay(60), "new"],
      ["lunation", atDay(75), "full"], ["solar-ingress", atDay(90), "Cancer"],
      ["lunation", atDay(90), "new"], ["lunation", atDay(105), "full"]
    ]);
    expect(result.search).toEqual({
      window: "(from,to]", completeness: "engine-sampled-search;not-proven",
      ordering: "instant;ingress-before-lunation;target-longitude-or-elongation"
    });
    expect(searchMundaneReport({ place, from: epoch, to: epoch + 105 * DAY })).toEqual(result);
    for (const event of result.events) {
      expect(event.chart.at).toBe(event.at);
      expect(event.factors.label).toBe(result.label);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    frozen(result);
  });

  it("combines adjacent windows without losing or duplicating either coincident closing root", () => {
    syntheticMotion();
    const first = searchMundaneReport({ place, from: epoch, to: epoch + 90 * DAY });
    const next = searchMundaneReport({ place, from: epoch + 90 * DAY, to: epoch + 180 * DAY });
    const whole = searchMundaneReport({ place, from: epoch, to: epoch + 180 * DAY });
    expect(first.status).toBe("complete");
    expect(next.status).toBe("complete");
    expect(first.events.filter(event => event.at === atDay(90)).map(event => event.kind))
      .toEqual(["solar-ingress", "lunation"]);
    expect(next.events.every(event => Date.parse(event.at) > epoch + 90 * DAY)).toBe(true);
    expect([...first.events, ...next.events]).toEqual(whole.events);
  });

  it("supports event-free and millisecond windows while rejecting zero-length windows", () => {
    syntheticMotion();
    const empty = searchMundaneReport({ place, from: epoch + DAY, to: epoch + 2 * DAY });
    expect(empty).toMatchObject({ status: "complete", events: [] });
    expect(empty.searches.ingresses.status).toBe("complete");
    expect(empty.searches.lunations.status).toBe("complete");
    const root = epoch + 90 * DAY;
    expect(searchMundaneReport({ place, from: root - 1, to: root }).events.map(event => event.kind))
      .toEqual(["solar-ingress", "lunation"]);
    expect(searchMundaneReport({ place, from: root, to: root + 1 }).events).toEqual([]);
    expect(() => searchMundaneReport({ place, from: root, to: root })).toThrow(RangeError);
    frozen(empty);
  });

  it("uses target order for same-kind ties even if component arrays arrive in reverse order", () => {
    syntheticMotion();
    const selection = { place, from: epoch + 90 * DAY - 1, to: epoch + 90 * DAY };
    const ingress = searchIngresses(selection);
    const lunation = searchLunations(selection);
    const cancer = ingress.ingresses[0]!;
    const newMoon = lunation.lunations[0]!;
    // Deliberately impossible simultaneous targets to exercise the ordering
    // contract only; they are never treated as real events or accuracy data.
    vi.spyOn(ingressSearch, "searchIngresses").mockReturnValue(Object.freeze({
      ...ingress, status: "complete", ingresses: Object.freeze([
        Object.freeze({ ...cancer, sign: "Capricorn", targetLongitude: 270 }), cancer
      ])
    }));
    vi.spyOn(lunationSearch, "searchLunations").mockReturnValue(Object.freeze({
      ...lunation, status: "complete", lunations: Object.freeze([
        Object.freeze({ ...newMoon, phase: "full", targetElongation: 180 }), newMoon
      ])
    }));
    const result = searchMundaneReport(selection);
    expect(result.events.map(event => event.kind === "solar-ingress" ? event.sign : event.phase))
      .toEqual(["Cancer", "Capricorn", "new", "full"]);
  });

  it.each(["ingresses", "lunations"] as const)("discards all events when %s refuses and retains both search outcomes", kind => {
    syntheticMotion();
    const selection = { place, from: epoch, to: epoch + 105 * DAY };
    const options = kind === "ingresses" ? { ingressMaxSamples: 1 } : { lunationMaxSamples: 1 };
    const result = searchMundaneReport(selection, options);
    const other = kind === "ingresses" ? "lunations" : "ingresses";
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
    expect(result.searches[kind]).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(result.searches[other].status).toBe("complete");
    expect(result.searches[other].samples).toBeGreaterThan(0);
    frozen(result);
  });

  it("forwards independently specified exact budgets and reports their original units", () => {
    syntheticMotion();
    const selection = { place, from: epoch, to: epoch + 105 * DAY };
    const baseline = searchMundaneReport(selection);
    const result = searchMundaneReport(selection, {
      ingressMaxSamples: baseline.searches.ingresses.samples,
      lunationMaxSamples: baseline.searches.lunations.samples
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual(baseline.events);
    for (const kind of ["ingresses", "lunations"] as const) {
      expect(result.searches[kind].samples).toBe(result.searches[kind].search.maxSamples);
    }
    expect(result.searches.ingresses.search.budgetUnit).toBe("sun-longitude-evaluations;chart-casting-excluded");
    expect(result.searches.lunations.search.budgetUnit).toBe("elongation-evaluations;chart-casting-excluded");
    expect(result.searches.lunations.search.bodyLongitudesPerSample).toBe(2);
  });
});

// Comparisons to component APIs prove composition, not independent accuracy.
describe("report engine integration", () => {
  it("combines a year using the same request, charts, factor pointers and metadata as component searches", () => {
    const selection = { place, year: 2000 };
    const result = searchMundaneReport(selection);
    const ingresses = searchIngresses(selection);
    const lunations = searchLunations(selection);
    expect(result.status).toBe("complete");
    expect(result.request).toEqual(ingresses.request);
    expect(result.request).toEqual(lunations.request);
    const { request: _iRequest, ingresses: iEvents, ...iMetadata } = ingresses;
    const { request: _lRequest, lunations: lEvents, ...lMetadata } = lunations;
    expect(result.searches).toEqual({ ingresses: iMetadata, lunations: lMetadata });
    expect(result.events.filter(event => event.kind === "solar-ingress")).toEqual(iEvents);
    expect(result.events.filter(event => event.kind === "lunation")).toEqual(lEvents);
    const times = result.events.map(event => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(searchMundaneReport({ place, ...result.request.range })).toEqual(result);
    for (const event of result.events) {
      for (const factor of event.factors.items) {
        const target = factor.source.split("/").slice(1).reduce<unknown>((value, key) =>
          (value as Record<string, unknown>)[key], event);
        expect(target).toBeDefined();
      }
    }
  });

  it("preserves polar fallback and coverage flags without changing component conventions", () => {
    const result = searchMundaneReport({
      from: "1750-03-01", to: "1750-04-01", houseSystem: "koch",
      place: { name: "Synthetic Polar", latitude: -78.5, longitude: 31.25 }
    });
    expect(result.status).toBe("complete");
    expect(result.events.some(event => event.kind === "solar-ingress")).toBe(true);
    expect(result.events.some(event => event.kind === "lunation")).toBe(true);
    for (const event of result.events) {
      expect(event.chart.houses).toMatchObject({ requested: "koch", actual: "whole" });
      expect(event.chart.flags).toContain("polar-fallback");
      expect(event.chart.flags).toContain("outside-reference-span");
    }
  });

  it("captures the request once, retaining detached dates and coordinates for both searches", () => {
    const from = new Date(epoch);
    const to = new Date(epoch + DAY);
    const local = { ...place };
    const getter = vi.fn(() => from);
    const ingress = vi.spyOn(ingressSearch, "searchIngresses");
    const lunation = vi.spyOn(lunationSearch, "searchLunations");
    const result = searchMundaneReport({ place: local, get from() { return getter(); }, to });
    expect(getter).toHaveBeenCalledTimes(1);
    expect(ingress.mock.calls[0]![0]).toEqual(lunation.mock.calls[0]![0]);
    from.setUTCFullYear(2020);
    to.setUTCFullYear(2020);
    local.latitude = 20;
    expect(result.request).toMatchObject({ range: { from: atDay(0), to: atDay(1) }, place });
    expect(Object.isFrozen(local)).toBe(false);
    frozen(result);
  });

  it("propagates calculation failures instead of returning a partial report", () => {
    const error = new Error("synthetic search failure");
    vi.spyOn(lunationSearch, "searchLunations").mockImplementation(() => { throw error; });
    expect(() => searchMundaneReport({ place, from: epoch, to: epoch + DAY })).toThrow(error);
  });
});

describe("report validation", () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "100"])(
    "validates both budgets before any search: %s", value => {
      const ingress = vi.spyOn(ingressSearch, "searchIngresses");
      const lunation = vi.spyOn(lunationSearch, "searchLunations");
      for (const key of ["ingressMaxSamples", "lunationMaxSamples"]) {
        expect(() => searchMundaneReport({ year: 2000, place }, { [key]: value } as MundaneReportOptions))
          .toThrow(RangeError);
      }
      expect(ingress).not.toHaveBeenCalled();
      expect(lunation).not.toHaveBeenCalled();
    }
  );
  it.each([null, [], 42, new Date(), { maxSamples: 1 }, { stepDays: 5 }, { [Symbol("key")]: 1 },
    Object.create({ ingressMaxSamples: 1 }), Object.defineProperty({}, "lunationMaxSamples", { value: 1 })])(
    "rejects malformed and unsupported options %j", options => {
      expect(() => searchMundaneReport({ year: 2000, place }, options as MundaneReportOptions)).toThrow(RangeError);
    }
  );
  it("rejects accessors without invocation and accepts null-prototype options", () => {
    const getter = vi.fn(() => 1);
    const options = Object.defineProperty({}, "lunationMaxSamples", { get: getter, enumerable: true });
    expect(() => searchMundaneReport({ year: 2000, place }, options)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    const result = searchMundaneReport({ year: 2000, place }, Object.assign(Object.create(null), {
      ingressMaxSamples: 1, lunationMaxSamples: 1
    }));
    expect(result).toMatchObject({ status: "refused", events: [], searches: {
      ingresses: { status: "refused", samples: 0 }, lunations: { status: "refused", samples: 0 }
    } });
    frozen(result);
  });
  it.each([null, [], 42, { year: 2000, place, timeScale: "tt" }, { year: 2000, place, eclipses: true },
    { year: 2000, place, [Symbol("key")]: 1 }, { year: 2000, place: { latitude: 90, longitude: 0 } },
    { place, from: "2000-02-30", to: "2000-03-01" }, { place, year: 2000, from: epoch, to: epoch + DAY }])(
    "rejects invalid requests and unsupported settings %j", input => {
      expect(() => searchMundaneReport(input as MundaneRequest)).toThrow(RangeError);
    }
  );
  it("retains endpoint coverage validation before budget refusal", () => {
    expect(() => searchMundaneReport({ year: 3999, place }, {
      ingressMaxSamples: 1, lunationMaxSamples: 1
    })).toThrow(/ephemeris span/u);
  });
});
