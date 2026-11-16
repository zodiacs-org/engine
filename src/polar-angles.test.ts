import { describe, expect, it } from "vitest";
import { natalChart, saturnReturn, transits } from "./api.js";
import { chart as calcChart, houses as calcHouses } from "./calc.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import type { BirthInput, Chart } from "./types.js";

// Synthetic instants and places only; no person's birth data.
const SOLSTICE = "2021-06-21T00:00:00Z";
const at = (latitude: number, changes: Partial<BirthInput> = {}): Chart =>
  natalChart({ utc: SOLSTICE, latitude, longitude: 0, houseSystem: "whole", ...changes });
/** The shorter arc between two longitudes, 0 to 180 degrees. */
const arc = (from: number, to: number) => {
  const d = (((to - from) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe('"polar-angles": the angles inside the polar circle', () => {
  it.each([67, 70, 78.22, 89.99, 90, -67, -70, -90])("flags every chart with angles at %s°", (latitude) => {
    for (const houseSystem of ["whole", "equal", "porphyry", "placidus", "koch", "regiomontanus"] as const) {
      expect(at(latitude, { houseSystem }).flags).toContain("polar-angles");
    }
  });

  it.each([0, 40, 60, 66, -66])("leaves a chart at %s° unflagged", (latitude) => {
    expect(at(latitude).flags).not.toContain("polar-angles");
  });

  it("leaves a chart without a birth time unflagged, which has no angles", () => {
    expect(at(78, { timeKnown: false }).flags).not.toContain("polar-angles");
  });

  it("is on each minute of a day at 70° N, through both half-circle turns of the ascendant", () => {
    const start = Date.parse(SOLSTICE);
    let turns = 0;
    let previous: number | undefined;
    for (let minute = 0; minute <= 1440; minute += 1) {
      const chart = natalChart({ utc: new Date(start + minute * 60_000).toISOString(), latitude: 70, longitude: 0, houseSystem: "whole" });
      expect(chart.flags).toContain("polar-angles");
      const asc = chart.angles!.asc;
      if (previous !== undefined && arc(previous, asc) > 90) turns += 1;
      previous = asc;
    }
    expect(turns).toBe(2);
  });

  it("is echoed where it holds and refused where it does not", () => {
    expect(at(78, { flags: ["polar-angles"] }).flags).toContain("polar-angles");
    expect(() => at(40, { flags: ["polar-angles"] })).toThrow(RangeError);
    expect(() => at(78, { flags: ["polar-angles"], timeKnown: false })).toThrow(RangeError);
    expect(() =>
      saturnReturn({ utc: SOLSTICE, latitude: 40, longitude: 0, houseSystem: "whole", flags: ["polar-angles"] })
    ).toThrow(RangeError);
    expect(() =>
      saturnReturn({ utc: SOLSTICE, latitude: 78, longitude: 0, houseSystem: "whole", flags: ["polar-angles"] })
    ).not.toThrow();
  });

  it("is set by calc's houses() and chart() as by natalChart", () => {
    const place = { latitude: 70, longitude: 0 };
    const houses = calcHouses({ time: SOLSTICE, place, houseSystem: "whole" });
    if (houses.status !== "ok") throw new Error(houses.reason);
    expect(houses.flags).toContain("polar-angles");
    const given = calcChart({ time: SOLSTICE, place, houseSystem: "whole" });
    if (given.status !== "ok") throw new Error(given.reason);
    expect(given.chart.flags).toContain("polar-angles");
    const south = calcHouses({ time: SOLSTICE, place: { latitude: 40, longitude: 0 }, houseSystem: "whole" });
    if (south.status !== "ok") throw new Error(south.reason);
    expect(south.flags).not.toContain("polar-angles");
  });

  it("is checked on a supplied chart: allowed inside the circle, refused outside, optional for a chart before the flag", () => {
    const polar = at(78);
    expect(() => transits(polar, "2026-01-01T00:00:00Z")).not.toThrow();
    const older = { ...polar, flags: polar.flags.filter((flag) => flag !== "polar-angles") };
    expect(() => transits(older, "2026-01-01T00:00:00Z")).not.toThrow();
    const temperate = at(40);
    expect(() => transits({ ...temperate, flags: [...temperate.flags, "polar-angles"] }, "2026-01-01T00:00:00Z")).toThrow(
      RangeError
    );
  });

  it("round-trips in a natal receipt, and a receipt claiming it away from the pole is refused", () => {
    const envelope = createNatalEnvelope(at(78));
    expect(envelope.receipt.resultFlags).toContain("polar-angles");
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope))).toEqual({ ok: true, envelope });
    const temperate = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(at(40))));
    temperate.receipt.resultFlags.push("polar-angles");
    expect(parseNatalEnvelope(JSON.stringify(temperate))).toMatchObject({ ok: false, code: "inconsistent_result" });
  });
});
