import { beforeAll, describe, expect, it } from "vitest";

import { TZDB, laterCause } from "./zone-history.js";
import { prepareLocalTime, resolveLocalToUtc, zoneOffsetAt } from "./timezone.js";

/*
 * The shipped history before 1970 is tzdata 2026f's (ZOD-282). Every expected
 * value below is zdump's reading of zic-compiled tzdata 2026f with backzone
 * (docs/evidence/tzdb-2026f-20261117/oracle.mjs), never this engine's output;
 * the comment on each case quotes the zdump line it rests on. Wall times are
 * synthetic.
 */
const ZONES = [
  "Europe/Dublin",
  "Eire",
  "America/Sao_Paulo",
  "EST5EDT",
  "Pacific/Majuro",
  "Asia/Kolkata",
  "Europe/London",
  "America/Yellowknife",
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

  it("reads America/Yellowknife as tzdata 2026f's link to America/Edmonton", () => {
    // America/Yellowknife  Sun Apr 27 09:00:00 1947 UT = Sun Apr 27 03:00:00 1947 MDT isdst=1 gmtoff=-21600
    const summer = resolveLocalToUtc("1947-06-01", "12:00", "America/Yellowknife");
    expect(summer.offsetMinutes).toBe(-360);
    expect(summer.utc.toISOString()).toBe("1947-06-01T18:00:00.000Z");
  });
});
