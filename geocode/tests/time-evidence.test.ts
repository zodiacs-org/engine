import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { loadAtlas } from "../src/atlas-module.mjs";
import { resolveIanaTime } from "../src/iana-time.js";
import { createTimeResolver } from "../src/time.js";
import type { PlaceRecord } from "../src/types.js";

interface Instant { utc: string; offsetSeconds: number }
interface Case {
  id: string; zone: string; local: string;
  expected: {
    status: "ok" | "ambiguous" | "nonexistent";
    instants: Instant[];
    shiftForward?: Instant;
    transition?: { at: string; offsetBeforeSeconds: number; offsetAfterSeconds: number };
  };
  backzoneLink?: { zone: string; expected: { status: "ok"; instants: Instant[] } };
}
// Generated data stays ignored. Rebuild through the shared independent oracle
// rather than committing a second timezone dataset. Pinned input archives are
// downloaded once by this tooling; subsequent runs need no network access.
execFileSync("python3", [fileURLToPath(new URL("../scripts/build-time-evidence.py", import.meta.url)), "--cc", "cc"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), timeout: 60_000,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, stdio: "pipe"
});
const fixture = JSON.parse(readFileSync(new URL("../generated/m9-time-evidence.json", import.meta.url), "utf8")) as {
  reference: {
    arbiter: string; arbiterSha256: string; receipt: string; receiptSha256: string;
    release: string; form: string;
  };
  cases: Case[];
};
const atlas = loadAtlas();
const resolver = createTimeResolver(loadAtlasTimeProvider());
afterEach(() => vi.restoreAllMocks());

// Invented caller records test routing. The explicit source ID is the only
// atlas join; the coordinates and label do not establish historical facts.
function place(id: string, timeZone: string | null, latitude = 0): PlaceRecord {
  return {
    id, timeZone, latitude, longitude: 0, name: "Invented Port", asciiName: "Invented Port",
    aliases: [], countryCode: "ZZ", countryName: "Example Republic",
    regionCode: null, regionName: null, population: null,
    elevationMeters: null, demElevationMeters: null
  };
}

describe("independent selected IANA timezone evidence", () => {
  it("binds the selected evidence to the shared arbiter and pinned source receipt", () => {
    for (const [path, digest] of [
      [fixture.reference.arbiter, fixture.reference.arbiterSha256],
      [fixture.reference.receipt, fixture.reference.receiptSha256]
    ] as const) {
      const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    }
    expect(fixture.reference).toMatchObject({ release: "2025c", form: "main+backzone" });
    expect(new Set(fixture.cases.map((entry) => entry.id)).size).toBe(fixture.cases.length);
    expect(new Set(fixture.cases.map((entry) => entry.expected.status))).toEqual(
      new Set(["ok", "ambiguous", "nonexistent"])
    );
  });

  it.each(fixture.cases)("checks independently compiled tzdb and recorded build differences for $id", async (entry) => {
    const date = entry.local.slice(0, 10);
    const time = entry.local.slice(11, 16);
    // Always use the public routing API with an unmatched source ID. Even
    // British dates inside the atlas window must follow IANA, not French rules.
    const actual = await resolver.resolve({
      place: place("geonames:900000000000001", entry.zone), dataset: "geonames", date, time
    });
    expect(actual).toMatchObject({
      provider: "iana", status: entry.expected.status, timeZone: entry.zone,
      atlasFallback: "unmatched-place", timeZoneRole: "source-assignment"
    });
    if (actual.provider !== "iana" || actual.status === "unavailable") throw new Error("Missing reference zone");
    const resolution = actual.resolution;
    const pinned = entry.expected.status === "nonexistent"
      ? entry.expected.shiftForward! : entry.expected.instants[0]!;
    // A documented build disagreement is not counted as agreement with the
    // pinned backzone recipe. Compare it separately with backzone's source link.
    const chosen = entry.backzoneLink?.expected.instants[0] ?? pinned;
    if (entry.backzoneLink) {
      expect(entry.id).toBe("polar-link-history-1200");
      expect(entry.backzoneLink.zone).toBe("Europe/Oslo");
      expect(entry.backzoneLink.expected.status).toBe("ok");
      expect(pinned.offsetSeconds).toBe(10800);
      expect(chosen.offsetSeconds).toBe(7200);
      expect(chosen.offsetSeconds).not.toBe(pinned.offsetSeconds);
      expect(resolution.utc.getTime()).not.toBe(Date.parse(pinned.utc));
    }
    expect(resolution.utc.getTime()).toBe(Date.parse(chosen.utc));
    expect(resolution.offsetMinutes).toBe(chosen.offsetSeconds / 60);
    expect(resolution.localMeanTime).toBeNull();
    expect(resolution.localResolution.policy).toEqual({ fold: "earlier", gap: "shift-forward" });
    if (entry.expected.transition) {
      const transition = entry.expected.transition;
      expect(resolution.transition).toMatchObject({
        at: new Date(transition.at).toISOString(),
        offsetBeforeMinutes: transition.offsetBeforeSeconds / 60,
        offsetAfterMinutes: transition.offsetAfterSeconds / 60
      });
      const gap = entry.expected.status === "nonexistent";
      expect(resolution.jump?.kind).toBe(gap ? "gap" : "fold");
      expect(resolution.flags).toContain(gap ? "dst-gap" : "dst-fold");
      expect(resolution.localResolution.gapShiftMinutes).toBe(gap
        ? (transition.offsetAfterSeconds - transition.offsetBeforeSeconds) / 60 : 0);
      if (entry.id.startsWith("skipped-date-") || entry.id.startsWith("repeated-date-")) {
        expect(resolution.jump?.cause).toBe("date-line");
      }
    } else {
      expect(resolution.jump).toBeNull();
      expect(resolution.localResolution.gapShiftMinutes).toBe(0);
    }
    expect(resolution.zone).toMatchObject(date < "1970-01-01"
      ? { source: "tzdb", tzdbVersion: "2025c", dataForm: "main+backzone" }
      : { source: "intl", tzdbVersion: process.versions.tz ?? null, dataForm: "host" });
  });

  it.each([78, -78, 90, -90])("uses the supplied zone at latitude %s, never longitude-derived offsets", async (latitude) => {
    const reference = fixture.cases.find((entry) => entry.id === "polar-summer-1200")!;
    const actual = await resolver.resolve({
      place: place("synthetic:polar", reference.zone, latitude), dataset: "synthetic",
      date: reference.local.slice(0, 10), time: reference.local.slice(11, 16)
    });
    if (actual.provider !== "iana" || actual.status === "unavailable") throw new Error("Missing reference zone");
    expect(actual.resolution.offsetMinutes).toBe(reference.expected.instants[0]!.offsetSeconds / 60);
    expect(actual.resolution.utc.getTime()).toBe(Date.parse(reference.expected.instants[0]!.utc));
  });
});

interface Difference {
  place: string; zone: string; from: string; to: string;
  atlasRule: string; atlasOffsetSeconds: number; tzdbOffsetSeconds: number; explanation: string;
}
const differences = JSON.parse(readFileSync(new URL("../../atlas/tzdb/differences.json", import.meta.url), "utf8")) as {
  tzdb: string; differences: Difference[];
};
// Read the atlas comparison in place. Never copy or regenerate its rules or
// timezone extract here. These assertions check precedence, not historical truth.
const precedenceCases = [
  { place: "fr-brest", local: "1880-06-01T12:00:00", explanation: "fr-own-mean-time-before-1891" },
  { place: "fr-paris", local: "1916-10-01T12:00:00", explanation: "fr-summer-time-end-hour" }
];
describe("atlas precedence over documented tzdb disagreements", () => {
  it.each(precedenceCases)("keeps atlas facts for $place $local", async (entry) => {
    const atlasPlace = atlas.places.get(entry.place)!;
    const actual = await resolver.resolve({
      place: place(`geonames:${atlasPlace.geonamesId}`, atlasPlace.tzdbZone), dataset: "geonames",
      date: entry.local.slice(0, 10), time: entry.local.slice(11, 16)
    });
    if (actual.provider !== "atlas") throw new Error("Expected atlas precedence");
    const instant = actual.resolution.instants[0]!;
    const difference = differences.differences.find((row) => row.place === entry.place
      && Date.parse(row.from) <= instant.utcMs && instant.utcMs < Date.parse(row.to));
    if (!difference) throw new Error("Expected a committed atlas disagreement");
    expect(differences.tzdb).toBe("2025c");
    expect(difference.explanation).toBe(entry.explanation);
    expect(instant.rule).toBe(difference.atlasRule);
    expect(instant.offsetSeconds).toBe(difference.atlasOffsetSeconds);
    const iana = await resolveIanaTime(entry.local.slice(0, 10), entry.local.slice(11, 16), difference.zone);
    if (iana.status === "unavailable") throw new Error("Missing comparison zone");
    expect(iana.resolution.offsetMinutes).toBe(difference.tzdbOffsetSeconds / 60);
    expect(instant.offsetSeconds).not.toBe(difference.tzdbOffsetSeconds);
    expect(actual.provenance.citations.length).toBeGreaterThan(0);
    for (const id of instant.citations) {
      expect(actual.provenance.citations).toContainEqual(atlas.citations.get(id));
    }
  });
});

describe("a supported IANA label absent from the host database", () => {
  it.each(["1945-06-01", "2000-06-01"])("returns unavailable for %s even if shipped history exists", async (date) => {
    const zone = "Arctic/Longyearbyen";
    const failure = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("Synthetic host without this zone");
    });
    const result = await resolver.resolve({
      place: place("synthetic:missing-host-zone", zone), dataset: "synthetic", date, time: "12:00"
    });
    expect(result).toEqual({
      provider: "iana", status: "unavailable", timeZone: zone, reason: "unsupported-timezone",
      atlasFallback: "not-geonames", timeZoneRole: "source-assignment"
    });
    failure.mockRestore();
    const retry = await resolveIanaTime(date, "12:00", zone);
    expect(retry.status).toBe("ok");
  });

  it("uses the atlas before checking host support for its comparison label", async () => {
    const failure = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("Synthetic host missing Europe/Paris");
    });
    const result = await resolver.resolve({
      place: place(`geonames:${atlas.places.get("fr-brest")!.geonamesId}`, "Europe/Paris"),
      dataset: "geonames", date: "1880-06-01", time: "12:00"
    });
    expect(result.provider).toBe("atlas");
    expect(failure).not.toHaveBeenCalled();
  });

  it("propagates host failures other than unsupported-zone RangeError", async () => {
    const failure = new Error("Synthetic host failure");
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw failure; });
    await expect(resolveIanaTime("2000-06-01", "12:00", "Europe/London")).rejects.toBe(failure);
  });
});
