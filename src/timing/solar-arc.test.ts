import { describe, expect, it } from "vitest";

import {
  SIGN_SLUGS,
  natalChart,
  normalizeLongitude,
  positions,
  progressedBodies,
  progressedInstant,
  type ZodiacSign
} from "../index.js";
import {
  directLongitudes,
  solarArc,
  solarArcDirections
} from "../timing.js";

/** Degrees and minutes within a sign, as a longitude. */
const lon = (sign: ZodiacSign, degrees: number, minutes: number) => SIGN_SLUGS.indexOf(sign) * 30 + degrees + minutes / 60;

/** Signed a − b in arcminutes, across the 0/360 seam. */
const arcmin = (a: number, b: number) => ((((a - b) % 360) + 540) % 360 - 180) * 60;

type Row = readonly [name: string, natal: number, directed: number];

/**
 * Hamish Saunders, "Solar Arc Directions" (Astrology House, Orewa, 1996),
 * https://astrology-house.com/content/docs/articles/Solar_Arc.pdf (accessed
 * 2026-09-28), p. 3, Figure 1: Christopher Reeve (1952-2004), 25 Sep 1952,
 * 3:12:00 AM EDT (+4h), Manhattan NY, 73w59'00 40n46'00; transits 26 May
 * 1995, 2:02:46 AM EDT; "True SA 42°20'". Inner wheel "Radix", middle wheel
 * "Directed". The PDF sets planets and signs in an astrological font; the
 * glyphs are decoded here (Sun ‚ ... Lot of Fortune £, Aries Ö ... Pisces á),
 * and the engine's own natal chart confirms the decoding to about a minute in
 * every row.
 */
const REEVE = {
  birth: { utc: "1952-09-25T07:12:00Z", latitude: 40 + 46 / 60, longitude: -(73 + 59 / 60) },
  target: "1995-05-26T06:02:46Z",
  arc: 42 + 20 / 60,
  /** The engine's arc differs from the printed one by less than this, in arcminutes. */
  within: 0.05,
  rows: [
    ["Sun", lon("libra", 2, 9), lon("scorpio", 14, 29)],
    ["Moon", lon("sagittarius", 12, 32), lon("capricorn", 24, 52)],
    ["Mercury", lon("libra", 2, 44), lon("scorpio", 15, 4)],
    ["Venus", lon("libra", 27, 0), lon("sagittarius", 9, 20)],
    ["Mars", lon("sagittarius", 18, 15), lon("aquarius", 0, 35)],
    ["Jupiter", lon("taurus", 20, 35), lon("cancer", 2, 55)],
    ["Saturn", lon("libra", 16, 0), lon("scorpio", 28, 20)],
    ["Uranus", lon("cancer", 18, 9), lon("virgo", 0, 29)],
    ["Neptune", lon("libra", 20, 43), lon("sagittarius", 3, 3)],
    ["Pluto", lon("leo", 22, 26), lon("libra", 4, 46)],
    ["North Node", lon("aquarius", 20, 40), lon("aries", 3, 0)],
    ["Ascendant", lon("leo", 19, 5), lon("libra", 1, 25)],
    ["Midheaven", lon("taurus", 10, 29), lon("gemini", 22, 49)],
    ["Lot of Fortune", lon("gemini", 8, 42), lon("cancer", 21, 2)]
  ] as readonly Row[]
};

/**
 * Saunders (1996), p. 4, Figure 2: Coretta Scott King (1927-2006), 27 Apr
 * 1927, 4:00:00 PM CST (+6h), Marion AL, 87w19'09 32n37'56; transits 5 Apr
 * 1968, 12:41:13 PM CST; "True SA 39°27'".
 */
const KING = {
  birth: { utc: "1927-04-27T22:00:00Z", latitude: 32 + 37 / 60 + 56 / 3600, longitude: -(87 + 19 / 60 + 9 / 3600) },
  target: "1968-04-05T18:41:13Z",
  arc: 39 + 27 / 60,
  within: 0.05,
  rows: [
    ["Sun", lon("taurus", 6, 38), lon("gemini", 16, 5)],
    ["Moon", lon("pisces", 15, 56), lon("aries", 25, 23)],
    ["Mercury", lon("aries", 15, 5), lon("taurus", 24, 32)],
    ["Venus", lon("gemini", 13, 9), lon("cancer", 22, 36)],
    ["Mars", lon("cancer", 6, 21), lon("leo", 15, 48)],
    ["Jupiter", lon("pisces", 23, 4), lon("taurus", 2, 31)],
    ["Saturn", lon("sagittarius", 6, 21), lon("capricorn", 15, 48)],
    ["Uranus", lon("aries", 1, 27), lon("taurus", 10, 54)],
    ["Neptune", lon("leo", 24, 12), lon("libra", 3, 39)],
    ["Pluto", lon("cancer", 13, 57), lon("leo", 23, 24)],
    ["North Node", lon("gemini", 29, 20), lon("leo", 8, 47)],
    ["Ascendant", lon("libra", 6, 27), lon("scorpio", 15, 54)],
    ["Midheaven", lon("cancer", 6, 56), lon("leo", 16, 23)],
    ["Lot of Fortune", lon("leo", 15, 46), lon("virgo", 25, 13)]
  ] as readonly Row[]
};

/**
 * Saunders (1996), p. 5, Figure 3: Princess Diana (1961-1997), 1 Jul 1961,
 * 7:45:00 PM GMD −01:00:00 (British Summer Time), Sandringham, 0e30'00
 * 52n50'00; the wedding, 29 Jul 1981, 11:30:00 AM BST, London; "True SA
 * 19°09'", age "20y 0m 27d". The glyphs decode as in Figures 1 and 2, and the
 * engine's chart confirms every row to within 1.1′. The engine's arc is
 * 19°9.05′: the printed figure is its minute, truncated.
 */
const DIANA = {
  birth: { utc: "1961-07-01T18:45:00Z", latitude: 52 + 50 / 60, longitude: 0.5 },
  target: "1981-07-29T10:30:00Z",
  arc: 19 + 9 / 60,
  within: 0.06,
  rows: [
    ["Sun", lon("cancer", 9, 39), lon("cancer", 28, 48)],
    ["Moon", lon("aquarius", 25, 2), lon("pisces", 14, 11)],
    ["Mercury", lon("cancer", 3, 12), lon("cancer", 22, 21)],
    ["Venus", lon("taurus", 24, 23), lon("gemini", 13, 32)],
    ["Mars", lon("virgo", 1, 38), lon("virgo", 20, 47)],
    ["Jupiter", lon("aquarius", 5, 5), lon("aquarius", 24, 14)],
    ["Saturn", lon("capricorn", 27, 48), lon("aquarius", 16, 57)],
    ["Uranus", lon("leo", 23, 20), lon("virgo", 12, 29)],
    ["Neptune", lon("scorpio", 8, 38), lon("scorpio", 27, 47)],
    ["Pluto", lon("virgo", 6, 2), lon("virgo", 25, 11)],
    ["North Node", lon("leo", 28, 10), lon("virgo", 17, 19)],
    ["Ascendant", lon("sagittarius", 18, 24), lon("capricorn", 7, 33)],
    ["Midheaven", lon("libra", 23, 3), lon("scorpio", 12, 12)],
    ["Lot of Fortune", lon("leo", 3, 46), lon("leo", 22, 55)]
  ] as readonly Row[]
};

describe("solar arc directions: Saunders's worked examples", () => {
  for (const [name, example] of [["Christopher Reeve", REEVE], ["Coretta Scott King", KING], ["Princess Diana", DIANA]] as const) {
    describe(name, () => {
      it("computes the published true solar arc", () => {
        // Printed in whole minutes; the engine's arc is within `within` of it.
        const arc = solarArc(example.birth.utc, example.target);
        expect(Math.abs(arc.arc - example.arc) * 60).toBeLessThan(1);
        expect(Math.abs(arc.arc - example.arc) * 60).toBeLessThan(example.within);
        expect(arc.progressed).toEqual(progressedInstant(example.birth.utc, example.target));
      });

      it("reproduces every published directed position from the published radix and arc", () => {
        const directed = directLongitudes(example.rows.map(([row, natal]) => ({ name: row, lon: natal })), example.arc);
        directed.forEach((row, index) => {
          expect(row.name).toBe(example.rows[index]![0]);
          expect(Math.abs(arcmin(row.directed, example.rows[index]![2]))).toBeLessThan(1e-6);
        });
      });

      it("directs the engine's own chart to the published positions within 1.5′", () => {
        // The source prints whole minutes, truncated where it can be checked,
        // and its program's angles differ from the engine's by up to 0.75′.
        const result = solarArcDirections(example.birth, example.target);
        for (const [row, natal, directed] of example.rows) {
          const found = result.positions.find((position) => position.name === row)!;
          expect(Math.abs(arcmin(found.natal, natal))).toBeLessThan(1.5);
          expect(Math.abs(arcmin(found.directed, directed))).toBeLessThan(1.5);
          expect(found.sign).toBe(SIGN_SLUGS[Math.floor(directed / 30)]);
        }
      });
    });
  }

  it("uses the text's dates as printed on the figures", () => {
    // The text names 27 May 1995 and "the evening of the 4th of April 1968";
    // the figures, whose arcs are checked above, are set for 26 May 1995 and
    // 5 Apr 1968. A day moves the arc by about a sixth of a minute.
    const nextDay = solarArc(REEVE.birth.utc, "1995-05-27T06:02:46Z").arc - solarArc(REEVE.birth.utc, REEVE.target).arc;
    expect(nextDay * 60).toBeGreaterThan(0.1);
    expect(nextDay * 60).toBeLessThan(0.2);
  });
});

describe("solar arc invariants", () => {
  // Charlie Chaplin's birth as Juan Estadella works it (Predictive Astrology,
  // 3rd ed., 2019, pp. 84-85; see progressions.test.ts), Reeve's as Saunders
  // publishes it (above), and two synthetic instants.
  const births = ["1889-04-16T19:40:40Z", "1952-09-25T07:12:00Z", "1990-06-15T13:30:00Z", "2001-12-21T00:00:00Z"];
  const offsets = [-40, -1, 0, 0.5, 1, 12.3, 29.99, 58, 91];

  it("is the progressed Sun minus the natal Sun", () => {
    for (const birth of births) {
      for (const years of offsets) {
        const target = new Date(Date.parse(birth) + years * 365.2422 * 86_400_000);
        const arc = solarArc(birth, target);
        const natal = positions(birth).find((row) => row.body === "Sun")!.lon;
        const progressed = progressedBodies(birth, target).find((row) => row.body === "Sun")!.lon;
        expect(arc.natalSun).toBe(natal);
        expect(arc.progressedSun).toBe(progressed);
        expect(normalizeLongitude(arc.arc)).toBeCloseTo(normalizeLongitude(progressed - natal), 12);
        // Roughly a degree a year: 57′ to 61′ of arc per year of life.
        if (years !== 0) {
          expect(arc.arc / years).toBeGreaterThan(0.95);
          expect(arc.arc / years).toBeLessThan(1.02);
        } else {
          expect(arc.arc).toBe(0);
        }
      }
    }
  });

  it("counts whole turns rather than wrapping, and runs backwards before birth", () => {
    const arc = solarArc("1700-01-01T00:00:00Z", "2100-01-01T00:00:00Z");
    expect(arc.arc).toBeGreaterThan(360);
    expect(arc.arc).toBeCloseTo(normalizeLongitude(arc.progressedSun - arc.natalSun) + 360, 9);
    expect(solarArc("2000-01-01", "1990-01-01").arc).toBeLessThan(-9.5);
  });

  it("moves every body, angle and point of a chart by the same arc", () => {
    const birth = { utc: "1990-06-15T13:30:00Z", latitude: 51.5074, longitude: -0.1278, houseSystem: "placidus" } as const;
    const result = solarArcDirections(birth, "2026-09-28T00:00:00Z");
    const chart = natalChart(birth);
    expect(result.positions.map((row) => row.name).slice(0, 16)).toEqual([
      ...chart.bodies.map((body) => body.body), "Ascendant", "Midheaven", "Descendant", "Imum Coeli"
    ]);
    expect(result.positions.filter((row) => row.kind === "point")).toHaveLength(12);
    for (const row of result.positions) {
      expect(arcmin(row.directed, row.natal + result.arc.arc)).toBeCloseTo(0, 9);
      expect(row.directed).toBeGreaterThanOrEqual(0);
      expect(row.directed).toBeLessThan(360);
      expect(row.degree).toBeCloseTo(row.directed % 30, 12);
    }
    // Without a birth time there are no angles or lots, only the bodies and the mean points.
    const untimed = solarArcDirections({ utc: "1990-06-15", timeKnown: false }, "2026-09-28");
    expect(untimed.positions.map((row) => row.kind)).toEqual([...Array(12).fill("body"), "point", "point", "point"]);
  });
});

describe("solar arcs and a chart's own clock", () => {
  it("direct a chart's natal longitudes by an arc read as UTC on the engine's time basis", () => {
    // docs/timing-hellenistic.md: the arc ignores a chart's pinned ΔT, so the
    // directed Sun of such a chart is off the progressed Sun. A chart given on
    // TT is read at its UTC instant, and its directed Sun is the progressed Sun.
    const offset = (birth: Parameters<typeof natalChart>[0], target: string): number => {
      const result = solarArcDirections(natalChart(birth), target);
      const sun = result.positions.find((row) => row.name === "Sun")!;
      return arcmin(sun.directed, result.arc.progressedSun) * 60;
    };
    const pinned = offset({ utc: "1600-06-15T12:00:00Z", latitude: 40, longitude: -74, deltaT: 3600 }, "1650-01-01T00:00:00Z");
    expect(pinned).toBeGreaterThan(139.5);
    expect(pinned).toBeLessThan(139.7);
    // TT 1990-06-15T12:30:00 is UTC 12:29:02.816 (TT − UTC = 25 s + 32.184 s): the arc starts there.
    const tt = solarArcDirections({ utc: "1990-06-15T12:30:00Z", timeScale: "tt", latitude: 40, longitude: -74 }, "2026-09-28T00:00:00Z");
    expect(tt.arc.birth.toISOString()).toBe("1990-06-15T12:29:02.816Z");
    expect(Math.abs(offset({ utc: "1990-06-15T12:30:00Z", timeScale: "tt", latitude: 40, longitude: -74 }, "2026-09-28T00:00:00Z"))).toBeLessThan(0.001);
    // On the engine's own clock the directed Sun is the progressed Sun.
    expect(Math.abs(offset({ utc: "1990-06-15T12:30:00Z", latitude: 40, longitude: -74 }, "2026-09-28T00:00:00Z"))).toBeLessThan(1e-6);
  });
});

describe("solar arc refusals and ownership", () => {
  it("refuses invalid instants, rows and arcs", () => {
    expect(() => solarArc("1990-02-30", "2000-01-01")).toThrow(/birthUtc must be/);
    expect(() => solarArc("1990-01-01", "2000-01-01T12:00:00")).toThrow(/target must be/);
    expect(() => directLongitudes([{ name: "Sun", lon: 1 }], Number.NaN)).toThrow(/arc must be/);
    expect(() => directLongitudes([{ name: "Sun", lon: 1 }], "1" as unknown as number)).toThrow(/arc must be/);
    expect(() => directLongitudes({} as never, 1)).toThrow(/rows must be/);
    expect(() => directLongitudes(Array.from({ length: 257 }, (_, index) => ({ name: `p${index}`, lon: index })), 1)).toThrow(/at most 256/);
    expect(() => directLongitudes([{ name: "Sun", lon: 1 }, { name: "Sun", lon: 2 }], 1)).toThrow(/unique/);
    expect(() => directLongitudes([{ name: "", lon: 1 }], 1)).toThrow(/nonempty name/);
    expect(() => directLongitudes([{ name: "Sun", lon: Number.POSITIVE_INFINITY }], 1)).toThrow(/finite lon/);
    expect(() => directLongitudes([null as never], 1)).toThrow(RangeError);
  });

  it("returns frozen results and normalizes directed longitudes", () => {
    const rows = directLongitudes([{ name: "a", lon: 350 }, { name: "b", lon: -10 }], 20);
    expect(rows.map((row) => [row.natal, row.directed, row.sign])).toEqual([[350, 10, "aries"], [350, 10, "aries"]]);
    expect(Object.isFrozen(rows) && Object.isFrozen(rows[0])).toBe(true);
    const result = solarArcDirections(REEVE.birth, REEVE.target);
    expect(Object.isFrozen(result) && Object.isFrozen(result.arc) && Object.isFrozen(result.positions) && Object.isFrozen(result.positions[0])).toBe(true);
  });
});
