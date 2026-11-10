import type { DatasetProvenance, PlaceDataset, PlaceRecord, SourceFile } from "./types.js";

/** Validation messages name fields, never echo submitted values. */
export class DatasetValidationError extends TypeError {
  override readonly name = "DatasetValidationError";

  constructor(readonly path: string, reason: string) {
    super(`Invalid place dataset at ${path}: ${reason}.`);
  }
}

function fail(path: string, reason: string): never {
  throw new DatasetValidationError(path, reason);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected a plain object");
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    fail(path, "unexpected or missing fields");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  // Array.map skips holes. Explicitly reject them before mapping records or aliases.
  for (let i = 0; i < value.length; i++) {
    if (!Object.hasOwn(value, i)) fail(path, "sparse arrays are not supported");
  }
  return value as unknown[];
}

function label(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512
      || value.trim() !== value || /[\p{Cc}\p{Cs}]/u.test(value)) {
    fail(path, "expected nonempty trimmed text without controls, at most 512 UTF-16 code units");
  }
  return value;
}

function nullableLabel(value: unknown, path: string): string | null {
  return value === null ? null : label(value, path);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected a finite number");
  return value;
}

function coordinate(value: unknown, path: string, limit: number): number {
  const result = finite(value, path);
  if (Math.abs(result) > limit) fail(path, "coordinate out of range");
  return result;
}

function height(value: unknown, path: string): number | null {
  return value === null ? null : finite(value, path);
}

function population(value: unknown, path: string): number | null {
  if (value === null) return null;
  const result = finite(value, path);
  if (!Number.isSafeInteger(result) || result < 0) fail(path, "expected a nonnegative safe integer");
  return result;
}

function sourceFile(value: unknown, path: string): SourceFile {
  const row = object(value, path, ["file", "url", "sha256"]);
  const file = label(row.file, `${path}.file`);
  const url = label(row.url, `${path}.url`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`${path}.url`, "expected an absolute HTTPS source URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail(`${path}.url`, "expected an absolute HTTPS source URL without credentials");
  }
  if (typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(row.sha256)) {
    fail(`${path}.sha256`, "expected a lowercase SHA-256 digest");
  }
  return Object.freeze({ file, url, sha256: row.sha256 });
}

function provenance(value: unknown): DatasetProvenance {
  const path = "provenance";
  const row = object(value, path, ["dataset", "license", "attribution", "sources"]);
  if (row.dataset !== "synthetic" && row.dataset !== "geonames") fail(`${path}.dataset`, "unsupported dataset");
  const license = row.dataset === "geonames" ? "CC-BY-4.0" : "MIT";
  if (row.license !== license) fail(`${path}.license`, "license does not match the dataset");
  const attribution = label(row.attribution, `${path}.attribution`);
  const sources = array(row.sources, `${path}.sources`).map((source, i) => sourceFile(source, `${path}.sources[${i}]`));
  if (row.dataset === "geonames" && sources.length === 0) fail(`${path}.sources`, "GeoNames requires source provenance");
  const names = new Set<string>();
  for (const source of sources) {
    if (names.has(source.file)) fail(`${path}.sources`, "duplicate source file");
    names.add(source.file);
  }
  return Object.freeze({ dataset: row.dataset, license, attribution, sources: Object.freeze(sources) });
}

function place(value: unknown, path: string, dataset: DatasetProvenance["dataset"]): PlaceRecord {
  const row = object(value, path, [
    "id", "name", "asciiName", "aliases", "countryCode", "countryName",
    "regionCode", "regionName", "latitude", "longitude", "elevationMeters",
    "demElevationMeters", "population", "timeZone"
  ]);
  const id = label(row.id, `${path}.id`);
  const idPattern = dataset === "geonames" ? /^geonames:[1-9][0-9]*$/u : /^synthetic:[a-z0-9][a-z0-9-]*$/u;
  if (!idPattern.test(id)) fail(`${path}.id`, "expected a source-prefixed identifier");
  const aliases = array(row.aliases, `${path}.aliases`);
  if (aliases.length > 1024) fail(`${path}.aliases`, "too many aliases");
  const parsedAliases = aliases.map((alias, i) => label(alias, `${path}.aliases[${i}]`));
  if (new Set(parsedAliases).size !== parsedAliases.length) fail(`${path}.aliases`, "duplicate aliases");
  const countryCode = label(row.countryCode, `${path}.countryCode`);
  if (!/^[A-Z]{2}$/u.test(countryCode)) fail(`${path}.countryCode`, "expected an uppercase country code");
  const timeZone = nullableLabel(row.timeZone, `${path}.timeZone`);
  // Syntax only. The timezone adapter must check its actual IANA provider later.
  if (timeZone !== null && !/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/u.test(timeZone)) {
    fail(`${path}.timeZone`, "expected a timezone identifier, not an offset");
  }
  return Object.freeze({
    id,
    name: label(row.name, `${path}.name`),
    asciiName: label(row.asciiName, `${path}.asciiName`),
    aliases: Object.freeze(parsedAliases),
    countryCode,
    countryName: label(row.countryName, `${path}.countryName`),
    regionCode: nullableLabel(row.regionCode, `${path}.regionCode`),
    regionName: nullableLabel(row.regionName, `${path}.regionName`),
    latitude: coordinate(row.latitude, `${path}.latitude`, 90),
    longitude: coordinate(row.longitude, `${path}.longitude`, 180),
    elevationMeters: height(row.elevationMeters, `${path}.elevationMeters`),
    demElevationMeters: height(row.demElevationMeters, `${path}.demElevationMeters`),
    population: population(row.population, `${path}.population`),
    timeZone
  });
}

/** Validate parsed JSON and return a detached, deeply frozen snapshot. No I/O. */
export function parsePlaceDataset(value: unknown): PlaceDataset {
  const row = object(value, "dataset", ["schemaVersion", "provenance", "places"]);
  if (row.schemaVersion !== 1) fail("schemaVersion", "unsupported schema version");
  const source = provenance(row.provenance);
  const places = array(row.places, "places").map((entry, i) => place(entry, `places[${i}]`, source.dataset));
  const ids = new Set<string>();
  for (let i = 0; i < places.length; i++) {
    const entry = places[i]!;
    if (ids.has(entry.id)) fail(`places[${i}].id`, "duplicate place identifier");
    ids.add(entry.id);
  }
  return Object.freeze({ schemaVersion: 1, provenance: source, places: Object.freeze(places) });
}
