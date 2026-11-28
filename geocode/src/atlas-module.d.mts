/** Only the atlas fields used by the adapter; data and math stay in atlas/. */
export interface AtlasPlace {
  readonly id: string;
  readonly geonamesId: number;
  readonly jurisdiction: string;
  readonly latitude: number;
  readonly longitude: number;
  /** A comparison zone, not a claim that tzdb describes the historical clock. */
  readonly tzdbZone: string;
}

export interface AtlasManifest {
  readonly name: string;
  readonly version: string;
  readonly released: string;
  readonly license: string;
  readonly coverage: {
    readonly start: string;
    readonly end: string;
    readonly countries: readonly string[];
    readonly note: string;
  };
  readonly longitudeSource: Readonly<Record<string, unknown>>;
}

export interface AtlasCitation extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly url: string;
  readonly locator: string;
  readonly excerpt: string;
}

export interface AtlasInstant {
  readonly utc: string;
  readonly utcMs: number;
  readonly offset: string;
  readonly offsetSeconds: number;
  readonly rule: string;
  readonly ruleVersion: number;
  readonly isDst: boolean;
  readonly abbreviation: string | null;
  readonly uncertainty: {
    readonly flag: "documented" | "inferred" | "uncertain";
    readonly reasons: readonly string[];
  };
  readonly citations: readonly string[];
}

export interface AtlasResolution {
  readonly place: string | null;
  readonly jurisdiction: string;
  readonly clock: "civil";
  readonly local: string;
  readonly status: "ok" | "ambiguous" | "nonexistent" | "out-of-coverage" | "no-such-clock";
  readonly instants: readonly AtlasInstant[];
  readonly skipped?: { readonly from: string; readonly to: string };
  readonly reason?: string;
}

export interface AtlasData {
  readonly manifest: AtlasManifest;
  readonly places: Map<string, AtlasPlace>;
  readonly citations: Map<string, AtlasCitation>;
  readonly problems: readonly string[];
}

export function loadAtlas(): AtlasData;
export function resolve(atlas: AtlasData, place: string, local: string, clock?: "civil"): AtlasResolution;
