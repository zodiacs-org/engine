import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadAtlas, resolve as resolveAtlas } from "../src/atlas-module.mjs";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { createGeocoder, parsePlaceDataset } from "../src/index.js";
import type { AtlasTimeResult, PlaceDataset, PlaceRecord } from "../src/index.js";

const atlas = loadAtlas();
const provider = loadAtlasTimeProvider();
const project = fileURLToPath(new URL("../", import.meta.url));
const receipt = JSON.parse(readFileSync(new URL("../data/sample-receipt.json", import.meta.url), "utf8")) as {
  outputs: Array<{ file: string; sha256: string }>;
};
let temporaryDirectory: string | undefined;
let dataset: PlaceDataset;

// These invented queries concern no person's birth. Place records come from
// the attributed sample; historical expectations come from the existing atlas.
// These tests establish composition, not independent historical accuracy.
beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  temporaryDirectory = await mkdtemp(join(project, ".tmp", "geocoder-atlas-test-"));
  const outputDirectory = join(temporaryDirectory, "index");
  function source(file: string) {
    const entry = receipt.outputs.find((output) => output.file === file)!;
    return {
      path: join(project, "data", file),
      url: "https://download.geonames.org/export/dump/",
      expectedSha256: entry.sha256
    };
  }
  const manifest = await buildGeoNamesIndex({
    places: source("geonames-sample.tsv"),
    countries: source("country-info-sample.tsv"),
    admin1: source("admin1-sample.tsv"),
    outputDirectory
  });
  const places: PlaceRecord[] = [];
  for (const shard of manifest.shards) {
    const parsed = parsePlaceDataset(JSON.parse(await readFile(join(outputDirectory, shard.file), "utf8")) as unknown);
    expect(parsed.provenance).toEqual(manifest.provenance);
    places.push(...parsed.places);
  }
  dataset = parsePlaceDataset({ schemaVersion: 1, provenance: manifest.provenance, places });
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

function samplePlace(atlasId: string): PlaceRecord {
  const atlasPlace = atlas.places.get(atlasId);
  if (!atlasPlace) throw new Error("Expected an existing atlas place");
  const found = dataset.places.find((place) => place.id === `geonames:${atlasPlace.geonamesId}`);
  if (!found) throw new Error("Expected an attributed sample place");
  return found;
}

type GeocoderResult = Awaited<ReturnType<ReturnType<typeof createGeocoder>["resolve"]>>;

function atlasResult(result: GeocoderResult): AtlasTimeResult {
  expect(result.status).toBe("time-result");
  if (result.status !== "time-result" || result.time?.provider !== "atlas") {
    throw new Error("Expected a selected place with an atlas time result");
  }
  return result.time;
}

describe("composed geocoder with the existing atlas", () => {
  it.each(["fr-paris", "fr-brest", "fr-strasbourg", "us-new-york"])(
    "joins the attributed sample lookup for %s to native atlas results and both provenances", async (atlasId) => {
      const geocoder = createGeocoder(dataset, provider);
      const place = samplePlace(atlasId);
      const result = await geocoder.resolve({ query: place.name, date: "1880-06-01", time: "12:00" });
      const actual = atlasResult(result);
      const expected = resolveAtlas(atlas, atlasId, "1880-06-01T12:00:00");
      expect(result).toMatchObject({
        input: { kind: "civil-time", date: "1880-06-01", time: "12:00" },
        selection: "unique-match",
        lookup: { status: "unique", total: 1, candidates: [{ place }] },
        place,
        provenance: dataset.provenance
      });
      expect(actual.resolution).toEqual(expected);
      expect(actual.status).toBe(expected.status);
      expect(actual.timeZoneRole).toBe("comparison");
      expect(actual.timeZone).toBe(atlas.places.get(atlasId)!.tzdbZone);
      expect(actual.provenance.manifest).toEqual(atlas.manifest);
      expect(actual.provenance.place).toEqual(atlas.places.get(atlasId));
      const citationIds = [...new Set(expected.instants.flatMap((instant) => instant.citations))];
      expect(actual.provenance.citations).toEqual(citationIds.map((id) => atlas.citations.get(id)));
      expect(result.provenance.sources).toEqual(dataset.provenance.sources);
    }
  );

  it.each([
    ["fr-brest", "1891-03-20", "12:00", "ok", true],
    ["fr-strasbourg", "1918-12-20", "12:00", "ok", true],
    ["us-new-york", "1883-11-18", "12:01", "ambiguous", true],
    ["us-new-york", "1918-03-31", "02:30", "nonexistent", false],
    ["us-new-york", "1918-10-27", "01:30", "ambiguous", false]
  ] as const)(
    "keeps covered %s %s %s as the atlas outcome %s", async (atlasId, date, time, status, uncertain) => {
      const place = samplePlace(atlasId);
      const geocoder = createGeocoder(dataset, provider);
      vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected IANA fallback"); });
      const result = await geocoder.resolve({ placeId: place.id, date, time });
      const actual = atlasResult(result);
      expect(result).toMatchObject({ selection: "explicit-id", lookup: null, place });
      expect(actual.status).toBe(status);
      expect(actual.resolution).toEqual(resolveAtlas(atlas, atlasId, `${date}T${time}:00`));
      if (uncertain) {
        const instants = actual.resolution.instants.filter((instant) => instant.uncertainty.flag === "uncertain");
        expect(instants.length).toBeGreaterThan(0);
        for (const instant of instants) {
          expect(instant.uncertainty.reasons.length).toBeGreaterThan(0);
          expect(instant.citations.length).toBeGreaterThan(0);
        }
      }
      if (date === "1883-11-18") {
        expect(actual.resolution.instants).toHaveLength(2);
        expect(actual.resolution.instants.some((instant) => !Number.isInteger(instant.offsetSeconds))).toBe(true);
      }
      if (status === "nonexistent") expect(actual.resolution.skipped).toBeDefined();
    }
  );

  it.each([
    ["1869-12-31", "23:59", "iana"],
    ["1870-01-01", "00:00", "atlas"],
    ["1919-12-31", "23:59", "atlas"],
    ["1920-01-01", "00:00", "iana"]
  ] as const)("routes the local civil coverage edge %s %s to %s", async (date, time, expectedProvider) => {
    const place = samplePlace("us-new-york");
    const result = await createGeocoder(dataset, provider).resolve({ placeId: place.id, date, time });
    expect(result.status).toBe("time-result");
    if (result.status !== "time-result") throw new Error("Expected a time result");
    expect(result.time.provider).toBe(expectedProvider);
    if (result.time.provider === "atlas") {
      expect(result.time.resolution).toEqual(resolveAtlas(atlas, "us-new-york", `${date}T${time}:00`));
      if (date === "1919-12-31") expect(result.time.resolution.instants[0]!.utc.startsWith("1920-")).toBe(true);
    } else {
      expect(result.time.atlasFallback).toBe("out-of-coverage");
      expect(result.time.timeZone).toBe(place.timeZone);
      expect(result.time.timeZoneRole).toBe("source-assignment");
    }
  });

  it.each([null, "Invented/Unavailable", "Etc/UTC"])(
    "gives atlas facts precedence over the source-zone variant %s without discarding either source", async (timeZone) => {
      const place = { ...samplePlace("fr-brest"), timeZone, longitude: 120 };
      const changed = { ...dataset, places: [place] };
      const geocoder = createGeocoder(changed, provider);
      vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected IANA access"); });
      const result = await geocoder.resolve({ placeId: place.id, date: "1880-06-01", time: "12:00" });
      const actual = atlasResult(result);
      expect(result.place).toEqual(place);
      expect(result.provenance).toEqual(dataset.provenance);
      expect(actual.timeZone).toBe(atlas.places.get("fr-brest")!.tzdbZone);
      expect(actual.timeZoneRole).toBe("comparison");
      expect(actual.provenance.place.longitude).toBe(atlas.places.get("fr-brest")!.longitude);
      expect(actual.resolution).toEqual(resolveAtlas(atlas, "fr-brest", "1880-06-01T12:00:00"));
    }
  );

  it.each([
    [null, "missing-timezone"], ["Invented/Unavailable", "unsupported-timezone"]
  ] as const)("keeps the source-zone variant %s unavailable outside atlas coverage", async (timeZone, reason) => {
    const place = { ...samplePlace("fr-paris"), timeZone };
    const result = await createGeocoder({ ...dataset, places: [place] }, provider).resolve({
      placeId: place.id, date: "2000-06-01", time: "12:00"
    });
    expect(result).toMatchObject({
      status: "time-result", place,
      time: {
        provider: "iana", status: "unavailable", reason, timeZone,
        atlasFallback: "out-of-coverage", timeZoneRole: "source-assignment"
      }
    });
    expect(result.time).not.toHaveProperty("resolution");
    expect(result.time).not.toHaveProperty("offsetMinutes");
  });

  it("does not resolve a date-only request by probing midnight or noon in the atlas", async () => {
    const place = samplePlace("fr-brest");
    const resolve = vi.fn(provider.resolve);
    const geocoder = createGeocoder(dataset, { resolve });
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected IANA access"); });
    const result = await geocoder.resolve({ placeId: place.id, date: "1891-03-20" });
    expect(result).toMatchObject({
      status: "date-only", input: { kind: "date-only", date: "1891-03-20" },
      place, time: null, selection: "explicit-id", provenance: dataset.provenance
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("offsetMinutes");
    expect(result).not.toHaveProperty("utc");
  });

  it("preserves native clock refusals and propagates atlas failures instead of falling back", async () => {
    const place = samplePlace("fr-paris");
    const request = { placeId: place.id, date: "1880-06-01", time: "12:00" };
    const native = provider.resolve(place.id, request.date, request.time);
    if (native.status !== "covered") throw new Error("Expected atlas coverage");
    const refusal: AtlasTimeResult = {
      ...native.result, status: "no-such-clock",
      resolution: {
        ...native.result.resolution, status: "no-such-clock", instants: [], reason: "Invented provider refusal"
      }
    };
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Unexpected IANA fallback"); });
    const refused = await createGeocoder(dataset, {
      resolve: () => ({ status: "covered", result: refusal })
    }).resolve(request);
    expect(atlasResult(refused)).toEqual(refusal);
    const failure = new Error("Invented atlas integration failure");
    await expect(createGeocoder(dataset, { resolve() { throw failure; } }).resolve(request)).rejects.toBe(failure);
  });

  it("detaches covered results even when a caller-supplied provider reuses the same answer", async () => {
    const place = samplePlace("fr-brest");
    const request = { placeId: place.id, date: "1891-03-20", time: "12:00" };
    const native = provider.resolve(place.id, request.date, request.time);
    if (native.status !== "covered") throw new Error("Expected atlas coverage");
    const before = structuredClone(native.result);
    const geocoder = createGeocoder(dataset, { resolve: () => native });
    const answer = atlasResult(await geocoder.resolve(request));
    expect(answer).not.toBe(native.result);
    Reflect.set(answer.resolution.instants[0]!.uncertainty.reasons, "0", "Changed reason");
    Reflect.set(answer.provenance.citations[0]!, "excerpt", "Changed excerpt");
    Reflect.set(answer.provenance.manifest.coverage, "start", "0001-01-01T00:00:00");
    expect(native.result).toEqual(before);
    expect(atlasResult(await geocoder.resolve(request))).toEqual(before);
  });
});
