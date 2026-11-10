import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { AstroTime, SetDeltaTFunction } from "astronomy-engine";
import { positions } from "../../src/api.js";
import * as aspects from "../../src/aspects.js";
import * as calendar from "../../src/civil-calendar.js";
import * as configured from "../../src/configured-aspects.js";
import { dateFrom } from "../../src/date-input.js";
import { deltaT, deltaTAt } from "../../src/deltat.js";
import * as ephemeris from "../../src/ephemeris.js";
import * as houses from "../../src/houses.js";
import * as nutation from "../../src/nutation.js";
import { outsideReferenceSpan } from "../../src/reference-span.js";
import { findInterAspects } from "../../src/synastry.js";
import * as time from "../../src/time-scale.js";
import type { BodyPosition, DateInput } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, outcome } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

const instant = Date.UTC(2000, 0, 1, 12);
const geometry = Object.freeze({ gastHours: 5.25, latitude: 78, longitude: -73.125, obliquity: 23.4 });
const sharedAngles = Object.freeze(houses.computeAngles(geometry));
const syntheticRows: readonly BodyPosition[] = Object.freeze([
  Object.freeze({ body: "Sun", lon: 0, lat: 0, speed: 1, retrograde: false, sign: "aries", degree: 0 } as const),
  Object.freeze({ body: "Mars", lon: 90, lat: 0, speed: 0.5, retrograde: false, sign: "cancer", degree: 0 } as const)
]);

/** Shape and ownership only: quantity-specific numeric bounds live in the numeric suites. */
function sameShape(actual: unknown, expected: unknown, label: string): void {
  expect(actual instanceof Promise, label).toBe(false);
  expect(typeof actual, label).toBe(typeof expected);
  if (expected === null || typeof expected !== "object") {
    if (typeof expected !== "number") expect(actual, label).toBe(expected);
    return;
  }
  expect(actual, label).not.toBeNull();
  expect(Object.getPrototypeOf(actual), label).toBe(Object.getPrototypeOf(expected));
  expect(Object.isFrozen(actual), label).toBe(Object.isFrozen(expected));
  const keys = Reflect.ownKeys(expected);
  expect(Reflect.ownKeys(actual as object), label).toEqual(keys);
  for (const key of keys) {
    const a = Object.getOwnPropertyDescriptor(actual, key)!;
    const b = Object.getOwnPropertyDescriptor(expected, key)!;
    expect([a.enumerable, a.configurable, a.writable, a.get, a.set], `${label}.${String(key)}`)
      .toEqual([b.enumerable, b.configurable, b.writable, b.get, b.set]);
    sameShape(a.value, b.value, `${label}.${String(key)}`);
  }
}

function sameFailure(actual: () => unknown, expected: () => unknown, label: string): void {
  const a = outcome(actual), b = outcome(expected);
  expect(a.ok, label).toBe(false);
  expect(b.ok, label).toBe(false);
  if (!a.ok && !b.ok) {
    expectSameError(a.error, b.error, label);
    expect(Object.hasOwn(a.error as Error, "cause"), label).toBe(Object.hasOwn(b.error as Error, "cause"));
    expect((a.error as Error).cause, label).toBe((b.error as Error).cause);
  }
}

describe("synchronous JavaScript result boundaries", () => {
  it("returns ordinary objects and arrays with reference property descriptors", () => {
    const date = new Date(instant);
    const calls: readonly [string, () => unknown, () => unknown][] = [
      ["positions", () => rust.positions(date), () => positions(date)],
      ["computeBodies", () => rust.computeBodies(date), () => ephemeris.computeBodies(date)],
      ["calendar", () => rust.parseCalendarDate("2000-02-29", "gregorian"), () => calendar.parseCalendarDate("2000-02-29", "gregorian")],
      ["civilDateOf", () => rust.civilDateOf(2451545, "gregorian"), () => calendar.civilDateOf(2451545, "gregorian")],
      ["deltaTAt", () => rust.deltaTAt(0), () => deltaTAt(0)],
      ["ut1MinusUtcAt", () => rust.ut1MinusUtcAt(instant), () => time.ut1MinusUtcAt(instant)],
      ["nutation", () => rust.nutation(0), () => nutation.nutation(0)],
      ["tilt", () => rust.tilt(0), () => nutation.tilt(0)],
      ["computeAngles", () => rust.computeAngles(geometry), () => houses.computeAngles(geometry)],
      ["matchAspect", () => rust.matchAspect("Sun", 0, "Mars", 90), () => aspects.matchAspect("Sun", 0, "Mars", 90)],
      ["findAspects", () => rust.findAspects(syntheticRows), () => aspects.findAspects(syntheticRows)],
      ["findInterAspects", () => rust.findInterAspects(syntheticRows, syntheticRows), () => findInterAspects(syntheticRows, syntheticRows)]
    ];
    for (const [label, actual, expected] of calls) sameShape(actual(), expected(), label);
    for (const system of houses.HOUSE_SYSTEMS)
      sameShape(rust.computeHouses(system, geometry, sharedAngles), houses.computeHouses(system, geometry, sharedAngles), system);
    for (const scale of time.TIME_SCALE_NAMES) {
      for (const pin of [undefined, -0, 69.184])
        sameShape(rust.timeBasis(instant, scale, pin), time.timeBasis(instant, scale, pin), `timeBasis ${scale}/${pin}`);
    }
    const rustPolicy = rust.createAspectPolicy();
    const referencePolicy = configured.createAspectPolicy();
    sameShape(rust.findConfiguredAspects(syntheticRows, rustPolicy),
      configured.findConfiguredAspects(syntheticRows, referencePolicy), "configured aspects");
  });

  it("allocates time provenance afresh and keeps nested mutation local to its result", () => {
    for (const implementation of [rust, time]) {
      const first = implementation.timeBasis(instant);
      const second = implementation.timeBasis(instant);
      sameShape(first, second, "repeated time basis");
      expect(first).not.toBe(second);
      expect(first.deltaT).not.toBe(second.deltaT);
      expect(first.timeScale).not.toBe(second.timeScale);
      expect(first.timeScale.ut1MinusUtc).not.toBe(second.timeScale.ut1MinusUtc);
      expect(first.timeScale.leapSeconds).not.toBe(second.timeScale.leapSeconds);
      first.deltaT.seconds = 12345;
      first.timeScale.ut1MinusUtc!.seconds = 12345;
      first.timeScale.leapSeconds!.taiMinusUtc = 12345;
      expect(second).toEqual(implementation.timeBasis(instant));
    }
  });

  it("keeps legacy aspect results mutable and configured results frozen without mutating inputs", () => {
    for (const implementation of [rust, { ...aspects, findInterAspects, ...configured }]) {
      const first = implementation.findAspects(syntheticRows);
      const second = implementation.findAspects(syntheticRows);
      expect(first).not.toBe(second);
      expect(first[0]).not.toBe(second[0]);
      first[0]!.orb = 12345;
      first.length = 0;
      expect(second).toEqual(implementation.findAspects(syntheticRows));
      const policy = implementation.createAspectPolicy();
      const result = implementation.findConfiguredAspects(syntheticRows, policy);
      expect(result.policy).toBe(policy);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.aspects)).toBe(true);
      expect(Object.isFrozen(result.aspects[0])).toBe(true);
      expect(() => { (result.aspects[0] as { orb: number }).orb = 12345; }).toThrow(TypeError);
      expect(syntheticRows.map(row => row.lon)).toEqual([0, 90]);
    }
  });
});

describe("Date-only runtime failures and clock isolation", () => {
  const calculations = [
    ["computeBodies", rust.computeBodies, ephemeris.computeBodies],
    ["bodyLongitude", (date: Date) => rust.bodyLongitude("Sun", date), (date: Date) => ephemeris.bodyLongitude("Sun", date)],
    ["longitudeSpeed", (date: Date) => rust.longitudeSpeed("Sun", date), (date: Date) => ephemeris.longitudeSpeed("Sun", date)]
  ] as const;

  it("matches missing Date methods and invalid Date errors before numeric evaluation", () => {
    for (const [name, actual, expected] of calculations) {
      for (const input of [undefined, null, 0, "2000-01-01", {}, [], new Date(NaN), Object.create(Date.prototype)])
        sameFailure(() => actual(input as Date), () => expected(input as Date), `${name} invalid Date`);
    }
  });

  it("preserves Error identity and wraps non-Error Date method throws with their cause", () => {
    const thrownValues = [new Error("synthetic error"), new RangeError("synthetic range"),
      "synthetic non-Error", undefined, null, 17, Symbol("synthetic cause"), { message: "synthetic plain object" }];
    for (const [name, actual, expected] of calculations) {
      for (const thrown of thrownValues) {
        const date = new Date(instant);
        date.getTime = () => { throw thrown; };
        sameFailure(() => actual(date), () => expected(date), `${name} Date method throw`);
        const result = outcome(() => actual(date));
        if (!result.ok && thrown instanceof Error) expect(result.error).toBe(thrown);
      }
    }
  });

  it("uses intrinsic Date timestamps at public positions, parser and span boundaries", () => {
    const date = new Date(instant);
    date.getTime = () => { throw "synthetic method must not run"; };
    expect(rust.positions(date)).toEqual(rust.positions(instant));
    expect(positions(date)).toEqual(positions(instant));
    for (const implementation of [rust.dateFrom, dateFrom]) {
      const copy = implementation(date, "synthetic");
      expect(copy).not.toBe(date);
      expect(Object.getPrototypeOf(copy)).toBe(Date.prototype);
      expectSameNumber(copy.getTime(), instant, "intrinsic Date value");
    }
    expect(rust.outsideReferenceSpan(date)).toBe(outsideReferenceSpan(date));
    for (const implementation of [rust.positions, positions]) {
      const forged = Object.create(Date.prototype) as DateInput;
      expect(() => implementation(forged)).toThrow(TypeError);
    }
  });

  it("does not replace the caller's astronomy-engine clock during Rust calls or failures", () => {
    // The native port has no astronomy-engine callbacks. The TypeScript
    // reference instead restores its own model after an ephemeris call.
    const seconds = 4321;
    SetDeltaTFunction(() => seconds);
    try {
      const initial = new AstroTime(0).tt;
      rust.positions(instant);
      rust.bodyLongitude("Moon", new Date(instant));
      rust.longitudeSpeed("Sun", new Date(instant));
      rust.timeBasis(instant, "tt", -70);
      expect(() => rust.positions("invalid synthetic date")).toThrow(RangeError);
      expect(() => rust.computeBodies(new Date(NaN))).toThrow(RangeError);
      expectSameNumber(new AstroTime(0).tt, initial, "foreign clock unchanged");
      expectSameNumber(initial, seconds / 86400, "foreign clock initialized");
    } finally {
      SetDeltaTFunction(deltaT);
    }
  });
});
