import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../../src/index.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../../src/receipt.js";
import { analyzeStaticSynastry } from "../src/static-synastry.js";
import type { StaticSynastryRequest } from "../src/static-synastry.js";

// Invented chart inputs. Engine parity here verifies adapter behavior, not
// independent astronomical accuracy or the physical exactness of an aspect.
const request: StaticSynastryRequest = {
  first: {
    id: "synthetic-static-a", synthetic: true,
    birth: { utc: "2001-02-03T04:05:06.789Z", timeScale: "utc", latitude: 12.5, longitude: 34.25 }
  },
  second: {
    id: "synthetic-static-b", synthetic: true,
    birth: { utc: "2003-04-05T06:07:08.901Z", timeScale: "utc", timeKnown: false, deltaT: 75 }
  }
};

afterEach(() => vi.restoreAllMocks());

describe("undated static synastry", () => {
  it("preserves the engine's nonzero aspects and both full natal receipts without event timing", () => {
    const actual = analyzeStaticSynastry(request);
    const first = engine.natalChart(request.first.birth);
    const second = engine.natalChart(request.second.birth);
    const expected = engine.synastry(first, second);
    expect(actual.convention).toBe("static-natal/1");
    expect(actual.timing).toBe("undated");
    expect(actual.aspects).toEqual(expected.aspects);
    expect(actual.aspects.some(aspect => aspect.orb > 0)).toBe(true);
    expect(actual.exactAspects).toEqual(expected.aspects.filter(aspect => aspect.orb === 0));
    expect(actual.first).toEqual({ chartId: request.first.id, synthetic: true,
      calculation: createNatalEnvelope(first, { sourceInstant: request.first.birth.utc }) });
    expect(actual.second).toEqual({ chartId: request.second.id, synthetic: true,
      calculation: createNatalEnvelope(second, { sourceInstant: request.second.birth.utc }) });
    expect(actual.second.calculation.result.houses).toBeNull();
    expect(actual.second.calculation.receipt.resultFlags).toContain("no-time");
    expect(actual.second.calculation.result.deltaT).toMatchObject({ model: "pinned", seconds: 75 });
    for (const participant of [actual.first, actual.second]) {
      expect(parseNatalEnvelope(serializeNatalEnvelope(participant.calculation)).ok).toBe(true);
    }
    for (const field of ["utc", "events", "uid", "receipt", "dtstart", "startUtc", "endUtc"]) {
      expect(actual).not.toHaveProperty(field);
    }
  });

  it("selects only zero reported orbs, including same-body conjunctions of coincident synthetic charts", () => {
    const actual = analyzeStaticSynastry({ ...request, second: { ...request.first, id: request.second.id } });
    expect(actual.exactAspects.length).toBeGreaterThan(0);
    expect(actual.exactAspects).toEqual(actual.aspects.filter(aspect => aspect.orb === 0));
    expect(actual.exactAspects).toContainEqual(expect.objectContaining({ a: "Sun", b: "Sun", type: "conjunction", orb: 0 }));
    expect(actual.aspects.some(aspect => aspect.orb > 0)).toBe(true);
    expect(actual.aspects.some(aspect => aspect.a.includes("Node") || aspect.b.includes("Node"))).toBe(false);
  });

  it("does not promote a nearly coincident natal conjunction into the exact subset", () => {
    const actual = analyzeStaticSynastry({ ...request, second: {
      ...request.first, id: request.second.id,
      birth: { ...request.first.birth, utc: "2001-02-03T04:05:07.789Z" }
    } });
    const close = actual.aspects.find(aspect => aspect.a === "Sun" && aspect.b === "Sun")!;
    expect(close.type).toBe("conjunction");
    expect(close.orb).toBeGreaterThan(0);
    expect(close.orb).toBeLessThan(0.001);
    expect(actual.exactAspects.some(aspect => aspect.a === "Sun" && aspect.b === "Sun")).toBe(false);
  });

  it("preserves first and second chart roles when their order is reversed", () => {
    const forward = analyzeStaticSynastry(request);
    const reverse = analyzeStaticSynastry({ first: request.second, second: request.first });
    expect(reverse.first).toEqual(forward.second);
    expect(reverse.second).toEqual(forward.first);
    expect(reverse.aspects).toEqual(engine.synastry(
      engine.natalChart(request.second.birth), engine.natalChart(request.first.birth)
    ).aspects);
    for (const aspect of reverse.aspects) {
      expect(aspect.aLon).toBe(reverse.first.calculation.result.bodies.find(body => body.body === aspect.a)!.lon);
      expect(aspect.bLon).toBe(reverse.second.calculation.result.bodies.find(body => body.body === aspect.b)!.lon);
    }
  });

  it("normalizes default birth settings and detaches both inputs before calculation", () => {
    const mutable = structuredClone(request);
    const before = structuredClone(mutable);
    const expected = analyzeStaticSynastry(before);
    const natalChart = engine.natalChart;
    const spy = vi.spyOn(engine, "natalChart").mockImplementation(birth => {
      (mutable.first.birth as { utc: string }).utc = "2004-01-01T00:00:00.000Z";
      (mutable.second.birth as { deltaT: number }).deltaT = 90;
      (mutable.second as { id: string }).id = "changed-during-calculation";
      return natalChart(birth);
    });
    expect(analyzeStaticSynastry(mutable)).toEqual(expected);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    expect(analyzeStaticSynastry({ ...before, first: { ...before.first,
      birth: { ...before.first.birth, houseSystem: "whole", timeKnown: true }
    } })).toEqual(expected);
  });

  it.each([
    null, [], {}, { first: request.first }, { ...request, utc: "2026-01-01T00:00:00.000Z" },
    { ...request, startUtc: "2026-01-01T00:00:00.000Z" },
    { ...request, convention: "secondary-progressed-first-to-natal-second/1" },
    { ...request, second: { ...request.second, id: request.first.id } },
    { ...request, first: { ...request.first, synthetic: false } },
    { ...request, second: { ...request.second, synthetic: undefined } },
    { ...request, second: { ...request.second, surprise: true } },
    { ...request, first: { ...request.first, birth: { ...request.first.birth, timeScale: "tt" } } },
    { ...request, second: { ...request.second, birth: { ...request.second.birth, timeScale: "ut1" } } },
    { ...request, second: { ...request.second, birth: { ...request.second.birth, utc: "2003-02-30T00:00:00.000Z" } } },
    { ...request, second: { ...request.second, birth: { ...request.second.birth, latitude: 20 } } }
  ])("rejects ambiguous or unsupported input before calculating either chart: %j", input => {
    const spy = vi.spyOn(engine, "natalChart");
    expect(() => analyzeStaticSynastry(input as unknown as StaticSynastryRequest)).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
