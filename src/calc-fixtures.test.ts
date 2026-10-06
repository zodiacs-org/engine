import { readFileSync } from "node:fs";

import { AstroTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { calc, chart, events, houses } from "./calc.js";
import type { CalcPosition, CalcRequest } from "./calc.js";
import { CALC_FRAMES, apply, frameMatrix, fromSpherical, transpose } from "./calc-frames.js";
import type { Vec3 } from "./calc-frames.js";

interface Case {
  readonly function: "calc" | "houses" | "events" | "chart";
  readonly request: unknown;
  readonly result: { readonly status: string; readonly receipt?: { readonly request: unknown } };
}

const { cases } = JSON.parse(readFileSync(new URL("./fixtures/calc-roundtrip.json", import.meta.url), "utf8")) as {
  cases: Case[];
};
/** A function's result as JSON, as the fixture holds it: a chart's Dates as ISO strings. */
const run = Object.fromEntries(
  Object.entries({ calc, houses, events, chart }).map(([name, fn]) => [name, (request: never) => JSON.parse(JSON.stringify(fn(request)))])
) as Record<Case["function"], (request: never) => unknown>;
const ARCSEC = Math.PI / 648_000;
const DEG = Math.PI / 180;

/** The same, numbers to 10⁻¹² of their size; the engine's version, which a release changes, is not compared. */
function expectSame(actual: unknown, expected: unknown, path = "result"): void {
  const version = (where: string, key: string) =>
    (where === "result.receipt.engine" && key === "version") || (where === "result.chart" && key === "engineVersion");
  if (typeof expected === "number" && typeof actual === "number") {
    expect(Math.abs(actual - expected), path).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
  } else if (expected !== null && typeof expected === "object" && actual !== null && typeof actual === "object") {
    expect(Object.keys(actual).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      if (version(path, key)) continue;
      expectSame((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

function angle(a: Vec3, b: Vec3): number {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ARCSEC;
}

const positions = cases.filter(
  (entry): entry is Case & { result: CalcPosition } => entry.function === "calc" && entry.result.status === "ok"
);

describe("calc round-trip fixtures", () => {
  it("cover every function, both zodiacs and a caller's ayanamsa, every frame and center, the three corrections and the refusals", () => {
    expect(new Set(cases.filter((entry) => entry.result.status === "ok").map((entry) => entry.function))).toEqual(
      new Set(["calc", "houses", "events", "chart"])
    );
    const zodiacs = cases.map((entry) => (entry.request as { zodiac?: unknown }).zodiac ?? "tropical");
    const kinds = zodiacs.map((zodiac) =>
      zodiac === "tropical" ? "tropical" : typeof (zodiac as { sidereal: unknown }).sidereal === "string" ? "named" : "caller's"
    );
    expect(new Set(kinds)).toEqual(new Set(["tropical", "named", "caller's"]));
    const requests = positions.map((entry) => entry.result.receipt.request);
    expect(new Set(requests.map((request) => request.frame))).toEqual(new Set(CALC_FRAMES));
    const centers = requests.map((request) => (typeof request.center === "string" ? request.center : "topocentric"));
    expect(new Set(centers)).toEqual(new Set(["geocentric", "heliocentric", "barycentric", "topocentric"]));
    expect(new Set(requests.map((request) => request.flags!.correction))).toEqual(new Set(["apparent", "astrometric", "geometric"]));
    const reasons = cases.flatMap((entry) => ("reason" in entry.result ? [entry.result.reason] : []));
    expect(new Set(reasons)).toEqual(new Set(["not-in-this-version", "unsupported-combination", "out-of-range", "sample-budget"]));
  });

  it.each(cases.map((entry, index) => [index, entry.function, entry] as const))(
    "%i: %s gives the committed result for the committed request",
    (_, name, entry) => {
      expectSame(run[name](entry.request as never), entry.result);
    }
  );

  it.each(cases.filter((entry) => entry.result.receipt).map((entry, index) => [index, entry.function, entry] as const))(
    "%i: %s gives the same result again for its receipt's request",
    (_, name, entry) => {
      expectSame(run[name](JSON.parse(JSON.stringify(entry.result.receipt!.request)) as never), entry.result);
    }
  );

  it("give the same x, y, z as lon, lat, dist", () => {
    for (const { result } of positions.filter((entry) => entry.result.cartesian)) {
      const unit = result.receipt.request.flags!.units === "radians" ? DEG : 1;
      const [x, y, z] = fromSpherical(result.lon / unit, result.lat / unit, result.dist!);
      const { x: X, y: Y, z: Z } = result.cartesian!;
      expect(Math.hypot(x - X, y - Y, z - Z) / result.dist!).toBeLessThan(1e-14);
    }
  });

  it("turn each tropical cartesian position into every other frame as calc() gives it there", () => {
    // A sidereal vector is turned by the ayanamsa of its own ecliptic of date; calc-sidereal.test.ts compares those.
    for (const { result } of positions.filter((entry) => entry.result.cartesian && entry.result.receipt.request.zodiac === "tropical")) {
      const request = result.receipt.request;
      const at = AstroTime.FromTerrestrialTime(result.receipt.instants[0]!.jdTt - 2_451_545);
      const { x, y, z } = result.cartesian!;
      const eqj = apply(transpose(frameMatrix(result.frame, at)), [x, y, z]);
      for (const frame of CALC_FRAMES) {
        const there = calc({ ...request, frame } as CalcRequest);
        if (there.status !== "ok") throw new Error(there.reason);
        const { x: X, y: Y, z: Z } = there.cartesian!;
        expect(angle(apply(frameMatrix(frame, at), eqj), [X, Y, Z])).toBeLessThan(1e-8);
      }
    }
  });
});
