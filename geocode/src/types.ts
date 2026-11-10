/** Coordinates use WGS84 decimal degrees; heights are metres above sea level. */
export interface PlaceRecord {
  readonly id: string;
  readonly name: string;
  /** Source transliteration field, retained as supplied; not guaranteed ASCII. */
  readonly asciiName: string;
  readonly aliases: readonly string[];
  readonly countryCode: string;
  readonly countryName: string;
  /** First administrative division; opaque source code, not assumed to be ISO. */
  readonly regionCode: string | null;
  readonly regionName: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevationMeters: number | null;
  /** Terrain-model estimate, kept separate from the source elevation field. */
  readonly demElevationMeters: number | null;
  readonly population: number | null;
  /** Source IANA identifier; null means no known assignment, never UTC. */
  readonly timeZone: string | null;
}

export interface SourceFile {
  readonly file: string;
  readonly url: string;
  readonly sha256: string;
}

export interface DatasetProvenance {
  readonly dataset: "synthetic" | "geonames";
  readonly license: "MIT" | "CC-BY-4.0";
  readonly attribution: string;
  readonly sources: readonly SourceFile[];
}

export interface PlaceDataset {
  readonly schemaVersion: 1;
  readonly provenance: DatasetProvenance;
  readonly places: readonly PlaceRecord[];
}
