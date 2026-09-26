import { describe, expect, it } from "vitest";

import { chartPoints, natalChart } from "./api.js";
import {
  LOTS,
  MEAN_LUNAR_INCLINATION,
  antiscion,
  contraAntiscion,
  hellenisticLots,
  lunarMeanArguments,
  meanApogee,
  meanNodeLongitude,
  midpoint,
  sectOf
} from "./points.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "./signs.js";

const DEG = Math.PI / 180;
/** Signed a − b in arcseconds, across the 0/360 seam. */
const arcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;

describe("the Moon's mean elements", () => {
  it("are the IERS 2003 fundamental arguments at J2000", () => {
    // IERS Conventions (2010) eq. 5.43: l, F and Ω at t = 0.
    const { l, F, node } = lunarMeanArguments(0);
    expect(l).toBeCloseTo(134.96340251, 8);
    expect(F).toBeCloseTo(93.27209062, 8);
    expect(node).toBeCloseTo(125.04455501, 8);
  });

  it("move the node back 19.34° a year and the perigee forward 40.69°", () => {
    const year = 1 / 100;
    const start = lunarMeanArguments(0);
    const end = lunarMeanArguments(year);
    expect(end.node - start.node).toBeCloseTo(-19.3413, 3);
    // The perigee's mean longitude is L − l = F + Ω − l.
    const perigee = (a: typeof start) => a.F + a.node - a.l;
    expect(perigee(end) - perigee(start)).toBeCloseTo(40.6901, 3);
  });

  it("puts the mean node on the ecliptic of date, nutation included", () => {
    expect(meanNodeLongitude(0, 0)).toBeCloseTo(125.04455501, 8);
    expect(arcsec(meanNodeLongitude(0.25, -15 / 3600), meanNodeLongitude(0.25, 0))).toBeCloseTo(-15, 6);
  });

  it("puts Black Moon Lilith on the mean orbit, opposite the perigee", () => {
    for (let t = -2; t <= 2; t += 0.037) {
      const { l, F, node } = lunarMeanArguments(t);
      const apogee = meanApogee(t, 0);
      // Its latitude is the orbit's at argument of latitude F − l + 180°.
      const u = (F - l + 180) * DEG;
      expect(apogee.lat).toBeCloseTo(Math.asin(Math.sin(MEAN_LUNAR_INCLINATION * DEG) * Math.sin(u)) / DEG, 10);
      expect(Math.abs(apogee.lat)).toBeLessThanOrEqual(MEAN_LUNAR_INCLINATION + 1e-12);
      // Along the orbit the apogee is 180° from the perigee, so the two
      // points are antipodal: equal and opposite latitude, longitudes 180° apart.
      const perigeeU = (F - l) * DEG;
      const i = MEAN_LUNAR_INCLINATION * DEG;
      const perigeeLon = node + Math.atan2(Math.cos(i) * Math.sin(perigeeU), Math.cos(perigeeU)) / DEG;
      expect(Math.abs(arcsec(apogee.lon, perigeeLon + 180))).toBeLessThan(1e-6);
      // On the orbit's line of nodes the reduction to the ecliptic vanishes.
      if (Math.abs(Math.sin(u)) < 1e-3) expect(Math.abs(arcsec(apogee.lon, node + (F - l + 180)))).toBeLessThan(2);
    }
  });
});

describe("sect and the lots", () => {
  it("counts the Sun above the horizon from the descendant through the midheaven to the ascendant", () => {
    expect(sectOf(100, 99.9)).toBe("day");
    expect(sectOf(100, 100.1)).toBe("night");
    expect(sectOf(100, 280)).toBe("day");
    expect(sectOf(100, 279.9)).toBe("night");
    expect(sectOf(100, 100)).toBe("night");
    expect(sectOf(350, 10)).toBe("night");
    expect(sectOf(10, 350)).toBe("day");
  });

  const inputs = {
    ascendant: 100,
    sun: 10,
    moon: 50,
    mercury: 20,
    venus: 300,
    mars: 200,
    jupiter: 130,
    saturn: 250
  };

  it("takes each lot from the ascendant by day, as Paulus gives it", () => {
    const lots = Object.fromEntries(hellenisticLots(inputs, "day").map((lot) => [lot.point, lot.lon]));
    const fortune = 100 + 50 - 10;
    const spirit = 100 + 10 - 50;
    expect(lots).toEqual({
      "Lot of Fortune": fortune,
      "Lot of Spirit": spirit,
      "Lot of Eros": normalizeLongitude(100 + 300 - spirit),
      "Lot of Necessity": normalizeLongitude(100 + fortune - 20),
      "Lot of Courage": normalizeLongitude(100 + fortune - 200),
      "Lot of Victory": normalizeLongitude(100 + 130 - spirit),
      "Lot of Nemesis": normalizeLongitude(100 + fortune - 250)
    });
  });

  it("reverses every lot's arc by night", () => {
    const lots = Object.fromEntries(hellenisticLots(inputs, "night").map((lot) => [lot.point, lot.lon]));
    const fortune = 100 + 10 - 50;
    const spirit = 100 + 50 - 10;
    expect(lots).toEqual({
      "Lot of Fortune": fortune,
      "Lot of Spirit": spirit,
      "Lot of Eros": normalizeLongitude(100 + spirit - 300),
      "Lot of Necessity": normalizeLongitude(100 + 20 - fortune),
      "Lot of Courage": normalizeLongitude(100 + 200 - fortune),
      "Lot of Victory": normalizeLongitude(100 + spirit - 130),
      "Lot of Nemesis": normalizeLongitude(100 + 250 - fortune)
    });
    expect(hellenisticLots(inputs, "night").map((lot) => lot.point)).toEqual([...LOTS]);
  });
});

describe("antiscia and midpoints", () => {
  it("mirrors a longitude across the solstices and the equinoxes", () => {
    expect(antiscion(40)).toBe(140);
    expect(antiscion(140)).toBe(40);
    expect(antiscion(90)).toBe(90);
    expect(antiscion(0)).toBe(180);
    expect(contraAntiscion(40)).toBe(320);
    expect(contraAntiscion(0)).toBe(0);
    for (let lon = 0; lon < 360; lon += 7.3) {
      expect(normalizeLongitude(contraAntiscion(lon) - antiscion(lon))).toBeCloseTo(180, 9);
      // An antiscion has the same declination on the ecliptic.
      expect(Math.sin(antiscion(lon) * DEG)).toBeCloseTo(Math.sin(lon * DEG), 12);
    }
  });

  it("takes the nearer midpoint across 0°, and 90° past the first for opposite points", () => {
    expect(midpoint(350, 10)).toBe(0);
    expect(midpoint(10, 350)).toBe(0);
    expect(midpoint(40, 100)).toBe(70);
    expect(midpoint(100, 40)).toBe(70);
    expect(midpoint(0, 180)).toBe(90);
    expect(midpoint(180, 0)).toBe(270);
  });
});

describe("chartPoints", () => {
  const birth = { utc: "1990-06-15T13:30:00Z", latitude: 51.5074, longitude: -0.1278, houseSystem: "placidus" } as const;

  it("returns the node, Lilith, the Vertex, the East Point and the lots with a time and place", () => {
    const chart = natalChart(birth);
    const { sect, points } = chartPoints(chart);
    expect(points.map((point) => point.point)).toEqual([
      "Mean Node",
      "Mean South Node",
      "Black Moon Lilith",
      "Vertex",
      "East Point",
      ...LOTS
    ]);
    // 13:30 UT in London in June: the Sun is up.
    expect(sect).toBe("day");
    for (const point of points) {
      expect(point.lon).toBeGreaterThanOrEqual(0);
      expect(point.lon).toBeLessThan(360);
      expect(point.sign).toBe(signForLongitude(point.lon).slug);
      expect(point.degree).toBeCloseTo(degreeInSign(point.lon), 12);
    }
    const byName = Object.fromEntries(points.map((point) => [point.point, point]));
    expect(arcsec(byName["Mean South Node"]!.lon, byName["Mean Node"]!.lon + 180)).toBeCloseTo(0, 6);
    // Mean motions: the node regresses about 0.053° a day; the apogee advances about 0.111°.
    expect(byName["Mean Node"]!.speed).toBeCloseTo(-0.053, 2);
    expect(byName["Black Moon Lilith"]!.speed).toBeGreaterThan(0.1);
    expect(byName["Black Moon Lilith"]!.speed).toBeLessThan(0.125);
    expect(byName["Vertex"]!.speed).toBeNull();
    // The day Lot of Fortune is the ascendant plus the Moon minus the Sun.
    const lon = (body: string) => chart.bodies.find((candidate) => candidate.body === body)!.lon;
    expect(byName["Lot of Fortune"]!.lon).toBeCloseTo(normalizeLongitude(chart.angles!.asc + lon("Moon") - lon("Sun")), 9);
  });

  it("gives the same points for the chart and for the birth it came from", () => {
    expect(chartPoints(birth)).toEqual(chartPoints(natalChart(birth)));
  });

  it("returns only the time-dependent points without a birth time or place", () => {
    for (const source of [
      { ...birth, timeKnown: false },
      { utc: birth.utc }
    ]) {
      const { sect, points } = chartPoints(source);
      expect(sect).toBeNull();
      expect(points.map((point) => point.point)).toEqual(["Mean Node", "Mean South Node", "Black Moon Lilith"]);
    }
  });

  it("uses the chart's own clock, a pinned ΔT included", () => {
    const modelled = natalChart(birth).deltaT.seconds;
    const model = chartPoints(birth);
    const pinned = chartPoints({ ...birth, deltaT: modelled + 3600 });
    const node = (result: typeof model) => result.points.find((point) => point.point === "Mean Node")!.lon;
    // An hour more of ΔT is an hour later in TT, and the node regresses
    // 0.0529539° a day: 7.94″ further back.
    expect(arcsec(node(pinned), node(model))).toBeCloseTo(-0.0529539 * (3600 / 86400) * 3600, 1);
  });

  it("computes the Vertex and East Point from the instant and place, not from a supplied chart's claims", () => {
    const chart = natalChart(birth);
    const claimed = { ...chart, angles: { ...chart.angles!, mc: normalizeLongitude(chart.angles!.mc + 1) } };
    const vertex = (result: ReturnType<typeof chartPoints>) =>
      result.points.find((point) => point.point === "Vertex")!.lon;
    expect(vertex(chartPoints(claimed))).toBe(vertex(chartPoints(chart)));
  });
});
