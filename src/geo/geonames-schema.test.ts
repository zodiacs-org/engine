import { describe, expect, it, vi } from "vitest";

import { createGeoNamesClient } from "../geo.js";

const indexData = {
  version: 1,
  source: "Synthetic GeoNames schema fixture",
  count: 2,
  tz: ["UTC"],
  admin1: [""],
  countries: ["Test country"],
  shards: ["n", "s"]
};
const north = ["New Test City", 0, 0, 0, 1000, 2000, 0, 100];
const south = ["South Test City", 0, 0, 0, -1000, -2000, 0, 0];

function json(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function rowAt(position: number, value: unknown): unknown[] {
  const row = [...north];
  row[position] = value as string | number;
  return [row];
}

const invalidIndexes: [string, unknown][] = [
  ["null root", null],
  ["array root", []],
  ["error envelope", { error: "Temporarily unavailable" }],
  ["missing tables", { version: 1, source: "Incomplete upload", count: 2, shards: ["n"] }],
  ["unsupported version", { ...indexData, version: 2 }],
  ["string version", { ...indexData, version: "1" }],
  ["object source", { ...indexData, source: {} }],
  ["empty source", { ...indexData, source: "" }],
  ["negative count", { ...indexData, count: -1 }],
  ["fractional count", { ...indexData, count: 1.5 }],
  ["unsafe count", { ...indexData, count: Number.MAX_SAFE_INTEGER + 1 }],
  ["object timezone table", { ...indexData, tz: { 0: "UTC" } }],
  ["missing timezone", { ...indexData, tz: [null] }],
  ["empty timezone", { ...indexData, tz: [""] }],
  ["whitespace timezone", { ...indexData, tz: ["  "] }],
  ["object region", { ...indexData, admin1: [{}] }],
  ["numeric country", { ...indexData, countries: [42] }],
  ["object shard list", { ...indexData, shards: { n: true } }],
  ["string shard list", { ...indexData, shards: "n" }],
  ["invalid shard type", { ...indexData, shards: [0] }],
  ["unsupported shard path", { ...indexData, shards: ["../n"] }],
  ["unsupported prototype shard", { ...indexData, shards: ["__proto__"] }],
  ["uppercase shard", { ...indexData, shards: ["N"] }],
  ["duplicate shard", { ...indexData, shards: ["n", "n"] }]
];

const invalidShards: [string, unknown][] = [
  ["null root", null],
  ["error envelope", { error: "Temporarily unavailable" }],
  ["string root", "Unavailable"],
  ["null row", [null]],
  ["object row", [{ 0: "New Test City" }]],
  ["truncated row", [north.slice(0, 7)]],
  ["extra row position", [[...north, "unexpected"]]],
  ["nonstring name", rowAt(0, 42)],
  ["empty name", rowAt(0, "")],
  ["invalid ascii sentinel", rowAt(1, 1)],
  ["empty ascii name", rowAt(1, "")],
  ["string region index", rowAt(2, "0")],
  ["prototype region index", rowAt(2, "__proto__")],
  ["out-of-bounds region index", rowAt(2, 1)],
  ["negative country index", rowAt(3, -1)],
  ["constructor country index", rowAt(3, "constructor")],
  ["fractional country index", rowAt(3, 0.5)],
  ["out-of-bounds country index", rowAt(3, 1)],
  ["string latitude", rowAt(4, "1000")],
  ["null latitude", rowAt(4, null)],
  ["unscaled fractional latitude", rowAt(4, 40.71)],
  ["latitude above north pole", rowAt(4, 9001)],
  ["latitude below south pole", rowAt(4, -9001)],
  ["longitude above antimeridian", rowAt(5, 18001)],
  ["longitude below antimeridian", rowAt(5, -18001)],
  ["fractional timezone index", rowAt(6, 0.5)],
  ["out-of-bounds timezone index", rowAt(6, 1)],
  ["prototype timezone index", rowAt(6, "__proto__")],
  ["negative population", rowAt(7, -1)],
  ["fractional population", rowAt(7, 0.5)],
  ["string population", rowAt(7, "100")],
  ["unsafe population", rowAt(7, Number.MAX_SAFE_INTEGER + 1)]
];

function expectSchemaFailure(results: PromiseSettledResult<unknown>[], resource: string) {
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  const first = (results[0] as PromiseRejectedResult).reason;
  expect(first).toBeInstanceOf(TypeError);
  expect(first.message).toBe(`Invalid GeoNames ${resource} data.`);
  for (const result of results) expect((result as PromiseRejectedResult).reason).toBe(first);
}

function requests(fetcher: ReturnType<typeof vi.fn>, file: string): number {
  return fetcher.mock.calls.filter(([url]) => String(url).endsWith(`/${file}`)).length;
}

describe("GeoNames fulfilled JSON validation and recovery", () => {
  it.each(invalidIndexes)("evicts invalid index: %s", async (_name, invalid) => {
    let count = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/index.json")) return json(++count === 1 ? invalid : indexData);
      return json([north]);
    });
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    const failed = await Promise.allSettled([
      client.preload(),
      client.searchCities("new"),
      client.preload()
    ]);
    expectSchemaFailure(failed, "index");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [metadata, cities] = await Promise.all([client.preload(), client.searchCities("new")]);
    expect(metadata).toMatchObject({ version: 1, count: 2, shards: ["n", "s"] });
    expect(cities).toMatchObject([
      { name: "New Test City", latitude: 10, longitude: 20, timeZone: "UTC" }
    ]);
    await client.searchCities("new");
    expect(requests(fetcher, "index.json")).toBe(2);
    expect(requests(fetcher, "n.json")).toBe(1);
  });

  it.each(invalidShards)("evicts invalid shard: %s", async (_name, invalid) => {
    let count = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/index.json")) return json(indexData);
      if (url.endsWith("/s.json")) return json([south]);
      return json(++count === 1 ? invalid : [north]);
    });
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.searchCities("south")).toMatchObject([{ name: "South Test City" }]);
    const failed = await Promise.allSettled([
      client.searchCities("new"),
      client.searchCities("new t")
    ]);
    expectSchemaFailure(failed, "shard");
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [cities, sameCities] = await Promise.all([
      client.searchCities("new"),
      client.searchCities("new t")
    ]);
    expect(cities).toMatchObject([
      { name: "New Test City", admin1: "", country: "Test country", timeZone: "UTC" }
    ]);
    expect(sameCities).toEqual(cities);
    await Promise.all([client.preload(), client.searchCities("south"), client.searchCities("new")]);
    expect(requests(fetcher, "index.json")).toBe(1);
    expect(requests(fetcher, "n.json")).toBe(2);
    expect(requests(fetcher, "s.json")).toBe(1);
  });

  it("rejects a nonfinite value produced by valid JSON numeric overflow", async () => {
    let count = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/index.json")) return json(indexData);
      return ++count === 1
        ? new Response('[["New Test City",0,0,0,1e400,0,0,100]]')
        : json([north]);
    });
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    await expect(client.searchCities("new")).rejects.toThrow("Invalid GeoNames shard data.");
    expect(await client.searchCities("new")).toMatchObject([{ latitude: 10 }]);
    expect(requests(fetcher, "n.json")).toBe(2);
  });

  it("validates the entire shard before caching or returning a limited result", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      json(String(input).endsWith("/index.json") ? indexData : [north, north, north, null])
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    await expect(client.searchCities("new", 1)).rejects.toThrow("Invalid GeoNames shard data.");
  });

  it("does not expose cached index arrays through preload", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      json(String(input).endsWith("/index.json") ? indexData : [north])
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    const metadata = await client.preload();
    (metadata.timeZones as string[])[0] = "Injected/Zone";
    (metadata.shards as string[]).splice(0);
    const again = await client.preload();
    expect(again.timeZones).toEqual(["UTC"]);
    expect(again.shards).toEqual(["n", "s"]);
    expect(await client.searchCities("new")).toMatchObject([{ timeZone: "UTC" }]);
    expect(requests(fetcher, "index.json")).toBe(1);
  });

  it("copies validated data returned by a custom fetch before caching it", async () => {
    const customIndex = structuredClone(indexData);
    const customRows = [[...north]];
    const fetcher = vi.fn(
      async (input: string | URL | Request) =>
        ({
          ok: true,
          json: async () => (String(input).endsWith("/index.json") ? customIndex : customRows)
        }) as Response
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.searchCities("new")).toMatchObject([{ latitude: 10, timeZone: "UTC" }]);
    customIndex.tz[0] = "Injected/Zone";
    customIndex.shards.length = 0;
    customRows[0]![4] = "bad coordinate";
    expect(await client.searchCities("new")).toMatchObject([{ latitude: 10, timeZone: "UTC" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["inherited", "accessor"])("does not read %s index fields", async (kind) => {
    const getter = vi.fn(() => 1);
    const invalid = kind === "inherited" ? Object.create(indexData) : { ...indexData };
    if (kind === "accessor") Object.defineProperty(invalid, "version", { get: getter });
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => invalid }) as Response);
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    await expect(client.preload()).rejects.toThrow("Invalid GeoNames index data.");
    expect(getter).not.toHaveBeenCalled();
  });

  it("preserves full geographic bounds, Unicode and host-independent timezone identifiers", async () => {
    const valid = {
      ...indexData,
      tz: ["America/Coyhaique", "Unrecognized/Host_Zone"],
      countries: [""],
      shards: ["n", "0"]
    };
    const validRows = [
      ["Nörd", "Nord", 0, 0, 9000, -18000, 0, 0],
      ["Nadir", 0, 0, 0, -9000, 18000, 1, Number.MAX_SAFE_INTEGER]
    ];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/index.json")) return json(valid);
      if (url.endsWith("/0.json")) return json([["東京", 0, 0, 0, 3568, 13976, 1, 0]]);
      return json(validRows);
    });
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.searchCities("nord")).toMatchObject([
      { name: "Nörd", latitude: 90, longitude: -180, country: "", timeZone: "America/Coyhaique" }
    ]);
    expect(await client.searchCities("nadir")).toMatchObject([
      {
        latitude: -90,
        longitude: 180,
        timeZone: "Unrecognized/Host_Zone",
        population: Number.MAX_SAFE_INTEGER
      }
    ]);
    expect(await client.searchCities("東京")).toMatchObject([{ name: "東京" }]);
  });

  it("accepts an empty generated index without fetching a shard", async () => {
    const fetcher = vi.fn(async () =>
      json({ ...indexData, count: 0, tz: [], admin1: [], countries: [], shards: [] })
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.preload()).toMatchObject({ count: 0, shards: [], timeZones: [] });
    expect(await client.searchCities("new")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps a successfully loaded empty array shard cached", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      json(String(input).endsWith("/index.json") ? indexData : [])
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.searchCities("new")).toEqual([]);
    expect(await client.searchCities("new")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cannot detect in-range table references from a different dataset generation", async () => {
    // Generation A assigns table slot 0 to UTC/Test country. A later generation
    // could reuse slot 0 for Pacific/Auckland/New Zealand. The v1 row carries
    // no generation identity, so its valid indices cannot express that change.
    const differentGenerationRow = ["New Plymouth", 0, 0, 0, -3907, 17408, 0, 58000];
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      json(String(input).endsWith("/index.json") ? indexData : [differentGenerationRow])
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    await client.preload();
    expect(await client.searchCities("new plymouth")).toMatchObject([
      { name: "New Plymouth", timeZone: "UTC", country: "Test country" }
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated metadata without copying prototype keys into output", async () => {
    const extended = JSON.parse(
      JSON.stringify(indexData).slice(0, -1) +
        ',"__proto__":{"polluted":true},"extra":{"note":"extension"}}'
    );
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      json(String(input).endsWith("/index.json") ? extended : [north])
    );
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    const metadata = await client.preload();
    expect(metadata).not.toHaveProperty("extra");
    expect(Object.hasOwn(metadata, "__proto__")).toBe(false);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    expect(await client.searchCities("new")).toMatchObject([{ name: "New Test City" }]);
  });
});
