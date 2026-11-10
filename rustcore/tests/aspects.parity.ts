import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as reference from "../../src/aspects.js";
import { positions } from "../../src/api.js";
import { findInterAspects } from "../../src/synastry.js";
import type { Aspect, BodyPosition, InterAspect } from "../../src/types.js";
import * as rust from "../ts/index.js";
import { binary64Samples, expectSameNumber, neighbors, randomUint32 } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

function body(name: string, lon: number, speed = 1): BodyPosition {
  return { body: name, lon, speed, lat: 0, retrograde: speed < 0, sign: "aries", degree: 0 } as BodyPosition;
}

function sameMatch(a: string, aLon: number, b: string, bLon: number): void {
  const context = `${a}/${aLon}, ${b}/${bLon}`;
  const actual = rust.matchAspect(a, aLon, b, bLon);
  const expected = reference.matchAspect(a, aLon, b, bLon);
  if (expected === null) { expect(actual, context).toBeNull(); return; }
  expect(actual, context).not.toBeNull();
  expect(Object.keys(actual!), context).toEqual(Object.keys(expected));
  expect(actual!.definition, context).toEqual(expected.definition);
  const index = reference.ASPECTS.indexOf(expected.definition as typeof reference.ASPECTS[number]);
  expect(actual!.definition, context).toBe(rust.ASPECTS[index]);
  expect(Object.isFrozen(actual!.definition), context).toBe(true);
  expectSameNumber(actual!.orb, expected.orb, context);
}

function sameAspects(actual: readonly Aspect[], expected: readonly Aspect[], context: string): void {
  expect(actual.length, context).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!, b = expected[index]!;
    expect(Object.keys(a), context).toEqual(Object.keys(b));
    expect({ a: a.a, b: a.b, type: a.type, applying: a.applying }, context)
      .toEqual({ a: b.a, b: b.b, type: b.type, applying: b.applying });
    expectSameNumber(a.orb, b.orb, `${context}, index=${index}`);
  }
}

function sameInterAspects(actual: readonly InterAspect[], expected: readonly InterAspect[], context: string): void {
  expect(actual.length, context).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!, b = expected[index]!;
    expect(Object.keys(a), context).toEqual(Object.keys(b));
    expect([a.a, a.b, a.type], context).toEqual([b.a, b.b, b.type]);
    for (const key of ["aLon", "bLon", "orb"] as const)
      expectSameNumber(a[key], b[key], `${context}, index=${index}, ${key}`);
  }
}

describe("legacy aspects through WASM on shared binary64 inputs", () => {
  it("pins the translated legacy aspect and inter-chart source bytes", () => {
    const sources = {
      "aspects.ts": "5cfbf1ffe3889f1c038b798d5bd74674de17bd9f0571adb4be08141cdd49f740",
      // Only findInterAspects is ported from the synastry module in M10.
      "synastry.ts": "5671b43c9647a7164d171d9113ae4ab375b7f2a18cba53fac481e4c7a0522d29"
    };
    for (const [name, digest] of Object.entries(sources)) {
      const bytes = readFileSync(new URL(`../../src/${name}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(digest);
    }
  });

  it("preserves signatures, frozen definitions and the public body-set snapshot", () => {
    const signatures: [typeof reference.aspectMotion, typeof reference.matchAspect, typeof reference.findAspects,
      typeof findInterAspects] = [rust.aspectMotion, rust.matchAspect, rust.findAspects, rust.findInterAspects];
    expect(signatures.every(value => typeof value === "function")).toBe(true);
    expect(rust.ASPECTS).toEqual(reference.ASPECTS);
    expect(rust.ASPECT_TYPES).toEqual(reference.ASPECT_TYPES);
    expect([...rust.ASPECT_BODIES]).toEqual([...reference.ASPECT_BODIES]);
    expectSameNumber(rust.STATIONARY_RELATIVE_SPEED, reference.STATIONARY_RELATIVE_SPEED, "stationary speed");
    for (const value of [rust.ASPECTS, rust.ASPECT_TYPES, ...rust.ASPECTS]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => { (rust.ASPECTS[0] as { orb: number }).orb = 0; }).toThrow(TypeError);
    const publicBodies = rust.ASPECT_BODIES as Set<string>;
    const original = [...publicBodies];
    try {
      publicBodies.clear();
      publicBodies.add("North Node");
      const rows = [body("Sun", 0), body("Mars", 90), body("North Node", 0)];
      sameAspects(rust.findAspects(rows), reference.findAspects(rows), "mutated public body set");
      sameInterAspects(rust.findInterAspects(rows, rows), findInterAspects(rows, rows), "mutated inter body set");
    } finally {
      publicBodies.clear();
      for (const name of original) publicBodies.add(name);
    }
  });

  it("keeps every major aspect and luminary boundary, including adjacent representable longitudes", () => {
    for (const definition of reference.ASPECTS) {
      for (const [a, b, maximum] of [["Mars", "Saturn", definition.orb], ["Sun", "Mars", definition.luminaryOrb],
        ["Mars", "Moon", definition.luminaryOrb], ["sun", "Mars", definition.orb]] as const) {
        for (const base of [0, 0.1, 7.3, 97.625, 179.9, 359.7]) {
          for (const distance of [definition.angle, definition.angle - maximum, definition.angle + maximum]) {
            for (const longitude of neighbors(base + distance)) {
              sameMatch(a, base, b, longitude);
              sameMatch(b, longitude, a, base);
            }
          }
        }
      }
    }
  });

  it("retains unchecked legacy motion behavior at circular corners, stationary thresholds and exceptional doubles", () => {
    const speeds = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, ...neighbors(reference.STATIONARY_RELATIVE_SPEED),
      -1, 1, -Number.MAX_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity];
    for (const aLon of [0, -0, 1e-14, 0.1, 179.99999999999997, 180, 180.00000000000003, 359.875, NaN, Infinity]) {
      for (const bLon of [0, 0.1, 180, 359.875]) {
        for (const angle of [0, 30, 60, 90, 120, 150, 180, NaN]) {
          for (let index = 0; index < speeds.length; index++) {
            const a = { lon: aLon, speed: speeds[index]! };
            const b = { lon: bLon, speed: speeds[(index + 3) % speeds.length]! };
            expect(rust.aspectMotion(a, b, angle), `${aLon}/${bLon}/${a.speed}/${b.speed}/${angle}`)
              .toBe(reference.aspectMotion(a, b, angle));
          }
        }
      }
    }
    const samples = [...binary64Samples(1_024, 0x61737065), NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE];
    for (let index = 0; index < samples.length; index++) {
      const a = samples[index]!, b = samples[(index + 1) % samples.length]!;
      sameMatch("Sun", a, "Saturn", b);
      const first = { lon: a, speed: b }, second = { lon: b, speed: a };
      expect(rust.aspectMotion(first, second, 90), `binary sample ${index}`)
        .toBe(reference.aspectMotion(first, second, 90));
    }
  });

  it("preserves row order, duplicate rows, exclusions and stable ties in single and two-chart results", () => {
    const cases = [[], [body("Sun", 0)],
      [body("Mars", 4), body("Venus", 0), body("Saturn", 2)],
      [body("Mars", 0), body("Mars", 0), body("Sun", 90), body("North Node", 0), body("Unknown", 90)],
      [body("Sun", -0, NaN), body("Moon", 180, Infinity), body("Pluto", -180, -Infinity)]];
    for (const rows of cases) {
      for (const order of [rows, [...rows].reverse()]) {
        sameAspects(rust.findAspects(order), reference.findAspects(order), "row behavior");
        for (const other of cases)
          sameInterAspects(rust.findInterAspects(order, other), findInterAspects(order, other), "inter row behavior");
      }
    }
  });

  it("compares complete result order on seeded synthetic geometries", () => {
    const next = randomUint32(0x61737031);
    const names = [...reference.ASPECT_BODIES, "North Node", "South Node"];
    for (let sample = 0; sample < 256; sample++) {
      const rows = names.map(name => body(name, next() / 0x1_0000_0000 * 360,
        sample % 7 === 0 ? 0 : next() / 0x1_0000_0000 * 30 - 15));
      sameAspects(rust.findAspects(rows), reference.findAspects(rows), `geometry=${sample}`);
      const other = rows.slice().reverse();
      sameInterAspects(rust.findInterAspects(rows, other), findInterAspects(rows, other), `inter geometry=${sample}`);
    }
  });

  it("compares shared planetary rows at annual synthetic instants from 1800 through 2200", () => {
    const dates = [Date.UTC(1800, 0, 1), Date.UTC(2200, 11, 31, 23, 59, 59, 999)];
    for (let year = 1800; year <= 2200; year++) dates.push(Date.UTC(year, year % 12, 17, 11, 23, 41, 173));
    let previous = positions(dates[0]!);
    for (const ms of dates) {
      const rows = positions(ms);
      sameAspects(rust.findAspects(rows), reference.findAspects(rows), `ms=${ms}`);
      sameInterAspects(rust.findInterAspects(rows, previous), findInterAspects(rows, previous), `inter ms=${ms}`);
      previous = rows;
    }
  }, 30_000);
});
