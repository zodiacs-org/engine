/**
 * How `searchCities` picks and orders rows from a shard, and the arguments
 * the client refuses. The index and shards are synthetic (invented place
 * names, no GeoNames rows); the retry and validation behaviour is covered in
 * geonames.test.ts and geonames-schema.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGeoNamesClient } from "../geo.js";

const index = {
  version: 1,
  source: "Synthetic GeoNames search fixture",
  count: 9,
  tz: ["UTC", "Etc/GMT-1"],
  admin1: ["", "North Region"],
  countries: ["Testland"],
  shards: ["0", "b", "z"]
};

// [name, ascii name or 0, admin1, country, latitude x100, longitude x100, tz, population]
const shards: Record<string, unknown[]> = {
  b: [
    ["Old Barton", 0, 1, 0, 100, 200, 0, 10],
    ["Barton", 0, 0, 0, 300, 400, 1, 20],
    ["Bartonville", 0, 0, 0, 500, 600, 0, 30],
    ["Upper Barton Heath", 0, 0, 0, 700, 800, 0, 40],
    ["Bärenfeld", "Barenfeld", 0, 0, -4500, -17950, 0, 50]
  ],
  z: [["Zürichsee Testdorf", "Zurichsee Testdorf", 1, 0, 4720, 855, 1, 60]],
  "0": [
    ["12 Oaks", 0, 0, 0, 0, 0, 0, 70],
    ["Ölberg Test", 0, 0, 0, 0, 0, 0, 80]
  ]
};

function client() {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const file = String(input).split("/").pop()!;
    const body = file === "index.json" ? index : shards[file.replace(/\.json$/u, "")];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(JSON.stringify(body));
  });
  return { search: createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher }), fetcher };
}

const names = (cities: { name: string }[]): string[] => cities.map((city) => city.name);

describe("searchCities ordering", () => {
  it("returns names that start with the query before names that only contain it, each in shard order", async () => {
    const { search } = client();
    expect(names(await search.searchCities("bart"))).toEqual(["Barton", "Bartonville", "Old Barton", "Upper Barton Heath"]);
  });

  it("matches inside a name only from three characters", async () => {
    const { search } = client();
    expect(names(await search.searchCities("ba"))).toEqual(["Barton", "Bartonville", "Bärenfeld"]);
    expect(names(await search.searchCities("bar"))).toEqual(["Barton", "Bartonville", "Bärenfeld", "Old Barton", "Upper Barton Heath"]);
  });

  it("cuts the result to the limit, prefix matches first", async () => {
    const { search } = client();
    expect(names(await search.searchCities("bart", 1))).toEqual(["Barton"]);
    expect(names(await search.searchCities("bart", 3))).toEqual(["Barton", "Bartonville", "Old Barton"]);
  });

  it("ignores case, surrounding spaces and combining accents in the query", async () => {
    const { search } = client();
    const plain = await search.searchCities("barenf");
    expect(names(plain)).toEqual(["Bärenfeld"]);
    expect(await search.searchCities("  BÄRENF  ")).toEqual(plain);
    expect(await search.searchCities("bärenf")).toEqual(plain);
  });

  it("searches the ASCII name when a row has one, and returns the name as written", async () => {
    const { search } = client();
    expect(await search.searchCities("zurichsee")).toEqual([
      {
        name: "Zürichsee Testdorf",
        admin1: "North Region",
        country: "Testland",
        latitude: 47.2,
        longitude: 8.55,
        timeZone: "Etc/GMT-1",
        population: 60
      }
    ]);
  });
});

describe("searchCities shard choice", () => {
  it("reads the shard of the query's first letter, after folding, and shard 0 for anything else", async () => {
    const { search, fetcher } = client();
    expect(names(await search.searchCities("12 o"))).toEqual(["12 Oaks"]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://example.test/cities/index.json", "https://example.test/cities/0.json"]);
    // "Ö" folds to "o", whose shard the index does not list: no request, no result,
    // although shard 0 holds a row whose unfolded name starts with "Ö".
    expect(await search.searchCities("ölberg")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns a negative coordinate as written, scaled by 1/100", async () => {
    const { search } = client();
    expect(await search.searchCities("barenfeld")).toMatchObject([{ latitude: -45, longitude: -179.5, admin1: "" }]);
  });
});

describe("createGeoNamesClient and searchCities arguments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a limit that is not a positive integer, before any request", async () => {
    const { search, fetcher } = client();
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(search.searchCities("barton", limit)).rejects.toThrow(new RangeError("limit must be a positive integer."));
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns eight cities by default", async () => {
    const many = Array.from({ length: 12 }, (_, i) => [`Barton ${String(i).padStart(2, "0")}`, 0, 0, 0, 0, 0, 0, i]);
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      new Response(JSON.stringify(String(input).endsWith("index.json") ? index : many))
    );
    const search = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(names(await search.searchCities("barton"))).toEqual(many.slice(0, 8).map((row) => row[0]));
  });

  it("refuses an empty or blank base URL", () => {
    const fetch = vi.fn();
    expect(() => createGeoNamesClient({ baseUrl: "", fetch })).toThrow(new RangeError("baseUrl is required."));
    expect(() => createGeoNamesClient({ baseUrl: "  ", fetch })).toThrow(RangeError);
  });

  it("needs a fetch when the host has none", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => createGeoNamesClient({ baseUrl: "https://example.test/cities" })).toThrow("A fetch implementation is required.");
  });

  it("uses the host's fetch when none is passed", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(index)));
    vi.stubGlobal("fetch", fetcher);
    await createGeoNamesClient({ baseUrl: "https://example.test/cities/" }).preload();
    expect(fetcher).toHaveBeenCalledWith("https://example.test/cities/index.json");
  });
});
