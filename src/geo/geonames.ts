export interface City {
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  population: number;
}

export interface GeoNamesIndexMetadata {
  version: number;
  source: string;
  count: number;
  timeZones: readonly string[];
  shards: readonly string[];
}

interface CityIndex {
  version: number;
  source: string;
  count: number;
  tz: string[];
  admin1: string[];
  countries: string[];
  shards: string[];
}

type CityRow = [string, string | 0, number, number, number, number, number, number];

export interface GeoNamesClientOptions {
  /** URL of a compatible directory containing index.json and shard JSON. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export interface GeoNamesClient {
  /** Returns metadata snapshots; mutating an array cannot change the client's cache. */
  preload(): Promise<GeoNamesIndexMetadata>;
  searchCities(query: string, limit?: number): Promise<City[]>;
}

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();

function joinedUrl(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/$/u, "")}/${file}`;
}

function invalidData(resource: "index" | "shard"): never {
  throw new TypeError(`Invalid GeoNames ${resource} data.`);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stringTable(value: unknown, nonempty = false): string[] {
  if (!Array.isArray(value)) invalidData("index");
  const table: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || (nonempty && !nonemptyString(item))) invalidData("index");
    table.push(item);
  }
  return table;
}

function validateIndex(value: unknown): CityIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalidData("index");
  // Read only the v1 fields, without inheriting keys or invoking property accessors.
  const own = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
  const version = own("version");
  const source = own("source");
  const count = own("count");
  if (version !== 1 || !nonemptyString(source) || !nonnegativeInteger(count)) invalidData("index");
  const tz = stringTable(own("tz"), true);
  const admin1 = stringTable(own("admin1"));
  const countries = stringTable(own("countries"));
  const shards = stringTable(own("shards"));
  if (
    shards.some((key) => key.length !== 1 || !/^[a-z0]$/u.test(key)) ||
    new Set(shards).size !== shards.length
  ) {
    invalidData("index");
  }
  return { version, source, count, tz, admin1, countries, shards };
}

function tableIndex(value: unknown, table: string[]): value is number {
  return nonnegativeInteger(value) && value < table.length;
}

function coordinate(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= maximum;
}

function validateShard(value: unknown, index: CityIndex): CityRow[] {
  if (!Array.isArray(value)) invalidData("shard");
  const rows: CityRow[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 8) invalidData("shard");
    const [name, ascii, admin1, country, latitude, longitude, timeZone, population] = row;
    if (
      !nonemptyString(name) ||
      (ascii !== 0 && !nonemptyString(ascii)) ||
      !tableIndex(admin1, index.admin1) ||
      !tableIndex(country, index.countries) ||
      !coordinate(latitude, 9000) ||
      !coordinate(longitude, 18000) ||
      !tableIndex(timeZone, index.tz) ||
      !nonnegativeInteger(population)
    ) {
      invalidData("shard");
    }
    rows.push([name, ascii, admin1, country, latitude, longitude, timeZone, population]);
  }
  return rows;
}

export function createGeoNamesClient(options: GeoNamesClientOptions): GeoNamesClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error("A fetch implementation is required.");
  if (!options.baseUrl.trim()) throw new RangeError("baseUrl is required.");

  let indexPromise: Promise<CityIndex> | undefined;
  const shardCache = new Map<string, Promise<CityRow[]>>();

  async function fetchJson(url: string): Promise<unknown> {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`GeoNames fetch failed: ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  function index(): Promise<CityIndex> {
    if (!indexPromise) {
      const request: Promise<CityIndex> = fetchJson(joinedUrl(options.baseUrl, "index.json"))
        .then(validateIndex)
        .catch((error: unknown) => {
          // Validation must reject inside the cached promise, so a later explicit
          // call can retry invalid HTTP-200 data just like a transport failure.
          if (indexPromise === request) indexPromise = undefined;
          throw error;
        });
      indexPromise = request;
    }
    return indexPromise;
  }

  function shard(key: string, loaded: CityIndex): Promise<CityRow[]> {
    let request = shardCache.get(key);
    if (!request) {
      request = fetchJson(joinedUrl(options.baseUrl, `${key}.json`))
        .then((value) => validateShard(value, loaded))
        .catch((error: unknown) => {
          if (shardCache.get(key) === request) shardCache.delete(key);
          throw error;
        });
      shardCache.set(key, request);
    }
    return request;
  }

  return {
    async preload() {
      const loaded = await index();
      return {
        version: loaded.version,
        source: loaded.source,
        count: loaded.count,
        timeZones: [...loaded.tz],
        shards: [...loaded.shards]
      };
    },

    async searchCities(query: string, limit = 8) {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("limit must be a positive integer.");
      }
      const needle = fold(query.trim());
      if (needle.length < 2) return [];

      const loaded = await index();
      const key = /^[a-z]/u.test(needle) ? (needle[0] ?? "0") : "0";
      if (!loaded.shards.includes(key)) return [];
      const rows = await shard(key, loaded);
      const starts: CityRow[] = [];
      const contains: CityRow[] = [];

      for (const row of rows) {
        const searchable = fold(typeof row[1] === "string" ? row[1] : row[0]);
        if (searchable.startsWith(needle)) starts.push(row);
        else if (needle.length >= 3 && searchable.includes(needle)) {
          contains.push(row);
        }
        if (starts.length >= limit * 3) break;
      }

      return [...starts, ...contains].slice(0, limit).flatMap<City>((row) => {
        const timeZone = loaded.tz[row[6]];
        if (!timeZone) return [];
        return [
          {
            name: row[0],
            admin1: loaded.admin1[row[2]] ?? "",
            country: loaded.countries[row[3]] ?? "",
            latitude: row[4] / 100,
            longitude: row[5] / 100,
            timeZone,
            population: row[7]
          }
        ];
      });
    }
  };
}
