import { describe, expect, it } from "vitest";

import {
  ASPECTS,
  ASPECT_BODIES,
  aspectMotion,
  findAspects,
  matchAspect,
  separation
} from "./aspects.js";
import { computeBodies } from "./ephemeris.js";
import type { BodyPosition } from "./types.js";

const body = (name: string, lon: number, speed: number): BodyPosition =>
  ({ body: name, lon, lat: 0, speed, retrograde: speed < 0 }) as BodyPosition;

/** The 0.02-day forward step rc.6 used, kept here as the rule being replaced. */
function steppedApplying(a: BodyPosition, b: BodyPosition, angle: number, orb: number): boolean {
  const next = separation(a.lon + a.speed * 0.02, b.lon + b.speed * 0.02);
  return Math.abs(next - angle) < orb;
}

describe("aspectMotion", () => {
  it.each([
    // [label, a, b, angle, expected, what the 0.02-day step said]
    [
      "Moon 0.1° before a conjunction with the Sun",
      body("Moon", 99.9, 13.2),
      body("Sun", 100, 0.98),
      0,
      "applying",
      false
    ],
    [
      "Moon square Mars 0.05° before exact",
      body("Moon", 9.95, 13.2),
      body("Mars", 100, 0.5),
      90,
      "applying",
      false
    ],
    [
      "Moon opposition Sun across 0°/360°",
      body("Moon", 179.85, 13.2),
      body("Sun", 359.9, 0.98),
      180,
      "applying",
      false
    ],
    [
      "Jupiter–Saturn ten minutes before exact",
      body("Jupiter", 299.99896, 0.25),
      body("Saturn", 300, 0.1),
      0,
      "applying",
      false
    ],
    [
      "Jupiter–Saturn ten minutes after exact",
      body("Jupiter", 300.00104, 0.25),
      body("Saturn", 300, 0.1),
      0,
      "separating",
      false
    ],
    [
      "retrograde Mercury meeting the Sun",
      body("Mercury", 101, -1),
      body("Sun", 100, 0.98),
      0,
      "applying",
      true
    ],
    [
      "Mars square Jupiter, both retrograde",
      body("Mars", 10.5, -0.3),
      body("Jupiter", 100, -0.1),
      90,
      "applying",
      true
    ],
    [
      "Moon trine Sun, Moon faster and ahead",
      body("Moon", 245, 13.2),
      body("Sun", 0, 0.98),
      120,
      "separating",
      false
    ]
  ] as const)("%s", (_label, a, b, angle, expected, stepped) => {
    expect(aspectMotion(a, b, angle)).toBe(expected);
    const match = matchAspect(a.body, a.lon, b.body, b.lon)!;
    expect(steppedApplying(a, b, angle, match.orb)).toBe(stepped);
  });

  it("treats an exact aspect as separating", () => {
    expect(aspectMotion(body("Moon", 100, 13.2), body("Sun", 100, 0.98), 0)).toBe("separating");
    expect(aspectMotion(body("Moon", 190, 13.2), body("Sun", 100, 0.98), 90)).toBe("separating");
  });

  it("treats a relative speed below the threshold, or not a number, as stationary", () => {
    expect(aspectMotion(body("Mars", 10, 0), body("Jupiter", 100, 0), 90)).toBe("stationary");
    expect(aspectMotion(body("Mars", 10, 1.2), body("Jupiter", 100, 1.2 + 1e-10), 90)).toBe(
      "stationary"
    );
    expect(aspectMotion(body("Mars", 10, Number.NaN), body("Jupiter", 100, 1), 90)).toBe(
      "stationary"
    );
  });

  it("agrees with linear motion on 400,000 seeded pairs", () => {
    let state = 12345;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    let wrong = 0;
    let stepWrong = 0;
    for (let index = 0; index < 400_000; index += 1) {
      const definition = ASPECTS[index % ASPECTS.length]!;
      const fast = index % 2 === 0;
      const maxOrb = definition.orb;
      const orb = maxOrb * (0.01 + 0.99 * next());
      const sign = next() < 0.5 ? -1 : 1;
      const side = next() < 0.5 ? -1 : 1;
      const bLon = next() * 360;
      const aLon = bLon + side * (definition.angle + sign * orb);
      const range = fast ? 15 : 1.5;
      const a = body("Mars", ((aLon % 360) + 360) % 360, (next() * 2 - 1) * range);
      const b = body("Jupiter", bLon, (next() * 2 - 1) * range);
      // Long enough for the pair to move 1e-7°, far above rounding at these
      // longitudes and far below the smallest orb in the sweep (0.04°).
      const h = 1e-7 / Math.abs(a.speed - b.speed);
      const orbNow = Math.abs(separation(a.lon, b.lon) - definition.angle);
      const orbNext = Math.abs(
        separation(a.lon + a.speed * h, b.lon + b.speed * h) - definition.angle
      );
      const truth = orbNext < orbNow;
      if ((aspectMotion(a, b, definition.angle) === "applying") !== truth) wrong += 1;
      if (steppedApplying(a, b, definition.angle, orbNow) !== truth) stepWrong += 1;
    }
    expect(wrong).toBe(0);
    // The rule it replaces misjudges some of the same pairs (769 on this seed).
    expect(stepWrong).toBeGreaterThan(0);
  });
});

describe("findAspects applying flags against the engine's own motion", () => {
  it("match the sign of the orb's rate, measured over ±1 s, every 30 minutes in the first quarter of 2024", () => {
    const start = Date.UTC(2024, 0, 1);
    const end = Date.UTC(2024, 3, 1);
    const second = 1000;
    let aspects = 0;
    const wrong: string[] = [];
    for (let t = start; t < end; t += 30 * 60_000) {
      const now = computeBodies(new Date(t));
      const before = new Map(computeBodies(new Date(t - second)).map((row) => [row.body, row.lon]));
      const after = new Map(computeBodies(new Date(t + second)).map((row) => [row.body, row.lon]));
      for (const aspect of findAspects(now)) {
        if (!ASPECT_BODIES.has(aspect.a) || !ASPECT_BODIES.has(aspect.b)) continue;
        const angle = ASPECTS.find((row) => row.type === aspect.type)!.angle;
        const deviation = (at: Map<string, number>) =>
          separation(at.get(aspect.a)!, at.get(aspect.b)!) - angle;
        const a = now.find((row) => row.body === aspect.a)!;
        const b = now.find((row) => row.body === aspect.b)!;
        const signedNow = separation(a.lon, b.lon) - angle;
        const rate = (deviation(after) - deviation(before)) / 2;
        const truth = signedNow !== 0 && Math.sign(signedNow) * rate < 0;
        aspects += 1;
        if (aspect.applying !== truth)
          wrong.push(`${new Date(t).toISOString()} ${aspect.a}–${aspect.b} ${aspect.type}`);
      }
    }
    expect(aspects).toBeGreaterThan(50_000);
    expect(wrong.slice(0, 5)).toEqual([]);
  }, 120_000);
});
