import { describe, expect, it } from "vitest";
import { serializeNatalEnvelope } from "../../src/receipt.js";
import { castChart } from "../src/engine.js";
import { DIAL_CIRCLES, dialDistance, projectDial } from "../src/index.js";
import type { DialCircle, DialOptions, LongitudePoint } from "../src/index.js";

// Invented longitudes only. All arithmetic expectations below are integer or
// binary-fraction remainders and distances, derived here without chart output.
describe("Uranian dial projection", () => {
  it("defaults to the 90-degree circle and preserves the full zodiac longitude", () => {
    // 91=1*90+1; 181=2*90+1; 271=3*90+1. Each projects to 1.
    expect(projectDial([
      { body: "C", lon: 271 }, { body: "A", lon: 91 }, { body: "B", lon: 181 }
    ])).toEqual({
      circle: 90, contactOrb: 1, arithmetic: "binary64;inclusive;no-epsilon",
      points: [
        { body: "C", sourceLon: 271, lon: 1, sector: 3 },
        { body: "A", sourceLon: 91, lon: 1, sector: 1 },
        { body: "B", sourceLon: 181, lon: 1, sector: 2 }
      ],
      contacts: [{ a: "A", b: "B", orb: 0 }, { a: "A", b: "C", orb: 0 }, { a: "B", b: "C", orb: 0 }]
    });
    expect(DIAL_CIRCLES).toEqual([90, 45, 22.5]);
    expect(Object.isFrozen(DIAL_CIRCLES)).toBe(true);
  });

  it.each(DIAL_CIRCLES)("projects every sector and its exact seam on the %s-degree circle", (circle) => {
    // The supported circles divide 360 exactly. At sector k, k*C+1 has
    // quotient k and remainder 1; k*C is a seam with remainder zero.
    for (let k = 0; k < 360 / circle; k += 1) {
      const result = projectDial([{ body: "A", lon: k * circle + 1 }], circle);
      expect(result.points).toEqual([{ body: "A", sourceLon: k * circle + 1, lon: 1, sector: k }]);
      expect(projectDial([{ body: "A", lon: k * circle }], circle).points[0])
        .toEqual({ body: "A", sourceLon: k * circle, lon: 0, sector: k });
      expect(result.contacts).toEqual([]);
    }
  });

  it.each(DIAL_CIRCLES)("normalizes multi-turn and negative sources before projecting on %s", (circle) => {
    // -0.25+360=359.75, the final sector's last quarter degree.
    // 720.25-720=0.25. -720 and 360 are exact full turns.
    expect(projectDial([
      { body: "A", lon: -0.25 }, { body: "B", lon: 720.25 },
      { body: "C", lon: -720 }, { body: "D", lon: 360 }
    ], circle, { contactOrb: 0 }).points).toEqual([
      { body: "A", sourceLon: 359.75, lon: circle - 0.25, sector: 360 / circle - 1 },
      { body: "B", sourceLon: 0.25, lon: 0.25, sector: 0 },
      { body: "C", sourceLon: 0, lon: 0, sector: 0 },
      { body: "D", sourceLon: 0, lon: 0, sector: 0 }
    ]);
  });

  it.each(DIAL_CIRCLES)("measures shortest distances and seam contacts on %s", (circle) => {
    // C-0.25 and 0.25 differ by C-0.5; the wraparound distance is 0.5.
    const points = [{ body: "A", lon: circle - 0.25 }, { body: "B", lon: circle + 0.25 }];
    expect(dialDistance(points[0]!.lon, points[1]!.lon, circle)).toBe(0.5);
    expect(dialDistance(points[1]!.lon, points[0]!.lon, circle)).toBe(0.5);
    expect(dialDistance(-0.25, 720.25, circle)).toBe(0.5);
    expect(projectDial(points, circle, { contactOrb: 0.5 }).contacts).toEqual([{ a: "A", b: "B", orb: 0.5 }]);
    expect(projectDial(points, circle, { contactOrb: 0.5 - 2 ** -20 }).contacts).toEqual([]);
    // One further 2^-20 degree in B puts the seam distance beyond the limit.
    expect(projectDial([points[0]!, { body: "B", lon: circle + 0.25 + 2 ** -20 }], circle,
      { contactOrb: 0.5 }).contacts).toEqual([]);
    expect(dialDistance(0, circle / 2, circle)).toBe(circle / 2);
    expect(projectDial([{ body: "A", lon: 0 }, { body: "B", lon: circle / 2 }], circle,
      { contactOrb: circle / 2 }).contacts).toEqual([{ a: "A", b: "B", orb: circle / 2 }]);
  });

  it("distinguishes the three circles without multiplying the dial degrees", () => {
    // 45 is half of 90 but one full 45-degree turn and two 22.5-degree turns.
    // 22.5 is half of 45 and a whole turn on the smallest dial.
    expect(DIAL_CIRCLES.map((circle) => dialDistance(0, 45, circle))).toEqual([45, 0, 0]);
    expect(DIAL_CIRCLES.map((circle) => dialDistance(0, 22.5, circle))).toEqual([22.5, 22.5, 0]);
    // Number.MAX_VALUE=(2^53-1)*2^971 has remainder 128 modulo 360.
    // 128=90+38=2*45+38=5*22.5+15.5. No multiplication can overflow.
    expect(DIAL_CIRCLES.map((circle) => projectDial([{ body: "A", lon: Number.MAX_VALUE }], circle).points[0]!.lon))
      .toEqual([38, 38, 15.5]);
  });

  it.each(DIAL_CIRCLES)("applies the default one-degree orb without scaling on %s", (circle) => {
    // 2*C+1 projects to 1; 0 and 1 are exactly one degree apart on each dial.
    expect(projectDial([{ body: "A", lon: 0 }, { body: "B", lon: 2 * circle + 1 }], circle).contacts)
      .toEqual([{ a: "A", b: "B", orb: 1 }]);
    expect(projectDial([{ body: "A", lon: 0 }, { body: "B", lon: 2 * circle + 1 + 2 ** -20 }], circle).contacts)
      .toEqual([]);
  });

  it("keeps zero-orb matches exact and orders contacts independently of point order", () => {
    // A=0, B=90 and C=180 are coincident on this dial; D=270.5 is 0.5 away.
    const points = [{ body: "D", lon: 270.5 }, { body: "C", lon: 180 }, { body: "B", lon: 90 }, { body: "A", lon: 0 }];
    const exact = [{ a: "A", b: "B", orb: 0 }, { a: "A", b: "C", orb: 0 }, { a: "B", b: "C", orb: 0 }];
    expect(projectDial(points, 90, { contactOrb: 0 }).contacts).toEqual(exact);
    const contacts = [...exact, { a: "A", b: "D", orb: 0.5 }, { a: "B", b: "D", orb: 0.5 }, { a: "C", b: "D", orb: 0.5 }];
    expect(projectDial(points).contacts).toEqual(contacts);
    expect(projectDial([...points].reverse()).contacts).toEqual(contacts);
    // Rotating every source by 89.75 changes the dial seam, not these distances.
    expect(projectDial(points.map((point) => ({ ...point, lon: point.lon + 89.75 }))).contacts).toEqual(contacts);
    const zero = projectDial([{ body: "A", lon: -0 }, { body: "a", lon: 360 }], 90, { contactOrb: -0 });
    expect(Object.is(zero.contactOrb, -0)).toBe(false);
    expect(Object.is(zero.points[0]!.lon, -0)).toBe(false);
    expect(zero.contacts).toEqual([{ a: "A", b: "a", orb: 0 }]);
  });

  it("returns frozen snapshots and accepts unknown speeds without creating motion claims", () => {
    const input = [{ body: "A", lon: 91, speed: null, sign: "aries" }, { body: "B", lon: 181 }];
    const options = { contactOrb: 0.5 };
    const result = projectDial(input, 90, options);
    expect(input[0]!.lon).toBe(91);
    expect(result.points[0]).toEqual({ body: "A", sourceLon: 91, lon: 1, sector: 1 });
    input[0]!.lon = 20;
    options.contactOrb = 10;
    expect(result.points[0]!.sourceLon).toBe(91);
    expect(result.contactOrb).toBe(0.5);
    for (const value of [result, result.points, ...result.points, result.contacts, ...result.contacts]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("keeps the original natal receipt alongside cast dial analysis", () => {
    // Invented birth input. This checks integration, not ephemeris accuracy.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 },
      { includeAngles: true, includeChartPoints: true });
    const before = serializeNatalEnvelope(source.envelope);
    const result = { source, dial: projectDial(source.points, 22.5) };
    expect(result.source).toBe(source);
    expect(serializeNatalEnvelope(result.source.envelope)).toBe(before);
    expect(result.dial.points.map(({ body }) => body)).toEqual(source.points.map(({ body }) => body));
    expect(result.dial.points.every(({ sourceLon, lon }) => sourceLon >= 0 && sourceLon < 360 && lon >= 0 && lon < 22.5)).toBe(true);
    expect(Object.hasOwn(result.dial, "envelope")).toBe(false);
    expect(Object.hasOwn(result.dial, "receipt")).toBe(false);
  });
});

describe("dial input validation", () => {
  const points = [{ body: "A", lon: 0 }];
  it.each([0, 22, 360, -90, NaN, Infinity, null, "90"])("rejects unsupported circle %s", (value) => {
    expect(() => projectDial(points, value as DialCircle)).toThrow(RangeError);
    expect(() => dialDistance(0, 0, value as DialCircle)).toThrow(RangeError);
  });
  it.each(DIAL_CIRCLES)("rejects invalid orbs on %s", (circle) => {
    for (const contactOrb of [-1, circle / 2 + 2 ** -20, NaN, Infinity, null, "1"]) {
      expect(() => projectDial(points, circle, { contactOrb } as DialOptions)).toThrow(RangeError);
    }
  });
  it.each([null, [], "options", { orb: 1 }, { contactOrb: 1, extra: true }])("rejects unsupported options %s", (value) => {
    expect(() => projectDial(points, 90, value as DialOptions)).toThrow(RangeError);
  });
  it("reuses point validation and rejects invalid distance inputs", () => {
    for (const input of [[], null, {}, new Array(1), [null], [{ body: " A", lon: 0 }],
      [{ body: "A", lon: NaN }], [{ body: "A", lon: 0 }, { body: "A", lon: 90 }]]) {
      expect(() => projectDial(input as readonly LongitudePoint[])).toThrow(RangeError);
    }
    for (const value of [NaN, Infinity, -Infinity, null, "1", undefined]) {
      expect(() => dialDistance(value as number, 0)).toThrow(RangeError);
      expect(() => dialDistance(0, value as number)).toThrow(RangeError);
    }
  });
});
