import { describe, expect, it, vi } from "vitest";

import { createGeoNamesClient, offsetAt, resolveBirth, resolveLocalToUtc } from "./geo.js";
import type { LocalBirthInput } from "./geo.js";

describe("timezone resolution", () => {
  it.each([undefined, null, "", "   ", false, 0, { toString: () => "UTC" }])(
    "requires an explicit nonempty timezone string instead of using the host zone: %j",
    (timeZone) => {
      expect(() => offsetAt(timeZone as string, 0)).toThrow(RangeError);
      expect(() => resolveLocalToUtc("2024-01-01", "12:00", timeZone as string)).toThrow(
        RangeError
      );
    }
  );

  it.each([undefined, null, false, 0, [], { toString: () => "2024-01-01" }])(
    "rejects a nonstring local date or time: %j",
    (input) => {
      expect(() => resolveLocalToUtc(input as string, "12:00", "UTC")).toThrow(RangeError);
      expect(() => resolveLocalToUtc("2024-01-01", input as string, "UTC")).toThrow(RangeError);
    }
  );

  it.each([undefined, null, false, "0", NaN, Infinity, {}])(
    "rejects a non-finite or nonnumeric offsetAt timestamp: %j",
    (timestamp) => {
      expect(() => offsetAt("UTC", timestamp as number)).toThrow(RangeError);
    }
  );

  it.each([undefined, null, false, []])("rejects a malformed birth form: %j", (input) => {
    expect(() => resolveBirth(input as unknown as LocalBirthInput)).toThrow(RangeError);
  });

  it.each(["0000-02-29", "0001-01-01", "0099-12-31", "0100-01-01", "0999-12-31"])(
    "preserves the Gregorian year and ordinary-time flags for %s in UTC",
    (date) => {
      const resolution = resolveLocalToUtc(date, "00:00", "UTC");
      expect(resolution.utc.toISOString()).toBe(`${date}T00:00:00.000Z`);
      expect(resolution.offsetMinutes).toBe(0);
      expect(resolution.flags).toEqual([]);
    }
  );

  it.each([
    ["0000-01-01", "Etc/GMT-14", "-000001-12-31T10:00:00.000Z", 840],
    ["0099-12-31", "Etc/GMT+12", "0099-12-31T12:00:00.000Z", -720],
    ["0100-01-01", "Etc/GMT-14", "0099-12-31T10:00:00.000Z", 840]
  ])("keeps year boundaries ordinary for %s in %s", (date, timeZone, expected, offset) => {
    const resolution = resolveLocalToUtc(date, "00:00", timeZone);
    expect(resolution.utc.toISOString()).toBe(expected);
    expect(resolution.offsetMinutes).toBe(offset);
    expect(resolution.flags).toEqual([]);
  });

  it.each(["0000-02-30", "0001-02-29", "0100-02-29", "2024-02-29\n"])(
    "rejects invalid local calendar date %j",
    (date) => {
      expect(() => resolveLocalToUtc(date, "12:00", "UTC")).toThrow(RangeError);
    }
  );

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
    expect(historic.utc.toISOString()).toBe("1907-07-06T15:06:36.000Z");
    expect(historic.offsetMinutes).toBeCloseTo(-396.6, 10);
    expect(historic.flags).toEqual(["lmt"]);
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

  it("retains local noon and unknown-time settings for an early-year birth", () => {
    const birth = resolveBirth({
      date: "0000-02-29",
      timeZone: "UTC",
      timeKnown: false
    });
    expect(birth.utc).toEqual(new Date("0000-02-29T12:00:00.000Z"));
    expect(birth.timeKnown).toBe(false);
    expect(birth.flags).toEqual([]);
    expect(birth.houseSystem).toBe("whole");
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
