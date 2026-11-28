import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLongitude, longitudeSpeed } from "../../src/ephemeris.js";
import { timeBasis } from "../../src/time-scale.js";
import type { BodyName } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { expectSameError, outcome } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

const functions = [
  ["bodyLongitude", rust.bodyLongitude, bodyLongitude],
  ["longitudeSpeed", rust.longitudeSpeed, longitudeSpeed]
] as const;

function compareFailure(
  actual: typeof bodyLongitude, expected: typeof bodyLongitude,
  body: unknown, date: Date, context: string,
): void {
  const reference = outcome(() => expected(body as BodyName, date));
  const result = outcome(() => actual(body as BodyName, date));
  expect(reference.ok, context).toBe(false);
  expect(result.ok, context).toBe(false);
  if (!result.ok && !reference.ok) expectSameError(result.error, reference.error, context);
}

describe("standalone body-name boundaries", () => {
  it("rejects unknown names and ordinary non-string values without passing them to the WASM string ABI", () => {
    const invalid: unknown[] = [
      "", "Earth", "sun", " Sun", "Sun ", "NorthNode", "North node", "Moon\0",
      "\ud800", "\udfff", "Sun\ud800", "😀", "x".repeat(1000),
      NaN, Infinity, -Infinity, 0, -0, 1, true, false, null, undefined,
      0n, 1n, {}, [], ["Sun"], new String("Sun"), new String("Moon"),
      Object.create(null), Symbol("Sun")
    ];
    const date = new Date("2000-01-01T12:00:00Z");
    for (const [name, actual, expected] of functions) {
      for (const [index, body] of invalid.entries()) {
        compareFailure(actual, expected, body, date, `${name}, invalid body ${index}`);
      }
      // A previous rejection must not trap the WASM instance or damage its heap.
      expect(Number.isFinite(actual("Sun", date)), name).toBe(true);
      expect(Number.isFinite(actual("Pluto", date)), name).toBe(true);
    }
  });

  it("checks the date's TT span before rejecting the unknown body", () => {
    for (const date of [
      new Date(NaN), new Date(-8.64e15), new Date(8.64e15),
      new Date("0000-01-01"), new Date("3999-01-01")
    ]) {
      for (const [name, actual, expected] of functions) {
        for (const body of ["Earth", null, 1, Symbol("body")]) {
          compareFailure(actual, expected, body, date, `${name}, date ms=${date.getTime()}`);
        }
      }
    }
  });

  it("checks the earlier speed sample before rejecting its unknown body", () => {
    // Find the first synthetic UTC millisecond admitted at the lower TT bound.
    // This compares time-basis behavior, without an external ephemeris fixture.
    const day = 86_400_000;
    const approximate = Date.UTC(2000, 0, 1, 12) - 730000 * day;
    let lo = approximate - day;
    let hi = approximate + day;
    while (hi - lo > 1) {
      const middle = Math.floor((lo + hi) / 2);
      if (timeBasis(middle).ttDays < -730000) lo = middle;
      else hi = middle;
    }
    const date = new Date(hi);
    expect(timeBasis(hi).ttDays).toBeGreaterThanOrEqual(-730000);
    expect(timeBasis(hi - 86400).ttDays).toBeLessThan(-730000);
    for (const [name, actual, expected] of functions) {
      compareFailure(actual, expected, "Earth", date, `${name}, first admitted UTC millisecond`);
    }
    expect(() => rust.bodyLongitude("Earth" as BodyName, date)).toThrow("Unknown body: Earth");
    expect(() => rust.longitudeSpeed("Earth" as BodyName, date)).toThrow("outside the ephemeris span");
  });
});
