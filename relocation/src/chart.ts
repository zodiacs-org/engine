import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import type { NatalEnvelope } from "@zodiacs/engine/receipt";

export const RELOCATION_CHART_SCHEMA = "zodiacs.relocation-chart.v1";

/** Geographic degrees, latitude north-positive and longitude east-positive. */
export interface GeographicPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/** JSON-compatible engine envelopes; no rounded or fabricated chart values. */
export interface RelocatedChartResult {
  readonly schema: typeof RELOCATION_CHART_SCHEMA;
  readonly natal: NatalEnvelope;
  readonly relocated: NatalEnvelope;
}

function checkedDestination(destination: GeographicPoint): GeographicPoint {
  if (destination === null || typeof destination !== "object") {
    throw new RangeError("A relocation destination requires latitude and longitude.");
  }
  const { latitude, longitude } = destination;
  // The engine accepts exact poles, but there is no unique rising direction
  // there. Do not expose its degenerate ascendant as a relocation result.
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) >= 90) {
    throw new RangeError("Destination latitude must be finite and strictly between -90 and 90 degrees.");
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError("Destination longitude must be finite and between -180 and 180 degrees.");
  }
  return { latitude, longitude };
}

/**
 * Recompute a resolved birth at another geographic location. The instant,
 * time scale, pinned delta-T, time-known setting and requested house system
 * come from the engine's canonical natal input. No time-zone conversion is
 * performed. Unknown-time inputs retain absent angles and houses.
 */
export function relocateChart(birth: BirthInput, destination: GeographicPoint): RelocatedChartResult {
  const point = checkedDestination(destination);
  const natal = natalChart(birth);
  const relocated = natalChart({ ...natal.input, ...point });
  const context = typeof birth.utc === "string" ? { sourceInstant: birth.utc } : {};
  return {
    schema: RELOCATION_CHART_SCHEMA,
    natal: createNatalEnvelope(natal, context),
    relocated: createNatalEnvelope(relocated, context)
  };
}
