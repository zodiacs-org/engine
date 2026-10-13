import type { AtlasCitation, AtlasManifest, AtlasPlace, AtlasResolution } from "./atlas-module.mjs";
import { assertCivilTime } from "./civil-time.js";
import { resolveIanaTime } from "./iana-time.js";
import type { IanaTimeResolution, UnavailableTimeResolution } from "./iana-time.js";
import type { DatasetProvenance, PlaceRecord } from "./types.js";

export interface AtlasTimeResult {
  readonly provider: "atlas";
  readonly status: Exclude<AtlasResolution["status"], "out-of-coverage">;
  /** The atlas's comparison label, not the authority for historical offsets. */
  readonly timeZone: string;
  readonly timeZoneRole: "comparison";
  readonly resolution: AtlasResolution;
  readonly provenance: {
    readonly source: string;
    readonly attribution: string;
    readonly manifest: AtlasManifest;
    readonly place: AtlasPlace;
    readonly citations: readonly AtlasCitation[];
  };
}

export interface AtlasTimeProvider {
  /** Receives only an explicit source ID, never a name or guessed jurisdiction. */
  resolve(placeId: string, date: string, time: string):
    | { readonly status: "covered"; readonly result: AtlasTimeResult }
    | { readonly status: "unmatched-place" | "out-of-coverage" };
}

export interface PlaceTimeRequest {
  readonly place: PlaceRecord;
  readonly dataset: DatasetProvenance["dataset"];
  readonly date: string;
  readonly time: string;
}

export type PlaceTimeResult = AtlasTimeResult | (
  (IanaTimeResolution | UnavailableTimeResolution) & {
    readonly atlasFallback: "not-geonames" | "unmatched-place" | "out-of-coverage";
    readonly timeZoneRole: "source-assignment";
  }
);

export interface TimeResolver {
  resolve(input: PlaceTimeRequest): Promise<PlaceTimeResult>;
}

/** Construct an offline resolver over an explicit atlas provider, without I/O. */
export function createTimeResolver(atlas: AtlasTimeProvider): TimeResolver {
  return Object.freeze({
    async resolve(input: PlaceTimeRequest): Promise<PlaceTimeResult> {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new RangeError("Expected a place, dataset, date and time.");
      }
      const { place, dataset, date, time } = input;
      assertCivilTime(date, time);
      if (!place || typeof place !== "object" || typeof place.id !== "string"
          || (dataset !== "geonames" && dataset !== "synthetic")) {
        throw new RangeError("Expected a validated place and its dataset kind.");
      }
      const attempt = dataset === "geonames" ? atlas.resolve(place.id, date, time)
        : { status: "not-geonames" as const };
      if (attempt.status === "covered") return attempt.result;
      const result = await resolveIanaTime(date, time, place.timeZone);
      return { ...result, atlasFallback: attempt.status, timeZoneRole: "source-assignment" };
    }
  });
}
