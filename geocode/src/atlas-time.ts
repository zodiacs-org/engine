import { loadAtlas, resolve } from "./atlas-module.mjs";
import type { AtlasCitation, AtlasManifest, AtlasPlace, AtlasResolution } from "./atlas-module.mjs";
import { assertCivilTime } from "./civil-time.js";
import type { AtlasTimeProvider, AtlasTimeResult } from "./time.js";

/** Explicit Node-only loading. Importing this module does not read atlas files. */
export function loadAtlasTimeProvider(): AtlasTimeProvider {
  const atlas = loadAtlas();
  if (atlas.problems.length) throw new Error("The repository atlas reports data problems.");
  const bySourceId = new Map<string, AtlasPlace>();
  for (const place of atlas.places.values()) {
    const key = `geonames:${place.geonamesId}`;
    if (bySourceId.has(key)) throw new Error("The repository atlas repeats a GeoNames identifier.");
    bySourceId.set(key, place);
  }
  // These are the manifest's local civil boundaries, not UTC boundaries.
  const { start, end } = atlas.manifest.coverage;
  return Object.freeze({
    resolve(placeId: string, date: string, time: string) {
      assertCivilTime(date, time);
      const place = bySourceId.get(placeId);
      if (!place) return { status: "unmatched-place" as const };
      const local = `${date}T${time}:00`;
      // Avoid asking the atlas parser to read ancient years outside its remit.
      if (local < start || local >= end) return { status: "out-of-coverage" as const };
      const resolution = resolve(atlas, place.id, local, "civil");
      if (resolution.status === "out-of-coverage") return { status: "out-of-coverage" as const };
      const citationIds = new Set(resolution.instants.flatMap((instant) => instant.citations));
      const citations = [...citationIds].map((id) => {
        const citation = atlas.citations.get(id);
        if (!citation) throw new Error("The repository atlas is missing a cited source.");
        return citation;
      });
      const result: AtlasTimeResult = {
        provider: "atlas",
        status: resolution.status,
        timeZone: place.tzdbZone,
        timeZoneRole: "comparison",
        resolution,
        provenance: {
          source: "https://github.com/zodiacs-org/engine/tree/main/atlas",
          attribution: "Zodiacs.org historical time atlas; place coordinates from GeoNames (https://www.geonames.org/).",
          manifest: atlas.manifest,
          place,
          citations
        }
      };
      // Atlas readings reference rule arrays. Never let a caller mutate the loaded data.
      return { status: "covered" as const, result: structuredClone(result) };
    }
  });
}

export type { AtlasCitation, AtlasManifest, AtlasPlace, AtlasResolution };
