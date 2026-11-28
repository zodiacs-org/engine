import { describe, expect, it } from "vitest";

import {
  OBSERVING_WINDOW_LIMITS, VISIBILITY_BODIES, horizonEvents, observingWindows, sunBodyGeometry
} from "../src/index.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const FROM = "2001-02-03T00:00:00.000Z";
const TO = "2001-02-06T00:00:00.000Z";
const DAY_MS = 86_400_000;
const AIRLESS = { limb: "centre", refraction: "none" } as const;
type Complete = Extract<ReturnType<typeof observingWindows>, { status: "complete" }>;

function complete(result: ReturnType<typeof observingWindows>): Complete {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected observing-window status: ${result.status}`);
  return result;
}

function spans(windows: Complete["windows"]): { period: string; from: string; to: string }[] {
  return windows.map(({ period, from, to }) => ({ period, from, to }));
}

function clipped(windows: Complete["windows"], from: number, to: number): ReturnType<typeof spans> {
  return windows.flatMap((window) => {
    const start = Math.max(Date.parse(window.from), from);
    const end = Math.min(Date.parse(window.to), to);
    return start < end ? [{ period: window.period, from: new Date(start).toISOString(), to: new Date(end).toISOString() }] : [];
  });
}

// These tests check delegation, segmentation and provenance. Engine positions
// and times used here are integration checks, not independent accuracy data.
describe("observing windows from engine horizon events", () => {
  it.each(VISIBILITY_BODIES)("keeps airless horizon searches and receipts for %s", (body) => {
    const result = complete(observingWindows(body, SITE, FROM, TO));
    expect(result.body).toBe(body);
    expect(result.observer).toEqual(SITE);
    expect(result.from).toBe(FROM);
    expect(result.to).toBe(TO);
    expect(result.receiptScope).toBe("event-positions");
    expect(result.maxSamples).toBe(OBSERVING_WINDOW_LIMITS.defaultMaxSamples);
    expect(Date.parse(result.support.from)).toBe(Date.parse(FROM) - OBSERVING_WINDOW_LIMITS.supportPaddingDays * DAY_MS);
    expect(Date.parse(result.support.to)).toBe(Date.parse(TO) + OBSERVING_WINDOW_LIMITS.supportPaddingDays * DAY_MS);
    expect(result.horizons.sun?.status).toBe("complete");
    expect(result.horizons.target?.status).toBe("complete");
    if (!result.horizons.sun || !result.horizons.target) throw new Error("Missing horizon search results");
    expect(result.samples).toBe(result.horizons.sun.samples + result.horizons.target.samples);
    expect(result.samples).toBeLessThanOrEqual(result.maxSamples);
    for (const [name, horizon] of [["Sun", result.horizons.sun], [body, result.horizons.target]] as const) {
      expect(horizon).toEqual(horizonEvents(name, SITE, result.support.from, result.support.to, AIRLESS));
      expect(horizon.conventions).toEqual({ ...AIRLESS, refractionArcmin: 0 });
      for (const event of horizon.events) {
        expect(event.position.status).toBe("ok");
        if (event.position.status !== "ok") throw new Error("Position receipt refused");
        expect(event.position.receipt.request.body).toBe(name);
        expect(event.position.receipt.instants[0]?.utc).toBe(event.at.toISOString());
        expect(event.position.receipt.request.center).toEqual({ topocentric: SITE });
      }
    }
    let precedingEnd = Date.parse(FROM);
    for (const window of result.windows) {
      const start = Date.parse(window.from);
      const end = Date.parse(window.to);
      expect(start).toBeGreaterThanOrEqual(precedingEnd);
      expect(start).toBeGreaterThanOrEqual(Date.parse(FROM));
      expect(end).toBeLessThanOrEqual(Date.parse(TO));
      expect(end).toBeGreaterThan(start);
      expect(window.start.at).toBe(window.from);
      expect(window.end.at).toBe(window.to);
      expect(window.solarHalf.start.kind).toBe(window.period === "evening" ? "upper-transit" : "lower-transit");
      expect(window.solarHalf.end.kind).toBe(window.period === "evening" ? "lower-transit" : "upper-transit");
      expect(start).toBeGreaterThanOrEqual(window.solarHalf.start.at.getTime());
      expect(end).toBeLessThanOrEqual(window.solarHalf.end.at.getTime());
      for (const boundary of [window.start, window.end]) {
        expect(boundary.causes.length).toBeGreaterThan(0);
        for (const anchor of boundary.events) {
          expect(anchor.event.at.toISOString()).toBe(boundary.at);
          const search = anchor.body === "Sun" ? result.horizons.sun : result.horizons.target;
          expect(search.events).toContainEqual(anchor.event);
        }
      }
      const middle = new Date(Math.floor((start + end) / 2));
      const geometry = sunBodyGeometry(body, middle, SITE);
      expect(geometry.status).toBe("ok");
      if (geometry.status !== "ok") throw new Error(geometry.detail);
      // Midpoints avoid comparing the slightly different sky/calc observer
      // and aberration conventions exactly at a sky horizon crossing.
      expect(geometry.topocentric.sun.horizontal.altitudeDeg).toBeLessThan(0);
      expect(geometry.topocentric.target.horizontal.altitudeDeg).toBeGreaterThan(0);
      precedingEnd = end;
    }
  });

  it("clips an existing window without inventing horizon events at range boundaries", () => {
    const whole = complete(observingWindows("Moon", SITE, FROM, TO));
    const window = whole.windows[0];
    if (!window) throw new Error("The synthetic example needs a lunar observing window");
    const start = Date.parse(window.from);
    const end = Date.parse(window.to);
    const from = Math.floor((2 * start + end) / 3);
    const to = Math.floor((start + 2 * end) / 3);
    const result = complete(observingWindows("Moon", SITE, from, to));
    expect(spans(result.windows)).toEqual(clipped(whole.windows, from, to));
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.start.causes).toContain("range-start");
    expect(result.windows[0]?.end.causes).toContain("range-end");
    expect(result.windows[0]?.start.events).toEqual([]);
    expect(result.windows[0]?.end.events).toEqual([]);
    const millisecond = complete(observingWindows("Moon", SITE, from, from + 1));
    expect(spans(millisecond.windows)).toEqual(clipped(whole.windows, from, from + 1));
  });

  it("preserves the same half-open partition when split exactly at a solar lower transit", () => {
    const whole = complete(observingWindows("Moon", SITE, FROM, TO));
    const evening = whole.windows.find((window) => window.end.causes.includes("sun-lower-transit"));
    if (!evening) throw new Error("The synthetic example needs a lunar window through a lower transit");
    const cut = Date.parse(evening.to);
    const before = complete(observingWindows("Moon", SITE, FROM, cut));
    const after = complete(observingWindows("Moon", SITE, cut, TO));
    expect(spans(before.windows)).toEqual(clipped(whole.windows, Date.parse(FROM), cut));
    expect(spans(after.windows)).toEqual(clipped(whole.windows, cut, Date.parse(TO)));
    expect(before.windows.every((window) => Date.parse(window.to) <= cut)).toBe(true);
    expect(after.windows.every((window) => Date.parse(window.from) >= cut)).toBe(true);
    const morning = after.windows.find((window) => Date.parse(window.from) === cut);
    expect(morning?.period).toBe("morning");
    expect(morning?.start.causes).toContain("range-start");
    expect(morning?.start.causes).toContain("sun-lower-transit");
  });

  it("returns an empty complete interval for a short daytime request", () => {
    const source = complete(observingWindows("Moon", SITE, FROM, TO));
    const upper = source.horizons.sun?.events.find((event) => event.kind === "upper-transit"
      && event.at.getTime() >= Date.parse(FROM) && event.at.getTime() < Date.parse(TO));
    if (!upper) throw new Error("The synthetic example needs a solar upper transit");
    const result = complete(observingWindows("Moon", SITE, upper.at.getTime() - 1_000, upper.at.getTime() + 1_000));
    expect(result.windows).toEqual([]);
  });

  it("normalizes equivalent instants and copies observer and date inputs", () => {
    const from = new Date(FROM);
    const to = new Date(TO);
    const site = { latitude: SITE.latitude, longitude: SITE.longitude };
    const result = complete(observingWindows("Moon", site, from, to));
    expect(result).toEqual(observingWindows("Moon", site, "2001-02-03T07:00:00+07:00", "2001-02-06T07:00:00+07:00"));
    expect(result).toEqual(observingWindows("Moon", site, from.getTime(), to.getTime()));
    expect(result.observer.height).toBe(0);
    from.setTime(0);
    to.setTime(1);
    site.latitude = 0;
    expect(result.from).toBe(FROM);
    expect(result.to).toBe(TO);
    expect(result.observer.latitude).toBe(SITE.latitude);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.observer)).toBe(true);
    expect(Object.isFrozen(result.windows)).toBe(true);
  });
});

describe("polar observing windows", () => {
  const polar = { latitude: 78, longitude: 15 };

  it("returns no windows in polar daylight while preserving completed searches", () => {
    const result = complete(observingWindows("Moon", polar, "2001-06-21", "2001-06-22"));
    expect(result.windows).toEqual([]);
    expect(result.horizons.sun?.flags).toContain("never-sets");
    expect(result.horizons.sun?.events.some((event) => event.kind === "upper-transit")).toBe(true);
    expect(result.diagnostics).toContainEqual({ body: "Sun", code: "above-throughout-support", scope: "support-search" });
  });

  it("uses solar transits to label polar night without inventing sunrise or sunset", () => {
    const result = complete(observingWindows("Moon", polar, "2001-12-21", "2001-12-24"));
    expect(result.horizons.sun?.flags).toContain("never-rises");
    expect(result.horizons.sun?.events.some((event) => event.kind === "rise" || event.kind === "set")).toBe(false);
    expect(result.diagnostics).toContainEqual({ body: "Sun", code: "below-throughout-support", scope: "support-search" });
    expect(result.windows.length).toBeGreaterThan(0);
    for (const window of result.windows) {
      expect([...window.start.causes, ...window.end.causes]).not.toContain("sun-rise");
      expect([...window.start.causes, ...window.end.causes]).not.toContain("sun-set");
      expect(window.solarHalf.start.kind).toBe(window.period === "morning" ? "lower-transit" : "upper-transit");
      const midpoint = new Date(Math.floor((Date.parse(window.from) + Date.parse(window.to)) / 2));
      const geometry = sunBodyGeometry("Moon", midpoint, polar);
      if (geometry.status !== "ok") throw new Error(geometry.detail);
      expect(geometry.topocentric.sun.horizontal.altitudeDeg).toBeLessThan(0);
      expect(geometry.topocentric.target.horizontal.altitudeDeg).toBeGreaterThan(0);
    }
  });
});

describe("bounded observing-window searches", () => {
  it("refuses a range above the declared cap before either horizon search", () => {
    expect(OBSERVING_WINDOW_LIMITS).toEqual({ maxRangeDays: 366, supportPaddingDays: 2, defaultMaxSamples: 200_000 });
    const result = observingWindows("Moon", SITE, FROM, Date.parse(FROM) + OBSERVING_WINDOW_LIMITS.maxRangeDays * DAY_MS + 1);
    expect(result).toMatchObject({ status: "refused", reason: "range-budget", windows: [], samples: 0, horizons: { sun: null, target: null } });
  });

  it("accepts the range cap itself and applies the sample budget", () => {
    const result = observingWindows("Moon", SITE, FROM, Date.parse(FROM) + OBSERVING_WINDOW_LIMITS.maxRangeDays * DAY_MS, { maxSamples: 1 });
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected budget refusal");
    expect(result.reason).toBe("sample-budget");
    expect(result.windows).toEqual([]);
    expect(result.samples).toBeLessThanOrEqual(1);
  });

  it("preserves a first-search refusal and never runs the target search", () => {
    const result = observingWindows("Moon", SITE, FROM, TO, { maxSamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], maxSamples: 1 });
    expect(result.horizons.sun?.status).toBe("refused");
    expect(result.horizons.target).toBeNull();
    expect(result.samples).toBe(result.horizons.sun?.samples);
  });

  it("shares the budget across searches and discards windows when the target search refuses", () => {
    const supportFrom = Date.parse(FROM) - OBSERVING_WINDOW_LIMITS.supportPaddingDays * DAY_MS;
    const supportTo = Date.parse(TO) + OBSERVING_WINDOW_LIMITS.supportPaddingDays * DAY_MS;
    const sun = horizonEvents("Sun", SITE, supportFrom, supportTo, AIRLESS);
    expect(sun.status).toBe("complete");
    const maxSamples = sun.samples + 1;
    const result = observingWindows("Moon", SITE, FROM, TO, { maxSamples });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], maxSamples });
    expect(result.horizons.sun?.status).toBe("complete");
    expect(result.horizons.target?.status).toBe("refused");
    expect(result.samples).toBe((result.horizons.sun?.samples ?? 0) + (result.horizons.target?.samples ?? 0));
    expect(result.samples).toBeLessThanOrEqual(maxSamples);
  });

  it.each([
    ["1750-02-03", "1750-02-04"],
    ["1800-01-03T00:00:00Z", "1800-01-04T00:00:00Z"],
    ["2199-12-28T00:00:00Z", "2199-12-29T23:59:59.999Z"],
    ["+030000-01-01", "+030000-01-02"]
  ])("refuses support outside reference coverage, including the solver's extra hour, at %s", (from, to) => {
    const result = observingWindows("Moon", SITE, from!, to!);
    expect(result).toMatchObject({ status: "refused", reason: "support-outside-reference-span", windows: [], samples: 0, horizons: { sun: null, target: null } });
  });

  it.each([-90, 90])("refuses the undefined solar-half convention at geographic latitude %s", (latitude) => {
    const result = observingWindows("Moon", { latitude, longitude: 0 }, FROM, TO);
    expect(result).toMatchObject({ status: "refused", reason: "geographic-pole", windows: [], samples: 0, horizons: { sun: null, target: null } });
  });
});

describe("observing-window input validation", () => {
  it.each([null, [], { extra: true }, { limb: "upper" }, { refraction: "standard" }, { maxSamples: null },
    { maxSamples: 0 }, { maxSamples: -1 }, { maxSamples: 1.5 }, { maxSamples: Infinity },
    { maxSamples: NaN }, { maxSamples: "100" }, { maxSamples: Number.MAX_SAFE_INTEGER + 1 }])(
    "rejects invalid options %j", (options) => {
      expect(() => observingWindows("Moon", SITE, FROM, TO, options as never)).toThrow(RangeError);
    }
  );

  it("rejects options accessors without evaluating them", () => {
    let evaluated = false;
    const options = { get maxSamples() { evaluated = true; return 1; } };
    expect(() => observingWindows("Moon", SITE, FROM, TO, options)).toThrow(RangeError);
    expect(evaluated).toBe(false);
  });

  it.each(["Sun", "Uranus", "moon", null, undefined, {}])("rejects invalid target %s", (body) => {
    expect(() => observingWindows(body as never, SITE, FROM, TO)).toThrow(RangeError);
  });

  it.each([null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 }, { ...SITE, height: Infinity }, { ...SITE, pressure: 1000 }])(
    "rejects invalid observer %j", (site) => {
      expect(() => observingWindows("Moon", site as never, FROM, TO)).toThrow(RangeError);
    }
  );

  it.each(["2001-02-03T00:00:00", "2001-02-30", "not a date", NaN, Infinity, new Date(NaN), null])(
    "rejects invalid or unresolved time %s in either boundary", (at) => {
      expect(() => observingWindows("Moon", SITE, at as never, TO)).toThrow(RangeError);
      expect(() => observingWindows("Moon", SITE, FROM, at as never)).toThrow(RangeError);
    }
  );

  it("rejects empty and reversed ranges", () => {
    expect(() => observingWindows("Moon", SITE, FROM, FROM)).toThrow(RangeError);
    expect(() => observingWindows("Moon", SITE, TO, FROM)).toThrow(RangeError);
  });
});
