import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_HARMONIC, harmonicChart } from "../src/index.js";
import type { HarmonicOptions, LongitudePoint } from "../src/index.js";

// All points are invented. Integers and quarters below are exact binary64 values.
// Expectations come from the written multiplication and division remainders,
// never from an engine chart, this library's earlier output or an ephemeris.
const synthetic: readonly LongitudePoint[] = [
  { body: "Sun", lon: 10 },
  { body: "Moon", lon: 130 },
  { body: "Mercury", lon: 250 },
  { body: "Ascendant", lon: 359.75 }
];

describe("harmonic longitude charts", () => {
  it("keeps normalized source longitudes at harmonic one", () => {
    expect(harmonicChart(synthetic, 1)).toEqual({
      harmonic: 1,
      maxHarmonic: 180,
      points: [
        { body: "Sun", sourceLon: 10, lon: 10 },
        { body: "Moon", sourceLon: 130, lon: 130 },
        { body: "Mercury", sourceLon: 250, lon: 250 },
        { body: "Ascendant", sourceLon: 359.75, lon: 359.75 }
      ]
    });
  });

  it("turns exact trine spacing into a conjunction at harmonic three", () => {
    // 3*10=30; 3*130=390=360+30; 3*250=750=2*360+30.
    // 3*359.75=1079.25=2*360+359.25.
    expect(harmonicChart(synthetic, 3).points.map((point) => point.lon))
      .toEqual([30, 30, 30, 359.25]);
  });

  it("normalizes negative and multi-turn inputs before multiplication", () => {
    // -361.25+720=358.75; 2*358.75=717.5=360+357.5.
    // 721.25-720=1.25; 2*1.25=2.5. 360 and -720 are whole turns.
    expect(harmonicChart([
      { body: "A", lon: -361.25 }, { body: "B", lon: 721.25 },
      { body: "C", lon: 360 }, { body: "D", lon: -720 }
    ], 2).points).toEqual([
      { body: "A", sourceLon: 358.75, lon: 357.5 },
      { body: "B", sourceLon: 1.25, lon: 2.5 },
      { body: "C", sourceLon: 0, lon: 0 },
      { body: "D", sourceLon: 0, lon: 0 }
    ]);
  });

  it("supports every integer harmonic in the default range", () => {
    // For the invented longitude 2 degrees, 2*N is in [2,358] for N=1..179;
    // N=180 is exactly one complete turn and therefore zero degrees.
    expect(DEFAULT_MAX_HARMONIC).toBe(180);
    for (let n = 1; n <= 180; n += 1) {
      expect(harmonicChart([{ body: "A", lon: 2 }], n).points[0]?.lon)
        .toBe(n === 180 ? 0 : 2 * n);
    }
  });

  it("allows a smaller or larger explicit harmonic ceiling", () => {
    expect(harmonicChart(synthetic, 3, { maxHarmonic: 3 }).maxHarmonic).toBe(3);
    expect(() => harmonicChart(synthetic, 4, { maxHarmonic: 3 })).toThrow(RangeError);
    expect(() => harmonicChart(synthetic, 181)).toThrow(RangeError);
    // 0.25*720=180, with no wraparound or decimal rounding.
    expect(harmonicChart([{ body: "A", lon: 0.25 }], 720, { maxHarmonic: 720 }))
      .toEqual({ harmonic: 720, maxHarmonic: 720, points: [{ body: "A", sourceLon: 0.25, lon: 180 }] });
  });

  it("normalizes before multiplying very large finite longitudes", () => {
    // Number.MAX_VALUE is (2^53-1)*2^971. Modulo 360 it is 128:
    // 2^971 mod 360=248, (2^53-1) mod 360=31, and 31*248 mod 360=128.
    // The remainder survives although Number.MAX_VALUE*180 would overflow.
    expect(harmonicChart([{ body: "A", lon: Number.MAX_VALUE }], 180).points)
      .toEqual([{ body: "A", sourceLon: 128, lon: 0 }]); // 128*180=64*360.
  });

  it("returns frozen snapshots without mutating caller data or forwarding stale annotations", () => {
    const input = [{ body: "A", lon: 120, sign: "leo", speed: 5 }];
    const result = harmonicChart(input, 3);
    expect(result.points).toEqual([{ body: "A", sourceLon: 120, lon: 0 }]);
    expect(input).toEqual([{ body: "A", lon: 120, sign: "leo", speed: 5 }]);
    input[0]!.lon = 60;
    expect(result.points[0]?.sourceLon).toBe(120);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.points)).toBe(true);
    expect(Object.isFrozen(result.points[0])).toBe(true);
  });

  it("treats case-sensitive names as distinct and reports positive zero", () => {
    const result = harmonicChart([{ body: "A", lon: -0 }, { body: "a", lon: 360 }], 1);
    expect(result.points.map((point) => point.body)).toEqual(["A", "a"]);
    for (const point of result.points) {
      expect(Object.is(point.lon, -0)).toBe(false);
      expect(Object.is(point.sourceLon, -0)).toBe(false);
    }
  });
});

describe("invalid harmonic input", () => {
  it.each([0, -1, 1.5, 181, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, null, "3"])(
    "rejects harmonic %s", (value) => {
      expect(() => harmonicChart(synthetic, value as number)).toThrow(RangeError);
    }
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "180"])(
    "rejects maxHarmonic %s", (value) => {
      expect(() => harmonicChart(synthetic, 1, { maxHarmonic: value } as HarmonicOptions)).toThrow(RangeError);
    }
  );

  it.each([null, [], "options"])("rejects malformed options %s", (value) => {
    expect(() => harmonicChart(synthetic, 1, value as unknown as HarmonicOptions)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -Infinity, null, "30", undefined])("rejects longitude %s", (value) => {
    expect(() => harmonicChart([{ body: "A", lon: value as number }], 1)).toThrow(RangeError);
  });

  it.each(["", " A", "A ", "A\nB", "A\u007f", "A".repeat(81), null, 3])(
    "rejects invalid identifier %s", (value) => {
      expect(() => harmonicChart([{ body: value as string, lon: 30 }], 1)).toThrow(RangeError);
    }
  );

  it("rejects empty, sparse and malformed point arrays and duplicate identities", () => {
    const invalid: unknown[] = [
      [], null, {}, new Array(2), [null], [{ lon: 30 }], [{ body: "A" }],
      [{ body: "A", lon: 10 }, { body: "A", lon: 20 }]
    ];
    for (const points of invalid) {
      expect(() => harmonicChart(points as readonly LongitudePoint[], 1)).toThrow(RangeError);
    }
  });
});
