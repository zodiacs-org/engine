import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../api.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { prepareLocalTime, resolveBirth, resolveLocalBirth, resolveLocalToUtc } from "./timezone.js";

/*
 * A wall time the clock showed twice: `fold` picks the first pass ("earlier",
 * the default) or the second ("later"). The expected instants are written
 * out from the IANA time zone database's rules, not from this engine:
 *
 * - America/New_York (northamerica, Rule US 2007 on: Nov Sun>=1 2:00 to
 *   standard): on 2021-11-07 the clock went from 02:00 EDT (−4) back to
 *   01:00 EST (−5) at 06:00 UTC, so 01:30 is 05:30 UTC and again 06:30 UTC.
 * - Australia/Sydney (australasia, Rule AN 2008 on: Apr Sun>=1 2:00s to
 *   standard): on 2021-04-04 from 03:00 AEDT (+11) back to 02:00 AEST (+10)
 *   at 16:00 UTC on the 3rd, so 02:30 is 15:30 UTC and again 16:30 UTC.
 * - Australia/Lord_Howe (Rule LH 2008 on: Apr Sun>=1 2:00 to standard, a
 *   half-hour change): on 2021-04-04 from 02:00 (+11) back to 01:30 (+10:30)
 *   at 15:00 UTC on the 3rd, so 01:45 is 14:45 UTC and again 15:15 UTC.
 * - America/Sao_Paulo (southamerica, Rule Brazil 2018: Feb Sun>=15 0:00 to
 *   standard): on 2019-02-17 from 00:00 −02 back to 23:00 −03 on the 16th at
 *   02:00 UTC, so 23:30 on the 16th is 01:30 UTC and again 02:30 UTC.
 * - America/New_York 1883 (Zone line: LMT −4:56:02 until 1883 Nov 18 17:00u,
 *   then −5:00): 12:02 local mean time is 16:58:02 UTC, and 12:02 Eastern
 *   Standard Time is 17:02 UTC.
 * - America/New_York 1950 (Rule NYC 1946 to 1953: Sep lastSun 2:00 to
 *   standard): on 1950-09-24 01:30 is 05:30 UTC and again 06:30 UTC.
 *
 * Each pair is also read back through the host's Intl (ICU's own copy of the
 * database, where it carries the year): both instants must show the same
 * wall time. The birth data is synthetic.
 */
const FOLDS = [
  // [label, date, time, zone, earlier UTC, later UTC, earlier offset (min), later offset (min), cause]
  ["New York 2021-11-07 01:30", "2021-11-07", "01:30", "America/New_York", "2021-11-07T05:30:00.000Z", "2021-11-07T06:30:00.000Z", -240, -300, "dst"],
  ["Sydney 2021-04-04 02:30", "2021-04-04", "02:30", "Australia/Sydney", "2021-04-03T15:30:00.000Z", "2021-04-03T16:30:00.000Z", 660, 600, "dst"],
  ["Lord Howe 2021-04-04 01:45, a half-hour fold", "2021-04-04", "01:45", "Australia/Lord_Howe", "2021-04-03T14:45:00.000Z", "2021-04-03T15:15:00.000Z", 660, 630, "dst"],
  ["São Paulo 2019-02-16 23:30", "2019-02-16", "23:30", "America/Sao_Paulo", "2019-02-17T01:30:00.000Z", "2019-02-17T02:30:00.000Z", -120, -180, "dst"],
  ["New York 1950-09-24 01:30, from the shipped history", "1950-09-24", "01:30", "America/New_York", "1950-09-24T05:30:00.000Z", "1950-09-24T06:30:00.000Z", -240, -300, "dst"],
  [
    "New York 1883-11-18 12:02, the end of local mean time",
    "1883-11-18", "12:02", "America/New_York", "1883-11-18T16:58:02.000Z", "1883-11-18T17:02:00.000Z", -(4 * 60 + 56 + 2 / 60), -300, "legal-change"
  ]
] as const;

function wallTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(instant));
  const part = (type: string): string => parts.find((each) => each.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

describe("the pass of a repeated wall time", () => {
  beforeAll(() => Promise.all(FOLDS.map(([, date, , zone]) => prepareLocalTime(date, zone))));

  it.each(FOLDS)("%s: earlier by default, later when asked", (_label, date, time, zone, earlierUtc, laterUtc, earlierOffset, laterOffset, cause) => {
    const byDefault = resolveLocalToUtc(date, time, zone);
    const earlier = resolveLocalToUtc(date, time, zone, { fold: "earlier" });
    const later = resolveLocalToUtc(date, time, zone, { fold: "later" });

    expect(byDefault.utc.toISOString()).toBe(earlierUtc);
    expect(earlier).toEqual(byDefault);
    expect(later.utc.toISOString()).toBe(laterUtc);
    expect(earlier.offsetMinutes).toBeCloseTo(earlierOffset, 9);
    expect(later.offsetMinutes).toBeCloseTo(laterOffset, 9);

    // The flag and the jump stay on both passes: the wall time is still one the clock showed twice.
    for (const resolved of [earlier, later]) {
      expect(resolved.flags).toContain("dst-fold");
      expect(resolved.jump).toEqual({ kind: "fold", cause });
      expect(resolved.localResolution.gapShiftMinutes).toBe(0);
    }
    expect(later.transition).toEqual(earlier.transition);
    expect(earlier.localResolution.policy).toEqual({ fold: "earlier", gap: "shift-forward" });
    expect(later.localResolution.policy).toEqual({ fold: "later", gap: "shift-forward" });
  });

  it.each(FOLDS.filter(([, date]) => date > "1970"))("%s: the host's Intl shows the same wall time at both instants", (_label, date, time, zone, earlierUtc, laterUtc) => {
    expect(wallTime(earlierUtc, zone)).toBe(`${date} ${time}`);
    expect(wallTime(laterUtc, zone)).toBe(`${date} ${time}`);
  });

  it("leaves local mean time for the legal clock on the second pass of 1883's fold", () => {
    const earlier = resolveLocalToUtc("1883-11-18", "12:02", "America/New_York");
    const later = resolveLocalToUtc("1883-11-18", "12:02", "America/New_York", { fold: "later" });
    expect(earlier.flags).toEqual(["dst-fold", "lmt"]);
    expect(earlier.localResolution.clock).toBe("local-mean-time");
    expect(later.flags).toEqual(["dst-fold"]);
    expect(later.localResolution.clock).toBe("legal");
  });

  it("changes nothing for a wall time the clock showed once", () => {
    const once = resolveLocalToUtc("2021-06-15", "01:30", "America/New_York");
    const asked = resolveLocalToUtc("2021-06-15", "01:30", "America/New_York", { fold: "later" });
    // 01:30 EDT (−4).
    expect(once.utc.toISOString()).toBe("2021-06-15T05:30:00.000Z");
    expect(asked.utc.toISOString()).toBe("2021-06-15T05:30:00.000Z");
    expect(asked.flags).toEqual([]);
    expect({ ...asked, localResolution: null }).toEqual({ ...once, localResolution: null });
    // The record keeps the pass asked for.
    expect(asked.localResolution).toEqual({ ...once.localResolution, policy: { fold: "later", gap: "shift-forward" } });
  });

  it("moves a skipped wall time forward whichever pass is asked for", () => {
    // Rule US: Mar Sun>=8 2:00 to daylight time. On 2021-03-14 the clock went
    // from 02:00 EST to 03:00 EDT at 07:00 UTC, so 02:30 did not happen; moved
    // forward by the hour it is 03:30 EDT (−4), 07:30 UTC.
    for (const fold of ["earlier", "later"] as const) {
      const gap = resolveLocalToUtc("2021-03-14", "02:30", "America/New_York", { fold });
      expect(gap.utc.toISOString()).toBe("2021-03-14T07:30:00.000Z");
      expect(gap.flags).toEqual(["dst-gap"]);
      expect(gap.localResolution.gapShiftMinutes).toBe(60);
      expect(gap.localResolution.policy).toEqual({ fold, gap: "shift-forward" });
    }
  });

  it("refuses any other value", () => {
    for (const fold of ["first", "Later", "", null, 1, true]) {
      expect(() => resolveLocalToUtc("2021-11-07", "01:30", "America/New_York", { fold } as never)).toThrow(
        new RangeError('fold must be "earlier" or "later".')
      );
      expect(() =>
        resolveLocalBirth({ date: "2021-11-07", time: "01:30", timeZone: "America/New_York", fold } as never)
      ).toThrow(new RangeError('fold must be "earlier" or "later".'));
    }
    // Undefined is the default, as for the other options.
    expect(resolveLocalToUtc("2021-11-07", "01:30", "America/New_York", { fold: undefined }).utc.toISOString()).toBe(
      "2021-11-07T05:30:00.000Z"
    );
  });
});

describe("a local birth in a repeated hour", () => {
  const form = { date: "2021-11-07", time: "01:30", timeZone: "America/New_York", latitude: 40.7, longitude: -74 } as const;

  it("takes the pass the form names and keeps the flag", () => {
    expect(resolveBirth(form).utc).toEqual(new Date("2021-11-07T05:30:00.000Z"));
    expect(resolveBirth({ ...form, fold: "earlier" }).utc).toEqual(new Date("2021-11-07T05:30:00.000Z"));
    const later = resolveLocalBirth({ ...form, fold: "later" });
    expect(later.birth.utc).toEqual(new Date("2021-11-07T06:30:00.000Z"));
    expect(later.birth.flags).toEqual(["dst-fold"]);
    expect(later.reference).toBe("supplied-instant");
  });

  it("gives a different chart on each pass: the hour turns the sky", () => {
    const first = natalChart(resolveBirth(form));
    const second = natalChart(resolveBirth({ ...form, fold: "later" }));
    const moved = (((second.angles!.mc - first.angles!.mc) % 360) + 360) % 360;
    // One hour of mean solar time is 15.041° of right ascension on the
    // meridian (360.9856° a day), and a degree of right ascension is between
    // cos ε = 0.917 and 1/cos ε = 1.090 degrees of ecliptic longitude
    // (ε = 23.44°): the midheaven moves by 13.8° to 16.4°.
    expect(moved).toBeGreaterThan(13.8);
    expect(moved).toBeLessThan(16.4);
    expect(second.angles!.asc).not.toBeCloseTo(first.angles!.asc, 0);
  });

  it.each(["earlier", "later"] as const)("records the %s pass in a receipt that checks", (fold) => {
    const { birth, resolution, reference } = resolveLocalBirth({ ...form, fold });
    const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
    expect(envelope.receipt.localResolution?.policy).toEqual({ fold, gap: "shift-forward" });
    expect(envelope.receipt.inputFlags).toEqual(["dst-fold"]);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope.receipt.localResolution?.policy.fold).toBe(fold);
  });

  it("refuses a receipt whose pass does not match its instant", () => {
    const resolve = (fold: "earlier" | "later") => {
      const { birth, resolution, reference } = resolveLocalBirth({ ...form, fold });
      return createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
    };
    for (const [made, claimed] of [["earlier", "later"], ["later", "earlier"]] as const) {
      const altered = structuredClone(resolve(made));
      (altered.receipt.localResolution!.policy as { fold: string }).fold = claimed;
      expect(parseNatalEnvelope(JSON.stringify(altered))).toEqual({ ok: false, code: "invalid_context" });
    }
    // A pass this engine does not know is another engine's feature.
    const unknown = structuredClone(resolve("later"));
    (unknown.receipt.localResolution!.policy as { fold: string }).fold = "latest";
    expect(parseNatalEnvelope(JSON.stringify(unknown))).toEqual({ ok: false, code: "unsupported_feature" });
    // The second pass ends when the repeated hour does: the same record an hour on is not a fold's.
    const late = structuredClone(resolve("later"));
    late.receipt.localResolution!.transition!.at = "2021-11-07T05:00:00.000Z";
    expect(parseNatalEnvelope(JSON.stringify(late)).ok).toBe(false);
  });
});
