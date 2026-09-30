import {
  Body,
  MakeTime,
  Observer,
  SearchHourAngle,
  SearchRiseSet,
  SiderealTime
} from "astronomy-engine";
import { describe, expect, it } from "vitest";

import {
  computeAngles,
  elementBalance,
  findInterAspects,
  houseOf,
  meanObliquity,
  moonPhase,
  modalityBalance,
  natalChart,
  normalizeLongitude,
  placidusCusps,
  positions,
  saturnReturn,
  separation,
  signForLongitude,
  synastry,
  transits,
  wholeSignCusps
} from "./index.js";
import { prepareLocalTime, resolveBirth } from "./geo.js";
import type { BodyPosition } from "./types.js";

function longitudeOf(bodies: readonly BodyPosition[], name: string): number {
  const body = bodies.find((candidate) => candidate.body === name);
  if (!body) throw new Error(`Missing body: ${name}`);
  return body.lon;
}

function angleDifference(a: number, b: number): number {
  const difference = Math.abs(normalizeLongitude(a - b));
  return difference > 180 ? 360 - difference : difference;
}

import { HORIZONS_2020 } from "./fixtures/horizons-2020.js";

describe("positions", () => {
  const bodies = positions("2020-01-01T00:00:00Z");

  for (const [name, expected] of Object.entries(HORIZONS_2020)) {
    it(`${name} matches the public JPL Horizons vector`, () => {
      expect(angleDifference(longitudeOf(bodies, name), expected)).toBeLessThan(0.01);
    });
  }

  it("matches the historic JPL vector for 1908-02-11", () => {
    // A synthetic instant. JPL Horizons (DE441; Mars mar099), QUANTITIES='31',
    // CENTER='500@399', 1908-Feb-11 09:23 UT, fetched 2026-09-29 by
    // docs/evidence/rc15-20260929/horizons-1908.sh.
    const historic = positions("1908-02-11T09:23:00Z");
    expect(angleDifference(longitudeOf(historic, "Sun"), 321.2707941)).toBeLessThan(0.01);
    expect(angleDifference(longitudeOf(historic, "Moon"), 76.3230925)).toBeLessThan(0.01);
    expect(angleDifference(longitudeOf(historic, "Mars"), 21.8469781)).toBeLessThan(0.01);
  });

  it("annotates longitude with sign and degree", () => {
    const sun = bodies.find((body) => body.body === "Sun");
    expect(sun?.sign).toBe("capricorn");
    expect(sun?.degree).toBeCloseTo(10.009492, 4);
  });
});

describe("angles and houses", () => {
  function anglesAt(date: Date, latitude: number, longitude: number) {
    const obliquity = meanObliquity(
      (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (86_400_000 * 36_525)
    );
    return computeAngles({
      gastHours: SiderealTime(MakeTime(date)),
      latitude,
      longitude,
      obliquity
    });
  }

  it("places the Sun near the ascendant at sunrise", () => {
    const observer = new Observer(40.7128, -74.006, 10);
    const rise = SearchRiseSet(
      Body.Sun,
      observer,
      1,
      MakeTime(new Date("2024-06-01T00:00:00Z")),
      2
    );
    expect(rise).toBeTruthy();
    if (!rise) return;
    const angles = anglesAt(rise.date, 40.7128, -74.006);
    const sun = longitudeOf(positions(rise.date), "Sun");
    expect(angleDifference(angles.asc, sun)).toBeLessThan(2.5);
  });

  it("places the Sun at the midheaven near solar culmination", () => {
    const observer = new Observer(40.7128, -74.006, 10);
    const culmination = SearchHourAngle(
      Body.Sun,
      observer,
      0,
      MakeTime(new Date("2024-06-01T00:00:00Z")),
      1
    );
    const angles = anglesAt(culmination.time.date, 40.7128, -74.006);
    const sun = longitudeOf(positions(culmination.time.date), "Sun");
    expect(angleDifference(angles.mc, sun)).toBeLessThan(0.2);
  });

  it("builds ordered Placidus cusps anchored to ASC and MC", () => {
    const date = new Date("1990-02-01T18:45:00Z");
    const obliquity = meanObliquity(
      (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (86_400_000 * 36_525)
    );
    const input = {
      gastHours: SiderealTime(MakeTime(date)),
      latitude: 51.5074,
      longitude: -0.1278,
      obliquity
    };
    const angles = computeAngles(input);
    const cusps = placidusCusps(input, angles);
    expect(cusps).toHaveLength(12);
    if (!cusps) return;
    expect(angleDifference(cusps[0] ?? 0, angles.asc)).toBeLessThan(1e-9);
    expect(angleDifference(cusps[9] ?? 0, angles.mc)).toBeLessThan(1e-9);
    const total = cusps.reduce((sum, cusp, index) => {
      const next = cusps[(index + 1) % 12];
      return sum + normalizeLongitude((next ?? 0) - cusp);
    }, 0);
    expect(total).toBeCloseTo(360, 6);
  });

  it("supports whole-sign lookup and a polar fallback", () => {
    const cusps = wholeSignCusps(15);
    expect(cusps[0]).toBe(0);
    expect(houseOf(35, cusps)).toBe(2);

    const chart = natalChart({
      utc: "2001-12-21T09:30:00Z",
      latitude: 69.6492,
      longitude: 18.9553,
      houseSystem: "placidus"
    });
    expect(chart.houses?.system).toBe("whole");
    expect(chart.flags).toContain("polar-fallback");
  });
});

// A birth before 1970 reads the zone's shipped history, loaded first.
await prepareLocalTime("1908-02-11", "America/Mexico_City");

describe("public composition APIs", () => {
  // A synthetic birth before Mexico City's clock left local mean time (1922
  // in tzdb): resolveBirth reads 02:47 on the birthplace's own mean time,
  // 99.13° × 240 s = 6 h 36 min 31 s behind Greenwich, so 09:23:31 UT, 31 s
  // after the JPL vector above.
  const natal = natalChart(
    resolveBirth({
      date: "1908-02-11",
      time: "02:47",
      timeZone: "America/Mexico_City",
      latitude: 19.43,
      longitude: -99.13
    })
  );

  it("puts the Sun, Moon and ascendant of a local-mean-time birth in the signs independent sources give", () => {
    // Sun 321.27° and Moon 76.32° from JPL Horizons (above; the Moon moves
    // 0.004° in the 31 s). The ascendant from the textbook formula on the
    // IAU 1982 mean sidereal time and the IAU 1980 mean obliquity of date
    // (23.4512°), written out here rather than taken from the engine: 263.64°,
    // Sagittarius. With nutation (the engine's apparent frame) it is 263.633°.
    expect(natal.input.utc.toISOString()).toBe("1908-02-11T09:23:31.000Z");
    expect(signForLongitude(longitudeOf(natal.bodies, "Sun")).slug).toBe("aquarius");
    expect(signForLongitude(longitudeOf(natal.bodies, "Moon")).slug).toBe("gemini");
    const jd = Date.parse("1908-02-11T09:23:31Z") / 86_400_000 + 2_440_587.5;
    const t = (jd - 2_451_545) / 36_525;
    const ramc = normalizeLongitude(280.46061837 + 360.98564736629 * (jd - 2_451_545) + 0.000387933 * t * t - t ** 3 / 38_710_000 - 99.13);
    const obliquity = 23.4392911 - 0.0130041667 * t - 1.639e-7 * t * t + 5.036e-7 * t ** 3;
    const [r, e, phi] = [(ramc * Math.PI) / 180, (obliquity * Math.PI) / 180, (19.43 * Math.PI) / 180];
    const ascendant = normalizeLongitude((Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(phi) * Math.sin(e))) * 180) / Math.PI);
    expect(ascendant).toBeCloseTo(263.637, 2);
    expect(angleDifference(natal.angles!.asc, ascendant)).toBeLessThan(0.05);
    expect(signForLongitude(natal.angles!.asc).slug).toBe("sagittarius");
    expect(natal.flags).toContain("lmt");
  });

  it("computes transit and synastry summaries", () => {
    const other = natalChart({
      utc: "1990-02-01T12:00:00Z",
      timeKnown: false
    });
    const current = transits(natal, "2026-07-15T00:00:00Z");
    expect(current.positions).toHaveLength(12);
    expect(current.aspects.length).toBeGreaterThan(0);

    const pair = synastry(natal, other);
    expect(pair.aspects.length).toBeGreaterThan(0);
    expect(pair.top).toEqual(pair.aspects.slice(0, pair.top.length));
  });

  it("returns a bounded, named moon phase", () => {
    const phase = moonPhase("2024-04-08T18:21:00Z");
    expect(phase.name).toBe("New Moon");
    expect(phase.illumination).toBeLessThan(0.001);
    expect(phase.angle).toBeGreaterThanOrEqual(0);
    expect(phase.angle).toBeLessThan(360);
  });

  it("finds the known 1990 Saturn return triple pass", () => {
    const result = saturnReturn("1990-02-01T12:00:00Z");
    const first = result.seasons[0];
    expect(first?.crossings.map((crossing) => crossing.at.toISOString().slice(0, 10))).toEqual([
      "2019-03-21",
      "2019-06-09",
      "2019-12-13"
    ]);
    expect(first?.crossings.map((crossing) => crossing.retrograde)).toEqual([false, true, false]);
  }, 120_000);
});

describe("aspect and balance vocabulary", () => {
  const fixture = [
    { body: "Sun", lon: 10 },
    { body: "Moon", lon: 40 },
    { body: "Mercury", lon: 20 },
    { body: "Venus", lon: 55 },
    { body: "Mars", lon: 100 },
    { body: "Jupiter", lon: 130 },
    { body: "Saturn", lon: 190 },
    { body: "Uranus", lon: 220 },
    { body: "Neptune", lon: 280 },
    { body: "Pluto", lon: 310 }
  ];

  it("detects exact inter-chart aspects without intra-chart pairs", () => {
    const aspects = findInterAspects([{ body: "Sun", lon: 0 }], [{ body: "Moon", lon: 90 }]);
    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toMatchObject({ a: "Sun", b: "Moon", type: "square", orb: 0 });
  });

  it("counts the ten aspect bodies by element and modality", () => {
    expect(elementBalance(fixture)).toEqual({ fire: 3, earth: 3, air: 2, water: 2 });
    const modalities = modalityBalance(fixture);
    expect(modalities.cardinal + modalities.fixed + modalities.mutable).toBe(10);
  });

  it("uses symmetric wrapped angular separation", () => {
    expect(separation(350, 10)).toBe(20);
    expect(separation(10, 350)).toBe(20);
  });
});

describe("mathematical invariants", () => {
  it("keeps the true node close to the independently computed mean node", () => {
    for (const iso of ["2005-03-15T00:00:00Z", "2020-01-01T00:00:00Z", "2026-07-01T00:00:00Z"]) {
      const date = new Date(iso);
      const node = positions(date).find((body) => body.body === "North Node");
      expect(node).toBeTruthy();
      if (!node) continue;
      const days = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
      const meanNode = normalizeLongitude(125.04452 - 0.05295377 * days);
      expect(angleDifference(node.lon, meanNode)).toBeLessThan(2);
      expect(Math.abs(node.speed)).toBeLessThan(0.3);
    }
  });
});
