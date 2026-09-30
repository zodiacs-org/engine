import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../api.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "./timezone.js";

/*
 * The engine audit's time-5 finding (docs/platform/evidence/engine-audit-2026-09-22/
 * LEDGER.md in the Zodiacs site repository): `lmt` was set for any offset with
 * seconds and `dst-gap`/`dst-fold` for any offset change. The flags now come
 * from the tzdb record: `lmt` only for local mean time (tzdb's LMT era, or the
 * birthplace's own mean time), and every gap or fold carries its cause, "dst",
 * "legal-change" or "date-line", in `jump`. The names dst-gap and dst-fold are
 * kept for compatibility and mean a gap or fold of any cause.
 */
const PROBES = [
  // [label, date, time, zone, flags, jump, clock, offset in minutes]
  ["Guam 1890: local mean time in whole minutes", "1890-06-01", "12:00", "Pacific/Guam", ["lmt"], null, "local-mean-time", 579],
  ["Kolkata 1900: Madras time, a legal time with seconds", "1900-06-01", "12:00", "Asia/Kolkata", [], null, "legal", 321 + 10 / 60],
  ["Monrovia 1960: Monrovia Mean Time, legal", "1960-06-01", "12:00", "Africa/Monrovia", [], null, "legal", -44.5],
  [
    "New York 1883-11-18 12:02: the change to standard time repeated the minute",
    "1883-11-18", "12:02", "America/New_York", ["dst-fold", "lmt"], { kind: "fold", cause: "legal-change" },
    "local-mean-time", -(4 * 60 + 56 + 2 / 60)
  ],
  ["Apia 2011-12-30: Samoa skipped the day across the date line", "2011-12-30", "12:00", "Pacific/Apia", ["dst-gap"], { kind: "gap", cause: "date-line" }, "legal", 14 * 60],
  ["Kwajalein 1993-08-21: skipped across the date line", "1993-08-21", "12:00", "Pacific/Kwajalein", ["dst-gap"], { kind: "gap", cause: "date-line" }, "legal", 12 * 60]
] as const;

describe("time-5's six flag probes", () => {
  beforeAll(() => Promise.all(PROBES.map(([, date, , zone]) => prepareLocalTime(date, zone))));

  it.each(PROBES)("%s", (_label, date, time, zone, flags, jump, clock, offset) => {
    const resolved = resolveLocalToUtc(date, time, zone);
    expect(resolved.flags).toEqual(flags);
    expect(resolved.jump).toEqual(jump);
    expect(resolved.localResolution.clock).toBe(clock);
    expect(resolved.offsetMinutes).toBeCloseTo(offset, 9);
    // And the receipt carries it, checked arithmetically.
    const { birth, resolution, reference } = resolveLocalBirth({ date, time, timeZone: zone, latitude: 10, longitude: 10 });
    const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope)).ok).toBe(true);
    if (jump) expect(envelope.receipt.localResolution?.transition?.cause).toBe(jump.cause);
    expect(envelope.receipt.inputFlags).toEqual(flags);
  });

  it("classified them wrongly under the old rule, which receipts from before this set still use", () => {
    // Fractional minutes: Guam unflagged, Kolkata and Monrovia flagged.
    const fractional = (minutes: number) => Math.abs(minutes % 1) > 1e-9;
    expect(fractional(579)).toBe(false);
    expect(fractional(321 + 10 / 60)).toBe(true);
    expect(fractional(-44.5)).toBe(true);
  });
});

describe("the cause of a gap or fold, from the record", () => {
  beforeAll(() =>
    Promise.all(["Europe/London", "Europe/Moscow", "America/New_York", "Pacific/Apia"].map((zone) => prepareLocalTime("1900-01-01", zone)))
  );

  it.each([
    // Daylight saving, including double summer time (the standard offset stays).
    ["2024-03-10", "02:30", "America/New_York", "gap", "dst"],
    ["2024-11-03", "01:30", "America/New_York", "fold", "dst"],
    ["1941-05-04", "02:30", "Europe/London", "gap", "dst"],
    ["1941-08-10", "02:30", "Europe/London", "fold", "dst"],
    // Legal changes: Moscow's standard offset moved in 2011 and back in 2014.
    ["2011-03-27", "02:30", "Europe/Moscow", "gap", "legal-change"],
    ["2014-10-26", "01:30", "Europe/Moscow", "fold", "legal-change"],
    // Liberia left Monrovia Mean Time (−0:44:30) at 00:44:30 UT: a change on a second, not a minute.
    ["1972-01-07", "00:20", "Africa/Monrovia", "gap", "legal-change"],
    // Samoa lived 1892-07-04 twice, crossing the date line the other way.
    ["1892-07-04", "12:00", "Pacific/Apia", "fold", "date-line"]
  ] as const)("%s %s in %s is a %s caused by %s", (date, time, zone, kind, cause) => {
    const resolved = resolveLocalToUtc(date, time, zone);
    expect(resolved.jump).toEqual({ kind, cause });
    expect(resolved.flags).toContain(kind === "gap" ? "dst-gap" : "dst-fold");
    expect(resolved.transition?.cause).toBe(cause);
  });

  /*
   * A zone line that ends during daylight saving while the clock goes back:
   * zic ends it where the old line's clock reads its UNTIL, and the standard
   * offset changes there. rc.15's first cut placed those 30 ends an hour or two
   * late and labelled the changes "dst" (docs/evidence/rc15-20260929/
   * tz-line-ends.json, from zic 2025c's own output). Each is a fold.
   */
  const LINE_ENDS: [zone: string, at: string, before: number, after: number][] = [
    ["America/Argentina/Catamarca", "1991-03-03T02:00:00Z", -120, -240],
    ["America/Argentina/ComodRivadavia", "1991-03-03T02:00:00Z", -120, -240],
    ["America/Argentina/Cordoba", "1991-03-03T02:00:00Z", -120, -240],
    ["America/Argentina/Jujuy", "1990-03-04T02:00:00Z", -120, -240],
    ["America/Argentina/La_Rioja", "1991-03-01T02:00:00Z", -120, -240],
    ["America/Argentina/Mendoza", "1990-03-04T02:00:00Z", -120, -240],
    ["America/Argentina/Salta", "1991-03-03T02:00:00Z", -120, -240],
    ["America/Argentina/San_Juan", "1991-03-01T02:00:00Z", -120, -240],
    ["America/Argentina/San_Luis", "1990-03-14T02:00:00Z", -120, -240],
    ["America/Argentina/San_Luis", "2008-01-21T02:00:00Z", -120, -180],
    ["America/Argentina/Tucuman", "1991-03-03T02:00:00Z", -120, -240],
    ["America/Cancun", "1998-08-02T06:00:00Z", -240, -300],
    ["America/Iqaluit", "1999-10-31T06:00:00Z", -240, -360],
    ["America/Juneau", "1983-10-30T09:00:00Z", -420, -540],
    ["America/La_Paz", "1932-03-21T03:32:36Z", -(212 + 36 / 60), -240],
    ["America/Pangnirtung", "1999-10-31T06:00:00Z", -240, -360],
    ["America/Santiago", "1946-08-29T03:00:00Z", -180, -240],
    ["America/Sitka", "1983-10-30T09:00:00Z", -420, -540],
    ["Asia/Barnaul", "1995-05-27T16:00:00Z", 480, 420],
    ["Asia/Novosibirsk", "1993-05-22T16:00:00Z", 480, 420],
    ["Asia/Tbilisi", "2004-06-26T19:00:00Z", 300, 240],
    ["Asia/Tehran", "1977-10-20T19:30:00Z", 270, 240],
    ["Asia/Tomsk", "2002-04-30T19:00:00Z", 480, 420],
    ["Europe/Athens", "1941-04-29T21:00:00Z", 180, 120],
    ["Europe/Chisinau", "1941-07-16T21:00:00Z", 180, 120],
    ["Europe/Chisinau", "1990-05-05T22:00:00Z", 240, 180],
    ["Europe/Kyiv", "1990-06-30T22:00:00Z", 240, 180],
    ["Europe/Monaco", "1945-09-16T01:00:00Z", 120, 60],
    ["Europe/Paris", "1945-09-16T01:00:00Z", 120, 60],
    ["Europe/Tiraspol", "1941-07-16T21:00:00Z", 180, 120]
  ];

  it.each(LINE_ENDS)("labels %s's change of standard offset at %s a legal change", async (zone, at, before, after) => {
    // The middle of the repeated wall times, rounded down to the minute.
    const wall = new Date(Date.parse(at) + ((before + after) / 2) * 60_000);
    const [date, time] = [wall.toISOString().slice(0, 10), wall.toISOString().slice(11, 16)];
    await prepareLocalTime(date, zone);
    const resolved = resolveLocalToUtc(date, time, zone);
    expect(resolved.jump).toEqual({ kind: "fold", cause: "legal-change" });
    expect(resolved.transition).toMatchObject({ at: new Date(at).toISOString(), cause: "legal-change" });
    expect(resolved.transition!.offsetBeforeMinutes).toBeCloseTo(before, 9);
    expect(resolved.transition!.offsetAfterMinutes).toBeCloseTo(after, 9);
  });

  it("labels the reviewers' Kyiv 1990-07-01 01:30, the first reading, and its receipt, a legal change", async () => {
    await prepareLocalTime("1990-07-01", "Europe/Kyiv");
    const { birth, resolution, reference } = resolveLocalBirth({
      date: "1990-07-01",
      time: "01:30",
      timeZone: "Europe/Kyiv",
      latitude: 50.45,
      longitude: 30.52
    });
    expect(resolution.utc.toISOString()).toBe("1990-06-30T21:30:00.000Z");
    expect(resolution.jump).toEqual({ kind: "fold", cause: "legal-change" });
    const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
    expect(envelope.receipt.localResolution?.transition?.cause).toBe("legal-change");
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope)).ok).toBe(true);
  });

  it("gives an ordinary time the transition behind its offset where the shipped history has one", () => {
    const london = resolveLocalToUtc("1947-07-01", "12:00", "Europe/London");
    expect(london.jump).toBeNull();
    expect(london.transition).toMatchObject({ at: "1947-04-13T01:00:00.000Z", offsetAfterMinutes: 120, cause: "dst" });
    expect(london.zone).toMatchObject({ source: "tzdb", abbreviation: "BDST", dst: true });
    const modern = resolveLocalToUtc("2020-07-01", "12:00", "Europe/London");
    expect(modern.transition).toBeNull();
    expect(modern.zone).toMatchObject({ source: "intl", dataForm: "host", abbreviation: null, dst: null });
  });
});
