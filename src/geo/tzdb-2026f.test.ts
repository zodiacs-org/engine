import { beforeAll, describe, expect, it } from "vitest";

import { TZDB, laterCause } from "./zone-history.js";
import { prepareLocalTime, resolveLocalToUtc, zoneOffsetAt } from "./timezone.js";

/*
 * The shipped history before 1970 is tzdata 2026f's (ZOD-282). Every expected
 * value below is zdump's reading of zic-compiled tzdata 2026f with backzone
 * (docs/evidence/tzdb-2026f-20261117/oracle.mjs), never this engine's output;
 * the comment on each case quotes the zdump line it rests on. Wall times are
 * synthetic. America/Yellowknife, held at tzdata 2025c, has its own block at
 * the end.
 */
const ZONES = [
  "Europe/Dublin",
  "Eire",
  "America/Sao_Paulo",
  "EST5EDT",
  "Pacific/Majuro",
  "Asia/Kolkata",
  "Europe/London",
  "CST6CDT",
  "MST7MDT",
  "PST8PDT",
  "Europe/Uzhgorod",
  "Europe/Zaporozhye"
];

describe("the tzdata 2026f history before 1970", () => {
  beforeAll(() => Promise.all(ZONES.map((zone) => prepareLocalTime("1900-01-01", zone))));

  it("is tzdata 2026f, pinned by its archive digest", () => {
    expect(TZDB).toEqual({
      version: "2026f",
      sha256: "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d",
      form: "main+backzone"
    });
  });

  // 2026e: "In 1925 Ireland fell back on 09-20 not 10-04".
  // Europe/Dublin  Sun Sep 20 02:00:00 1925 UT = Sun Sep 20 02:00:00 1925 GMT isdst=0 gmtoff=0
  it.each(["Europe/Dublin", "Eire"])("%s fell back on 1925-09-20 at 02:00 UTC", (zone) => {
    const resolved = resolveLocalToUtc("1925-09-27", "12:00", zone);
    expect(resolved.utc.toISOString()).toBe("1925-09-27T12:00:00.000Z");
    expect(resolved.offsetMinutes).toBe(0);
    expect(resolved.zone).toMatchObject({ source: "tzdb", tzdbVersion: "2026f", abbreviation: "GMT", dst: false });
    expect(zoneOffsetAt(zone, Date.parse("1925-09-20T02:00:00Z") - 1000)).toBe(60);
    expect(zoneOffsetAt(zone, Date.parse("1925-09-20T02:00:00Z"))).toBe(0);
    expect(zoneOffsetAt(zone, Date.parse("1925-10-04T01:59:59Z"))).toBe(0);
  });

  it("repeats Dublin's 02:00 to 03:00 on 1925-09-20, and no longer on 1925-10-04", () => {
    // Sun Sep 20 01:59:59 1925 UT = Sun Sep 20 02:59:59 1925 IST; 02:00:00 UT = 02:00:00 GMT.
    const fold = resolveLocalToUtc("1925-09-20", "02:30", "Europe/Dublin");
    expect(fold.utc.toISOString()).toBe("1925-09-20T01:30:00.000Z");
    expect(fold.offsetMinutes).toBe(60);
    expect(fold.flags).toContain("dst-fold");
    const later = resolveLocalToUtc("1925-09-20", "02:30", "Europe/Dublin", { fold: "later" });
    expect(later.utc.toISOString()).toBe("1925-09-20T02:30:00.000Z");
    // No transition on 1925-10-04 in 2026f.
    const october = resolveLocalToUtc("1925-10-04", "02:30", "Europe/Dublin");
    expect(october.utc.toISOString()).toBe("1925-10-04T02:30:00.000Z");
    expect(october.offsetMinutes).toBe(0);
    expect(october.flags).not.toContain("dst-fold");
  });

  // 2026f: "In 1965 Brazil ended DST on 03-31 at 24:00 not 00:00, and in 1966 it ended DST on 03-01 at 01:00 not 00:00."
  it("ends Brazil's daylight saving on 1965-03-31 at 24:00", () => {
    // America/Sao_Paulo  Thu Apr  1 02:00:00 1965 UT = Wed Mar 31 23:00:00 1965 -03
    const resolved = resolveLocalToUtc("1965-03-31", "12:00", "America/Sao_Paulo");
    expect(resolved.offsetMinutes).toBe(-120);
    expect(resolved.utc.toISOString()).toBe("1965-03-31T14:00:00.000Z");
    expect(zoneOffsetAt("America/Sao_Paulo", Date.parse("1965-04-01T02:00:00Z") - 1000)).toBe(-120);
    expect(zoneOffsetAt("America/Sao_Paulo", Date.parse("1965-04-01T02:00:00Z"))).toBe(-180);
  });

  it("ends it on 1966-03-01 at 01:00, so 00:00 to 01:00 is repeated", () => {
    // America/Sao_Paulo  Tue Mar  1 02:59:59 1966 UT = Tue Mar  1 00:59:59 1966 -02; 03:00:00 UT = 00:00:00 -03
    const resolved = resolveLocalToUtc("1966-03-01", "00:30", "America/Sao_Paulo");
    expect(resolved.offsetMinutes).toBe(-120);
    expect(resolved.utc.toISOString()).toBe("1966-03-01T02:30:00.000Z");
    expect(resolved.flags).toContain("dst-fold");
    expect(resolveLocalToUtc("1966-03-01", "00:30", "America/Sao_Paulo", { fold: "later" }).offsetMinutes).toBe(-180);
  });

  it("keeps Brazil's 1965-12-01 start, now written Nov 30 24:00: the same instant", () => {
    // America/Sao_Paulo  Wed Dec  1 03:00:00 1965 UT = Wed Dec  1 01:00:00 1965 -02 (in 2025c and 2026f)
    const before = resolveLocalToUtc("1965-11-30", "23:30", "America/Sao_Paulo");
    expect(before.utc.toISOString()).toBe("1965-12-01T02:30:00.000Z");
    expect(before.offsetMinutes).toBe(-180);
    const gap = resolveLocalToUtc("1965-12-01", "00:30", "America/Sao_Paulo");
    expect(gap.utc.toISOString()).toBe("1965-12-01T03:30:00.000Z");
    expect(gap.flags).toContain("dst-gap");
  });

  // 2026d: EST5EDT "now always uses the abbreviation "EST" for standard time ... and "EDT" for daylight saving time".
  it("reads EST5EDT on US federal rules with POSIX abbreviations", () => {
    // EST5EDT  Mon Feb  9 07:00:00 1942 UT = Mon Feb  9 03:00:00 1942 EDT isdst=1 gmtoff=-14400
    const war = resolveLocalToUtc("1942-06-01", "12:00", "EST5EDT");
    expect(war.utc.toISOString()).toBe("1942-06-01T16:00:00.000Z");
    expect(war.zone).toMatchObject({ source: "tzdb", abbreviation: "EDT", dst: true });
    // The state from the beginning of time: EST isdst=0 gmtoff=-18000.
    const early = resolveLocalToUtc("1900-01-01", "12:00", "EST5EDT");
    expect(early.utc.toISOString()).toBe("1900-01-01T17:00:00.000Z");
    expect(early.zone).toMatchObject({ source: "tzdb", abbreviation: "EST", dst: false });
  });

  // 2026d: the four names now use US federal rules with POSIX abbreviations; backward's USback rule
  // writes 1945's Peace line with letter D, so zic records no transition on 1945-08-14 at 23:00 UTC.
  it.each([
    // EST5EDT  Mon Feb  9 07:00:00 1942 UT = Mon Feb  9 03:00:00 1942 EDT isdst=1 gmtoff=-14400
    // EST5EDT  Sun Sep 30 06:00:00 1945 UT = Sun Sep 30 01:00:00 1945 EST isdst=0 gmtoff=-18000
    ["EST5EDT", "1942-02-09T07:00:00.000Z", -300, "EDT"],
    // CST6CDT  Mon Feb  9 08:00:00 1942 UT = Mon Feb  9 03:00:00 1942 CDT isdst=1 gmtoff=-18000
    // CST6CDT  Sun Sep 30 07:00:00 1945 UT = Sun Sep 30 01:00:00 1945 CST isdst=0 gmtoff=-21600
    ["CST6CDT", "1942-02-09T08:00:00.000Z", -360, "CDT"],
    // MST7MDT  Mon Feb  9 09:00:00 1942 UT = Mon Feb  9 03:00:00 1942 MDT isdst=1 gmtoff=-21600
    // MST7MDT  Sun Sep 30 08:00:00 1945 UT = Sun Sep 30 01:00:00 1945 MST isdst=0 gmtoff=-25200
    ["MST7MDT", "1942-02-09T09:00:00.000Z", -420, "MDT"],
    // PST8PDT  Mon Feb  9 10:00:00 1942 UT = Mon Feb  9 03:00:00 1942 PDT isdst=1 gmtoff=-25200
    // PST8PDT  Sun Sep 30 09:00:00 1945 UT = Sun Sep 30 01:00:00 1945 PST isdst=0 gmtoff=-28800
    ["PST8PDT", "1942-02-09T10:00:00.000Z", -480, "PDT"]
  ] as const)("%s has no Peace time transition: 1945-08-20 still follows the 1942 change", (zone, at, standard, abbreviation) => {
    const resolved = resolveLocalToUtc("1945-08-20", "20:00", zone);
    expect(resolved.offsetMinutes).toBe(standard + 60);
    expect(resolved.transition).toEqual({ at, offsetBeforeMinutes: standard, offsetAfterMinutes: standard + 60, cause: "dst" });
    expect(resolved.zone).toMatchObject({ source: "tzdb", abbreviation, dst: true });
    expect(resolveLocalToUtc("1945-09-29", "20:00", zone).transition?.at).toBe(at);
  });

  // 2026f's backzone has no Uzhgorod or Zaporozhye zone (2025c backzone lines 1588 and 1631 are gone),
  // so both names are backward's links to Europe/Kyiv, whose pinned and default builds agree.
  // Europe/Uzhgorod  Wed Dec 31 21:57:56 1879 UT = Thu Jan  1 00:00:00 1880 KMT isdst=0 gmtoff=7324
  it("reads Europe/Uzhgorod as Kyiv: Kyiv mean time from 1880, with or without a longitude", () => {
    const plain = resolveLocalToUtc("1885-06-01", "12:00", "Europe/Uzhgorod");
    expect(plain.utc.toISOString()).toBe("1885-06-01T09:57:56.000Z");
    expect(plain.zone).toMatchObject({ source: "tzdb", dataForm: "main+backzone", abbreviation: "KMT" });
    const placed = resolveLocalToUtc("1885-06-01", "12:00", "Europe/Uzhgorod", { longitude: 22.3 });
    expect(placed.utc.toISOString()).toBe("1885-06-01T09:57:56.000Z");
    expect(placed.flags).not.toContain("lmt");
    expect(placed.zone.dataForm).toBe("main+backzone");
  });

  // Europe/Zaporozhye  Wed Dec 31 21:57:55 1879 UT = Wed Dec 31 23:59:59 1879 LMT isdst=0 gmtoff=7324
  it("ends Europe/Zaporozhye's local mean time with Kyiv's, at 1879-12-31T21:57:56Z", () => {
    const placed = resolveLocalToUtc("1879-12-31", "23:50", "Europe/Zaporozhye", { longitude: 35.17 });
    // The birthplace's own mean time, 35.17 degrees east: 4 minutes a degree.
    expect(placed.offsetMinutes).toBeCloseTo(35.17 * 4, 1);
    expect(placed.flags).toEqual(["lmt"]);
    expect(placed.zone.dataForm).toBe("main+backzone");
  });

  // 2026c: "Morocco plans to move back to permanent UTC, without daylight saving time transitions, on 2026-09-20 at 02:00."
  // Africa/Casablanca  Sun Sep 20 01:00:00 2026 UT = Sun Sep 20 01:00:00 2026 +00 isdst=0 gmtoff=0 (default build)
  it.each(["Africa/Casablanca", "Africa/El_Aaiun"])("records %s's 2026-09-20 move to +00 as a legal change", (zone) => {
    expect(laterCause(zone, Date.parse("2026-09-20T01:00:00Z"))).toBe("legal-change");
    // Its Ramadan changes stay daylight saving: Sun Feb 15 02:00:00 2026 UT = +00 isdst=1.
    expect(laterCause(zone, Date.parse("2026-02-15T02:00:00Z"))).toBe("dst");
  });

  it("leaves the cases the ticket names unchanged", () => {
    // Pacific/Majuro  Fri Jan 31 15:00:00 1919 UT = Sat Feb  1 02:00:00 1919 +11 (conformance vector L3-TZ-0001).
    expect(resolveLocalToUtc("1928-01-16", "12:00", "Pacific/Majuro").offsetMinutes).toBe(660);
    // Asia/Kolkata  Tue Sep 30 18:30:00 1941 UT = Wed Oct  1 01:00:00 1941 +0630
    expect(resolveLocalToUtc("1941-10-01", "12:00", "Asia/Kolkata").offsetMinutes).toBe(390);
    // Europe/London  Sun Apr 13 01:00:00 1947 UT = Sun Apr 13 03:00:00 1947 BDST isdst=1 gmtoff=7200
    expect(resolveLocalToUtc("1947-04-13", "12:00", "Europe/London").offsetMinutes).toBe(120);
  });

});

/*
 * America/Yellowknife is held at tzdata 2025c by the owner's decision (ZOD-282). tzdata 2026f's backzone comments its
 * zone out (lines 930 to 933), with no NEWS entry or other official announcement behind the change, which would move
 * 1947-04-27T09:00Z to 1947-09-28T08:00Z from -7:00 to -6:00 and change the zone's source, data form, local mean time
 * and transitions before 1935. The package compiles tzdata 2025c's backzone lines 929 to 932 for the name instead
 * (scripts/tzdb-held/yellowknife-2025c.zi), so it answers as on origin/main (2.0.0-rc.2, tzdata 2025c) at every
 * instant. Offsets: zdump of tzdata 2025c with backzone (the same lines); before 1935 that zone is "-00", read from
 * Intl. The other fields are origin/main's output at 373ceda, a regression record, not accuracy evidence; only
 * tzdbVersion, which names the package's pinned release, reads 2026f where main read 2025c.
 */
describe("America/Yellowknife, held at tzdata 2025c", () => {
  const ZONE = "America/Yellowknife";
  beforeAll(() => prepareLocalTime("1900-01-01", ZONE));

  // The shard entry origin/main shipped (src/tzdb/tzdb-2025c-*.ts at 373ceda), unchanged.
  it("ships origin/main's history for the name", async () => {
    const { SHARD_LOADERS } = await import("../tzdb/tzdb-2026f.js");
    const buckets = await Promise.all(SHARD_LOADERS.map((load) => load()));
    const entry = buckets.map((bucket) => bucket.default["america/yellowknife"]).find(Boolean);
    expect(entry).toEqual({
      n: "America/Yellowknife",
      s: "America/Yellowknife",
      f: null,
      y: [
        [null, 0, "-00"],
        [-25200, 0, "MST"],
        [-21600, 1, "MWT"],
        [-21600, 1, "MPT"]
      ],
      t: "-i9m2o0,3pk3o0,1tz5k0,2dvo0",
      k: "1l2d3l1d"
    });
  });

  it.each([
    // "-00" until 1935 (Thu Jan  1 00:00:00 -2147481748 UT = ... -00), so Intl (Edmonton): LMT gmtoff=-27232 until 1906.
    ["1900-01-01T00:00:00Z", -27232],
    // Tue Jan  1 00:00:00 1935 UT = Mon Dec 31 17:00:00 1934 MST isdst=0 gmtoff=-25200
    ["1935-01-01T00:00:00Z", -25200],
    ["1938-06-01T12:00:00Z", -25200],
    // Sun Sep 30 08:00:00 1945 UT = Sun Sep 30 01:00:00 1945 MST isdst=0 gmtoff=-25200, and no change until 1970.
    ["1947-04-27T09:00:00Z", -25200],
    ["1947-06-01T00:00:00Z", -25200],
    ["1947-09-28T07:59:59Z", -25200],
    ["1960-01-01T00:00:00Z", -25200]
  ] as const)("is at %s on tzdata 2025c's offset, %i s", (iso, seconds) => {
    expect(zoneOffsetAt(ZONE, Date.parse(iso)) * 60).toBeCloseTo(seconds, 6);
  });

  const host = { source: "intl", dataForm: "host", abbreviation: null, dst: null };
  const mst = { source: "tzdb", tzdbVersion: TZDB.version, dataForm: "main+backzone", abbreviation: "MST", dst: false };
  const legal1935 = { at: "1935-01-01T00:00:00.000Z", offsetBeforeMinutes: -420, offsetAfterMinutes: -420, cause: "legal-change" };
  const fall1945 = { at: "1945-09-30T08:00:00.000Z", offsetBeforeMinutes: -360, offsetAfterMinutes: -420, cause: "dst" };
  it.each([
    ["1900-06-01", "12:00", undefined, "1900-06-01T19:33:52.000Z", host, null],
    ["1900-06-01", "12:00", { longitude: -114.37 }, "1900-06-01T19:33:52.000Z", host, null],
    ["1935-01-01", "00:00", undefined, "1935-01-01T07:00:00.000Z", mst, legal1935],
    ["1938-06-01", "05:00", undefined, "1938-06-01T12:00:00.000Z", mst, legal1935],
    ["1947-06-01", "12:00", undefined, "1947-06-01T19:00:00.000Z", mst, fall1945],
    ["1960-06-01", "12:00", { longitude: -114.37 }, "1960-06-01T19:00:00.000Z", mst, fall1945]
  ] as const)("resolves %s %s %o as origin/main did", (date, time, options, utc, zone, transition) => {
    const resolved = resolveLocalToUtc(date, time, ZONE, options);
    expect(resolved.utc.toISOString()).toBe(utc);
    expect(resolved.flags).toEqual([]);
    expect(resolved.localMeanTime).toBeNull();
    expect(resolved.zone).toMatchObject(zone);
    expect(resolved.transition).toEqual(transition);
    expect(resolved.localResolution.clock).toBe("legal");
  });
});
