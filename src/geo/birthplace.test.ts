import { beforeAll, describe, expect, it, vi } from "vitest";

import { natalChart } from "../api.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { SHARD_LOADERS, TZDB } from "../tzdb/tzdb-2025c.js";
import type { ZoneShard } from "./zone-history.js";
import { offsetAt, prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "./timezone.js";

/*
 * Step 1.1 of the engine brief, ported from the Zodiacs site's
 * src/lib/time/localToUtc-birthplace.test.ts: before a zone's local mean time
 * era ended, a birthplace's clock kept its own mean time. Longitudes are the
 * site's GeoNames city index's (0.01°).
 */
const BUFFALO = -78.88;
const BREST = -4.49;
const OMAHA = -95.94;
const NEW_YORK = -74.01;
const CHICAGO = -87.65;
const PARIS = 2.35;
const HARTFORD = -72.69;
const PORTO = -8.61;
const GALWAY = -9.05;
const BERGEN = 5.32;
const MANILA = 120.98;

const minutes = (h: number, m: number, s: number) => Math.sign(h || m || s) * (Math.abs(h) * 60 + m + s / 60);

describe("birthplace local mean time", () => {
  beforeAll(() =>
    Promise.all(
      [
        "Africa/Addis_Ababa", "Africa/Monrovia", "America/Anchorage", "America/Chicago", "America/Juneau",
        "America/Mexico_City", "America/New_York", "Asia/Kolkata", "Asia/Manila", "Asia/Shanghai",
        "Europe/Amsterdam", "Europe/Dublin", "Europe/Lisbon", "Europe/Oslo", "Europe/Paris", "Pacific/Apia",
        "Pacific/Midway", "Pacific/Pohnpei", "UTC", "Etc/GMT+5"
      ].map((zone) => prepareLocalTime("1800-01-01", zone))
    )
  );

  it.each([
    // The three towns the engine review measured, each 19–33 minutes from its
    // zone's reference city: 5° to 8° of Ascendant.
    ["Buffalo 1870", "1870-06-15", "America/New_York", BUFFALO, "1870-06-15T17:15:31.000Z", -minutes(5, 15, 31), -minutes(4, 56, 2)],
    ["Brest 1880", "1880-06-15", "Europe/Paris", BREST, "1880-06-15T12:17:58.000Z", -minutes(0, 17, 58), minutes(0, 9, 21)],
    ["Omaha 1880", "1880-06-15", "America/Chicago", OMAHA, "1880-06-15T18:23:46.000Z", -minutes(6, 23, 46), -minutes(5, 50, 36)],
    ["Porto 1880", "1880-06-15", "Europe/Lisbon", PORTO, "1880-06-15T12:34:26.000Z", -minutes(0, 34, 26), -minutes(0, 36, 45)]
  ])("%s uses the birthplace's mean time", (_label, date, zone, longitude, iso, offset, zoneOffset) => {
    const resolved = resolveLocalToUtc(date, "12:00", zone, { longitude });
    expect(resolved.utc.toISOString()).toBe(iso);
    expect(resolved.offsetMinutes).toBeCloseTo(offset, 9);
    expect(resolved.flags).toEqual(["lmt"]);
    expect(resolved.localMeanTime?.longitude).toBe(longitude);
    expect(resolved.localMeanTime?.zoneOffsetMinutes).toBeCloseTo(zoneOffset, 9);
    expect(resolved.localResolution.clock).toBe("local-mean-time");
    // Without a longitude, the zone's reference city decides.
    const zoneOnly = resolveLocalToUtc(date, "12:00", zone);
    expect(zoneOnly.offsetMinutes).toBeCloseTo(zoneOffset, 9);
    expect(zoneOnly.localMeanTime).toBeNull();
    expect(zoneOnly.flags).toEqual(["lmt"]);
  });

  it.each([
    // New York's mean time is tzdb's −4:56:02, Chicago's −5:50:36; the city
    // index's 74.01° W and 87.65° W round to the same seconds.
    ["New York 1870", "1870-06-15", "America/New_York", NEW_YORK],
    ["Chicago 1880", "1880-06-15", "America/Chicago", CHICAGO]
  ])("agrees with the zone at its own reference city: %s", (_label, date, zone, longitude) => {
    const withPlace = resolveLocalToUtc(date, "12:00", zone, { longitude });
    const zoneOnly = resolveLocalToUtc(date, "12:00", zone);
    expect(withPlace.utc.toISOString()).toBe(zoneOnly.utc.toISOString());
    expect(withPlace.offsetMinutes).toBeCloseTo(zoneOnly.offsetMinutes, 9);
  });

  it("moves Paris before 1891 by the 3 s between the city index and tzdb", () => {
    // tzdb's Paris mean time is +0:09:21; the index's 2.35° E is +0:09:24.
    const resolved = resolveLocalToUtc("1880-06-15", "12:00", "Europe/Paris", { longitude: PARIS });
    expect(resolved.utc.toISOString()).toBe("1880-06-15T11:50:36.000Z");
    expect(resolved.offsetMinutes).toBeCloseTo(minutes(0, 9, 24), 9);
    expect(resolved.localMeanTime?.zoneOffsetMinutes).toBeCloseTo(minutes(0, 9, 21), 9);
  });

  it.each([
    // After the era ended, a national mean time was the legal time for the
    // whole country at the capital's offset: not the birthplace's own clock,
    // not local mean time (the site's F-39).
    ["Brest under Paris Mean Time, 1900", "1900-06-15", "Europe/Paris", BREST, minutes(0, 9, 21), "PMT"],
    ["Galway under Dublin Mean Time, 1885", "1885-06-15", "Europe/Dublin", GALWAY, -minutes(0, 25, 21), "DMT"],
    ["Porto under Lisbon Mean Time, 1890", "1890-06-15", "Europe/Lisbon", PORTO, -minutes(0, 36, 45), "LMT"],
    ["Amsterdam under Amsterdam Mean Time, 1900", "1900-06-15", "Europe/Amsterdam", 4.89, minutes(0, 19, 32), "AMT"],
    ["Kolkata under Madras time, 1900", "1900-06-15", "Asia/Kolkata", 88.36, minutes(5, 21, 10), "MMT"],
    ["Monrovia under Monrovia Mean Time, 1960", "1960-06-15", "Africa/Monrovia", -10.8, -minutes(0, 44, 30), "MMT"],
    ["Buffalo under Eastern time, 1900", "1900-06-15", "America/New_York", BUFFALO, -300, "EST"],
    ["Buffalo today", "2024-06-15", "America/New_York", BUFFALO, -240, null]
  ])("%s is unchanged, and no local mean time", (_label, date, zone, longitude, offset, abbreviation) => {
    const resolved = resolveLocalToUtc(date, "12:00", zone, { longitude });
    const zoneOnly = resolveLocalToUtc(date, "12:00", zone);
    expect(resolved).toEqual(zoneOnly);
    expect(resolved.offsetMinutes).toBeCloseTo(offset, 9);
    expect(resolved.localMeanTime).toBeNull();
    expect(resolved.flags).toEqual([]);
    expect(resolved.localResolution.clock).toBe("legal");
    // tzdb calls Lisbon Mean Time "LMT" too; the era, from the zone lines, ended in 1884.
    expect(resolved.zone.abbreviation).toBe(abbreviation);
  });

  it("follows backzone where the zone kept its own mean time longer than its link", () => {
    // Norway kept local mean time until 1895; Intl follows Berlin's 1893 change.
    const resolved = resolveLocalToUtc("1894-06-15", "12:00", "Europe/Oslo", { longitude: BERGEN });
    expect(resolved.utc.toISOString()).toBe("1894-06-15T11:38:43.000Z");
    expect(resolved.offsetMinutes).toBeCloseTo(minutes(0, 21, 17), 9);
    expect(offsetAt("Europe/Oslo", Date.UTC(1894, 5, 15, 11))).toBe(60);
    expect(resolved.intlOffsetMinutes).toBe(60);
    // The zone's own clock is Oslo's mean time from the shipped history, not Berlin's +1:00.
    expect(resolved.localMeanTime?.zoneOffsetMinutes).toBe(43);
    const later = resolveLocalToUtc("1895-06-15", "12:00", "Europe/Oslo", { longitude: BERGEN });
    expect(later.offsetMinutes).toBe(60);
    expect(later.localMeanTime).toBeNull();
  });

  it("keeps the calendar day of a zone that later moved across the date line", () => {
    // Manila kept the American date until the end of 1844: −15:56:08 in tzdb.
    const resolved = resolveLocalToUtc("1840-06-15", "12:00", "Asia/Manila", { longitude: MANILA });
    expect(resolved.offsetMinutes).toBeCloseTo(-minutes(15, 56, 5), 9);
    expect(resolved.utc.toISOString()).toBe("1840-06-16T03:56:05.000Z");
    const after = resolveLocalToUtc("1850-06-15", "12:00", "Asia/Manila", { longitude: MANILA });
    expect(after.offsetMinutes).toBeCloseTo(minutes(8, 3, 55), 9);
    expect(after.utc.toISOString()).toBe("1850-06-15T03:56:05.000Z");
    expect(after.transition?.cause).toBe("date-line");
    // Pohnpei made the same move at the same time; the shipped record decides. 158.16° E is 10:32:38.
    const pohnpei = resolveLocalToUtc("1840-06-01", "12:00", "Pacific/Pohnpei", { longitude: 158.16 });
    expect(pohnpei.utc.toISOString()).toBe("1840-06-02T01:27:22.000Z");
    expect(pohnpei.offsetMinutes).toBeCloseTo(-minutes(13, 27, 22), 9);
    expect(pohnpei.localMeanTime?.longitude).toBe(158.16);
    const pohnpeiAfter = resolveLocalToUtc("1850-06-01", "12:00", "Pacific/Pohnpei", { longitude: 158.16 });
    expect(pohnpeiAfter.utc.toISOString()).toBe("1850-06-01T01:27:22.000Z");
    // Midway kept the American date.
    const midway = resolveLocalToUtc("1880-06-01", "12:00", "Pacific/Midway", { longitude: -177.37 });
    expect(midway.utc.toISOString()).toBe("1880-06-01T23:49:29.000Z");
  });

  it("moves a skipped wall time forward by the gap the change to standard time left, and keeps its mean time (F-38)", () => {
    // At 17:00 UT on 1883-11-18 Buffalo's clocks jumped from 11:44:29 to 12:00.
    const resolved = resolveLocalToUtc("1883-11-18", "11:50", "America/New_York", { longitude: BUFFALO });
    expect(resolved.utc.toISOString()).toBe("1883-11-18T17:05:31.000Z");
    expect(resolved.offsetMinutes).toBe(-300);
    expect(resolved.flags).toEqual(["dst-gap"]);
    expect(resolved.jump).toEqual({ kind: "gap", cause: "legal-change" });
    // The shifted instant is on Eastern time, but Buffalo's mean time read the
    // wall time; the zone alone would have read it on New York's.
    expect(resolved.localMeanTime?.longitude).toBe(BUFFALO);
    expect(resolved.localMeanTime?.zoneOffsetMinutes).toBeCloseTo(-minutes(4, 56, 2), 9);
    expect(resolved.transition).toEqual({
      at: "1883-11-18T17:00:00.000Z",
      offsetBeforeMinutes: -minutes(5, 15, 31),
      offsetAfterMinutes: -300,
      cause: "legal-change"
    });
    expect(resolved.localResolution.gapShiftMinutes).toBeCloseTo(minutes(0, 15, 31), 9);
    expect(resolveLocalToUtc("1883-11-18", "11:44", "America/New_York", { longitude: BUFFALO }).utc.toISOString())
      .toBe("1883-11-18T16:59:31.000Z");
    expect(resolveLocalToUtc("1883-11-18", "12:00", "America/New_York", { longitude: BUFFALO }).utc.toISOString())
      .toBe("1883-11-18T17:00:00.000Z");
  });

  it("takes the earlier instant of a wall time the change to standard time repeated", () => {
    // East of 75° W the clocks went back: Hartford read 12:00–12:09 twice.
    const resolved = resolveLocalToUtc("1883-11-18", "12:05", "America/New_York", { longitude: HARTFORD });
    expect(resolved.utc.toISOString()).toBe("1883-11-18T16:55:46.000Z");
    expect(resolved.flags).toEqual(["dst-fold", "lmt"]);
    expect(resolved.jump).toEqual({ kind: "fold", cause: "legal-change" });
    expect(resolveLocalToUtc("1883-11-18", "12:15", "America/New_York", { longitude: HARTFORD }).utc.toISOString())
      .toBe("1883-11-18T17:15:00.000Z");
  });

  it.each([Number.NaN, 200, -180.5, "74"])("refuses the longitude %j instead of ignoring it", (longitude) => {
    expect(() => resolveLocalToUtc("1870-06-15", "12:00", "America/New_York", { longitude } as never)).toThrow(RangeError);
  });

  it("keeps a skipped or repeated date across a date-line move inside the era", () => {
    // Alaska left the Asian date on 1867-10-19: 10:00 that day happened twice.
    const anchorage = resolveLocalToUtc("1867-10-19", "10:00", "America/Anchorage", { longitude: -149.9 });
    expect(anchorage.utc.toISOString()).toBe("1867-10-18T19:59:36.000Z");
    expect(anchorage.flags).toEqual(["dst-fold", "lmt"]);
    expect(anchorage.jump).toEqual({ kind: "fold", cause: "date-line" });
    // Manila skipped 1844-12-31 when it moved to the Asian date.
    const manila = resolveLocalToUtc("1844-12-31", "20:00", "Asia/Manila", { longitude: MANILA });
    expect(manila.flags).toContain("dst-gap");
    expect(manila.jump?.cause).toBe("date-line");
    expect(manila.utc.getTime()).toBeGreaterThan(
      resolveLocalToUtc("1844-12-30", "20:00", "Asia/Manila", { longitude: MANILA }).utc.getTime()
    );
    // Samoa lived 1892-07-04 twice.
    const apia = resolveLocalToUtc("1892-07-04", "18:00", "Pacific/Apia", { longitude: -171.76 });
    expect(apia.flags).toContain("dst-fold");
    expect(apia.jump?.cause).toBe("date-line");
  });

  it("treats a whole-minute mean time as local mean time too", () => {
    // 38.75° E is exactly +2:35:00: no seconds, but still the birthplace's own mean time.
    const resolved = resolveLocalToUtc("1860-06-15", "12:00", "Africa/Addis_Ababa", { longitude: 38.75 });
    expect(resolved.offsetMinutes).toBe(155);
    expect(resolved.flags).toEqual(["lmt"]);
    expect(resolved.localMeanTime?.longitude).toBe(38.75);
  });

  it("bounds the departure in whole seconds, alike in every zone", () => {
    // 29.008333° W is exactly 180 minutes from New York's mean time.
    expect(resolveLocalToUtc("1883-11-17", "09:03", "America/New_York", { longitude: -29.008333333333333 }).localMeanTime)
      .not.toBeNull();
    expect(resolveLocalToUtc("1883-11-17", "09:03", "America/New_York", { longitude: -29 }).localMeanTime).toBeNull();
  });

  it("ignores a longitude hours away from the zone, as a birthplace in another zone", () => {
    // Toronto's longitude under Juneau's zone is 3 h 40 min from Juneau's mean time.
    const resolved = resolveLocalToUtc("1867-10-18", "12:00", "America/Juneau", { longitude: -79.38 });
    expect(resolved).toEqual(resolveLocalToUtc("1867-10-18", "12:00", "America/Juneau"));
    // The widest real case in the city index, Gar under Shanghai's zone, is kept.
    expect(resolveLocalToUtc("1890-06-15", "12:00", "Asia/Shanghai", { longitude: 80.1 }).localMeanTime).not.toBeNull();
  });

  it.each(["UTC", "Etc/GMT+5"])("leaves %s, which has no local mean time era, to Intl", (zone) => {
    const resolved = resolveLocalToUtc("1870-06-15", "12:00", zone, { longitude: BUFFALO });
    expect(resolved).toEqual(resolveLocalToUtc("1870-06-15", "12:00", zone));
    expect(resolved.zone.source).toBe("intl");
  });

  it("produces portable receipts that validate, the mean time recorded", () => {
    for (const [date, time, zone, longitude] of [
      ["1870-06-15", "12:00", "America/New_York", BUFFALO],
      ["1883-11-18", "11:50", "America/New_York", BUFFALO],
      ["1883-11-18", "12:05", "America/New_York", HARTFORD]
    ] as const) {
      const { birth, resolution, reference } = resolveLocalBirth({
        date, time, timeZone: zone, latitude: 42.89, longitude, houseSystem: "placidus"
      });
      const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
      const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
      expect(parsed.ok).toBe(true);
      expect(envelope.receipt.localResolution?.localMeanTime?.longitude).toBe(longitude);
    }
  });
});

describe("loading the birthplace clock", () => {
  it("refuses to guess an early time before the zone is prepared, and needs nothing after 1970", async () => {
    vi.resetModules();
    const fresh = await import("./timezone.js");
    expect(() => fresh.resolveLocalToUtc("1870-06-15", "12:00", "America/New_York", { longitude: BUFFALO }))
      .toThrow("prepareLocalTime");
    // Without a longitude too: before 1970 the shipped history answers.
    expect(() => fresh.resolveLocalToUtc("1953-01-04", "12:00", "America/New_York")).toThrow("prepareLocalTime");
    expect(fresh.resolveLocalToUtc("1971-01-04", "12:00", "America/New_York", { longitude: BUFFALO }).offsetMinutes).toBe(-300);
    await fresh.prepareLocalTime("1952-12-31", "America/New_York");
    expect(fresh.resolveLocalToUtc("1870-06-15", "12:00", "America/New_York", { longitude: BUFFALO }).utc.toISOString())
      .toBe("1870-06-15T17:15:31.000Z");
    vi.resetModules();
  });
});

describe("the local mean time eras shipped", () => {
  const zones: ZoneShard[] = [];
  beforeAll(async () => {
    for (const load of SHARD_LOADERS) zones.push(...Object.values((await load()).default));
  });

  it("records its tzdb release and source digest", () => {
    expect(TZDB.version).toBe("2025c");
    expect(TZDB.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(TZDB.form).toBe("main+backzone");
    expect(zones.length).toBe(597);
  });

  it("holds whole seconds, every era ending before 1953", () => {
    const eras = zones.filter((zone) => zone.e);
    expect(eras.length).toBe(518);
    for (const zone of eras) {
      for (const [until, offset] of zone.e!) {
        expect(Number.isInteger(until) && Number.isInteger(offset)).toBe(true);
        expect(until).toBeGreaterThan(Date.UTC(1700, 0, 1) / 1000);
        expect(until * 1000).toBeLessThan(Date.UTC(1953, 0, 1));
      }
    }
  });

  it.each([
    ["America/New_York", "1883-11-18T17:00:00.000Z"],
    ["America/Chicago", "1883-11-18T18:00:00.000Z"],
    ["Europe/Paris", "1891-03-15T23:50:39.000Z"],
    ["Europe/Dublin", "1880-08-02T00:25:21.000Z"],
    ["Europe/Lisbon", "1884-01-01T00:36:45.000Z"],
    ["Europe/Oslo", "1894-12-31T23:17:00.000Z"],
    ["Asia/Manila", "1899-09-06T04:00:00.000Z"],
    ["America/Anchorage", "1900-08-20T21:59:36.000Z"],
    // A backzone Zone that replaces a main-data Link (to Puerto Rico).
    ["America/Kralendijk", "1912-02-12T04:35:47.000Z"],
    // An UNTIL in standard time ("0:00s"), not universal time.
    ["Europe/Isle_of_Man", "1883-03-30T00:17:55.000Z"]
  ])("ends %s at %s", (zone, iso) => {
    const shard = zones.find((candidate) => candidate.n === zone)!;
    expect(new Date(shard.e!.at(-1)![0] * 1000).toISOString()).toBe(iso);
  });

  it("matches Intl on the offset change where the zone and the host agree", async () => {
    for (const zone of ["America/New_York", "America/Chicago", "America/Mexico_City"]) {
      const end = zones.find((candidate) => candidate.n === zone)!.e!.at(-1)![0] * 1000;
      expect(offsetAt(zone, end - 1000)).not.toBe(offsetAt(zone, end));
    }
  });
});
