/**
 * Check L7 of docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md:
 * sect fixtures not taken from the engine's own output.
 *
 * The first eleven cases are the Zodiacs.org site's (src/lib/sect.test.ts at
 * site main 9a67f761: three of orientality, eight of sect), ported unchanged
 * but for one comment's dash, written here as a comma; the site's
 * `sectOf(input)` is read as its adapter will call the package,
 * `sectReading({ convention: "altitude", ...input })`. The rest come from the
 * definitions: an altitude of 0 or -0 is day; under the ecliptic convention a
 * Sun exactly on the ascendant is night and one on the descendant day
 * (src/points.ts, `sectOf`); Mercury on the Sun is occidental and opposite it
 * oriental; longitudes outside [0, 360) read as their place on the circle;
 * and the two charts at 78.2° N of docs/timing-hellenistic.md, *Flags*,
 * where the two conventions disagree. Their Sun is 11.0° below and 12.1°
 * above the horizon, more than a thousand times the README's largest
 * declination error, so the sign needs no arbiter.
 *
 * Controls, which these cases must fail: an altitude test written `> 0`
 * fails the site's horizon case and the 0 and -0 case, and orientality's
 * test written `>= 0` fails the site's case of a body on the Sun and the
 * Mercury case.
 */
import { describe, expect, it } from "vitest";
import { chartDeclinations, chartPoints, natalChart } from "./index.js";
import type { Chart } from "./index.js";
import { sectOf as eclipticSectOf } from "./points.js";
import { DIURNAL_PLANETS, NOCTURNAL_PLANETS, SECT_CONVENTIONS, orientality, sectReading } from "./sect.js";
import type { AltitudeSectInput, SectReading } from "./sect.js";

/** The site's `sectOf`, as its adapter reads it: the altitude convention. */
const sectOf = (input: Omit<AltitudeSectInput, "convention">): SectReading => sectReading({ convention: "altitude", ...input });

describe('orientality', () => {
  it('calls a body earlier in zodiacal order a morning star', () => {
    // Lower longitude reaches the ascendant first, so it rises ahead of
    // the Sun, oriental, in the tradition's word.
    expect(orientality(100, 120)).toBe('oriental');
    expect(orientality(140, 120)).toBe('occidental');
  });

  it('measures the short way round the circle', () => {
    expect(orientality(350, 10)).toBe('oriental');
    expect(orientality(10, 350)).toBe('occidental');
  });

  it('counts a body exactly on the Sun as occidental', () => {
    expect(orientality(120, 120)).toBe('occidental');
  });
});

describe('sect', () => {
  it('reads the Sun above the horizon as a day chart', () => {
    const reading = sectOf({ sunAltitude: 64.2, sunLon: 103.59 });
    expect(reading.sect).toBe('day');
    expect(reading.light).toBe('Sun');
    expect(reading.inSect).toEqual(expect.arrayContaining([...DIURNAL_PLANETS]));
    expect(reading.outOfSect).toEqual(expect.arrayContaining([...NOCTURNAL_PLANETS]));
  });

  it('reads the Sun below the horizon as a night chart', () => {
    const reading = sectOf({ sunAltitude: -21.7, sunLon: 300 });
    expect(reading.sect).toBe('night');
    expect(reading.light).toBe('Moon');
    expect(reading.inSect).toEqual(expect.arrayContaining([...NOCTURNAL_PLANETS]));
    expect(reading.outOfSect).toEqual(expect.arrayContaining([...DIURNAL_PLANETS]));
  });

  it('gives the Sun on the horizon itself to the day', () => {
    expect(sectOf({ sunAltitude: 0, sunLon: 0 }).sect).toBe('day');
  });

  it('puts a morning Mercury with the day and an evening one with the night', () => {
    const morning = sectOf({ sunAltitude: 30, sunLon: 125.44, mercuryLon: 107.33 });
    expect(morning.mercury).toBe('oriental');
    expect(morning.inSect).toContain('Mercury');
    expect(morning.outOfSect).not.toContain('Mercury');

    const evening = sectOf({ sunAltitude: 30, sunLon: 103.59, mercuryLon: 126.42 });
    expect(evening.mercury).toBe('occidental');
    expect(evening.outOfSect).toContain('Mercury');
    expect(evening.inSect).not.toContain('Mercury');
  });

  it('flips Mercury’s side with the chart’s, not with its own', () => {
    // A morning Mercury belongs to the day; in a night chart that same
    // Mercury is out of sect.
    const night = sectOf({ sunAltitude: -12, sunLon: 125.44, mercuryLon: 107.33 });
    expect(night.mercury).toBe('oriental');
    expect(night.outOfSect).toContain('Mercury');
  });

  it('leaves Mercury off both lists when its longitude is unknown', () => {
    const reading = sectOf({ sunAltitude: 10, sunLon: 0 });
    expect(reading.mercury).toBeNull();
    expect([...reading.inSect, ...reading.outOfSect]).not.toContain('Mercury');
  });

  it('claims nothing about the modern planets', () => {
    const reading = sectOf({ sunAltitude: 10, sunLon: 0, mercuryLon: 5 });
    const listed = [...reading.inSect, ...reading.outOfSect];
    for (const body of ['Uranus', 'Neptune', 'Pluto']) {
      expect(listed, body).not.toContain(body);
    }
    expect(listed).toHaveLength(7);
    expect(new Set(listed).size).toBe(7);
  });

  it('carries the altitude it was handed, so the readout can quote it', () => {
    expect(sectOf({ sunAltitude: 64.23, sunLon: 0 }).sunAltitude).toBeCloseTo(64.23, 5);
  });
});

const DEG = Math.PI / 180;

/**
 * The Sun's geometric altitude in degrees, from its right ascension and
 * declination (its ecliptic latitude included) and the sidereal time read
 * from the East Point, whose right ascension is the sidereal time plus 90°;
 * as src/timing/shared.test.ts takes it, apart from the sect's own geometry.
 */
function sunAltitude(chart: Chart): number {
  const { trueObliquity, rows } = chartDeclinations(chart);
  const sun = rows.find((row) => row.body === "Sun")!;
  const east = chartPoints(chart).points.find((point) => point.point === "East Point")!.lon * DEG;
  const e = trueObliquity * DEG;
  const siderealTime = Math.atan2(Math.sin(east) * Math.cos(e), Math.cos(east)) / DEG - 90;
  const phi = chart.input.latitude! * DEG;
  return Math.asin(
    Math.sin(phi) * Math.sin(sun.dec * DEG) + Math.cos(phi) * Math.cos(sun.dec * DEG) * Math.cos((siderealTime - sun.ra!) * DEG)
  ) / DEG;
}

describe("sectReading at its boundaries", () => {
  it("gives an altitude of 0 and of -0 to the day, and hands each back unchanged", () => {
    for (const altitude of [0, -0]) {
      const reading = sectReading({ convention: "altitude", sunAltitude: altitude, sunLon: 0 });
      expect(reading.sect).toBe("day");
      expect(reading.light).toBe("Sun");
      expect(Object.is(reading.sunAltitude, altitude)).toBe(true);
    }
    for (const [altitude, sect] of [[Number.MIN_VALUE, "day"], [-Number.MIN_VALUE, "night"], [1e-12, "day"], [-1e-12, "night"], [90, "day"], [-90, "night"]] as const) {
      expect(sectReading({ convention: "altitude", sunAltitude: altitude, sunLon: 0 }).sect, String(altitude)).toBe(sect);
    }
  });

  it("under the ecliptic convention, counts a Sun exactly on the ascendant to the night and on the descendant to the day", () => {
    for (const ascendant of [0, 17.5, 123.25, 359.75]) {
      const descendant = (ascendant + 180) % 360;
      expect(sectReading({ convention: "ecliptic", ascendant, sunLon: ascendant }).sect).toBe("night");
      expect(sectReading({ convention: "ecliptic", ascendant, sunLon: descendant }).sect).toBe("day");
      expect(eclipticSectOf(ascendant, ascendant)).toBe("night");
      expect(eclipticSectOf(ascendant, descendant)).toBe("day");
    }
  });

  it("under the ecliptic convention, gives the root's sectOf", () => {
    for (let ascendant = 0; ascendant < 360; ascendant += 7.5) {
      for (let sun = -720; sun <= 720; sun += 7.5) {
        const reading = sectReading({ convention: "ecliptic", ascendant, sunLon: sun });
        expect(reading.sect).toBe(eclipticSectOf(ascendant, sun));
        expect(reading.sunAltitude).toBeNull();
        expect(reading.convention).toBe("ecliptic");
      }
    }
  });

  it("calls Mercury on the Sun occidental and Mercury opposite it oriental", () => {
    for (const sun of [0, 45, 180, 300.5]) {
      expect(orientality(sun, sun)).toBe("occidental");
      expect(orientality((sun + 180) % 360, sun)).toBe("oriental");
      const onTheSun = sectReading({ convention: "altitude", sunAltitude: 5, sunLon: sun, mercuryLon: sun });
      expect([onTheSun.mercury, onTheSun.inSect, onTheSun.outOfSect]).toEqual(["occidental", ["Sun", "Jupiter", "Saturn"], ["Moon", "Venus", "Mars", "Mercury"]]);
      const opposite = sectReading({ convention: "altitude", sunAltitude: -5, sunLon: sun, mercuryLon: sun + 180 });
      expect([opposite.mercury, opposite.inSect, opposite.outOfSect]).toEqual(["oriental", ["Moon", "Venus", "Mars"], ["Sun", "Jupiter", "Saturn", "Mercury"]]);
    }
  });

  it("reads longitudes outside [0, 360) as their place on the circle", () => {
    for (const [body, sun] of [[-10, 350], [370, 10], [720, 0], [-10, 370], [720, 10], [370, -10]] as const) {
      const near = (value: number) => ((value % 360) + 360) % 360;
      expect(orientality(body, sun), `${body} ${sun}`).toBe(orientality(near(body), near(sun)));
      for (const ascendant of [-10, 370, 720]) {
        expect(sectReading({ convention: "ecliptic", ascendant, sunLon: sun }).sect).toBe(
          sectReading({ convention: "ecliptic", ascendant: near(ascendant), sunLon: near(sun) }).sect
        );
      }
    }
    expect(orientality(-10, 350)).toBe("occidental");
    expect(orientality(720, 10)).toBe("oriental");
    expect(orientality(370, 0)).toBe("occidental");
    expect(sectReading({ convention: "ecliptic", ascendant: -10, sunLon: 370 }).sect).toBe("night");
    expect(sectReading({ convention: "ecliptic", ascendant: 720, sunLon: -10 }).sect).toBe("day");
  });

  it("reads the two charts at 78.2° N of docs/timing-hellenistic.md: each convention gives the other's sect", () => {
    const polarNight = { utc: "1810-01-07T11:57:42.814Z", latitude: 78.2, longitude: 17.8405 } as const;
    const midnightSun = { utc: "2100-06-26T00:24:28.491Z", latitude: 78.2, longitude: -22.924 } as const;
    for (const [birth, tenths, ecliptic, altitudeSect] of [[polarNight, -110, "day", "night"], [midnightSun, 121, "night", "day"]] as const) {
      const chart = natalChart(birth);
      const sun = chart.bodies.find((body) => body.body === "Sun")!;
      const altitude = sunAltitude(chart);
      expect(Math.round(altitude * 10), birth.utc).toBe(tenths);
      expect(sectReading({ convention: "ecliptic", ascendant: chart.angles!.asc, sunLon: sun.lon }).sect).toBe(ecliptic);
      expect(sectReading({ convention: "altitude", sunAltitude: altitude, sunLon: sun.lon }).sect).toBe(altitudeSect);
    }
  });
});

describe("sectReading's results and refusals", () => {
  it("gives frozen readings, with the lists in order and Mercury last", () => {
    const day = sectReading({ convention: "ecliptic", ascendant: 0, sunLon: 200, mercuryLon: 190 });
    expect(day).toEqual({
      convention: "ecliptic", sect: "day", sunAltitude: null, light: "Sun", mercury: "oriental",
      inSect: ["Sun", "Jupiter", "Saturn", "Mercury"], outOfSect: ["Moon", "Venus", "Mars"]
    });
    const night = sectReading({ convention: "altitude", sunAltitude: -3, sunLon: 10, mercuryLon: 20 });
    expect(night).toEqual({
      convention: "altitude", sect: "night", sunAltitude: -3, light: "Moon", mercury: "occidental",
      inSect: ["Moon", "Venus", "Mars", "Mercury"], outOfSect: ["Sun", "Jupiter", "Saturn"]
    });
    for (const reading of [day, night]) {
      expect(Object.isFrozen(reading) && Object.isFrozen(reading.inSect) && Object.isFrozen(reading.outOfSect)).toBe(true);
    }
    for (const mercuryLon of [null, undefined]) {
      expect(sectReading({ convention: "altitude", sunAltitude: 1, sunLon: 0, mercuryLon }).mercury).toBeNull();
    }
    expect(SECT_CONVENTIONS).toEqual(["altitude", "ecliptic"]);
    expect(DIURNAL_PLANETS).toEqual(["Sun", "Jupiter", "Saturn"]);
    expect(NOCTURNAL_PLANETS).toEqual(["Moon", "Venus", "Mars"]);
    for (const table of [SECT_CONVENTIONS, DIURNAL_PLANETS, NOCTURNAL_PLANETS]) expect(Object.isFrozen(table)).toBe(true);
  });

  it("refuses with RangeError what it cannot read, and names no default convention", () => {
    const withGetter = Object.defineProperty({ convention: "altitude", sunLon: 0 }, "sunAltitude", { get: () => 1, enumerable: true });
    const inherited = Object.assign(Object.create({ convention: "altitude" }) as object, { sunAltitude: 1, sunLon: 0 });
    const refused: unknown[] = [
      undefined, null, 1, "altitude", [], new Date(0), withGetter, inherited,
      {}, { sunAltitude: 1, sunLon: 0 }, { convention: undefined, sunAltitude: 1, sunLon: 0 }, { convention: "horizon", sunAltitude: 1, sunLon: 0 },
      { convention: "Altitude", sunAltitude: 1, sunLon: 0 }, { convention: "altitude", sunAltitude: 1 }, { convention: "altitude", sunLon: 0 },
      { convention: "altitude", sunAltitude: Number.NaN, sunLon: 0 }, { convention: "altitude", sunAltitude: Number.POSITIVE_INFINITY, sunLon: 0 },
      { convention: "altitude", sunAltitude: 90.000001, sunLon: 0 }, { convention: "altitude", sunAltitude: -90.000001, sunLon: 0 },
      { convention: "altitude", sunAltitude: "1", sunLon: 0 }, { convention: "altitude", sunAltitude: 1, sunLon: Number.NaN },
      { convention: "altitude", sunAltitude: 1, sunLon: Number.NEGATIVE_INFINITY }, { convention: "altitude", sunAltitude: 1, sunLon: "10" },
      { convention: "altitude", sunAltitude: 1, sunLon: 0, mercuryLon: Number.NaN }, { convention: "altitude", sunAltitude: 1, sunLon: 0, mercuryLon: "5" },
      { convention: "altitude", sunAltitude: 1, sunLon: 0, ascendant: 0 }, { convention: "altitude", sunAltitude: 1, sunLon: 0, mercury: 5 },
      { convention: "ecliptic", ascendant: 0, sunLon: 0, sunAltitude: 1 }, { convention: "ecliptic", sunLon: 0 },
      { convention: "ecliptic", ascendant: Number.NaN, sunLon: 0 }, { convention: "ecliptic", ascendant: 0, sunLon: Number.POSITIVE_INFINITY }
    ];
    for (const input of refused) expect(() => sectReading(input as never), String(JSON.stringify(input))).toThrow(RangeError);
    for (const [body, sun] of [[Number.NaN, 0], [0, Number.NaN], [Number.POSITIVE_INFINITY, 0], [0, "0"]] as const) {
      expect(() => orientality(body as number, sun as number)).toThrow(RangeError);
    }
  });
});
