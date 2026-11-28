import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { fullTrainingEpochs } from "../src/full-recipe.ts";
import { pilotTrainingEpochs } from "../src/pilot-recipe.ts";
import { decodeHorizonsFileCapture, makeHorizonsFileRequest } from "../src/horizons-file.ts";
import { readStationReference, STATION_REFERENCE_RECIPE, STATION_REFERENCE_RECIPE_V1,
  stationReferenceBrackets, stationReferenceEpochs, stationReferenceRates, stationScanCenters } from "../src/station-reference.ts";

describe("independent station reference recipe", () => {
  it("retains the pre-evaluation intake failure and changes only the scan phase", () => {
    expect(STATION_REFERENCE_RECIPE_V1.schema).toBe("minorbodies-station-reference-recipe-v1");
    expect(STATION_REFERENCE_RECIPE.schema).toBe("minorbodies-station-reference-recipe-v2");
    const { schema: _schema, reason: _reason, scanFirstCenterJdTt: _first, scanLastCenterJdTt: _last, ...revised } = STATION_REFERENCE_RECIPE;
    const { schema: _oldSchema, scanFirstCenterJdTt: _oldFirst, scanLastCenterJdTt: _oldLast, ...original } = STATION_REFERENCE_RECIPE_V1;
    expect(revised).toEqual(original);
    expect(() => stationReferenceEpochs([2451552.5], 0.25, 0.5)).toThrow(/overlap/);
    expect(STATION_REFERENCE_RECIPE.stationAgreementMarginSeconds).toBe(300);
    expect(STATION_REFERENCE_RECIPE.maxReferenceBracketSeconds).toBe(85);
    expect(STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay).toBe(0.01);
  });

  it("keeps the complete potential refinement lattice distinct from both training datasets", () => {
    const training = new Set([...pilotTrainingEpochs(), ...fullTrainingEpochs()]);
    const subdivisions = STATION_REFERENCE_RECIPE.refinementSubdivisions ** STATION_REFERENCE_RECIPE.refinementPasses;
    const spanDays = STATION_REFERENCE_RECIPE.scanLastCenterJdTt - STATION_REFERENCE_RECIPE.scanFirstCenterJdTt;
    const padDays = 3 * STATION_REFERENCE_RECIPE.scanCoarseStepDays;
    for (let i = -padDays * subdivisions; i <= (spanDays + padDays) * subdivisions; i++) {
      const jd = Number((STATION_REFERENCE_RECIPE.scanFirstCenterJdTt + i / subdivisions).toFixed(6));
      if (training.has(jd)) throw new Error(`Reference refinement lattice overlaps training at ${jd}`);
    }
    expect(stationScanCenters()).toHaveLength(367);
  });

  it("derives both directions from position-only analytic samples, including longitude wrap", () => {
    const centers = [2451545.125003, 2451545.375003, 2451545.625003];
    const middle = centers[1]!;
    for (const sign of [-1, 1]) {
      const rows = stationReferenceEpochs(centers, 0.25, 0.5).map(jdTt => ({ jdTt,
        longitudeDeg: ((sign * (jdTt - middle) ** 2 + 360) % 360), latitudeDeg: 0, distanceAu: 1 }));
      const rates = stationReferenceRates(rows, centers, 0.25, 0.5);
      const brackets = stationReferenceBrackets([rates[0]!, rates[2]!]);
      expect(brackets).toHaveLength(1);
      expect(brackets[0]!.direction).toBe(sign < 0 ? "direct-to-retrograde" : "retrograde-to-direct");
      expect(rates.every(rate => rate.convergenceArcsecPerDay < 1e-6)).toBe(true);
      expect(() => stationReferenceRates(rows.slice(1), centers, 0.25, 0.5)).toThrow(/Missing/);
      expect(() => stationReferenceBrackets([{ ...rates[0]!, coarseLongitudeSpeedDegPerDay: -rates[0]!.fineLongitudeSpeedDegPerDay }])).toThrow(/disagree/);
      expect(() => stationReferenceBrackets([{ ...rates[0]!, fineLongitudeSpeedDegPerDay: 0 }])).toThrow(/Exact sampled/);
    }
  });
});

describe("retained original Horizons station references", () => {
  it.each(MINOR_BODY_NAMES)("replays %s from bound original sources and independent ERFA only", async body => {
    const reference = await readStationReference(body);
    expect(reference.recipe).toEqual(STATION_REFERENCE_RECIPE);
    expect(reference.reference.tool).toBe("minorbodies-erfa-reference-v1");
    expect(reference.events.length).toBe(body === "Pallas" ? 1 : 2);
    if (body !== "Pallas") expect(new Set(reference.events.map(event => event.direction))).toEqual(new Set(["direct-to-retrograde", "retrograde-to-direct"]));
    else expect(reference.events[0]!.direction).toBe("retrograde-to-direct");
    for (const event of reference.events) {
      expect(event.widthSeconds).toBeLessThanOrEqual(STATION_REFERENCE_RECIPE.maxReferenceBracketSeconds);
      expect(event.bracketStartJdTt).toBeGreaterThanOrEqual(STATION_REFERENCE_RECIPE.startJdTt);
      expect(event.bracketEndJdTt).toBeLessThan(STATION_REFERENCE_RECIPE.endJdTtExclusive);
      expect(event.before.convergenceArcsecPerDay).toBeLessThanOrEqual(STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay);
      expect(event.after.convergenceArcsecPerDay).toBeLessThanOrEqual(STATION_REFERENCE_RECIPE.maxReferenceLongitudeSpeedDifferenceArcsecPerDay);
      expect(Math.sign(event.before.fineLongitudeSpeedDegPerDay)).toBe(-Math.sign(event.after.fineLongitudeSpeedDegPerDay));
    }
  }, 30000);

  it("rejects source-byte and target substitutions", async () => {
    const raw = await readFile(new URL("fixtures/stations/chiron/scan.json", import.meta.url), "utf8");
    const request = makeHorizonsFileRequest("Chiron", stationReferenceEpochs(stationScanCenters(), 1, 2));
    const capture = decodeHorizonsFileCapture(raw, request);
    const replaced = JSON.parse(raw);
    replaced.raw = capture.raw + "\n";
    expect(() => decodeHorizonsFileCapture(JSON.stringify(replaced), request)).toThrow(/digest mismatch/);
    replaced.raw = capture.raw.replace("JPL#171", "JPL#172");
    expect(() => decodeHorizonsFileCapture(JSON.stringify(replaced), request)).toThrow(/solution identifiers/);
    expect(() => decodeHorizonsFileCapture(raw, makeHorizonsFileRequest("Ceres", request.epochs))).toThrow(/Invalid/);
  });
});
