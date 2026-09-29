import { describe, expect, it } from "vitest";

import { CHALDEAN_ORDER, PLANETARY_DAY_RULERS, planetaryHourAt, planetaryHours, skyEvents } from "../sky.js";

const MINUTE = 60_000;
/** Oxford: Chaucer gives its latitude as 51°50′ (Astrolabe II.25). */
const OXFORD = { latitude: 51 + 50 / 60, longitude: -1.25 };

describe("planetary hours: worked examples", () => {
  it("Chaucer, Astrolabe II.12: a Saturday, 13 March (Julian 1389), at Oxford", () => {
    // 13 March 1389 Julian is 21 March 1389 Gregorian, a Saturday.
    const day = planetaryHours(OXFORD, "1389-03-21");
    expect(day.status).toBe("complete");
    if (day.status !== "complete") return;
    expect(day.weekday).toBe(6);
    expect(day.ruler).toBe("Saturn");
    expect(day.hours.slice(0, 12).map((hour) => hour.ruler)).toEqual([
      "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus"
    ]);
    // "Thanne sheweth ... the houre of Mercurie entring ... at eve; and next him succedeth the Mone."
    expect(day.hours[12]!.ruler).toBe("Mercury");
    expect(day.hours[13]!.ruler).toBe("Moon");
    expect(day.flags).toContain("outside-reference-span");
    // "Now ryseth the sonne that Sonday by the morwe ... the houre of the forseide sonne."
    const sunday = planetaryHours(OXFORD, "1389-03-22");
    expect(sunday.ruler).toBe("Sun");
    expect(sunday.status === "complete" && sunday.hours[0]!.ruler).toBe("Sun");
    expect(sunday.status === "complete" && sunday.sunrise.getTime()).toBe(day.nextSunrise.getTime());
  });

  it("Skeat's notes to II.7–10: Oxford at the solstice, day hours of 1 h 22½ m and night hours of 37½ m", () => {
    const day = planetaryHours(OXFORD, "2000-06-21", { limb: "centre", refraction: "none" });
    expect(day.status).toBe("complete");
    if (day.status !== "complete") return;
    const length = (index: number) => (day.hours[index]!.end.getTime() - day.hours[index]!.start.getTime()) / MINUTE;
    expect(Math.abs(length(0) - 82.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(length(12) - 37.5)).toBeLessThanOrEqual(1);
    // The figures docs/sky.md gives.
    expect([length(0).toFixed(2), length(12).toFixed(2)]).toEqual(["82.32", "37.70"]);
  });

  it("Heindel (1919), pp. 155–156: latitude 40, a Thursday in December, Mars from 1:32 to 2:18 P.M.", () => {
    // 75° W keeps local mean time on UTC − 5 h.
    const place = { latitude: 40, longitude: -75 };
    const { day, hour } = planetaryHourAt(place, "2025-12-18T19:00:00Z", { utcOffsetMinutes: -300 });
    expect(day.ruler).toBe("Jupiter");
    expect(hour?.number).toBe(9);
    expect(hour?.ruler).toBe("Mars");
    const local = (date: Date) => (date.getTime() - Date.parse("2025-12-18T05:00:00Z")) / MINUTE;
    expect(Math.abs(local(hour!.start) - (13 * 60 + 32))).toBeLessThanOrEqual(5);
    expect(Math.abs(local(hour!.end) - (14 * 60 + 18))).toBeLessThanOrEqual(5);
    // The figures docs/sky.md gives, local mean time.
    const clock = (date: Date) => new Date(date.getTime() - 5 * 60 * MINUTE).toISOString().slice(11, 19);
    expect([clock(hour!.start), clock(hour!.end)]).toEqual(["13:30:06", "14:16:46"]);
  });

  it("Cassius Dio 37.19: counting the hours from Saturn, each day's first hour falls to its own planet", () => {
    expect(PLANETARY_DAY_RULERS).toEqual(["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]);
    const place = { latitude: 51.48, longitude: 0 };
    let previous: string | undefined;
    for (let date = 7; date <= 13; date += 1) {
      const day = planetaryHours(place, `2024-01-${String(date).padStart(2, "0")}`);
      expect(day.status).toBe("complete");
      if (day.status !== "complete") return;
      // 2024-01-07 was a Sunday.
      expect(day.weekday).toBe(date - 7);
      expect(day.hours[0]!.ruler).toBe(PLANETARY_DAY_RULERS[date - 7]);
      if (previous) expect(CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(previous as never) + 24) % 7]).toBe(day.ruler);
      previous = day.ruler;
    }
  });
});

describe("planetary hours: consistency with the rise/set function", () => {
  it("divides sunrise to sunset and sunset to the next sunrise into twelve equal parts", () => {
    for (const [latitude, longitude, date] of [[0, 0, "2024-03-20"], [45, 90, "2025-06-21"], [-55, -135, "1975-12-21"], [65, 45, "2050-06-21"]] as const) {
      const place = { latitude, longitude };
      const day = planetaryHours(place, date);
      expect(day.status).toBe("complete");
      if (day.status !== "complete") continue;
      const rises = skyEvents("Sun", place, day.sunrise.getTime() - 1, day.nextSunrise.getTime() + 1).events;
      expect(rises.filter((event) => event.kind !== "upper-transit" && event.kind !== "lower-transit").map((event) => event.at.getTime())).toEqual([
        day.sunrise.getTime(), day.sunset.getTime(), day.nextSunrise.getTime()
      ]);
      const marks = [day.sunrise.getTime(), day.sunset.getTime(), day.nextSunrise.getTime()];
      day.hours.forEach((hour, index) => {
        const night = index >= 12;
        const k = index % 12;
        const from = marks[night ? 1 : 0]!;
        const step = (marks[night ? 2 : 1]! - from) / 12;
        expect(Math.abs(hour.start.getTime() - (from + k * step))).toBeLessThanOrEqual(1);
        expect(Math.abs(hour.end.getTime() - (from + (k + 1) * step))).toBeLessThanOrEqual(1);
        expect(hour.ruler).toBe(CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(day.ruler) + index) % 7]);
        if (index > 0) expect(hour.start.getTime()).toBe(day.hours[index - 1]!.end.getTime());
      });
    }
  });

  it("gives the hour of an instant, from the day whose sunrise precedes it", () => {
    const place = { latitude: 30, longitude: 120 };
    const day = planetaryHours(place, "2024-06-21");
    if (day.status !== "complete") throw new Error("expected a complete day");
    const before = planetaryHourAt(place, day.sunrise.getTime() - 1);
    expect(before.day.date).toBe("2024-06-20");
    expect(before.hour?.number).toBe(24);
    const at = planetaryHourAt(place, day.sunrise.getTime());
    expect(at.day.date).toBe("2024-06-21");
    expect(at.hour?.number).toBe(1);
  });

  it("reports polar days and nights, and dates without a sunrise, instead of hours", () => {
    const svalbard = { latitude: 78, longitude: 15 };
    const summer = planetaryHours(svalbard, "2024-06-21");
    expect(summer.status).toBe("no-sunrise");
    expect(summer.flags).toEqual(["never-sets"]);
    expect(summer.hours).toEqual([]);
    const winter = planetaryHours(svalbard, "2024-12-21");
    expect(winter.status).toBe("no-sunrise");
    expect(winter.flags).toEqual(["never-rises"]);
    expect(planetaryHourAt(svalbard, "2024-12-21T12:00:00Z").hour).toBeNull();
    // On the UTC clock at 90° E the March sunrise falls just after midnight,
    // later each day: 2000-03-20 has none, though the Sun rises and sets daily.
    const clockMissesIt = planetaryHours({ latitude: -65, longitude: 90 }, "2000-03-20", { utcOffsetMinutes: 0 });
    expect(clockMissesIt.status).toBe("no-sunrise");
    expect(clockMissesIt.flags).toEqual([]);
    // Polar day begins at 70° N 25° E: the Sun rises early on 2024-05-16 (local
    // mean time) and does not set again for weeks.
    const begins = planetaryHours({ latitude: 70, longitude: 25 }, "2024-05-16");
    expect(begins.status).toBe("no-sunset");
    expect(begins.flags).toEqual([]);
    expect(planetaryHours({ latitude: 70, longitude: 25 }, "2024-05-15").status).toBe("complete");
    // Polar night begins there: the Sun rises and sets on 2024-11-24 and does
    // not rise again until January.
    const ends = planetaryHours({ latitude: 70, longitude: 25 }, "2024-11-24");
    expect(ends.status).toBe("no-next-sunrise");
    expect(ends.flags).toEqual([]);
    expect(planetaryHours({ latitude: 70, longitude: 25 }, "2024-11-23").status).toBe("complete");
    expect(planetaryHours({ latitude: 70, longitude: 25 }, "2024-11-25").flags).toEqual(["never-rises"]);
  });

  it("refuses bad input", () => {
    expect(() => planetaryHours({ latitude: 91, longitude: 0 }, "2024-01-01")).toThrow(RangeError);
    expect(() => planetaryHours({ latitude: 0, longitude: 0 }, "2024-02-30")).toThrow(RangeError);
    expect(() => planetaryHours({ latitude: 0, longitude: 0 }, "2024-01-01", { limb: "rim" as never })).toThrow(RangeError);
    expect(() => planetaryHours({ latitude: 0, longitude: 0 }, "2024-01-01", { refraction: "standard", other: 1 } as never)).toThrow(RangeError);
    const refused = planetaryHours({ latitude: 0, longitude: 0 }, "2024-01-01", { maxSamples: 10 });
    expect(refused.status).toBe("refused");
  });
});
