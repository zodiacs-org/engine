import { describe, expect, it } from "vitest";
import { bodyLongitude } from "../ephemeris.js";
import { loadHistory, loadedHistory } from "../geo/zone-history.js";
import { prepareLocalTime, resolveLocalToUtc } from "../geo/timezone.js";
import { SIGN_NAMES, signIndexForLongitude } from "../signs.js";
import { SHARD_LOADERS } from "../tzdb/tzdb-2025c.js";
import { EVERY_ZONE_OFFSETS, MOON_SIGN_MAX_SPAN_DAYS, moonSignCandidates, moonSignsBetween } from "./moon-sign.js";

const HOUR = 3_600_000;
const moonSign = (ms: number) => SIGN_NAMES[signIndexForLongitude(bodyLongitude("Moon", new Date(ms)))]!;

// First, before any test below loads the zone histories.
describe("a date before 1970", () => {
  it("is read on the shipped history, once prepared", async () => {
    expect(() => moonSignCandidates("1947-07-01", { timeZone: "Europe/Stockholm" })).toThrow("prepareLocalTime");
    await prepareLocalTime("1947-07-01", "Europe/Stockholm");
    expect(moonSignCandidates("1947-07-01", { timeZone: "Europe/Stockholm" }).from.toISOString()).toBe("1947-06-30T23:00:00.000Z");
  });
});

describe("the span of a date in every time zone", () => {
  it("runs from 00:00 at UTC+14 to 24:00 at UTC−12, 50 hours", () => {
    expect(EVERY_ZONE_OFFSETS).toEqual({ earliestHours: 14, latestHours: -12 });
    const result = moonSignCandidates("2000-04-11");
    expect(result.from.toISOString()).toBe("2000-04-10T10:00:00.000Z");
    expect(result.to.toISOString()).toBe("2000-04-12T11:59:59.999Z");
    expect(result.timeZone).toBeNull();
  });

  // G4 (PREREGISTRATION.md): over the shipped zone histories, every offset is
  // inside the span except in the zones the site's test lists.
  it("holds every shipped offset but those kept across the date line before 1868", async () => {
    const outside = new Set<string>();
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    for (const load of SHARD_LOADERS) {
      for (const entry of Object.values((await load()).default)) {
        await loadHistory(entry.n);
        const history = loadedHistory(entry.n)!;
        const check = (offset: number | null, until: string) => {
          if (offset !== null && (offset > EVERY_ZONE_OFFSETS.earliestHours * 3600 || offset < EVERY_ZONE_OFFSETS.latestHours * 3600)) {
            outside.add(`${history.name} until ${until}`);
          }
        };
        history.types.forEach((type, period) => check(history.offsets[type]!, period < history.times.length ? day(history.times[period]!) : "1970"));
        for (const [until, offset] of history.era ?? []) check(offset, day(until));
      }
    }
    expect([...outside].sort()).toEqual([
      "America/Anchorage until 1867-10-19", "America/Juneau until 1867-10-19", "America/Metlakatla until 1867-10-19",
      "America/Sitka until 1867-10-19", "America/Yakutat until 1867-10-19",
      "Asia/Manila until 1844-12-31",
      "Pacific/Chuuk until 1844-12-31", "Pacific/Guam until 1844-12-31", "Pacific/Kosrae until 1844-12-31",
      "Pacific/Palau until 1844-12-31", "Pacific/Pohnpei until 1844-12-31", "Pacific/Ponape until 1844-12-31",
      "Pacific/Saipan until 1844-12-31", "Pacific/Truk until 1844-12-31", "Pacific/Yap until 1844-12-31",
      "US/Alaska until 1867-10-19"
    ]);
  }, 60_000);
});

describe("the sign held the whole date in every time zone", () => {
  // The site's check: sample every hour of the 50-hour span.
  it("is named only when every hour of the span has it", () => {
    let settled = 0;
    for (let day = 1; day <= 30; day += 1) {
      const date = `2000-04-${String(day).padStart(2, "0")}`;
      const start = Date.parse(`${date}T00:00:00Z`) - 14 * HOUR;
      const signs = new Set<string>();
      for (let hour = 0; hour <= 50; hour += 1) signs.add(moonSign(Math.min(start + hour * HOUR, start + 50 * HOUR - 1)));
      const expected = signs.size === 1 ? [...signs][0] : null;
      const result = moonSignCandidates(date);
      expect(result.sign, date).toBe(expected);
      expect(result.signs.length === 1, date).toBe(expected !== null);
      if (expected) settled += 1;
    }
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(15);
  });

  it("refuses a date that is not one", () => {
    for (const bad of ["2000-02-30", "2000-2-01", "", "2000-04-11T00:00:00Z"]) expect(() => moonSignCandidates(bad)).toThrow(RangeError);
  });
});

describe("the signs over a date in a time zone (the site's cases)", () => {
  it("keeps both London candidates on 1990-01-01, one in Los Angeles, one in London on 1990-01-02", () => {
    expect(moonSignCandidates("1990-01-01", { timeZone: "Europe/London" }).signs).toEqual(["aquarius", "pisces"]);
    expect(moonSignCandidates("1990-01-01", { timeZone: "America/Los_Angeles" }).signs).toEqual(["pisces"]);
    const stable = moonSignCandidates("1990-01-02", { timeZone: "Europe/London" });
    expect(stable.signs).toEqual(["pisces"]);
    expect(stable.sign).toBe("pisces");
  });

  it("runs from local midnight to the millisecond before the next", () => {
    const result = moonSignCandidates("2024-03-10", { timeZone: "America/New_York" });
    expect(result.from.getTime()).toBe(resolveLocalToUtc("2024-03-10", "00:00", "America/New_York").utc.getTime());
    expect(result.to.getTime()).toBe(resolveLocalToUtc("2024-03-11", "00:00", "America/New_York").utc.getTime() - 1);
    expect((result.to.getTime() + 1 - result.from.getTime()) / HOUR).toBe(23);
  });

  it("refuses a date the zone skipped", () => {
    expect(() => moonSignCandidates("2011-12-30", { timeZone: "Pacific/Apia" })).toThrow("did not occur");
    expect(moonSignCandidates("2011-12-31", { timeZone: "Pacific/Apia" }).from.toISOString()).toBe("2011-12-30T10:00:00.000Z");
  });

  it("reads a birthplace's own mean time with a longitude", async () => {
    await prepareLocalTime("1880-05-01", "Europe/Paris");
    const zone = moonSignCandidates("1880-05-01", { timeZone: "Europe/Paris" });
    const place = moonSignCandidates("1880-05-01", { timeZone: "Europe/Paris", longitude: 7.75 });
    expect(place.from.getTime()).toBe(resolveLocalToUtc("1880-05-01", "00:00", "Europe/Paris", { longitude: 7.75 }).utc.getTime());
    expect(place.from.getTime()).not.toBe(zone.from.getTime());
  });

  it("refuses options it does not know, and a longitude without a zone", () => {
    expect(() => moonSignCandidates("2000-01-01", { longitude: 10 })).toThrow(RangeError);
    expect(() => moonSignCandidates("2000-01-01", { zone: "UTC" } as never)).toThrow(RangeError);
    expect(() => moonSignCandidates("2000-01-01", { timeZone: "Not/AZone" })).toThrow(RangeError);
  });
});

describe("the signs over a span", () => {
  it("lists the signs in order, across the Pisces–Aries wrap", () => {
    // Find an ingress into Aries and take the span around it.
    let t = Date.parse("2000-01-01T00:00:00Z");
    while (moonSign(t) !== "pisces" || moonSign(t + 6 * HOUR) !== "aries") t += 6 * HOUR;
    expect(moonSignsBetween(t, t + 6 * HOUR)).toEqual(["pisces", "aries"]);
    expect(moonSignsBetween(t, t)).toEqual(["pisces"]);
    // Three signs over five days.
    expect(moonSignsBetween(t - 2 * 24 * HOUR, t + 3 * 24 * HOUR)).toHaveLength(3);
  });

  it("refuses an inverted or overlong span", () => {
    expect(() => moonSignsBetween(10, 0)).toThrow(RangeError);
    expect(() => moonSignsBetween(0, (MOON_SIGN_MAX_SPAN_DAYS + 1) * 24 * HOUR)).toThrow(RangeError);
  });

  it("flags a date outside 1800–2200", () => {
    expect(moonSignCandidates("1799-12-31").flags).toEqual(["outside-reference-span"]);
    expect(moonSignCandidates("2000-01-01").flags).toEqual([]);
  });
});
