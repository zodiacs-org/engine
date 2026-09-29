import { describe, expect, it } from "vitest";
import { natalChart } from "../api.js";
import { compositeAspects, compositeChart, compositeMidpoints, davisonChart, davisonPlace } from "./relationship.js";

// Invented births: instants and places drawn for these tests, no one's birth.
const FIRST = { utc: "1984-03-02T09:30:00Z", latitude: 10, longitude: 20, houseSystem: "placidus" as const };
const SECOND = { utc: "1984-03-04T09:30:00Z", latitude: 30, longitude: 40, houseSystem: "placidus" as const };

describe("composite midpoints (the site's cases)", () => {
  it("uses the shorter arc and keeps the first list's order for shared bodies", () => {
    const points = compositeMidpoints(
      [{ body: "Sun", lon: 359 }, { body: "Moon", lon: 10 }, { body: "Mars", lon: 40 }, { body: "Mercury", lon: 80 }],
      [{ body: "Mercury", lon: 100 }, { body: "Sun", lon: 1 }, { body: "Moon", lon: 50 }, { body: "Venus", lon: 30 }]
    );
    expect(points).toEqual([{ body: "Sun", lon: 0 }, { body: "Moon", lon: 30 }, { body: "Mercury", lon: 90 }]);
  });

  it("takes the midpoint 90° east of the first chart's for exact opposites", () => {
    expect(compositeMidpoints([{ body: "Sun", lon: 0 }], [{ body: "Sun", lon: 180 }])).toEqual([{ body: "Sun", lon: 90 }]);
    expect(compositeMidpoints([{ body: "Sun", lon: 180 }], [{ body: "Sun", lon: 0 }])).toEqual([{ body: "Sun", lon: 270 }]);
  });

  it("gives aspects with the natal orbs and no motion", () => {
    const aspects = compositeAspects([
      { body: "Sun", lon: 0 },
      { body: "Mars", lon: 120 },
      { body: "Mercury", lon: 20 },
      { body: "Venus", lon: 110 }
    ]);
    expect(aspects).toEqual([
      { a: "Sun", b: "Mars", type: "trine", orb: 0 },
      { a: "Mercury", b: "Venus", type: "square", orb: 0 }
    ]);
    for (const aspect of aspects) expect(aspect).not.toHaveProperty("applying");
  });

  it("refuses unknown bodies, repeated bodies and non-finite longitudes", () => {
    expect(() => compositeMidpoints([{ body: "Chiron" as never, lon: 1 }], [])).toThrow(RangeError);
    expect(() => compositeMidpoints([{ body: "Sun", lon: 1 }, { body: "Sun", lon: 2 }], [])).toThrow(RangeError);
    expect(() => compositeMidpoints([{ body: "Sun", lon: Number.NaN }], [])).toThrow(RangeError);
  });
});

describe("composite charts", () => {
  it("is the midpoint of each body of two charts, with no angles", () => {
    const a = natalChart(FIRST);
    const b = natalChart(SECOND);
    const composite = compositeChart(FIRST, SECOND);
    expect(composite.bodies.map((row) => row.body)).toEqual(a.bodies.map((row) => row.body));
    composite.bodies.forEach((row, index) => {
      const x = a.bodies[index]!.lon;
      const y = b.bodies[index]!.lon;
      // Equidistant from both, on the shorter arc.
      const d = (p: number, q: number) => Math.abs(((p - q + 540) % 360) - 180);
      expect(Math.abs(d(row.lon, x) - d(row.lon, y))).toBeLessThan(1e-9);
      expect(d(row.lon, x) + d(row.lon, y)).toBeCloseTo(d(x, y), 9);
    });
    expect(composite).not.toHaveProperty("angles");
  });
});

// Davison: the chart for the midpoint in time and the midpoint in space of
// the two births (Ronald C. Davison, Synastry, 1977).
describe("Davison charts", () => {
  it("is cast for the mean instant and the mean place", () => {
    const davison = davisonChart(FIRST, SECOND);
    expect(davison.instant.toISOString()).toBe("1984-03-03T09:30:00.000Z");
    expect(davison.location).toEqual({ latitude: 20, longitude: 30 });
    expect(davison.place).toBe("coordinates");
    expect(davison.chart).toEqual(
      natalChart({ utc: "1984-03-03T09:30:00Z", latitude: 20, longitude: 30, houseSystem: "placidus", timeKnown: true })
    );
    expect(davison.flags).toEqual([]);
  });

  it("rounds an odd millisecond down", () => {
    const davison = davisonChart({ utc: 1 }, { utc: 4 });
    expect(davison.instant.getTime()).toBe(2);
    expect(davisonChart({ utc: -3 }, { utc: 0 }).instant.getTime()).toBe(-2);
  });

  it("has no angles unless both births have a place, and no known time unless both do", () => {
    expect(davisonChart(FIRST, { utc: SECOND.utc }).chart.angles).toBeNull();
    expect(davisonChart(FIRST, { utc: SECOND.utc }).location).toBeNull();
    const untimed = davisonChart(FIRST, { ...SECOND, timeKnown: false });
    expect(untimed.chart.input.timeKnown).toBe(false);
    expect(untimed.chart.angles).toBeNull();
  });

  it("takes the midpoint of longitude on the shorter arc, across the antimeridian", () => {
    expect(davisonPlace({ latitude: 0, longitude: 170 }, { latitude: 10, longitude: -170 })).toEqual({ latitude: 5, longitude: 180 });
    expect(davisonPlace({ latitude: 0, longitude: -10 }, { latitude: 0, longitude: 30 })).toEqual({ latitude: 0, longitude: 10 });
    // Longitudes exactly opposite: 90° east of the first.
    expect(davisonPlace({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toEqual({ latitude: 0, longitude: 90 });
  });

  it("offers the great-circle midpoint, checked against a second formula", () => {
    // A second formula, from the spherical triangle rather than from vectors.
    const RAD = Math.PI / 180;
    const williams = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
      const [p1, p2, dl] = [a.latitude * RAD, b.latitude * RAD, (b.longitude - a.longitude) * RAD];
      const bx = Math.cos(p2) * Math.cos(dl);
      const by = Math.cos(p2) * Math.sin(dl);
      const lat = Math.atan2(Math.sin(p1) + Math.sin(p2), Math.hypot(Math.cos(p1) + bx, by));
      const lon = a.longitude * RAD + Math.atan2(by, Math.cos(p1) + bx);
      return { latitude: lat / RAD, longitude: ((((lon / RAD + 180) % 360) + 360) % 360) - 180 };
    };
    let seed = 7;
    const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let index = 0; index < 500; index += 1) {
      const a = { latitude: next() * 170 - 85, longitude: next() * 360 - 180 };
      const b = { latitude: next() * 170 - 85, longitude: next() * 360 - 180 };
      const ours = davisonPlace(a, b, "great-circle");
      const theirs = williams(a, b);
      expect(Math.abs(ours.latitude - theirs.latitude)).toBeLessThan(1e-9);
      expect(Math.abs(((ours.longitude - theirs.longitude + 540) % 360) - 180)).toBeLessThan(1e-9);
    }
    expect(davisonPlace({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 90 }, "great-circle")).toEqual({ latitude: 0, longitude: 45 });
    expect(() => davisonPlace({ latitude: 45, longitude: 0 }, { latitude: -45, longitude: 180 }, "great-circle")).toThrow(RangeError);
    expect(davisonChart(FIRST, SECOND, { place: "great-circle" }).location).toEqual(davisonPlace(FIRST, SECOND, "great-circle"));
  });

  it("refuses unknown options", () => {
    expect(() => davisonChart(FIRST, SECOND, { place: "arithmetic" as never })).toThrow(RangeError);
    expect(() => davisonChart(FIRST, SECOND, { orb: 1 } as never)).toThrow(RangeError);
  });
});
