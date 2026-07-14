import { describe, expect, it, vi } from "vitest";

import { createGeoNamesClient, resolveBirth, resolveLocalToUtc } from "./geo.js";

describe("timezone resolution", () => {
  it("handles ordinary, gap, fold, and local-mean-time instants", () => {
    expect(resolveLocalToUtc("2024-01-15", "12:00", "America/New_York").utc.toISOString()).toBe(
      "2024-01-15T17:00:00.000Z"
    );

    const gap = resolveLocalToUtc("2024-03-10", "02:30", "America/New_York");
    expect(gap.flags).toContain("dst-gap");
    expect(gap.utc.toISOString()).toBe("2024-03-10T07:30:00.000Z");

    const fold = resolveLocalToUtc("2024-11-03", "01:30", "America/New_York");
    expect(fold.flags).toContain("dst-fold");
    expect(fold.utc.toISOString()).toBe("2024-11-03T05:30:00.000Z");

    const historic = resolveLocalToUtc("1907-07-06", "08:30", "America/Mexico_City");
    expect(historic.flags).toContain("lmt");
  });

  it("turns a local form into a core BirthInput", () => {
    const birth = resolveBirth({
      date: "2000-01-01",
      time: "12:00",
      timeZone: "UTC",
      latitude: 10,
      longitude: 20,
      houseSystem: "placidus"
    });
    expect(birth.utc).toEqual(new Date("2000-01-01T12:00:00.000Z"));
    expect(birth).toMatchObject({
      latitude: 10,
      longitude: 20,
      timeKnown: true,
      houseSystem: "placidus"
    });
  });
});

describe("GeoNames shard client", () => {
  it("loads only the matching shard and caches it", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("index.json")) {
        return new Response(
          JSON.stringify({
            version: 1,
            source: "GeoNames cities15000 (CC BY 4.0)",
            count: 2,
            tz: ["America/New_York"],
            admin1: ["New York"],
            countries: ["United States"],
            shards: ["n"]
          })
        );
      }
      return new Response(
        JSON.stringify([
          ["New York City", 0, 0, 0, 4071, -7401, 0, 8_000_000],
          ["Newburgh", 0, 0, 0, 4149, -7401, 0, 28_000]
        ])
      );
    });
    const client = createGeoNamesClient({
      baseUrl: "https://example.test/cities/",
      fetch: fetcher
    });

    const cities = await client.searchCities("new y");
    expect(cities[0]).toMatchObject({
      name: "New York City",
      latitude: 40.71,
      longitude: -74.01,
      timeZone: "America/New_York"
    });
    await client.searchCities("new y");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
