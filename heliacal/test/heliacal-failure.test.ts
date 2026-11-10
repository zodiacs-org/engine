import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal } from "../../src/calc.js";
import * as geometry from "../src/geometry.js";
import { heliacalEvents } from "../src/heliacal.js";
import * as windows from "../src/windows.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const MODEL = { model: "horizon-arcus-visionis/1", thresholds: { "first-morning": 5, "last-evening": 5 } } as const;
const FROM = "2024-06-01";
const TO = "2024-06-10";
// Engine-produced data are used only as fault-injection scaffolding here,
// never as an independent ephemeris or visibility reference.
const support = windows.observingWindows("Venus", SITE, FROM, TO);
if (support.status !== "complete") throw new Error("Expected support completion");
afterEach(() => vi.restoreAllMocks());

describe("heliacal failure propagation", () => {
  it("returns no partial opportunities or events when geometry refuses after successful calls", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic geometry refusal" };
    vi.spyOn(windows, "observingWindows").mockReturnValue(support);
    const original = geometry.sunBodyGeometry;
    let calls = 0;
    const positions = vi.spyOn(geometry, "sunBodyGeometry").mockImplementation((...args) => {
      calls += 1;
      return calls === 3 ? refusal : original(...args);
    });
    const result = heliacalEvents("Venus", SITE, FROM, TO, MODEL);
    expect(positions).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", geometrySamples: 3, events: [], opportunities: [] });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.positionRefusal).toBe(refusal);
    expect(result.observing).toBe(support);
  });

  it("retains the engine position refusal from a horizon support search", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic horizon position refusal" };
    const faulty = { ...support, status: "refused", reason: "engine-position", positionRefusal: refusal, windows: [] } as const;
    vi.spyOn(windows, "observingWindows").mockReturnValue(faulty);
    const positions = vi.spyOn(geometry, "sunBodyGeometry");
    const result = heliacalEvents("Venus", SITE, FROM, TO, MODEL);
    expect(result).toMatchObject({ status: "refused", reason: "engine-position", events: [], opportunities: [], geometrySamples: 0 });
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.positionRefusal).toBe(refusal);
    expect(result.observing).toBe(faulty);
    expect(positions).not.toHaveBeenCalled();
  });

  it("retains unresolved solar anchors and does not attempt geometry", () => {
    const faulty = { ...support, status: "unresolved", reason: "event-sequence", detail: "Synthetic missing solar anchors", windows: [] } as const;
    vi.spyOn(windows, "observingWindows").mockReturnValue(faulty);
    const positions = vi.spyOn(geometry, "sunBodyGeometry");
    const result = heliacalEvents("Venus", SITE, FROM, TO, MODEL);
    expect(result).toMatchObject({ status: "unresolved", reason: "event-sequence", detail: faulty.detail, events: [], opportunities: [] });
    expect(result.observing).toBe(faulty);
    expect(positions).not.toHaveBeenCalled();
  });

  it("cannot infer opportunities from missing support searches", () => {
    vi.spyOn(windows, "observingWindows").mockReturnValue({ ...support, horizons: { sun: null, target: null } });
    const result = heliacalEvents("Venus", SITE, FROM, TO, MODEL);
    expect(result).toMatchObject({ status: "unresolved", reason: "event-sequence", events: [], opportunities: [], geometrySamples: 0 });
  });

  it("snapshots caller parameters and evaluates only requested periods", () => {
    const thresholds = { "first-morning": 5 };
    vi.spyOn(windows, "observingWindows").mockImplementation(() => {
      thresholds["first-morning"] = 80;
      return support;
    });
    const result = heliacalEvents("Venus", SITE, FROM, TO, { model: "horizon-arcus-visionis/1", thresholds });
    expect(result.status).toBe("complete");
    expect(result.model.thresholds["first-morning"]).toBe(5);
    expect(result.model.thresholds).not.toBe(thresholds);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((row) => row.period === "morning")).toBe(true);
  });
});
