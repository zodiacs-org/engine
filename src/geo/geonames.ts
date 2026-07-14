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

export function createGeoNamesClient(options: GeoNamesClientOptions): GeoNamesClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error("A fetch implementation is required.");
  if (!options.baseUrl.trim()) throw new RangeError("baseUrl is required.");

  let indexPromise: Promise<CityIndex> | undefined;
  const shardCache = new Map<string, Promise<CityRow[]>>();

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`GeoNames fetch failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  function index(): Promise<CityIndex> {
    indexPromise ??= fetchJson<CityIndex>(joinedUrl(options.baseUrl, "index.json"));
    return indexPromise;
  }

  function shard(key: string): Promise<CityRow[]> {
    let request = shardCache.get(key);
    if (!request) {
      request = fetchJson<CityRow[]>(joinedUrl(options.baseUrl, `${key}.json`));
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
        timeZones: loaded.tz,
        shards: loaded.shards
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
      const rows = await shard(key);
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
