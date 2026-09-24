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
import { resolveBirth } from "./geo.js";
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

/**
 * JPL Horizons QUANTITIES='31', CENTER='500@399': apparent geocentric,
 * true-of-date ecliptic longitudes. Reference values fetched 2026-07-05.
 */
const HORIZONS_2020: Record<string, number> = {
  Sun: 280.009492,
  Moon: 346.1383767,
  Mercury: 274.3833145,
  Venus: 314.4094923,
  Mars: 238.3846079,
  Jupiter: 276.6703386,
  Saturn: 291.3949664,
  Uranus: 32.6940395,
  Neptune: 346.2645218,
  Pluto: 292.3855818
};

describe("positions", () => {
  const bodies = positions("2020-01-01T00:00:00Z");

  for (const [name, expected] of Object.entries(HORIZONS_2020)) {
    it(`${name} matches the public JPL Horizons vector`, () => {
      expect(angleDifference(longitudeOf(bodies, name), expected)).toBeLessThan(0.01);
    });
  }

  it("matches the historic JPL vector for 1907-07-06", () => {
    const historic = positions("1907-07-06T15:07:00Z");
    expect(angleDifference(longitudeOf(historic, "Sun"), 103.3759585)).toBeLessThan(0.01);
    expect(angleDifference(longitudeOf(historic, "Moon"), 59.714797)).toBeLessThan(0.01);
    expect(angleDifference(longitudeOf(historic, "Mars"), 283.394441)).toBeLessThan(0.01);
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

describe("public composition APIs", () => {
  const frida = natalChart(
    resolveBirth({
      date: "1907-07-06",
      time: "08:30",
      timeZone: "America/Mexico_City",
      latitude: 19.35,
      longitude: -99.16
    })
  );

  it("reproduces the documented Frida Kahlo big three", () => {
    expect(signForLongitude(longitudeOf(frida.bodies, "Sun")).slug).toBe("cancer");
    expect(signForLongitude(longitudeOf(frida.bodies, "Moon")).slug).toBe("taurus");
    expect(signForLongitude(frida.angles?.asc ?? 0).slug).toBe("leo");
    expect(frida.flags).toContain("lmt");
  });

  it("computes transit and synastry summaries", () => {
    const other = natalChart({
      utc: "1990-02-01T12:00:00Z",
      timeKnown: false
    });
    const current = transits(frida, "2026-07-15T00:00:00Z");
    expect(current.positions).toHaveLength(12);
    expect(current.aspects.length).toBeGreaterThan(0);

    const pair = synastry(frida, other);
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
