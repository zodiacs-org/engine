import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeocoder, createPlaceLookup, DatasetValidationError } from "../src/index.js";
import type { AtlasTimeProvider, GeocodeRequest, PlaceDataset, PlaceRecord } from "../src/index.js";

// Invented places and civil readings, unrelated to any person's birth details.
function place(id: string, overrides: Partial<PlaceRecord> = {}): PlaceRecord {
  return {
    id: `synthetic:${id}`, name: "Amber Harbour", asciiName: "Amber Harbour",
    aliases: ["Port of Amber"], countryCode: "ZZ", countryName: "Example Republic",
    regionCode: "01", regionName: "North Reach", latitude: 12.3456789,
    longitude: -45.6789123, elevationMeters: null, demElevationMeters: 17,
    population: null, timeZone: "Etc/UTC", ...overrides
  };
}

function dataset(places: readonly PlaceRecord[] = [place("amber")]): PlaceDataset {
  return {
    schemaVersion: 1, places,
    provenance: {
      dataset: "synthetic", license: "MIT",
      attribution: "Invented records for composed geocode requests", sources: []
    }
  };
}

function unreachableAtlas() {
  return { resolve: vi.fn<AtlasTimeProvider["resolve"]>(() => { throw new Error("Unexpected atlas call"); }) };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("offline composition and place selection", () => {
  it("constructs and searches without time-provider or network access", () => {
    const fetch = vi.fn(() => { throw new Error("Unexpected network access"); });
    vi.stubGlobal("fetch", fetch);
    const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected Intl access"); });
    const atlas = unreachableAtlas();
    const data = dataset();
    const geocoder = createGeocoder(data, atlas);
    expect(geocoder.size).toBe(data.places.length);
    expect(geocoder.provenance).toEqual(data.provenance);
    expect(geocoder.lookup("Port of Amber, ZZ")).toEqual(createPlaceLookup(data).lookup("Port of Amber, ZZ"));
    expect(geocoder.getById("synthetic:amber")).toBe(geocoder.lookup("Amber").candidates[0]!.place);
    expect(fetch).not.toHaveBeenCalled();
    expect(intl).not.toHaveBeenCalled();
    expect(atlas.resolve).not.toHaveBeenCalled();
  });

  it("never chooses by ranking or a truncated candidate list", async () => {
    const atlas = unreachableAtlas();
    const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected Intl access"); });
    const geocoder = createGeocoder(dataset([
      place("large", { population: 900_000 }), place("small", { population: 20, regionCode: "02" })
    ]), atlas);
    const result = await geocoder.resolve({ query: "Amber", filters: { limit: 1 }, date: "2001-06-15", time: "08:30" });
    expect(result).toMatchObject({
      status: "ambiguous-place", place: null, time: null, selection: null,
      input: { kind: "civil-time", date: "2001-06-15", time: "08:30" },
      lookup: { status: "ambiguous", total: 2, truncated: true }
    });
    expect(result.lookup!.candidates).toHaveLength(1);
    expect(atlas.resolve).not.toHaveBeenCalled();
    expect(intl).not.toHaveBeenCalled();
    // Direct selection can name a candidate outside the short suggestion list.
    const chosen = await geocoder.resolve({ placeId: "synthetic:small", date: "2001-06-15" });
    expect(chosen).toMatchObject({ status: "date-only", selection: "explicit-id", place: { id: "synthetic:small" }, lookup: null });
  });

  it("selects a unique filtered match, retaining source precision and elevation distinctions", async () => {
    const geocoder = createGeocoder(dataset([
      place("large", { population: 900_000 }), place("small", { population: 20, regionCode: "02", elevationMeters: -3.5 })
    ]), unreachableAtlas());
    const result = await geocoder.resolve({
      query: "Port of Amber", filters: { region: "02", country: "Example Republic" },
      date: "2001-06-15", time: "08:30"
    });
    expect(result).toMatchObject({
      status: "time-result", selection: "unique-match", lookup: { status: "unique" },
      place: { id: "synthetic:small", latitude: 12.3456789, longitude: -45.6789123, elevationMeters: -3.5, demElevationMeters: 17 },
      time: { provider: "iana", status: "ok", atlasFallback: "not-geonames", timeZoneRole: "source-assignment" }
    });
    if (result.status !== "time-result" || result.time.provider !== "iana" || result.time.status === "unavailable") {
      throw new Error("Expected native IANA resolution");
    }
    expect(result.time.resolution.utc).toBeInstanceOf(Date);
    expect(result.time.resolution.utc.toISOString()).toBe("2001-06-15T08:30:00.000Z");
    expect(result.time.resolution.zone.tzdbVersion).toBe(process.versions.tz ?? null);
    expect(result.time.resolution.localMeanTime).toBeNull();
    expect(result.time.resolution.localResolution.policy).toEqual({ fold: "earlier", gap: "shift-forward" });
    expect(JSON.parse(JSON.stringify(result)).time.resolution.utc).toBe("2001-06-15T08:30:00.000Z");
  });

  it("distinguishes no text matches from an absent explicit ID without calling providers", async () => {
    const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected Intl access"); });
    const atlas = unreachableAtlas();
    const geocoder = createGeocoder(dataset(), atlas);
    expect(await geocoder.resolve({ query: "Absent Place", date: "2000-01-01", time: "12:00" })).toMatchObject({
      status: "no-match", place: null, selection: null, time: null, lookup: { status: "no-match", total: 0 }
    });
    for (const placeId of ["synthetic:absent", "geonames:2988507", "Synthetic:amber"]) {
      expect(await geocoder.resolve({ placeId, date: "2000-01-01", time: "12:00" })).toMatchObject({
        status: "unknown-place", place: null, selection: null, time: null, lookup: null
      });
    }
    expect(intl).not.toHaveBeenCalled();
    expect(atlas.resolve).not.toHaveBeenCalled();
  });

  it("uses only its detached dataset, including for explicit ID selection", async () => {
    const data = dataset();
    const geocoder = createGeocoder(data, unreachableAtlas());
    Reflect.set(data.places[0]!, "id", "synthetic:tampered");
    Reflect.set(data.places[0]!, "timeZone", "Invented/Changed");
    Reflect.set(data.provenance, "attribution", "Changed attribution");
    const result = await geocoder.resolve({ placeId: "synthetic:amber", date: "2000-01-01" });
    expect(result.place?.timeZone).toBe("Etc/UTC");
    expect(result.provenance.attribution).toBe("Invented records for composed geocode requests");
    expect(Reflect.set(result.place!, "timeZone", "Invented/Changed")).toBe(false);
    expect(Reflect.set(result.provenance, "attribution", "Changed attribution")).toBe(false);
    expect(geocoder.getById("synthetic:tampered")).toBeUndefined();
  });
});

describe("date-only requests and unavailable assignments", () => {
  it.each(["2001-06-15", "2000-02-29", "0099-12-31", "1918-03-31"])(
    "keeps %s as a civil date, with no chosen time or provider claim", async (date) => {
      const atlas = unreachableAtlas();
      const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected Intl access"); });
      const geocoder = createGeocoder(dataset(), atlas);
      const result = await geocoder.resolve({ query: "Amber", date });
      expect(result).toMatchObject({ status: "date-only", input: { kind: "date-only", date }, time: null, selection: "unique-match" });
      expect(Object.keys(result.input)).toEqual(["kind", "date"]);
      expect(result.place?.timeZone).toBe("Etc/UTC");
      expect(result).not.toHaveProperty("utc");
      expect(result).not.toHaveProperty("offsetMinutes");
      expect(atlas.resolve).not.toHaveBeenCalled();
      expect(intl).not.toHaveBeenCalled();
    }
  );

  it.each([null, "Invented/Unavailable"])("retains source assignment %s without offset guesses", async (timeZone) => {
    const geocoder = createGeocoder(dataset([place("amber", { timeZone })]), unreachableAtlas());
    const dateOnly = await geocoder.resolve({ placeId: "synthetic:amber", date: "2000-01-01" });
    expect(dateOnly).toMatchObject({ status: "date-only", place: { timeZone }, time: null });
    const timed = await geocoder.resolve({ placeId: "synthetic:amber", date: "2000-01-01", time: "12:00" });
    expect(timed).toMatchObject({ status: "time-result", time: {
      provider: "iana", status: "unavailable", timeZone, atlasFallback: "not-geonames",
      reason: timeZone === null ? "missing-timezone" : "unsupported-timezone"
    } });
    expect(timed.time).not.toHaveProperty("resolution");
  });

  it("does not relabel a provider failure as an unavailable assignment", async () => {
    const geocoder = createGeocoder(dataset(), unreachableAtlas());
    const failure = new Error("Synthetic provider failure");
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw failure; });
    await expect(geocoder.resolve({ query: "Amber", date: "2000-01-01", time: "12:00" })).rejects.toBe(failure);
  });

  it("captures each input before async resolution and detaches native Date answers", async () => {
    const geocoder = createGeocoder(dataset(), unreachableAtlas());
    const request = { query: "Amber", date: "2000-01-01", time: "08:30" };
    const pending = geocoder.resolve(request);
    request.date = "2001-01-01";
    request.time = "09:30";
    const before = await pending;
    expect(before.input).toEqual({ kind: "civil-time", date: "2000-01-01", time: "08:30" });
    if (before.status !== "time-result" || before.time.provider !== "iana" || before.time.status === "unavailable") {
      throw new Error("Expected native IANA resolution");
    }
    before.time.resolution.utc.setUTCFullYear(2024);
    before.time.resolution.flags.push("dst-gap");
    const again = await geocoder.resolve({ placeId: "synthetic:amber", date: "2000-01-01", time: "08:30" });
    if (again.status !== "time-result" || again.time.provider !== "iana" || again.time.status === "unavailable") {
      throw new Error("Expected native IANA resolution");
    }
    expect(again.time.resolution.utc.toISOString()).toBe("2000-01-01T08:30:00.000Z");
    expect(again.time.resolution.flags).toEqual([]);
  });
});

describe("request validation before place/provider routing", () => {
  const malformed: unknown[] = [
    null, [], new Date(), {},
    { query: "Amber" }, { date: "2000-01-01" },
    { query: "Amber", placeId: "synthetic:amber", date: "2000-01-01" },
    { placeId: "synthetic:amber", filters: {}, date: "2000-01-01" },
    { placeId: undefined, date: "2000-01-01" }, { query: undefined, date: "2000-01-01" },
    { query: "Amber", date: "2000-01-01", time: undefined },
    { query: "Amber", date: "2000-01-01", time: null },
    { query: "Amber", date: "2000-01-01", filters: undefined },
    { query: "Amber", date: "2000-01-01", filters: null },
    { query: "Amber", date: "2000-01-01", filters: { limit: 0 } },
    { query: "Amber", date: "2000-01-01", filters: { region: "" } },
    { query: "Amber", date: "2000-01-01", timezone: "Etc/UTC" },
    { query: "Amber", date: "2000-01-01", calendar: "julian" },
    { query: "Amber", date: "2000-01-01", [Symbol("unknown")]: true },
    { query: "Amber", date: new Date("2000-01-01") },
    ...["", " synthetic:amber", "synthetic:amber\n", "x".repeat(513)].map((placeId) => ({ placeId, date: "2000-01-01" })),
    ...[null, 5, "a\n", "x".repeat(513)].map((query) => ({ query, date: "2000-01-01" }))
  ];

  it.each(malformed.map((value, index) => [index, value] as const))("rejects malformed request case %i", async (_index, request) => {
    const geocoder = createGeocoder(dataset(), unreachableAtlas());
    await expect(geocoder.resolve(request as GeocodeRequest)).rejects.toThrow(RangeError);
  });

  it.each(["1900-02-29", "2001-04-31", "2000-01-01T00:00:00Z", "2000-1-1", "PRIVATE-invalid-date"])(
    "validates date %s before every place-selection outcome", async (date) => {
      const geocoder = createGeocoder(dataset([place("one"), place("two")]), unreachableAtlas());
      for (const selector of [{ query: "Absent" }, { query: "Amber" }, { placeId: "synthetic:one" }, { placeId: "synthetic:absent" }]) {
        await expect(geocoder.resolve({ ...selector, date })).rejects.toThrow(RangeError);
        await expect(geocoder.resolve({ ...selector, date, time: "08:30" })).rejects.toThrow(RangeError);
        await expect(geocoder.resolve({ ...selector, date })).rejects.not.toThrow(date);
      }
    }
  );

  it.each(["", "24:00", "12:60", "1:00", "12:00Z", "12:00:00", "12:00+02:00"])(
    "rejects malformed civil time %s even for an absent place", async (time) => {
      const geocoder = createGeocoder(dataset(), unreachableAtlas());
      await expect(geocoder.resolve({ query: "Absent", date: "2000-01-01", time })).rejects.toThrow(RangeError);
    }
  );

  it("requires a validated dataset and explicit provider at construction", () => {
    expect(() => createGeocoder({ ...dataset(), places: [place("same"), place("same")] }, unreachableAtlas()))
      .toThrow(DatasetValidationError);
    for (const provider of [undefined, null, {}, { resolve: "wrong" }]) {
      expect(() => createGeocoder(dataset(), provider as AtlasTimeProvider)).toThrow(RangeError);
    }
  });

  it("accepts JSON-like null-prototype requests", async () => {
    const request = Object.assign(Object.create(null) as GeocodeRequest, { query: "Amber", date: "2000-01-01" });
    expect((await createGeocoder(dataset(), unreachableAtlas()).resolve(request)).status).toBe("date-only");
  });
});
