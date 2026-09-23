import { describe, expect, it } from "vitest";

import { NODE_SPEED_STEP_DAYS, bodyLongitude, computeBodies, longitudeSpeed } from "./ephemeris.js";
import { computeSaturnReturns } from "./returns.js";
import { natalChart } from "./api.js";
import type { BodyName } from "./types.js";

const DAY = 86_400_000;
const BODIES: BodyName[] = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
];

function centralDifference(body: BodyName, date: Date, stepDays: number): number {
  const before = bodyLongitude(body, new Date(date.getTime() - stepDays * DAY));
  const after = bodyLongitude(body, new Date(date.getTime() + stepDays * DAY));
  let difference = after - before;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference / (2 * stepDays);
}

describe("longitude speeds", () => {
  it("are the derivative of the reported longitude to 0.01″ a day", () => {
    let worst = 0;
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2026, 0, 1); t += 3 * DAY) {
      for (const body of BODIES) {
        const date = new Date(t);
        const error =
          Math.abs(longitudeSpeed(body, date) - centralDifference(body, date, 1e-4)) * 3600;
        worst = Math.max(worst, error);
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("keep the true node's six-hour difference", () => {
    for (const iso of ["1990-02-01T12:00:00Z", "2026-07-15T11:15:00Z", "2040-12-31T23:59:59Z"]) {
      const date = new Date(iso);
      expect(longitudeSpeed("North Node", date)).toBe(
        centralDifference("North Node", date, NODE_SPEED_STEP_DAYS)
      );
    }
  });

  it("set retrograde from the sign of the speed for every body", () => {
    for (const row of computeBodies(new Date("2024-04-01T22:14:00Z"))) {
      expect(row.retrograde).toBe(row.speed < 0);
    }
  });
});

describe("natal Saturn direction in the return scan", () => {
  // Saturn stations retrograde on 2026-07-26; this speed changes sign near 19:57:39.6Z.
  it.each([
    "2026-07-26T19:57:16.990Z",
    "2026-07-26T19:57:29.612Z",
    "2026-07-26T19:57:49.612Z",
    "1990-02-01T12:00:00Z"
  ])("agrees with the chart at %s", (iso) => {
    const utc = new Date(iso);
    const saturn = natalChart({
      utc,
      latitude: 0,
      longitude: 0,
      houseSystem: "whole",
      timeKnown: true
    }).bodies.find((row) => row.body === "Saturn")!;
    expect(computeSaturnReturns(utc).natalRetrograde).toBe(saturn.retrograde);
  });
});
