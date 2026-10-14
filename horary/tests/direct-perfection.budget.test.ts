import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createDirectPerfectionPolicy, evaluateDirectPerfectionWith } from "../src/index.js";
import type { AspectLongitudeAt, AspectSpeedAt } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
const policy = createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, maxSamples: 2000 });
const fixture = () => aspectFixture(28, 34, 2, 1);
const longitudeAt: AspectLongitudeAt = (body, at) => {
  const t = (at.getTime() - epoch) / DAY;
  return body === "Mars" ? 28 + 2 * t : body === "Venus" ? 34 + t : 180;
};
const speedAt: AspectSpeedAt = body => body === "Mars" ? 2 : body === "Venus" ? 1 : 0;

describe("atomic event budgets and provider boundaries", () => {
  it("preflights the event budget without losing the separately completed aspect candidate", () => {
    let longitudes = 0, speeds = 0;
    const report = evaluateDirectPerfectionWith((body, at) => { longitudes++; return longitudeAt(body, at); },
      (body, at) => { speeds++; return speedAt(body, at); }, fixture(), policy, createDirectPerfectionPolicy({ maxSamples: 1 }));
    expect(report.eventSearch).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(report.events).toEqual([]);
    expect(report.direct[0]).toMatchObject({ status: "event-search-refused", candidate: { elapsedDays: 6 }, events: [] });
    expect(longitudes).toBe(report.aspects.search.samples * 2);
    expect(speeds).toBe(0);
  });

  it("counts each event-provider call including probes, stays inside the horizon and clears earlier events on late refusal", () => {
    const times: number[] = [];
    let calls = 0;
    const provider: AspectLongitudeAt = (body, at) => { calls++; times.push(at.getTime()); return longitudeAt(body, at); };
    const speed: AspectSpeedAt = (body, at) => { calls++; times.push(at.getTime()); return speedAt(body, at); };
    const full = evaluateDirectPerfectionWith(provider, speed, fixture(), policy);
    expect(full.events).toHaveLength(1);
    expect(full.events[0]!.evidence.beforeAt).not.toBe(full.events[0]!.evidence.afterAt);
    expect(calls).toBe(2 * full.aspects.search.samples + full.eventSearch.samples);
    expect(Math.min(...times)).toBe(epoch);
    expect(Math.max(...times)).toBe(epoch + 8 * DAY);
    calls = 0;
    const limit = full.eventSearch.samples - 1;
    const refused = evaluateDirectPerfectionWith(provider, speed, fixture(), policy,
      createDirectPerfectionPolicy({ maxSamples: limit }));
    expect(refused.eventSearch.status).toBe("refused");
    expect(refused.eventSearch.samples).toBeLessThanOrEqual(limit);
    expect(refused.eventSearch.samples).toBeGreaterThan(0);
    expect(calls).toBe(2 * refused.aspects.search.samples + refused.eventSearch.samples);
    expect(refused.events).toEqual([]);
    expect(refused.direct[0]).toMatchObject({ status: "event-search-refused", candidate: { elapsedDays: 6 }, events: [] });
  });

  it("does not sample events after aspect refusal, when searches are disabled or when all aspects are disabled", () => {
    let speeds = 0;
    const speed: AspectSpeedAt = () => { speeds++; throw new Error("Should not be evaluated"); };
    for (const options of [{ search: false }, { maxSamples: 1 }, { aspects: [] }] as const) {
      const report = evaluateDirectPerfectionWith(longitudeAt, speed, fixture(), createAspectSearchPolicy(options));
      expect(report.eventSearch).toMatchObject({ status: "disabled", samples: 0 });
      expect(report.events).toEqual([]);
      expect(speeds).toBe(0);
      if ("maxSamples" in options) expect(report.direct[0]!.status).toBe("aspect-search-refused");
      if ("search" in options) expect(report.direct[0]!.status).toBe("search-disabled");
      if ("aspects" in options) expect(report.direct).toEqual([]);
    }
    const exact = evaluateDirectPerfectionWith(longitudeAt, speed, aspectFixture(10, 10), createAspectSearchPolicy({ search: false }));
    expect(exact.direct[0]!.status).toBe("exact-now");
  });

  it("does not use the speed provider when station checking is disabled", () => {
    const report = evaluateDirectPerfectionWith(longitudeAt, () => { throw new Error("Station toggle ignored"); }, fixture(), policy,
      createDirectPerfectionPolicy({ stations: false }));
    expect(report.direct[0]!.status).toBe("interrupted");
    expect(report.events.every(event => event.kind === "sign-boundary")).toBe(true);
  });

  it("propagates errors and invalid speeds rather than misreporting no events", () => {
    for (const value of [NaN, Infinity, -Infinity, null, "0"]) {
      expect(() => evaluateDirectPerfectionWith(longitudeAt, () => value as number, fixture(), policy)).toThrow(RangeError);
    }
    const failure = new RangeError("Outside provider span");
    expect(() => evaluateDirectPerfectionWith(longitudeAt, () => { throw failure; }, fixture(), policy)).toThrow(failure);
    expect(() => evaluateDirectPerfectionWith(longitudeAt, null as never, fixture(), policy)).toThrow(RangeError);
    expect(() => evaluateDirectPerfectionWith(null as never, speedAt, fixture(), policy)).toThrow(RangeError);
    for (const value of [-1, 360, NaN]) {
      expect(() => evaluateDirectPerfectionWith(() => value, speedAt, fixture(), policy)).toThrow(RangeError);
    }
  });
});
