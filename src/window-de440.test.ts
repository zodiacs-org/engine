/**
 * Birth-time windows on the package's default source, the shipped DE440
 * pack: each partition is held to natalChart itself, on the same source, as
 * src/window.test.ts holds one on astronomy-engine. Every cell must hold
 * natalChart's features at every whole second, and every switch must be the
 * millisecond at which they change.
 *
 * The pack's positions step, within its fitting budget, where a read passes
 * from one Chebyshev record to the next; the search treats each such instant
 * as a seam (src/window.ts, `sourceSteps`). The cases here include windows
 * that hold such steps, compared with natalChart at every millisecond around
 * each. Inputs are synthetic places and instants.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DE440_PACK, shippedDe440Source } from "./de440-pack.js";
import { bodyLongitude, setDefaultEphemeris } from "./ephemeris.js";
import { timeBasis } from "./time-scale.js";
import { WINDOW_RATE_BOUNDS, birthWindow } from "./window.js";
import { cellAt, cellFeatures, chartFeatures, expectExact, partition } from "./window.testkit.js";
import type { Place } from "./window.testkit.js";

const DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DE440 = { name: "jpl-de440", version: DE440_PACK.sha256 };

// The suite's setup puts every file on astronomy-engine; this one tests the package's default.
beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("birthWindow on the shipped DE440 pack, against natalChart on it", () => {
  const cases: [string, number, number, Place][] = [
    ["mid-latitude Placidus", Date.UTC(1990, 5, 15, 12, 20, 0, 250), 600_000, { latitude: 51.5, longitude: -0.12, houseSystem: "placidus" }],
    ["Koch just inside the polar circle", Date.UTC(2044, 11, 21, 3, 0, 0), 600_000, { latitude: 66.4, longitude: 18.9, houseSystem: "koch" }],
    ["Regiomontanus in the south polar region", Date.UTC(1911, 1, 2, 7, 30, 11), 600_000, { latitude: -67.5, longitude: 140, houseSystem: "regiomontanus" }],
    ["Porphyry at 78°", Date.UTC(1850, 3, 3, 8, 0, 0), 600_000, { latitude: 78.2, longitude: 15.6, houseSystem: "porphyry" }],
    ["Morinus", Date.UTC(1820, 6, 4, 16, 0, 0), 300_000, { latitude: 35, longitude: -90, houseSystem: "morinus" }],
    ["whole signs near the end of the span", Date.UTC(2199, 10, 30, 22, 0, 0), 600_000, { latitude: -33.9, longitude: 151.2, houseSystem: "whole" }]
  ];
  for (const [label, start, milliseconds, place] of cases) {
    it(`${label}: every cell and switch, and the pack named`, () => {
      const window = partition(start, milliseconds, place);
      expect(window.ephemeris).toEqual(DE440);
      expect(window.flags).not.toContain("de440-unavailable");
      expectExact(window, place);
    }, 120_000);
  }

  it("a whole day in three systems, at five-minute samples and every switch", () => {
    const start = Date.UTC(2031, 6, 9, 5, 17, 23, 441);
    for (const houseSystem of ["whole", "placidus", "equal"] as const) {
      const place = { latitude: 48.85, longitude: 2.35, houseSystem };
      const window = partition(start, DAY, place);
      expect(window.switches.length).toBeGreaterThan(20);
      expectExact(window, place, 300_000);
    }
  }, 300_000);

  it("gives the same switches as natalChart's Moon ingress on the pack, not astronomy-engine's", () => {
    // The two ephemerides put the Moon up to 12″ apart (src/calc-bounds.ts), about 20 s of its motion: a window on
    // the pack must not report astronomy-engine's ingress.
    const place: Place = { latitude: 10, longitude: 20, houseSystem: "whole" };
    const start = Date.UTC(1851, 2, 3);
    const onPack = partition(start, 2 * DAY, place);
    setDefaultEphemeris("astronomy-engine");
    const onFallback = partition(start, 2 * DAY, place);
    setDefaultEphemeris("de440");
    const moonIngress = (window: typeof onPack) =>
      window.switches.find((entry) => entry.changes.some((change) => change.feature === "sign" && change.body === "Moon"))!.at.getTime();
    expect(onFallback.ephemeris.name).toBe("astronomy-engine");
    expect(moonIngress(onPack)).not.toBe(moonIngress(onFallback));
    expectExact(onPack, place, 600_000);
  }, 120_000);
});

describe("the pack's record boundaries inside a window", () => {
  const tt = (ms: number): number => timeBasis(ms, "utc").ttDays;
  /** The UTC millisecond nearest a TT instant, days from J2000.0, near `guess`. */
  const utcOf = (ttDays: number, guess: number): number => Math.round(guess + (ttDays - tt(guess)) * DAY);

  it("are reported by the source in every month sampled, a few at a time", () => {
    const source = shippedDe440Source();
    for (const year of [1805, 1900, 1990, 2031, 2195]) {
      const from = (Date.UTC(year, 0, 1) - J2000_MS) / DAY;
      const steps = source.steps(from, from + 31);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThan(200);
      expect([...steps].sort((a, b) => a - b)).toEqual(steps);
      for (const step of steps) expect(step >= from && step <= from + 31).toBe(true);
    }
    expect(source.steps(0, -1)).toEqual([]);
  });

  it.each([1805, 1990, 2031, 2195])("leave a window of %i that holds them equal to natalChart at every millisecond around each", (year) => {
    const source = shippedDe440Source();
    const from = (Date.UTC(year, 6, 1) - J2000_MS) / DAY;
    const steps = source.steps(from, from + 40);
    // A window of six hours from an hour before the first step: it holds the cluster of steps that one boundary makes.
    const first = utcOf(steps[0]!, Date.UTC(year, 6, 1));
    const start = first - 3_600_000;
    const end = start + 6 * 3_600_000;
    const inside = steps.map((step) => utcOf(step, first)).filter((at) => at > start && at < end);
    expect(inside.length).toBeGreaterThanOrEqual(3);
    for (const houseSystem of ["whole", "placidus"] as const) {
      const place: Place = { latitude: 40.7, longitude: -74, houseSystem };
      const window = birthWindow({ start: new Date(start), end: new Date(end), ...place });
      expect(window.ephemeris).toEqual(DE440);
      expect(window.flags).toEqual([]);
      expectExact(window, place, 60_000);
      for (const at of inside) {
        for (let time = at - 25; time <= at + 25; time += 1) {
          expect(cellFeatures(cellAt(window, time)), new Date(time).toISOString()).toEqual(chartFeatures(time, place));
        }
      }
    }
  }, 300_000);
});

describe("a planet behind the Sun, where the pack's reduction bends its light", () => {
  // Neptune passes 0.022° from the Sun's centre on 1920-08-03, near 23:28 UTC. The reduction's light deflection
  // (src/de440/reduce.ts) grows as the inverse of that angle, so the place natalChart gives moves far faster than
  // the body: the search's rate bound must grow with it (Sky.rate in src/window.ts).
  const closest = Date.UTC(1920, 7, 3, 23, 28);
  const place: Place = { latitude: 40, longitude: -74, houseSystem: "whole" };

  it("moves Neptune's place at over ten times its rate bound", () => {
    let fastest = 0;
    for (let time = closest - 600_000; time < closest + 600_000; time += 10_000) {
      const moved = Math.abs(bodyLongitude("Neptune", new Date(time + 10_000)) - bodyLongitude("Neptune", new Date(time)));
      fastest = Math.max(fastest, moved * 8640);
    }
    expect(fastest).toBeGreaterThan(10 * WINDOW_RATE_BOUNDS.Neptune);
  });

  it("is partitioned as natalChart has it, with no bound broken", () => {
    const window = partition(closest - 3_600_000, 2 * 3_600_000, place);
    expect(window.flags).toEqual([]);
    expectExact(window, place, 20_000);
    // And the day before, a degree from the Sun, where the bound needs nothing added.
    const before = partition(closest - 30 * 3_600_000, 6 * 3_600_000, place);
    expect(before.flags).toEqual([]);
    expectExact(before, place, 60_000);
  }, 120_000);
});

