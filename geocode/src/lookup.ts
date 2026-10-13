import { parsePlaceDataset } from "./dataset.js";
import type { DatasetProvenance, PlaceRecord } from "./types.js";

export interface LookupOptions {
  /** Exact country code or country name, after search normalization. */
  readonly country?: string;
  /** Exact source region code or name; intersects the country and query. */
  readonly region?: string;
  /** Maximum candidates returned; ambiguity is computed before truncation. */
  readonly limit?: number;
}

export interface PlaceMatch {
  readonly kind: "exact" | "prefix";
  readonly field: "name" | "asciiName" | "alias";
  /** Unmodified source label that matched, not a confidence estimate. */
  readonly text: string;
}

export interface LookupCandidate {
  readonly place: PlaceRecord;
  readonly match: PlaceMatch;
}

export interface LookupResult {
  /** Uniqueness is relative to the supplied dataset, never worldwide. */
  readonly status: "no-match" | "unique" | "ambiguous";
  readonly total: number;
  readonly truncated: boolean;
  readonly candidates: readonly LookupCandidate[];
}

export interface PlaceLookup {
  readonly provenance: DatasetProvenance;
  readonly size: number;
  lookup(query: string, options?: LookupOptions): LookupResult;
  /** Exact source ID, independent of search ranking and result limits. */
  getById(placeId: string): PlaceRecord | undefined;
}

interface PreparedPlace {
  readonly place: PlaceRecord;
  readonly name: string;
  readonly countries: ReadonlySet<string>;
  readonly regions: ReadonlySet<string>;
  readonly qualifiers: ReadonlySet<string>;
}

interface NameEntry {
  readonly row: PreparedPlace;
  readonly field: PlaceMatch["field"];
  readonly text: string;
}

interface QueryPart {
  readonly city: string;
  readonly qualifier?: string;
  readonly region?: string;
  readonly country?: string;
}

const FIELD_ORDER = { name: 0, asciiName: 1, alias: 2 } as const;

// Deliberately independent of the host locale. Latin accent folding must not
// erase vowel marks in scripts such as Devanagari. This is not transliteration;
// spellings that need it come from asciiName and the source aliases.
function normalize(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .replace(/ß/gu, "ss").replace(/ς/gu, "σ")
    .replace(/['\u2018\u2019\u02bc]/gu, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim().normalize("NFC");
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function inputText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 512 || /[\p{Cc}\p{Cs}]/u.test(value)) {
    throw new RangeError(`Invalid lookup ${field}: expected text without controls, at most 512 UTF-16 code units.`);
  }
  return value;
}

function filterText(value: unknown, field: string): string {
  const text = inputText(value, field).normalize("NFKC");
  const result = normalize(text);
  if (!/[\p{L}\p{N}]/u.test(result)) {
    throw new RangeError(`Invalid lookup ${field}: expected a country or region label.`);
  }
  return result;
}

function parseOptions(options: LookupOptions): { country?: string; region?: string; limit: number } {
  if (!options || typeof options !== "object" || Array.isArray(options)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(options) as object | null)
      || Object.keys(options).some((key) => !["country", "region", "limit"].includes(key))) {
    throw new RangeError("Invalid lookup options: expected country, region and/or limit.");
  }
  const result: { country?: string; region?: string; limit: number } = { limit: 10 };
  if (Object.hasOwn(options, "country")) result.country = filterText(options.country, "country");
  if (Object.hasOwn(options, "region")) result.region = filterText(options.region, "region");
  if (Object.hasOwn(options, "limit")) {
    if (typeof options.limit !== "number" || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
      throw new RangeError("Invalid lookup limit: expected an integer from 1 to 100.");
    }
    result.limit = options.limit;
  }
  return result;
}

function queryParts(parts: readonly string[], qualifiers: ReadonlySet<string>, literalMatch: boolean): QueryPart[] {
  if (parts.length > 3 || (parts.length > 1 && parts.some((part) => !/[\p{L}\p{N}]/u.test(part)))) {
    if (literalMatch) return [];
    throw new RangeError("Invalid lookup query: expected city, optional region and optional country.");
  }
  const city = parts[0]!;
  if (!/[\p{L}\p{N}]/u.test(city)) return [];
  if (parts.length === 3) return [{ city, region: parts[1]!, country: parts[2]! }];
  if (parts.length === 2) return [{ city, region: parts[1]! }, { city, country: parts[1]! }];

  // Keep the entire phrase as a city as well as every valid city/qualifier
  // split. A city called "Amber North" must survive when North is a region.
  const result: QueryPart[] = [{ city }];
  for (let at = city.indexOf(" "); at >= 0; at = city.indexOf(" ", at + 1)) {
    const qualifier = city.slice(at + 1);
    if (qualifiers.has(qualifier)) result.push({ city: city.slice(0, at), qualifier });
  }
  return result;
}

function normalizedSet(labels: readonly (string | null)[]): Set<string> {
  return new Set(labels.filter((label): label is string => label !== null).map(normalize).filter(Boolean));
}

function lowerBound(names: readonly string[], query: string): number {
  let lo = 0;
  let hi = names.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (names[mid]! < query) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function compareMatch(a: PlaceMatch, b: PlaceMatch): number {
  return Number(a.kind === "prefix") - Number(b.kind === "prefix")
    || FIELD_ORDER[a.field] - FIELD_ORDER[b.field];
}

/** Build an in-memory search index from JSON-like data. No file or network I/O. */
export function createPlaceLookup(value: unknown): PlaceLookup {
  const dataset = parsePlaceDataset(value);
  const byId = new Map(dataset.places.map((place) => [place.id, place]));
  const postings = new Map<string, NameEntry[]>();
  const literalCommas = new Map<string, NameEntry[]>();
  const qualifiers = new Set<string>();
  const normalizedNames = new Map<string, string>();
  for (const place of dataset.places) {
    const countries = normalizedSet([place.countryCode, place.countryName]);
    const regions = normalizedSet([place.regionCode, place.regionName]);
    const placeQualifiers = new Set([...countries, ...regions]);
    for (const region of regions) for (const country of countries) placeQualifiers.add(`${region} ${country}`);
    for (const qualifier of placeQualifiers) qualifiers.add(qualifier);
    const row: PreparedPlace = { place, name: normalize(place.name), countries, regions, qualifiers: placeQualifiers };
    normalizedNames.set(place.id, row.name);
    const labels = new Map<string, NameEntry>();
    const add = (field: PlaceMatch["field"], text: string): void => {
      const key = normalize(text);
      if (!/[\p{L}\p{N}]/u.test(key)) return;
      // Some source names contain commas. Preserve their comma structure for
      // exact literal lookup as well as the ordinary normalized name index.
      const commaParts = text.normalize("NFKC").split(",").map(normalize);
      if (commaParts.length > 1) {
        const commaKey = commaParts.join(",");
        const entries = literalCommas.get(commaKey);
        const entry = { row, field, text };
        if (entries) entries.push(entry);
        else literalCommas.set(commaKey, [entry]);
      }
      const previous = labels.get(key);
      if (!previous || FIELD_ORDER[field] < FIELD_ORDER[previous.field]
          || (field === previous.field && text < previous.text)) labels.set(key, { row, field, text });
    };
    add("name", place.name);
    add("asciiName", place.asciiName);
    for (const alias of place.aliases) add("alias", alias);
    for (const [key, entry] of labels) {
      const list = postings.get(key);
      if (list) list.push(entry);
      else postings.set(key, [entry]);
    }
  }
  const names = [...postings.keys()].sort(compareText);

  function lookup(query: string, options: LookupOptions = {}): LookupResult {
    const filters = parseOptions(options);
    const commaParts = inputText(query, "query").normalize("NFKC").split(",").map(normalize);
    const literalEntries = commaParts.length > 1 ? literalCommas.get(commaParts.join(",")) : undefined;
    const parts = queryParts(commaParts, qualifiers, literalEntries !== undefined);
    const found = new Map<string, LookupCandidate>();
    function consider({ row, field, text }: NameEntry, kind: PlaceMatch["kind"], part?: QueryPart): void {
      if ((filters.country !== undefined && !row.countries.has(filters.country))
          || (filters.region !== undefined && !row.regions.has(filters.region))
          || (part?.qualifier !== undefined && !row.qualifiers.has(part.qualifier))
          || (part?.region !== undefined && !row.regions.has(part.region))
          || (part?.country !== undefined && !row.countries.has(part.country))) return;
      const match: PlaceMatch = { kind, field, text };
      const previous = found.get(row.place.id);
      if (!previous || compareMatch(match, previous.match) < 0
          || (compareMatch(match, previous.match) === 0 && text < previous.match.text)) {
        found.set(row.place.id, { place: row.place, match });
      }
    }
    for (const entry of literalEntries ?? []) consider(entry, "exact");
    for (const part of parts) {
      for (let at = lowerBound(names, part.city); at < names.length && names[at]!.startsWith(part.city); at++) {
        const key = names[at]!;
        for (const entry of postings.get(key)!) consider(entry, key === part.city ? "exact" : "prefix", part);
      }
    }
    const ranked = [...found.values()].sort((a, b) => compareMatch(a.match, b.match)
      || (b.place.population ?? -1) - (a.place.population ?? -1)
      || compareText(normalizedNames.get(a.place.id)!, normalizedNames.get(b.place.id)!)
      || compareText(a.place.id, b.place.id));
    const candidates = ranked.slice(0, filters.limit).map(({ place, match }) => Object.freeze({ place, match: Object.freeze(match) }));
    return Object.freeze({
      status: ranked.length === 0 ? "no-match" : ranked.length === 1 ? "unique" : "ambiguous",
      total: ranked.length,
      truncated: ranked.length > candidates.length,
      candidates: Object.freeze(candidates)
    });
  }

  function getById(placeId: string): PlaceRecord | undefined {
    const id = inputText(placeId, "place ID");
    if (!id || id.trim() !== id) throw new RangeError("Invalid lookup place ID: expected nonempty trimmed text.");
    return byId.get(id);
  }

  return Object.freeze({ provenance: dataset.provenance, size: dataset.places.length, lookup, getById });
}
