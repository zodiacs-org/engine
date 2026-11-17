import { beforeAll, describe, expect, it } from "vitest";

import { TZDB } from "./zone-history.js";
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
  "America/Yellowknife"
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
