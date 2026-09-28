import { SetDeltaTFunction } from "astronomy-engine";
import { describe, expect, it } from "vitest";
import {
  PROGRESSION_DAYS_PER_YEAR,
  deltaT,
  outsideReferenceSpan,
  positions,
  progressedBodies,
  progressedInstant,
  type DateInput
} from "./index.js";
import { HORIZONS_2020 } from "./fixtures/horizons-2020.js";

const DAY_MS = 86_400_000;
const YEAR_MS = 365.2422 * DAY_MS;

describe("secondary progression instant", () => {
  it("maps a fixed tropical year to one elapsed day in both directions", () => {
    expect(PROGRESSION_DAYS_PER_YEAR).toBe(365.2422);
    expect(Math.abs(progressedInstant(0, YEAR_MS).getTime() - DAY_MS)).toBeLessThanOrEqual(1);
    expect(Math.abs(progressedInstant(0, -YEAR_MS).getTime() + DAY_MS)).toBeLessThanOrEqual(1);
    expect(progressedInstant(0, 365 * DAY_MS).getTime()).toBeLessThan(DAY_MS);
    expect(progressedInstant(0, 366 * DAY_MS).getTime()).toBeGreaterThan(DAY_MS);
  });

  it("accepts equivalent Date, epoch-millisecond, UTC and offset inputs", () => {
    const births: DateInput[] = [new Date("2019-12-31"), 1577750400000, "2019-12-31", "2019-12-31T07:00:00+07:00"];
    const targets: DateInput[] = [new Date("2020-12-30T05:48:46.080Z"), 1609307326080, "2020-12-30T05:48:46.080Z", "2020-12-30T12:48:46.080+07:00"];
    for (const birth of births) for (const target of targets) {
      expect(progressedInstant(birth, target).toISOString()).toBe("2020-01-01T00:00:00.000Z");
    }
  });

  it("matches the rounded published Chaplin date-mapping example", () => {
    // Juan Estadella, Predictive Astrology, 3rd ed. (2019), pp. 84–85:
    // https://juanestadella.com/Predictive_Astrology_Juan-Estadella_3rd_edition.pdf
    // (PDF SHA-256 bf52656b367ad7d1415a7b021a0a0db3a609bf35c7a40053ff0622e7a3325622).
    // Use the book's stated birth/target instants as UT inputs, not independently
    // verified biography. Its intermediate arithmetic is rounded: its own
    // precision allows up to 4.73 s (docs/evidence/rc12-20260928/sources.md),
    // hence the predeclared 5-second comparison tolerance.
    const actual = progressedInstant("1889-04-16T19:40:40Z", "1901-05-09T12:00:00Z");
    expect(Math.abs(actual.getTime() - Date.parse("1889-04-28T21:06:27Z"))).toBeLessThanOrEqual(5_000);
    // Independent Decimal evaluation of the same literal inputs and convention
    // yields 21:06:30.683683...; this pre-epoch Date truncates toward zero.
    expect(Math.abs(actual.getTime() - Date.parse("1889-04-28T21:06:30.684Z"))).toBeLessThanOrEqual(1);
  });

  it("reproduces the book's own arithmetic from the birth time it actually used", () => {
    // The book writes 19:40:40 UT as 19.677 h, which is 19:40:37.2 UT. Its
    // six-decimal day arithmetic then gives 0.879489 d = 21:06:27.8496, printed
    // as 21:06:27; the exact mapping of 19:40:37.2 is 21:06:27.8913..., which
    // this pre-epoch Date truncates toward zero to 21:06:27.892. The 42 ms left
    // is the book's rounding of 4404.680125 / 365.2422 to 12.059614 days.
    const actual = progressedInstant("1889-04-16T19:40:37.200Z", "1901-05-09T12:00:00Z").getTime();
    expect(new Date(Math.floor(actual / 1000) * 1000).toISOString()).toBe("1889-04-28T21:06:27.000Z");
    expect(Math.abs(actual - Date.parse("1889-04-28T21:06:27.850Z"))).toBeLessThanOrEqual(50);
    expect(actual).toBe(Date.parse("1889-04-28T21:06:27.892Z"));
  });

  it.each(["2000-02-29", "0099-01-01", "0000-02-29", "-000001-12-31"])(
    "preserves the proleptic Gregorian birth epoch %s at zero age", (birth) => {
      expect(progressedInstant(birth, birth).getTime()).toBe(Date.parse(birth));
    }
  );

  it("returns a separate Date without mutating or coercing caller Dates", () => {
    const birth = new Date("2000-02-29T12:34:56.789Z");
    const target = new Date(birth);
    const expected = birth.getTime();
    birth.getTime = () => { throw new Error("overridden getTime must not be called"); };
    const first = progressedInstant(birth, target);
    const second = progressedInstant(birth, target);
    expect(first.getTime()).toBe(expected);
    expect(first).not.toBe(birth);
    expect(first).not.toBe(target);
    first.setTime(0);
    expect(second.getTime()).toBe(expected);
    expect(Date.prototype.getTime.call(birth)).toBe(expected);
    expect(target.getTime()).toBe(expected);
  });

  it("keeps the site's floating operation order and Date millisecond truncation", () => {
    // Cancelling DAY_MS algebraically produces 882895842724779 instead.
    expect(progressedInstant(886044525541365, -263987313490360).getTime()).toBe(882895842724780);
    // TimeClip truncates toward zero on both sides of the Unix epoch.
    expect(progressedInstant(0, 365).getTime()).toBe(0);
    expect(progressedInstant(0, -365).getTime()).toBe(0);
    expect(progressedInstant(0, 366).getTime()).toBe(1);
    expect(progressedInstant(0, -366).getTime()).toBe(-1);
    expect(progressedInstant(0.9, 366.9).getTime()).toBe(1);
  });

  it("retains the old mapping over signed ages and the valid Date endpoints", () => {
    const epochs = [-8_640_000_000_000_000, -2208988800000, -1, 0, 1, 951825600789, 1800000000000, 8_640_000_000_000_000];
    for (const birth of epochs) for (const target of epochs) {
      const yearsLived = (target - birth) / (365.2422 * DAY_MS);
      const legacy = new Date(birth + yearsLived * DAY_MS).getTime();
      expect(progressedInstant(birth, target).getTime()).toBe(legacy);
      expect(Number.isFinite(legacy)).toBe(true);
    }
  });

  const invalidInputs: unknown[] = [new Date(NaN), NaN, Infinity, -Infinity,
    8_640_000_000_000_001, "2023-02-29", "2024-04-31", "2020-01-01T12:00:00",
    "2020-01-01T24:00:00Z", "2020-01-01\n", "not a date", null, undefined, true, {}, []];
  it.each(["birthUtc", "target"] as const)("rejects invalid %s inputs in both APIs", (argument) => {
    for (const invalid of invalidInputs) for (const api of [progressedInstant, progressedBodies]) {
      const call = () => argument === "birthUtc"
        ? api(invalid as DateInput, 0) : api(0, invalid as DateInput);
      expect(call).toThrow(RangeError);
      expect(call).toThrow(new RegExp(`^${argument} must be`));
    }
  });
});

describe("secondary progressed positions", () => {
  it("checks a constructed mapping against the existing independent JPL component fixture", () => {
    // Not an independently published progression report: one exact tropical
    // year maps to the literal JPL epoch, where ten longitudes are checked.
    const birth = "2019-12-31T00:00:00Z";
    const target = "2020-12-30T05:48:46.080Z";
    expect(progressedInstant(birth, target).toISOString()).toBe("2020-01-01T00:00:00.000Z");
    const bodies = progressedBodies(birth, target);
    for (const [name, expected] of Object.entries(HORIZONS_2020)) {
      const body = bodies.find((row) => row.body === name)!;
      const separation = Math.abs(body.lon - expected);
      expect(Math.min(separation, 360 - separation)).toBeLessThan(0.01);
    }
  });

  it.each(["1887-07-06T00:00:00Z", "1907-07-06T15:06:36Z", "2026-07-06T00:00:00Z"])(
    "returns the exact ordinary positions row set, including speeds and true nodes, for %s", (target) => {
      const birth = "1907-07-06T15:06:36Z";
      const rows = progressedBodies(birth, target);
      expect(rows).toEqual(positions(progressedInstant(birth, target)));
      expect(rows.map((row) => row.body)).toEqual([
        "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"
      ]);
      expect(rows.every((row) => Number.isFinite(row.speed))).toBe(true);
    }
  );

  it("returns independent position rows without retaining caller Date objects", () => {
    const birth = new Date("2000-02-29");
    const target = new Date("2026-09-28");
    const expected = positions(progressedInstant(birth, target));
    const first = progressedBodies(birth, target);
    first[0]!.lon = 0;
    first.pop();
    expect(progressedBodies(birth, target)).toEqual(expected);
    expect(birth.toISOString()).toBe("2000-02-29T00:00:00.000Z");
    expect(target.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("restores the normal ephemeris clock after another astronomy-engine caller changes it", () => {
    const birth = "2000-02-29";
    const target = "2026-09-28";
    const expected = positions(progressedInstant(birth, target));
    try {
      SetDeltaTFunction(() => 86_400_000);
      expect(progressedBodies(birth, target)).toEqual(expected);
    } finally { SetDeltaTFunction(deltaT); }
  });

  it("throws RangeError, not astronomy-engine's string, where speed samples leave the Date range", () => {
    expect(() => progressedBodies(8.64e15, 8.64e15)).toThrow(RangeError);
    expect(() => progressedBodies(-8.64e15, -8.64e15)).toThrow(RangeError);
    expect(() => progressedBodies(8.64e15 - 1, 8.64e15 - 1)).toThrow(/outside JavaScript's Date range/);
    expect(() => positions(8.64e15)).toThrow(RangeError);
    expect(() => positions(-8.64e15)).toThrow(RangeError);
    // The mapping itself is arithmetic and remains defined at the Date limits.
    expect(progressedInstant(8.64e15, 8.64e15).getTime()).toBe(8.64e15);
  });

  it("maps the target before evaluating reference coverage", () => {
    const birth = "2000-01-01";
    const target = "2300-01-01";
    expect(outsideReferenceSpan(new Date(target))).toBe(true);
    expect(outsideReferenceSpan(progressedInstant(birth, target))).toBe(false);
    expect(progressedBodies(birth, target)).toEqual(positions(progressedInstant(birth, target)));
    // Date validity is not a claim of physical coverage outside the reference span.
    expect(outsideReferenceSpan(progressedInstant("1700-01-01", "1700-01-01"))).toBe(true);
  });
});
