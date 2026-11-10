import acquisition from "../data/sao-acquisition.json" with { type: "json" };
import aliases from "../data/sao-aliases.json" with { type: "json" };
import rawSource from "../data/sao-source.json" with { type: "json" };
import { CATALOGUE_SELECTION, j2000EclipticLatitude, sha256, validateSaoSource } from "./catalogue-source.js";
import type { SaoSource } from "./catalogue-source.js";

export interface CatalogueStar {
  readonly id: string;
  readonly sao: number;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly aliasSourceUrl: string | null;
  readonly group: "named-lunar-target" | "pleiades" | null;
  readonly raDegrees: number;
  readonly decDegrees: number;
  readonly epochJulianYear: 2000;
  readonly frame: "FK5-J2000";
  readonly properMotion: {
    readonly raCosDecMasPerYear: number | null;
    readonly decMasPerYear: number | null;
  };
  readonly parallaxMas: null;
  readonly radialVelocityKmPerSecond: null;
  readonly magnitude: {
    readonly value: number | null;
    readonly band: "SAO-heterogeneous-visual";
    readonly sourceCode: number | null;
  };
  readonly multiplicity: "flagged-double" | "unknown";
  readonly variability: "flagged-variable" | "unknown";
  readonly sourceCodes: {
    readonly duplicityVariability: number | null;
    readonly catalogue: number | null;
    readonly properMotion: number | null;
  };
  readonly selection: "named-inclusion" | "magnitude-and-latitude";
  readonly j2000EclipticLatitudeDegrees: number;
  readonly limitations: readonly string[];
  /** SHA-256 of the exact source row, with no trailing newline. */
  readonly sourceRowSha256: string;
}

export interface CatalogueReceipt {
  readonly schema: "zodiacs.occultations.catalogue-receipt.v1";
  readonly implementation: "sao-catalogue/1";
  readonly catalogue: string;
  readonly sourceQueryUrl: string;
  readonly sourceRetrievedAt: string;
  readonly sourceDescriptionUrl: string;
  readonly sourceQuerySha256: string;
  /** SHA-256 of JSON.stringify of the committed JSON value, without whitespace. */
  readonly subsetCanonicalJsonSha256: string;
  readonly aliasesCanonicalJsonSha256: string;
  readonly selection: typeof CATALOGUE_SELECTION;
  readonly conventions: readonly string[];
  readonly validation: "source-transcription;contact-accuracy-unmeasured";
}

export interface StarCatalogue {
  readonly stars: readonly CatalogueStar[];
  readonly receipt: CatalogueReceipt;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Offline source catalogue, not propagated or apparent stellar positions. */
export function starCatalogue(): StarCatalogue {
  const source = rawSource as SaoSource;
  const records = validateSaoSource(source);
  const stars = records.map((record, index): CatalogueStar => {
    const named = aliases.entries.find((entry) => entry.sao === record.sao);
    const code = record.duplicityVariabilityCode;
    const double = code === 1 || code === 2 || code === 3 || code === 7;
    const variable = code === 4 || code === 5 || code === 6 || code === 7 || record.magnitudeSourceCode === 17;
    return {
      id: `sao:${record.sao}`, sao: record.sao, label: named?.label ?? `SAO ${record.sao}`,
      aliases: [...new Set([`SAO ${record.sao}`, ...(named ? [named.label, ...named.aliases] : [])])],
      aliasSourceUrl: named?.sourceUrl ?? null,
      group: (named?.group as CatalogueStar["group"] | undefined) ?? null,
      raDegrees: record.raDegrees, decDegrees: record.decDegrees, epochJulianYear: 2000, frame: "FK5-J2000",
      properMotion: {
        raCosDecMasPerYear: record.raSecondsOfTimePerYear === null ? null :
          record.raSecondsOfTimePerYear * 15 * Math.cos(record.decDegrees * Math.PI / 180) * 1000,
        decMasPerYear: record.decArcsecondsPerYear === null ? null : record.decArcsecondsPerYear * 1000
      },
      parallaxMas: null, radialVelocityKmPerSecond: null,
      magnitude: { value: record.visualMagnitude, band: "SAO-heterogeneous-visual", sourceCode: record.magnitudeSourceCode },
      multiplicity: double ? "flagged-double" : "unknown", variability: variable ? "flagged-variable" : "unknown",
      sourceCodes: { duplicityVariability: code, catalogue: record.sourceCatalogueCode, properMotion: record.properMotionSourceCode },
      selection: named ? "named-inclusion" : "magnitude-and-latitude",
      j2000EclipticLatitudeDegrees: j2000EclipticLatitude(record),
      limitations: [
        "historical-astrometry;contact-accuracy-unmeasured", "parallax-unavailable", "radial-velocity-unavailable",
        "no-component-orbit-or-photocentre-model", "magnitude-not-an-event-brightness",
        ...(double ? ["catalogue-double-flag"] : ["multiplicity-unknown"]),
        ...(variable ? ["catalogue-variable-flag"] : []),
        ...(record.magnitudeSourceCode === 16 ? ["combined-magnitude"] : []),
        ...(record.raSecondsOfTimePerYear === null || record.decArcsecondsPerYear === null ? ["proper-motion-incomplete"] : [])
      ],
      sourceRowSha256: sha256(source.rows[index]!)
    };
  });
  return freeze({
    stars,
    receipt: {
      schema: "zodiacs.occultations.catalogue-receipt.v1", implementation: "sao-catalogue/1",
      catalogue: acquisition.catalogue, sourceQuerySha256: acquisition.sha256,
      sourceQueryUrl: acquisition.url, sourceRetrievedAt: acquisition.retrievedAt,
      sourceDescriptionUrl: acquisition.descriptionUrl,
      subsetCanonicalJsonSha256: sha256(JSON.stringify(source)), aliasesCanonicalJsonSha256: sha256(JSON.stringify(aliases)),
      selection: structuredClone(CATALOGUE_SELECTION),
      conventions: [
        "epoch-and-equinox:J2000;frame:FK5", "pmra-source:seconds-of-time-per-year;unweighted",
        "pmra-normalized:mas-per-year;cos-dec-weighted", "pmdec-normalized:mas-per-year",
        "missing-motion:null;never-zero-filled", "parallax-and-radial-velocity:unavailable",
        "selection:fixed-J2000-prefilter;not-window-completeness", "multiplicity:no-component-solution"
      ],
      validation: "source-transcription;contact-accuracy-unmeasured"
    }
  });
}
