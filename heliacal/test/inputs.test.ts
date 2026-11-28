import { describe, expect, it } from "vitest";

import { VISIBILITY_BODIES, dateRange, instant, observationBody, observer, visibilityBody } from "../src/index.js";

describe("body inputs", () => {
  it("limits visibility targets to the Moon and the five visible planets", () => {
    expect(VISIBILITY_BODIES).toEqual(["Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
    expect(Object.isFrozen(VISIBILITY_BODIES)).toBe(true);
    for (const body of VISIBILITY_BODIES) {
      expect(visibilityBody(body)).toBe(body);
      expect(observationBody(body)).toBe(body);
    }
    expect(observationBody("Sun")).toBe("Sun");
    expect(() => visibilityBody("Sun")).toThrow(RangeError);
  });

  it.each(["Earth", "Uranus", "Neptune", "Pluto", "North Node", "venus", "", null, undefined, 1, {}, []])(
    "rejects unsupported body input %j",
    (value) => {
      expect(() => visibilityBody(value)).toThrow(RangeError);
      expect(() => observationBody(value)).toThrow(RangeError);
    }
  );
});

describe("observer inputs", () => {
  it("copies the observer and fills in ellipsoid height", () => {
    const input = { latitude: 13, longitude: -42 };
    const result = observer(input);
    expect(result).toEqual({ latitude: 13, longitude: -42, height: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    input.latitude = 20;
    expect(result.latitude).toBe(13);
  });

  it("accepts the engine sky observer boundaries", () => {
    expect(observer({ latitude: -90, longitude: -180, height: -10_000 })).toEqual({
      latitude: -90, longitude: -180, height: -10_000
    });
    expect(observer({ latitude: 90, longitude: 180, height: 100_000 })).toEqual({
      latitude: 90, longitude: 180, height: 100_000
    });
  });

  it.each([
    null, undefined, [], {}, { latitude: 0 }, { longitude: 0 },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 },
    { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity },
    { latitude: "0", longitude: 0 }, { latitude: 0, longitude: 0, height: null },
    { latitude: 0, longitude: 0, height: -10_001 },
    { latitude: 0, longitude: 0, height: 100_001 },
    { latitude: 0, longitude: 0, altitude: 10 }
  ])("rejects malformed observer %j", (value) => {
    expect(() => observer(value)).toThrow(RangeError);
  });

  it("rejects accessors without invoking them", () => {
    let read = false;
    const value = {
      get latitude() { read = true; return 0; },
      longitude: 0
    };
    expect(() => observer(value)).toThrow(RangeError);
    expect(read).toBe(false);
  });
});

describe("resolved instants and ranges", () => {
  it("normalizes explicit offsets and UTC calendar dates using engine parsing", () => {
    expect(instant("2001-02-03T04:05:06.007+02:00").toISOString()).toBe("2001-02-03T02:05:06.007Z");
    expect(instant("2001-02-03").toISOString()).toBe("2001-02-03T00:00:00.000Z");
    expect(instant(0).getTime()).toBe(0);
  });

  it("clones Date inputs", () => {
    const input = new Date("2001-02-03T04:05:06Z");
    const result = instant(input);
    expect(result).not.toBe(input);
    expect(result.getTime()).toBe(input.getTime());
    input.setTime(0);
    expect(result.toISOString()).toBe("2001-02-03T04:05:06.000Z");
  });

  it.each([
    null, undefined, {}, [], true, NaN, Infinity, new Date(NaN),
    "2001-02-29", "2001-02-03T24:00:00Z", "2001-02-03T04:05:06",
    "2001-02-03T04:05:60Z", "2001-02-03T04:05:06.0001Z", "03 February 2001"
  ])("rejects unresolved or malformed instant %j", (value) => {
    expect(() => instant(value as never)).toThrow(RangeError);
  });

  it("returns a frozen nonempty range with independently copied endpoints", () => {
    const from = new Date("2001-02-03T00:00:00Z");
    const to = new Date("2001-02-04T00:00:00Z");
    const range = dateRange(from, to);
    expect(Object.isFrozen(range)).toBe(true);
    expect(range.from).not.toBe(from);
    expect(range.to).not.toBe(to);
    expect(range.from.getTime()).toBeLessThan(range.to.getTime());
    from.setTime(0);
    to.setTime(0);
    expect(range.from.toISOString()).toBe("2001-02-03T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2001-02-04T00:00:00.000Z");
    expect(dateRange(0, 1).to.getTime()).toBe(1);
  });

  it("rejects empty, reversed and invalid ranges", () => {
    expect(() => dateRange(0, 0)).toThrow(RangeError);
    expect(() => dateRange(1, 0)).toThrow(RangeError);
    expect(() => dateRange("invalid", 1)).toThrow(RangeError);
    expect(() => dateRange(0, new Date(NaN))).toThrow(RangeError);
  });
});
