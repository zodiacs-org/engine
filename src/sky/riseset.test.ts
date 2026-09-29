import { describe, expect, it } from "vitest";

import { SKY_RADII_KM, STANDARD_REFRACTION_ARCMIN, skyEvents, skyEventsOn } from "../sky.js";

const WASHINGTON = { latitude: 38.89, longitude: -77.03 };
const kinds = (result: ReturnType<typeof skyEvents>) => result.events.map((event) => event.kind);

describe("skyEvents", () => {
  it("finds the day's rise, set and transits in time order, with their geometry", () => {
    const sun = skyEventsOn("Sun", WASHINGTON, "2024-06-21", { utcOffsetMinutes: 0 });
    expect(sun.status).toBe("complete");
    expect(kinds(sun)).toEqual(["set", "lower-transit", "rise", "upper-transit"]);
    expect(sun.conventions).toEqual({ limb: "upper", refraction: "standard", refractionArcmin: 34 });
    const [set, lower, rise, upper] = sun.events;
    // At a rise or set the centre is 34′ plus the semi-diameter (15.7′ in June) below the horizon.
    expect(rise!.altitude).toBeCloseTo(-(34 + 15.74) / 60, 2);
    expect(set!.altitude).toBeCloseTo(rise!.altitude, 3);
    expect(rise!.azimuth).toBeGreaterThan(55);
    expect(rise!.azimuth).toBeLessThan(62);
    expect(upper!.azimuth).toBeCloseTo(180, 3);
    expect(Math.min(lower!.azimuth, 360 - lower!.azimuth)).toBeCloseTo(0, 3);
    // At the June solstice the Sun culminates at 90° − 38.89° + 23.44°.
    expect(upper!.altitude).toBeCloseTo(90 - 38.89 + 23.44, 1);
    expect(SKY_RADII_KM).toEqual({ Sun: 696_000, Moon: 1_737.4 });
    expect(STANDARD_REFRACTION_ARCMIN).toBe(34);
  });

  it("returns the events of [from, to), the same instants from any window", () => {
    // The angles can differ in the eleventh decimal: astronomy-engine reuses the
    // nutation of the last time within 86 ms (docs/time.md).
    const same = (a: readonly { kind: string; at: Date; altitude: number }[], b: typeof a) => {
      expect(a.map((event) => [event.kind, event.at.getTime()])).toEqual(b.map((event) => [event.kind, event.at.getTime()]));
      a.forEach((event, i) => expect(Math.abs(event.altitude - b[i]!.altitude)).toBeLessThan(1e-9));
    };
    const whole = skyEvents("Moon", WASHINGTON, "2024-06-20T00:00:00Z", "2024-06-23T00:00:00Z");
    const cut = whole.events[3]!.at;
    same(skyEvents("Moon", WASHINGTON, "2024-06-20T00:00:00Z", cut).events, whole.events.slice(0, 3));
    same(skyEvents("Moon", WASHINGTON, cut, "2024-06-23T00:00:00Z").events, whole.events.slice(3));
    same(skyEvents("Moon", WASHINGTON, cut.getTime() + 1, "2024-06-23T00:00:00Z").events, whole.events.slice(4));
  });

  it("moves the rise with the conventions: the upper limb and refraction make it earlier", () => {
    const at = (options: object) =>
      skyEventsOn("Sun", { latitude: 0, longitude: 0 }, "2024-03-20", { ...options, utcOffsetMinutes: 0 }).events.find((event) => event.kind === "rise")!.at.getTime();
    const standard = at({});
    const centre = at({ limb: "centre" });
    const bare = at({ limb: "centre", refraction: "none" });
    const lower = at({ limb: "lower" });
    // At the equator at the equinox the Sun climbs 15′ a minute: 34′ of refraction is 136 s, 16′ of disc 64 s.
    expect((centre - standard) / 1000).toBeCloseTo(64.4, 0);
    expect((bare - centre) / 1000).toBeCloseTo(136, 0);
    expect((lower - centre) / 1000).toBeCloseTo(64.4, 0);
  });

  it("flags polar day and polar night, and still gives the transits", () => {
    const svalbard = { latitude: 78, longitude: 15 };
    const day = skyEventsOn("Sun", svalbard, "2024-06-21");
    expect(day.flags).toEqual(["never-sets"]);
    expect(kinds(day).sort()).toEqual(["lower-transit", "upper-transit"]);
    const night = skyEventsOn("Sun", svalbard, "2024-12-21");
    expect(night.flags).toEqual(["never-rises"]);
    expect(night.events.find((event) => event.kind === "upper-transit")!.altitude).toBeLessThan(0);
  });

  it("marks windows outside REFERENCE_SPAN", () => {
    expect(skyEventsOn("Sun", WASHINGTON, "1750-06-21").flags).toEqual(["outside-reference-span"]);
    expect(skyEventsOn("Sun", WASHINGTON, "2199-12-31", { utcOffsetMinutes: 0 }).flags).toEqual([]);
  });

  it("refuses a search whole when the sample budget runs out", () => {
    const refused = skyEventsOn("Moon", WASHINGTON, "2024-06-21", { maxSamples: 30 });
    expect(refused.status).toBe("refused");
    expect(refused.events).toEqual([]);
    expect(refused.status === "refused" && refused.reason).toBe("sample-budget");
    const complete = skyEventsOn("Moon", WASHINGTON, "2024-06-21", { maxSamples: 10_000 });
    expect(complete.status).toBe("complete");
    expect(complete.samples).toBeLessThanOrEqual(10_000);
  });

  it("refuses unknown bodies, bad observers, options and windows", () => {
    expect(() => skyEvents("North Node" as never, WASHINGTON, 0, 1)).toThrow(RangeError);
    expect(() => skyEvents("Sun", { latitude: 0 } as never, 0, 1)).toThrow(RangeError);
    expect(() => skyEvents("Sun", { latitude: 0, longitude: 181 }, 0, 1)).toThrow(RangeError);
    expect(() => skyEvents("Sun", { latitude: 0, longitude: 0, height: 1e6 }, 0, 1)).toThrow(RangeError);
    expect(() => skyEvents("Sun", { latitude: 0, longitude: 0, elevation: 1 } as never, 0, 1)).toThrow(RangeError);
    expect(() => skyEvents("Venus", WASHINGTON, 0, 1, { limb: "upper" })).toThrow(RangeError);
    expect(() => skyEvents("Sun", WASHINGTON, 0, 1, { refraction: "average" as never })).toThrow(RangeError);
    expect(() => skyEvents("Sun", WASHINGTON, 0, 1, { maxSamples: 0 })).toThrow(RangeError);
    expect(() => skyEvents("Sun", WASHINGTON, 1, 1)).toThrow(RangeError);
    expect(() => skyEventsOn("Sun", WASHINGTON, "2024-6-21")).toThrow(RangeError);
    expect(() => skyEventsOn("Sun", WASHINGTON, "2024-06-21", { utcOffsetMinutes: 2000 })).toThrow(RangeError);
    expect(() => skyEventsOn("Sun", WASHINGTON, "4000-01-01")).toThrow(/ephemeris span/u);
  });

  it("returns frozen results", () => {
    const result = skyEventsOn("Mars", WASHINGTON, "2024-06-21");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
    expect(Object.isFrozen(result.observer)).toBe(true);
  });
});
