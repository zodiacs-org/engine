/** A fetched source with explicit redistribution terms, not an assumed licence. */
export interface SourceCitation {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly locator: string;
  readonly retrievedOn: string;
  readonly license: string;
  readonly attribution: string;
}

/** Historical beliefs attributed to a named work; tags are not factual claims. */
export interface HistoricalAttribution {
  readonly status: "historical-attribution";
  readonly author: string;
  readonly work: string;
  readonly locator: string;
  readonly sourceId: string;
  readonly tags: readonly string[];
}

/** Tangential angular rates. raCosDec is mu_alpha * cos(delta), not dRA/dt. */
export interface ProperMotion {
  readonly raCosDecMasPerYear: number;
  readonly decMasPerYear: number;
  readonly sourceId: string;
}

/**
 * Astrometry on the J2000 mean equator and equinox, at the J2000 epoch.
 * ICRS source data must be converted explicitly through the engine's frame
 * helpers and record that derivation; ICRS is not silently labelled EQJ.
 */
export interface CatalogStar {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly frame: "j2000-mean-equator-equinox";
  readonly epochJulianYear: 2000;
  /** Right ascension, degrees in [0, 360), not hours. */
  readonly raDeg: number;
  /** Declination, north positive, degrees in [-90, 90]. */
  readonly decDeg: number;
  readonly astrometrySourceId: string;
  /** Null means unavailable, rather than measured zero motion. */
  readonly properMotion: ProperMotion | null;
  readonly historicalAttributions: readonly HistoricalAttribution[];
}

