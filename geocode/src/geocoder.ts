import { assertCivilDate, assertCivilTime } from "./civil-time.js";
import { createPlaceLookup } from "./lookup.js";
import type { LookupOptions, LookupResult, PlaceLookup } from "./lookup.js";
import { createTimeResolver } from "./time.js";
import type { AtlasTimeProvider, PlaceTimeResult } from "./time.js";
import type { DatasetProvenance, PlaceRecord } from "./types.js";

/** Exactly one selector: a text search or an ID chosen from this dataset. */
export type GeocodeRequest = {
  readonly date: string;
  /** Omit for an unknown clock time. Explicit null/undefined is invalid. */
  readonly time?: string;
} & (
  | { readonly query: string; readonly filters?: LookupOptions; readonly placeId?: never }
  | { readonly placeId: string; readonly query?: never; readonly filters?: never }
);

/** A local civil reading is unresolved input, not a UTC instant. */
export type GeocodeCivilInput =
  | { readonly kind: "date-only"; readonly date: string }
  | { readonly kind: "civil-time"; readonly date: string; readonly time: string };

interface GeocodeContext {
  readonly input: GeocodeCivilInput;
  readonly provenance: DatasetProvenance;
  /** Null for direct ID selection; otherwise preserves all lookup metadata. */
  readonly lookup: LookupResult | null;
}

interface SelectedPlace {
  readonly place: PlaceRecord;
  readonly selection: "unique-match" | "explicit-id";
}

export type GeocodeResult =
  | (GeocodeContext & {
    readonly status: "no-match" | "ambiguous-place" | "unknown-place";
    readonly place: null;
    readonly selection: null;
    readonly time: null;
  })
  | (GeocodeContext & SelectedPlace & {
    readonly status: "date-only";
    readonly input: Extract<GeocodeCivilInput, { kind: "date-only" }>;
    readonly time: null;
  })
  | (GeocodeContext & SelectedPlace & {
    /** Place selected and time provider answered; inspect time.status. */
    readonly status: "time-result";
    readonly input: Extract<GeocodeCivilInput, { kind: "civil-time" }>;
    readonly time: PlaceTimeResult;
  });

export interface Geocoder extends PlaceLookup {
  resolve(request: GeocodeRequest): Promise<GeocodeResult>;
}

function civilInput(request: GeocodeRequest): GeocodeCivilInput {
  if (!request || typeof request !== "object" || Array.isArray(request)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(request) as object | null)) {
    throw new RangeError("Expected a geocode request object.");
  }
  const byQuery = Object.hasOwn(request, "query");
  const byId = Object.hasOwn(request, "placeId");
  const allowed = byQuery ? ["query", "filters", "date", "time"] : ["placeId", "date", "time"];
  if (byQuery === byId || !Object.hasOwn(request, "date")
      || Reflect.ownKeys(request).some((key) => typeof key !== "string" || !allowed.includes(key))) {
    throw new RangeError("Expected either query with optional filters, or placeId, plus date and optional time.");
  }
  const { date } = request;
  if (Object.hasOwn(request, "time")) {
    const { time } = request;
    assertCivilTime(date, time as string);
    return Object.freeze({ kind: "civil-time", date, time: time as string });
  }
  assertCivilDate(date);
  return Object.freeze({ kind: "date-only", date });
}

/**
 * Compose the existing offline lookup and atlas-first time adapters. Loading
 * place bytes and atlas files is the caller's responsibility, never an import
 * side effect. The provider is trusted executable code, not untrusted JSON.
 */
export function createGeocoder(value: unknown, atlas: AtlasTimeProvider): Geocoder {
  if (!atlas || typeof atlas !== "object" || typeof atlas.resolve !== "function") {
    throw new RangeError("Expected an explicit atlas time provider.");
  }
  const places = createPlaceLookup(value);
  const times = createTimeResolver(atlas);

  async function resolve(request: GeocodeRequest): Promise<GeocodeResult> {
    // Validate civil input even when no place matches or no zone is assigned.
    const input = civilInput(request);
    let lookup: LookupResult | null = null;
    let place: PlaceRecord | undefined;
    let selection: SelectedPlace["selection"];
    if (Object.hasOwn(request, "query")) {
      // Do not treat an explicitly supplied undefined filter as an omission.
      if (Object.hasOwn(request, "filters") && request.filters === undefined) {
        throw new RangeError("Expected lookup filters when the filters field is supplied.");
      }
      lookup = places.lookup(request.query as string, request.filters);
      if (lookup.status !== "unique") {
        return Object.freeze({
          status: lookup.status === "ambiguous" ? "ambiguous-place" : "no-match",
          input, provenance: places.provenance, lookup, place: null, selection: null, time: null
        });
      }
      place = lookup.candidates[0]!.place;
      selection = "unique-match";
    } else {
      place = places.getById(request.placeId as string);
      selection = "explicit-id";
    }
    if (!place) {
      return Object.freeze({
        status: "unknown-place", input, provenance: places.provenance, lookup,
        place: null, selection: null, time: null
      });
    }
    const selected = { provenance: places.provenance, lookup, place, selection };
    if (input.kind === "date-only") {
      return Object.freeze({ ...selected, status: "date-only", input, time: null });
    }
    const time = await times.resolve({
      place, dataset: places.provenance.dataset, date: input.date, time: input.time
    });
    // Keep native fields (including Date), but isolate caller mutations even
    // when an injected atlas provider reuses its answer object.
    return Object.freeze({ ...selected, status: "time-result", input, time: structuredClone(time) });
  }

  return Object.freeze({ ...places, resolve });
}
