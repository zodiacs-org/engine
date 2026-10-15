import { describe, expect, it } from "vitest";
import { fullValidationEpochs } from "../src/full-recipe.ts";
import { assertFullMeasuredPosition, measureFullAccuracy, reduceFullWithIndependentErfa } from "../src/full-validation.ts";
import type { HorizonsRow } from "../src/horizons-parser.ts";
import type { PilotMeasuredPosition } from "../src/pilot-validation.ts";
import { speedReferenceEpochs } from "../src/speed-reference-sources.ts";

describe("full validation integrity before any independent reference invocation", () => {
  const calculateAt = (): never => { throw new Error("An invalid corpus must not reach evaluation."); };
  const rows = (): HorizonsRow[] => fullValidationEpochs().map(jdTt => ({
    jdTt, positionAu: [1, 2, 3], velocityAuPerDay: [0, 0, 0]
  }));

  it("rejects an empty, truncated or reordered held-out corpus", async () => {
    for (const validationRows of [[], rows().slice(1), rows().reverse()]) {
      await expect(measureFullAccuracy({ body: "Chiron", shards: [], validationRows, speedRows: [], calculateAt }))
        .rejects.toThrow("complete registered held-out corpus");
    }
  });

  it("rejects corrupt reference vectors before running ERFA", async () => {
    for (const positionAu of [[0, 0, 0], [1, NaN, 2], [1, Infinity, 2]] as const) {
      const validationRows = rows();
      validationRows[1] = { ...validationRows[1]!, positionAu };
      await expect(measureFullAccuracy({ body: "Chiron", shards: [], validationRows, speedRows: [], calculateAt }))
        .rejects.toThrow("complete registered held-out corpus");
    }
  });

  it("rejects absent coefficients instead of silently reporting zero errors", async () => {
    const speedRows: HorizonsRow[] = speedReferenceEpochs().map(jdTt => ({
      jdTt, positionAu: [1, 2, 3], velocityAuPerDay: [0, 0, 0]
    }));
    await expect(measureFullAccuracy({ body: "Chiron", shards: [], validationRows: rows(), speedRows, calculateAt }))
      .rejects.toThrow("missing coefficient shards");
    await expect(reduceFullWithIndependentErfa([])).rejects.toThrow("empty reference corpus");
  });

  it("rejects missing supplemental speed data without falling back to failed short differences", async () => {
    await expect(measureFullAccuracy({ body: "Chiron", shards: [], validationRows: rows(), speedRows: [], calculateAt }))
      .rejects.toThrow("complete supplemental speed corpus");
  });
});

describe("full comparison result integrity", () => {
  const actual: PilotMeasuredPosition = {
    jdTt: 2451545, longitudeDeg: 21, latitudeDeg: 10, distanceAu: 2,
    longitudeSpeedDegPerDay: -0.01, latitudeSpeedDegPerDay: 0, distanceSpeedAuPerDay: 0, retrograde: true
  };

  it("rejects nonfinite speeds even at position-only comparison epochs", () => {
    for (const key of ["longitudeSpeedDegPerDay", "latitudeSpeedDegPerDay", "distanceSpeedAuPerDay"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => assertFullMeasuredPosition({ ...actual, [key]: value }, actual.jdTt))
          .toThrow("invalid numeric fields");
      }
    }
  });

  it("requires the requested clock and the speed-derived retrograde state", () => {
    expect(() => assertFullMeasuredPosition(actual, actual.jdTt)).not.toThrow();
    expect(() => assertFullMeasuredPosition(actual, actual.jdTt + 1)).toThrow("clock or retrograde");
    expect(() => assertFullMeasuredPosition({ ...actual, retrograde: false }, actual.jdTt)).toThrow("clock or retrograde");
  });
});
