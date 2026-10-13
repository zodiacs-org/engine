import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAtlas, resolve as resolveAtlas } from "../src/atlas-module.mjs";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { createTimeResolver } from "../src/index.js";
import type { AtlasTimeResult, PlaceRecord, PlaceTimeRequest } from "../src/index.js";

const atlas = loadAtlas();
const provider = loadAtlasTimeProvider();
const resolver = createTimeResolver(provider);

// Contrived caller records exercise routing, not geographic accuracy. The
// existing atlas supplies all historical facts, coordinates and expectations.
function place(id: string, timeZone: string | null = "Etc/UTC"): PlaceRecord {
  return {
    id, name: "Invented Harbour", asciiName: "Invented Harbour", aliases: [],
    countryCode: "FR", countryName: "France", regionCode: null, regionName: null,
    latitude: 0, longitude: 0, elevationMeters: null, demElevationMeters: null,
    population: null, timeZone
  };
}

function input(atlasId: string, date: string, time = "12:00"): PlaceTimeRequest {
  const record = atlas.places.get(atlasId)!;
  return { place: place(`geonames:${record.geonamesId}`, record.tzdbZone), dataset: "geonames", date, time };
}

function covered(value: Awaited<ReturnType<typeof resolver.resolve>>): AtlasTimeResult {
  expect(value.provider).toBe("atlas");
  if (value.provider !== "atlas") throw new Error("Expected atlas routing");
  return value;
}

afterEach(() => vi.restoreAllMocks());

describe("atlas adapter integration (existing resolver is the behavior reference)", () => {
  it.each([...atlas.places.values()].map((record) => record.id))(
    "joins %s by source ID, retaining its native result and complete cited passages", async (id) => {
      const request = input(id, "1880-06-01");
      const actual = covered(await resolver.resolve(request));
      const expected = resolveAtlas(atlas, id, "1880-06-01T12:00:00");
      expect(actual.resolution).toEqual(expected);
      expect(actual.status).toBe(expected.status);
      expect(actual.timeZoneRole).toBe("comparison");
      expect(actual.provenance.manifest).toEqual(atlas.manifest);
      expect(actual.provenance.place).toEqual(atlas.places.get(id));
      expect(actual.timeZone).toBe(atlas.places.get(id)!.tzdbZone);
      expect(actual.provenance.source).toContain("/engine/tree/main/atlas");
      expect(actual.provenance.attribution).toContain("GeoNames");
      const ids = [...new Set(expected.instants.flatMap((instant) => instant.citations))];
      expect(ids.length).toBeGreaterThan(0);
      expect(actual.provenance.citations).toEqual(ids.map((key) => atlas.citations.get(key)));
    }
  );

  it.each([
    ["fr-brest", "1891-03-20", "12:00", "ok"],
    ["fr-strasbourg", "1918-12-20", "12:00", "ok"],
    ["us-new-york", "1883-11-18", "12:01", "ambiguous"],
    ["us-new-york", "1918-03-31", "02:30", "nonexistent"],
    ["us-new-york", "1918-10-27", "01:30", "ambiguous"]
  ])("preserves covered uncertainty and gap/fold details for %s %s %s", async (id, date, time, status) => {
    const actual = covered(await resolver.resolve(input(id, date, time)));
    const expected = resolveAtlas(atlas, id, `${date}T${time}:00`);
    expect(actual.status).toBe(status);
    expect(actual.resolution).toEqual(expected);
    if (date === "1891-03-20" || date === "1918-12-20" || date === "1883-11-18") {
      expect(actual.resolution.instants.some((instant) => instant.uncertainty.flag === "uncertain")).toBe(true);
    }
    if (date === "1883-11-18") {
      expect(actual.resolution.instants).toHaveLength(2);
      expect(actual.resolution.instants.some((instant) => !Number.isInteger(instant.offsetSeconds))).toBe(true);
    }
    if (status === "nonexistent") expect(actual.resolution.skipped).toBeDefined();
  });

  it.each([null, "Invented/Unavailable", "Etc/UTC"])(
    "uses atlas facts even when the source's zone is %s and Intl is unavailable", async (timeZone) => {
      vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected Intl access"); });
      const request = input("fr-brest", "1880-06-01");
      const actual = covered(await resolver.resolve({ ...request, place: { ...request.place, timeZone, longitude: 120 } }));
      expect(actual.resolution).toEqual(resolveAtlas(atlas, "fr-brest", "1880-06-01T12:00:00"));
      expect(actual.provenance.place.longitude).toBe(atlas.places.get("fr-brest")!.longitude);
    }
  );

  it.each(["geonames:900000000000001", "geonames:02988507", "synthetic:paris", "2988507"])(
    "does not infer coverage from matching labels, coordinates or the wrong ID %s", async (id) => {
      const record = atlas.places.get("fr-paris")!;
      const result = await resolver.resolve({
        place: { ...place(id), name: "Paris", latitude: record.latitude, longitude: record.longitude },
        dataset: "geonames", date: "1880-06-01", time: "12:00"
      });
      expect(result).toMatchObject({ provider: "iana", atlasFallback: "unmatched-place", timeZone: "Etc/UTC" });
    }
  );

  it("requires GeoNames provenance as well as a matching source ID", async () => {
    const request = input("fr-paris", "1880-06-01");
    const result = await resolver.resolve({ ...request, dataset: "synthetic" });
    expect(result).toMatchObject({ provider: "iana", atlasFallback: "not-geonames" });
  });

  it.each([
    ["1869-12-31", "23:59", "iana"],
    ["1870-01-01", "00:00", "atlas"],
    ["1919-12-31", "23:59", "atlas"],
    ["1920-01-01", "00:00", "iana"]
  ])("routes the local civil boundary %s %s to %s", async (date, time, source) => {
    const result = await resolver.resolve(input("us-new-york", date, time));
    expect(result.provider).toBe(source);
    if (result.provider === "iana") expect(result.atlasFallback).toBe("out-of-coverage");
    else expect(result.resolution).toEqual(resolveAtlas(atlas, "us-new-york", `${date}T${time}:00`));
    if (date === "1919-12-31") expect(covered(result).resolution.instants[0]!.utc.startsWith("1920-")).toBe(true);
  });

  it("delegates early valid years outside atlas coverage without using its Date.UTC parser", async () => {
    const request = input("fr-paris", "0099-06-01");
    const result = await resolver.resolve({ ...request, place: { ...request.place, timeZone: "Etc/UTC" } });
    expect(result).toMatchObject({ provider: "iana", status: "ok", atlasFallback: "out-of-coverage" });
    if (result.provider === "iana" && result.status !== "unavailable") {
      expect(result.resolution.utc.toISOString()).toBe("0099-06-01T12:00:00.000Z");
    }
  });

  it("retains unavailable assignments outside coverage instead of adopting the atlas comparison zone", async () => {
    const request = input("fr-paris", "2000-06-01");
    expect(await resolver.resolve({ ...request, place: { ...request.place, timeZone: null } })).toEqual({
      provider: "iana", status: "unavailable", timeZone: null, reason: "missing-timezone",
      atlasFallback: "out-of-coverage", timeZoneRole: "source-assignment"
    });
  });

  it("does not expose loaded atlas arrays and objects through returned results", async () => {
    const request = input("fr-brest", "1891-03-20");
    const before = covered(await resolver.resolve(request));
    const tampered = covered(await resolver.resolve(request));
    Reflect.set(tampered.resolution.instants[0]!.citations, "0", "invented-citation");
    Reflect.set(tampered.resolution.instants[0]!.uncertainty.reasons, "0", "invented-reason");
    Reflect.set(tampered.provenance.citations[0]!, "excerpt", "invented-excerpt");
    Reflect.set(tampered.provenance.manifest.coverage, "start", "0000-01-01T00:00:00");
    Reflect.set(tampered.provenance.place, "longitude", 120);
    expect(await resolver.resolve(request)).toEqual(before);
  });

  it("does not downgrade atlas errors or unsupported clocks into a tzdb answer", async () => {
    const request = input("fr-paris", "1880-06-01");
    const failure = new Error("Atlas integration failure");
    await expect(createTimeResolver({ resolve() { throw failure; } }).resolve(request)).rejects.toBe(failure);
    const native = covered(await resolver.resolve(request));
    const noClock: AtlasTimeResult = {
      ...native, status: "no-such-clock",
      resolution: { ...native.resolution, status: "no-such-clock", instants: [], reason: "Synthetic provider refusal" }
    };
    const custom = createTimeResolver({ resolve() { return { status: "covered", result: noClock }; } });
    expect(await custom.resolve(request)).toBe(noClock);
  });

  it.each([
    ["1900-02-29", "12:00"], ["1910-04-31", "12:00"], ["1910-06-01", "24:00"],
    ["1910-06-01", "12:00:00"], ["1910-06-01", ""], ["1910-06-01Z", "12:00"]
  ])("rejects invalid civil input %s %s before routing", async (date, time) => {
    const spy = vi.fn(provider.resolve);
    await expect(createTimeResolver({ resolve: spy }).resolve(input("fr-paris", date, time))).rejects.toThrow(RangeError);
    expect(spy).not.toHaveBeenCalled();
  });
});
