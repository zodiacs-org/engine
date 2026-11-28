import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { searchEvents, EVENT_SEARCH_SOURCE } from "../src/event-search.js";
import type { EventSearchRequest } from "../src/event-search-types.js";
import { parseEventFilter } from "../src/subscription.js";

const window = { start: "2000-01-01T00:00:00Z", end: "2000-02-01T00:00:00Z" };
const base = { window, stepMs: 21_600_000, maxEvaluations: 20_000 };

describe("relative-source engine integration (regression, not independent accuracy evidence)", () => {
  it.each([
    { ...base, filter: parseEventFilter({ kind: "ingress", body: "Sun", sign: "aquarius" }) },
    { ...base, filter: parseEventFilter({ kind: "aspect-exact", bodies: ["Moon", "Sun"], angle: 0 }) },
    { ...base, filter: parseEventFilter({ kind: "station", body: "Mercury" }),
      window: { start: "2000-02-01T00:00:00Z", end: "2000-04-01T00:00:00Z" } },
    { ...base, filter: parseEventFilter({ kind: "eclipse", type: "any" }),
      // Invented model sizes used for delegation and payload checks, not catalog comparisons.
      eclipse: { model: { sunRadiusAu: 0.005, earthRadiusAu: 0.00005, moonRadiusAu: 0.00001 }, derivativeStepMs: 60_000 },
      window: { start: "2000-01-01T00:00:00Z", end: "2000-03-01T00:00:00Z" } }
  ] satisfies EventSearchRequest[])("carries complete engine receipts for $filter.kind", request => {
    const result = searchEvents(request);
    expect(result.status).toBe("complete");
    expect(result.search.source).toEqual(EVENT_SEARCH_SOURCE);
    expect(result.search.completeness).toBe("conditional-on-sampling-assumptions");
    expect(result.search.scanWindow.clock).toBe("utc");
    expect(result.events.length).toBeGreaterThan(0);
    if (request.filter.kind === "eclipse") {
      expect(new Set(result.events.map(event => event.definition.kind))).toEqual(new Set(["solar", "lunar"]));
    }
    for (const event of result.events) {
      expect(event.atMs).toBeGreaterThanOrEqual(Date.parse(request.window.start));
      expect(event.atMs).toBeLessThan(Date.parse(request.window.end));
      expect(event.at).toBe(new Date(event.atMs).toISOString());
      expect(event.definition.clock).toBe("utc");
      expect(Object.isFrozen(event.definition.bracket)).toBe(true);
      const expectedBodies = request.filter.kind === "aspect-exact" ? request.filter.bodies :
        request.filter.kind === "eclipse" ? ["Sun", "Moon"] :
        "body" in request.filter ? [request.filter.body] : [];
      expect(event.positions.map(position => position.body)).toEqual(expectedBodies);
      for (const position of event.positions) {
        const flags = {
          correction: "apparent" as const, units: "degrees" as const,
          speeds: request.filter.kind === "station", cartesian: request.filter.kind === "eclipse"
        };
        const sameEngine = calc({ body: position.body, time: event.at,
          center: "geocentric", frame: "ecliptic-true-of-date", zodiac: "tropical", flags });
        expect(position).toEqual(sameEngine);
        expect(position.receipt.schema).toBe("zodiacs.calc-receipt.v1");
        expect(position.receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
        expect(position.receipt.instants).toHaveLength(1);
        expect(position.receipt.instants[0]?.timeScale.input).toBe("utc");
        expect(position.receipt.instants[0]?.utc).toBe(event.at);
        expect(Object.isFrozen(position.receipt.instants[0]?.deltaT)).toBe(true);
        expect(position.receipt.conventions.length).toBeGreaterThan(0);
        if (request.filter.kind === "station") {
          expect(position.bounds.speed?.method).toBe("central-difference");
          expect(position.bounds.speed!.stepDays! * 86_400_000).toBe(86_400);
        }
      }
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("retains a real engine range refusal with no partial events", () => {
    const result = searchEvents({ ...base,
      filter: parseEventFilter({ kind: "ingress", body: "Sun", sign: "aries" }),
      window: { start: "1700-01-01T00:00:00Z", end: "1700-01-02T00:00:00Z" }
    });
    expect(result).toMatchObject({ status: "refused", reason: "engine-refused", events: [], evaluations: 1,
      engineRefusal: { status: "refused", reason: "out-of-range" } });
  });

  it.each([
    ["1940-12-31T17:59:59Z", "1940-12-31T18:00:01Z"],
    ["1971-12-31T23:59:59Z", "1972-01-01T00:00:01Z"],
    ["2016-12-31T23:59:59Z", "2017-01-01T00:00:01Z"],
    ["2027-10-02T00:00:00Z", "2027-10-02T00:00:02Z"]
  ])("refuses known clock breaks across %s", (start, end) => {
    expect(searchEvents({ ...base, stepMs: 1000, window: { start, end },
      filter: parseEventFilter({ kind: "ingress", body: "Moon", sign: "aries" })
    })).toMatchObject({ status: "refused", reason: "time-discontinuity", events: [], evaluations: 0 });
  });

  it("checks the engine speed stencil beyond the padded station window", () => {
    expect(searchEvents({ ...base, stepMs: 1000,
      window: { start: "2017-01-01T00:00:10Z", end: "2017-01-01T00:00:20Z" },
      filter: parseEventFilter({ kind: "station", body: "Mercury" })
    })).toMatchObject({ status: "refused", reason: "time-discontinuity", events: [], evaluations: 0 });
  });

  it("matches the checked vendor pin and parent ephemeris dependency without root installation", () => {
    const vendor = JSON.parse(readFileSync(new URL("../vendor/events/manifest.json", import.meta.url), "utf8"));
    const parent = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const local = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(vendor.commit).toBe(EVENT_SEARCH_SOURCE.commit);
    expect(local.dependencies["astronomy-engine"]).toBe(parent.dependencies["astronomy-engine"]);
  });
});
