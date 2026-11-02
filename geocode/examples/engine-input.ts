import type { BirthInput } from "../../src/types.js";
import { createGeocoder } from "../src/index.js";
import type { GeocodeRequest, GeocodeResult } from "../src/index.js";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { loadPlaceIndex } from "../src/load-index.js";

export type EngineHandoff =
  | { readonly status: "ready"; readonly engineInput: BirthInput }
  | { readonly status: "needs-review"; readonly reason:
      "place-selection" | "clock-time" | "time-unavailable" | "clock-change" | "historical-uncertainty" };

/** Example application policy, not a new geocoder or engine API. */
export function prepareEngineInput(result: GeocodeResult): EngineHandoff {
  if (result.status !== "time-result") {
    return { status: "needs-review", reason: result.status === "date-only" ? "clock-time" : "place-selection" };
  }
  const time = result.time;
  if (time.status === "unavailable" || time.status === "no-such-clock") {
    return { status: "needs-review", reason: "time-unavailable" };
  }
  // Even when a provider records a chosen gap/fold policy, this example asks
  // the application to review that choice before calculating a chart.
  if (time.status !== "ok") return { status: "needs-review", reason: "clock-change" };
  if (time.provider === "atlas") {
    const instant = time.resolution.instants[0];
    if (time.resolution.instants.length !== 1 || !instant) {
      return { status: "needs-review", reason: "clock-change" };
    }
    if (instant.uncertainty.flag !== "documented") {
      return { status: "needs-review", reason: "historical-uncertainty" };
    }
    return {
      status: "ready",
      engineInput: {
        utc: new Date(instant.utcMs),
        // The covered atlas reading uses these coordinates, which may differ
        // from a newer place snapshot. Never resolve its comparison zone again.
        latitude: time.provenance.place.latitude,
        longitude: time.provenance.place.longitude,
        houseSystem: "whole", timeKnown: true, timeScale: "utc"
      }
    };
  }
  return {
    status: "ready",
    engineInput: {
      utc: new Date(time.resolution.utc.getTime()),
      latitude: result.place.latitude, longitude: result.place.longitude,
      flags: [...time.resolution.flags],
      houseSystem: "whole", timeKnown: true, timeScale: "utc"
    }
  };
}

// These requests are invented and have no connection to any person's birth.
export const SYNTHETIC_REQUESTS: readonly { readonly label: string; readonly request: GeocodeRequest }[] = [
  { label: "documented-atlas", request: { query: "Paris, FR", date: "1905-06-01", time: "12:00" } },
  { label: "assigned-iana", request: { query: "Kathmandu, NP", date: "2000-01-01", time: "08:30" } },
  { label: "polar-place", request: { query: "Longyearbyen, SJ", date: "2001-12-21", time: "09:00" } },
  { label: "ambiguous-place", request: { query: "Springfield", date: "2000-01-01", time: "12:00" } },
  { label: "unknown-time", request: { query: "Kathmandu, NP", date: "2000-01-01" } },
  { label: "skipped-reading", request: { query: "New York, US", date: "1918-03-31", time: "02:30" } },
  { label: "repeated-reading", request: { query: "New York, US", date: "2024-11-03", time: "01:30" } },
  { label: "uncertain-atlas", request: { query: "Brest, FR", date: "1891-03-20", time: "12:00" } },
  { label: "inferred-atlas", request: { query: "Strasbourg, FR", date: "1880-06-01", time: "12:00" } }
];

/** Load only the caller's local index and the existing repository atlas. */
export async function runEngineExample(indexPath: string) {
  const geocoder = createGeocoder(await loadPlaceIndex(indexPath), loadAtlasTimeProvider());
  const answers = [];
  for (const { label, request } of SYNTHETIC_REQUESTS) {
    const geocode = await geocoder.resolve(request);
    // Keep the complete geocoder answer beside the engine input. BirthInput
    // cannot represent atlas citations, uncertainty or dataset attribution.
    answers.push({ label, geocode, handoff: prepareEngineInput(geocode) });
  }
  return answers;
}
