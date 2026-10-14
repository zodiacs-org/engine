import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import { observingWindows } from "../src/windows.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const FROM = "2001-02-03";
const TO = "2001-02-04";
const OPTIONS = { limb: "centre", refraction: "none" } as const;
const sun = engine.horizonEvents("Sun", SITE, "2001-02-01", "2001-02-06", OPTIONS);
const target = engine.horizonEvents("Moon", SITE, "2001-02-01", "2001-02-06", OPTIONS);
if (sun.status !== "complete" || target.status !== "complete") throw new Error("Unexpected fixture search refusal");

afterEach(() => vi.restoreAllMocks());

// Fault injection tests check refusal propagation, not astronomical accuracy.
describe("observing-window refusal propagation", () => {
  it("returns no windows if complete sky searches contain a refused position", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic position refusal" };
    const faultyTarget = { ...target, events: target.events.map((event, i) => i ? event : { ...event, position: refusal }) };
    const solve = vi.spyOn(engine, "horizonEvents").mockReturnValueOnce(sun).mockReturnValueOnce(faultyTarget);
    const result = observingWindows("Moon", SITE, FROM, TO);
    expect(solve).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", windows: [] });
    if (result.status !== "refused") throw new Error("Expected position refusal");
    expect(result.positionRefusal).toBe(refusal);
    expect(result.horizons.target).toBe(faultyTarget);
    expect(result.horizons.sun).toBe(sun);
    expect(result.samples).toBe(sun.samples + target.samples);
  });

  it("returns unresolved without windows when the support search lacks solar anchors", () => {
    const missingAnchors = { ...sun, events: sun.events.filter((event) => event.kind === "rise" || event.kind === "set") };
    vi.spyOn(engine, "horizonEvents").mockReturnValueOnce(missingAnchors).mockReturnValueOnce(target);
    const result = observingWindows("Moon", SITE, FROM, TO);
    expect(result).toMatchObject({ status: "unresolved", reason: "event-sequence", windows: [] });
    expect(result.horizons.sun).toBe(missingAnchors);
    expect(result.samples).toBe(sun.samples + target.samples);
  });

  it("does not call the target solver with zero remaining samples", () => {
    const solve = vi.spyOn(engine, "horizonEvents").mockReturnValueOnce(sun);
    const result = observingWindows("Moon", SITE, FROM, TO, { maxSamples: sun.samples });
    expect(solve).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], samples: sun.samples });
    expect(result.horizons.target).toBeNull();
  });

  it("allows exact budget use when the target search completes", () => {
    const solve = vi.spyOn(engine, "horizonEvents").mockReturnValueOnce(sun).mockReturnValueOnce(target);
    const result = observingWindows("Moon", SITE, FROM, TO, { maxSamples: sun.samples + target.samples });
    expect(result.status).toBe("complete");
    expect(result.samples).toBe(result.maxSamples);
    expect(solve.mock.calls[1]?.[4]).toEqual({ ...OPTIONS, maxSamples: target.samples });
  });
});
