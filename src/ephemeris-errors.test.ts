import { describe, expect, it, vi } from "vitest";

// astronomy-engine throws strings, not Error objects, for inputs it cannot
// evaluate. Make its lunar series fail on demand, as it does at extreme dates.
const failure = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("astronomy-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("astronomy-engine")>();
  return {
    ...original,
    EclipticGeoMoon: (...args: Parameters<typeof original.EclipticGeoMoon>) => {
      if (failure.value !== undefined) throw failure.value;
      return original.EclipticGeoMoon(...args);
    }
  };
});

const { chartDeclinations, moonPhase, natalChart, positions, progressedBodies, transits } = await import("./index.js");

const calls: [string, () => unknown][] = [
  ["positions", () => positions("2000-01-01T00:00:00Z")],
  ["natalChart", () => natalChart({ utc: "2000-01-01T00:00:00Z", latitude: 10, longitude: 20 })],
  ["chartDeclinations", () => chartDeclinations({ utc: "2000-01-01T00:00:00Z", deltaT: 64 })],
  ["progressedBodies", () => progressedBodies("1990-01-01", "2020-01-01")],
  ["moonPhase", () => moonPhase("2000-01-01")]
];

describe("ephemeris failures surface as RangeError", () => {
  it.each(calls)("%s wraps a thrown string in a RangeError that keeps it as the cause", (_name, call) => {
    failure.value = "Object is too distant for light-travel solver.";
    try {
      let thrown: unknown;
      try { call(); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(RangeError);
      expect((thrown as RangeError).message).toBe(
        "The ephemeris could not evaluate this instant: Object is too distant for light-travel solver."
      );
      expect((thrown as RangeError).cause).toBe("Object is too distant for light-travel solver.");
    } finally { failure.value = undefined; }
  });

  it("passes Error objects through unchanged and recovers afterwards", () => {
    const original = new TypeError("synthetic");
    failure.value = original;
    try {
      expect(() => positions("2000-01-01")).toThrow(original);
    } finally { failure.value = undefined; }
    const chart = natalChart({ utc: "2000-01-01T00:00:00Z", deltaT: 64 });
    expect(transits(chart, "2000-01-02").positions).toHaveLength(12);
    expect(positions("2000-01-01")).toHaveLength(12);
  });
});
