import { natalChart } from "@zodiacs/engine";
import type { BirthInput, Chart } from "@zodiacs/engine";
import {
  createNatalEnvelope,
  NatalEnvelopeError,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "@zodiacs/engine/receipt";
import type { NatalEnvelope } from "@zodiacs/engine/receipt";

export const RELOCATION_CHART_SCHEMA = "zodiacs.relocation-chart.v1";

/** A resolved birth, a full engine Chart, or an engine natal envelope. */
export type RelocationSource = BirthInput | Chart | NatalEnvelope;

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

function sourceEnvelope(source: RelocationSource): NatalEnvelope {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new RangeError("A relocation source requires a birth input, engine chart or natal envelope.");
  }
  // Route incomplete records through their own validator rather than quietly
  // treating a malformed chart/envelope as a fresh birth request.
  if (["schema", "receipt", "result", "requiredFeatures"].some((key) => key in source)) {
    // The codec validates plain data, bounds its size and makes an owned copy.
    // Do not use JSON.stringify on an unvalidated record or call its toJSON.
    const decoded = parseNatalEnvelope(serializeNatalEnvelope(source as NatalEnvelope));
    if (!decoded.ok) throw new NatalEnvelopeError(decoded.code);
    return decoded.envelope;
  }
  if (["input", "bodies", "angles", "houses", "aspects", "engineVersion"].some((key) => key in source)) {
    return createNatalEnvelope(source as Chart);
  }
  const birth = source as BirthInput;
  const natal = natalChart(birth);
  const context = typeof birth.utc === "string" ? { sourceInstant: birth.utc } : {};
  return createNatalEnvelope(natal, context);
}

/**
 * Recompute a resolved birth at another geographic location. The instant,
 * time scale, pinned delta-T, time-known setting and requested house system
 * come from the engine's receipt replay input. Existing source results and
 * provenance are retained as claims, not authenticated or recomputed. The
 * destination uses the installed engine and gets a fresh receipt. No time-zone
 * conversion is performed. Unknown-time inputs retain absent angles and houses.
 */
export function relocateChart(source: RelocationSource, destination: GeographicPoint): RelocatedChartResult {
  const point = checkedDestination(destination);
  const natal = sourceEnvelope(source);
  const relocated = natalChart({ ...natalReplayInput(natal), ...point });
  // Source birthplace resolution, artifact claims and extensions describe the
  // source. They must not be attributed to this new destination calculation.
  const context = { sourceInstant: natal.receipt.sourceInstant };
  return {
    schema: RELOCATION_CHART_SCHEMA,
    natal,
    relocated: createNatalEnvelope(relocated, context)
  };
}
