import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as reference from "../../src/configured-aspects.js";
import { positions } from "../../src/api.js";
import type { AspectPolicy, AspectPolicyInput, AspectPosition } from "../../src/configured-aspects.js";
import * as rust from "../ts/index.js";
import { expectSameError, expectSameNumber, neighbors, outcome, randomUint32 } from "./parity-helpers.js";

beforeAll(() => rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url))));

const position = (body: string, lon: number, speed = 1): AspectPosition => ({ body, lon, speed });
const pair = (a: number, b: number, va = 1, vb = 0): AspectPosition[] => [position("A", a, va), position("B", b, vb)];
type Policies = { actual: AspectPolicy; expected: AspectPolicy };

/** No tolerance: every numeric leaf, including a reported orb, must have identical bits. */
function sameData(actual: unknown, expected: unknown, context: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, context).toBe("number");
    expectSameNumber(actual as number, expected, context);
  } else if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", context).toBe(true);
    expect(Array.isArray(actual), context).toBe(Array.isArray(expected));
    expect(Object.keys(actual!), context).toEqual(Object.keys(expected));
    expect(Object.getPrototypeOf(actual!), context).toBe(Object.getPrototypeOf(expected));
    for (const key of Object.keys(expected))
      sameData((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${context}.${key}`);
  } else expect(actual, context).toBe(expected);
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

function policies(input: AspectPolicyInput = {}): Policies {
  const actual = rust.createAspectPolicy(input), expected = reference.createAspectPolicy(input);
  sameData(actual, expected, "policy");
  frozen(actual);
  return { actual, expected };
}

function custom(input: AspectPolicyInput = {}): Policies {
  return policies({ bodies: ["A", "B"], aspects: [{ type: "conjunction", orb: 8 }], ...input });
}

function compare(rows: readonly AspectPosition[], configured: Policies, context: string): ReturnType<typeof rust.findConfiguredAspects> {
  const actual = rust.findConfiguredAspects(rows, configured.actual);
  const expected = reference.findConfiguredAspects(rows, configured.expected);
  expect(Object.keys(actual), context).toEqual(Object.keys(expected));
  expect(actual.policy, context).toBe(configured.actual);
  expect(actual.schema, context).toBe(expected.schema);
  sameData(actual.aspects, expected.aspects, context);
  frozen(actual);
  return actual;
}

function sameFailure(actual: () => unknown, expected: () => unknown, context: string): void {
  const a = outcome(actual), b = outcome(expected);
  expect(a.ok, context).toBe(false);
  expect(b.ok, context).toBe(false);
  if (!a.ok && !b.ok) expectSameError(a.error, b.error, context);
}

describe("configured aspect policies and exact Rust/WASM arithmetic", () => {
  it("pins the translated configured-aspect, expansion-arithmetic and label-validation sources", () => {
    const sources = {
      "configured-aspects.ts": "c56349ba454e7cb3005f25eb3b740dd063cfeb3b9115e0d11512d8989ff19be4",
      "exact.ts": "f89a335657aa1139370511d315abcf8d6080ab857e0a37d249faf9de6a5eb25e",
      "body-label.ts": "bce12273949cd9810f4ab00c0f05c1aba14cf4ee46533ca3aba0588525006b1e"
    };
    for (const [name, digest] of Object.entries(sources)) {
      const bytes = readFileSync(new URL(`../../src/${name}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(digest);
    }
  });

  it("preserves signatures, schemas, all named angles and deeply frozen default metadata", () => {
    const signatures: [typeof reference.createAspectPolicy, typeof reference.findConfiguredAspects] =
      [rust.createAspectPolicy, rust.findConfiguredAspects];
    expect(signatures.every(value => typeof value === "function")).toBe(true);
    expect(rust.ASPECT_POLICY_SCHEMA).toBe(reference.ASPECT_POLICY_SCHEMA);
    expect(rust.CONFIGURED_ASPECTS_SCHEMA).toBe(reference.CONFIGURED_ASPECTS_SCHEMA);
    sameData(rust.CONFIGURED_ASPECT_ANGLES, reference.CONFIGURED_ASPECT_ANGLES, "named angles");
    sameData(rust.DEFAULT_ASPECT_POLICY, reference.DEFAULT_ASPECT_POLICY, "default policy");
    frozen(rust.CONFIGURED_ASPECT_ANGLES);
    frozen(rust.DEFAULT_ASPECT_POLICY);
    policies();
    policies(Object.create(null) as AspectPolicyInput);
    policies({ bodies: [], aspects: [], stationaryRelativeSpeed: -0 });
  });

  it("snapshots nested input, owns its registry and returns its own policy by identity", () => {
    const source = { bodies: ["A", "B"], aspects: [{ type: "custom", angle: 40,
      orb: { applying: 2, separating: 1, stationary: 0.5 }, luminaryOrb: 3 }],
      bodyOrbs: { A: { applying: 1.5, separating: 0.75, stationary: 0.25 } } };
    const configured = policies(source);
    source.bodies[0] = "Changed";
    source.aspects[0]!.angle = 41;
    source.aspects[0]!.orb.applying = 99;
    source.bodyOrbs.A.applying = 99;
    sameData(configured.actual, configured.expected, "snapshot after mutation");
    expect(configured.actual.bodies).toEqual(["A", "B"]);
    compare(pair(40.5, 0, -1), configured, "snapshot result");
    expect(() => { (configured.actual.bodies as string[]).push("C"); }).toThrow(TypeError);
    expect(() => { (configured.actual.aspects[0]!.orb as { applying: number }).applying = 99; }).toThrow(TypeError);
    for (const forged of [null, {}, { ...configured.actual }, JSON.parse(JSON.stringify(configured.actual)), configured.expected]) {
      sameFailure(() => rust.findConfiguredAspects([], forged as AspectPolicy),
        () => reference.findConfiguredAspects([], (forged === configured.expected ? configured.actual : forged) as AspectPolicy),
        "foreign or forged policy");
    }
  });

  it("selects each major/minor/custom angle at inclusive boundaries and adjacent doubles", () => {
    const definitions = [...Object.entries(reference.CONFIGURED_ASPECT_ANGLES),
      ["custom-small", 0.1], ["custom-seventh", 360 / 7], ["custom-near-opposite", 179.9]] as const;
    for (const [type, angle] of definitions) {
      const configured = custom({ aspects: [{ type, angle, orb: { applying: 1, separating: 0.5, stationary: 0.25 } }] });
      const exact = custom({ aspects: [{ type, angle, orb: 0 }] });
      for (const speed of [-1, 0, 1]) {
        const rows = pair(angle, 0, speed);
        for (const order of [rows, [...rows].reverse()]) {
          const found = compare(order, exact, `exact ${type}, speed=${speed}`).aspects;
          expect(found).toHaveLength(1);
          expectSameNumber(found[0]!.orb, 0, `exact ${type}`);
        }
      }
      for (const base of [0, 0.1, 7.3, 179.9, 359.7]) {
        for (const limit of [0, 0.25, 0.5, 1]) {
          for (const sign of [-1, 1]) {
            for (const longitude of neighbors(((base + angle + sign * limit) % 360 + 360) % 360)) {
              if (longitude < 0 || longitude >= 360) continue;
              for (const speed of [-1, 0, 1]) {
                const rows = pair(longitude, base, speed);
                compare(rows, configured, `${type}, ${longitude}/${base}/${speed}`);
                compare([...rows].reverse(), configured, `reversed ${type}, ${longitude}/${base}/${speed}`);
              }
            }
          }
        }
      }
    }
  }, 30_000);

  it("does not round away decimal, wrapped or subnormal orb boundaries", () => {
    const configured = custom({ aspects: [{ type: "conjunction", orb: 0.1 }] });
    for (const a of [0, -0, Number.MIN_VALUE, 1e-300, 1e-14, ...neighbors(0.1)])
      compare(pair(a, 0, -1), configured, `small decimal ${a}`);
    const cases: [number, number, number][] = [[0.1, 1.1, 1], [7.3, 8.3, 1], [12.3, 13.3, 1],
      [7.6999999999999895, 359.7, 8], [359.7 - 352, 359.7, 8],
      [359.875, 0, 0.125], [359.87499999999994, 0, 0.125],
      [Number.MIN_VALUE, 0, 0], [Number.MIN_VALUE, 0, Number.MIN_VALUE],
      [1, 2 ** -54, 1], [1, 3 * 2 ** -54, 1]];
    for (const [a, b, orb] of cases) {
      const policy = custom({ aspects: [{ type: "conjunction", orb }] });
      compare(pair(a, b), policy, `boundary ${a}/${b}/${orb}`);
      compare(pair(a, b).reverse(), policy, `reversed boundary ${a}/${b}/${orb}`);
    }
    expect(compare(pair(0.1, 1.1), custom({ aspects: [{ type: "conjunction", orb: 1 }] }), "rounded-outside").aspects)
      .toEqual([]);
    for (const angle of [0, 2 ** -200, 2 ** -55]) {
      const tinyAngle = custom({ aspects: [{ type: "tiny-angle", angle, orb: 1 }] });
      for (const lon of [2 ** -54, 3 * 2 ** -54])
        compare(pair(1, lon), tinyAngle, `three-term rounding ${lon}/${angle}`);
    }
  });

  it("ranks exact orbs before rounding and retains definition and pair order only for exact ties", () => {
    const conjunction = custom({ bodies: ["A", "B", "C", "D"], aspects: [{ type: "conjunction", orb: 2 }] });
    const rows = [position("A", 0.1), position("B", 1.1), position("C", 10), position("D", 11)];
    const ordered = compare(rows, conjunction, "equal reported orbs").aspects;
    expect(ordered.map(row => [row.a, row.b, row.orb])).toEqual([["C", "D", 1], ["A", "B", 1]]);
    const choices = custom({ aspects: [{ type: "first", angle: 0, orb: 2 }, { type: "second", angle: 2, orb: 2 }] });
    expect(compare(pair(0.1, 1.1), choices, "closest exact definition").aspects[0]?.type).toBe("second");
    expect(compare(pair(0, 1), choices, "equal exact definitions").aspects[0]?.type).toBe("first");
    const tied = custom({ bodies: ["A", "B", "C"], aspects: [{ type: "conjunction", orb: 10 }] });
    expect(compare([position("C", 4), position("A", 0), position("B", 2)], tied, "stable exact tie").aspects
      .map(row => [row.a, row.b, row.orb])).toEqual([["C", "B", 2], ["A", "B", 2], ["C", "A", 4]]);
    const eligibility = custom({ aspects: [{ type: "near", angle: 70, orb: 0.25 }, { type: "far", angle: 72, orb: 2 }] });
    expect(compare(pair(70.5, 0), eligibility, "eligibility before ranking").aspects[0]?.type).toBe("far");
  });

  it("classifies circular corners and exact speed thresholds without overflow or underflow", () => {
    const speeds: [number, number, number][] = [[1, 1, 0], [0, -0, 0], [1, 0, 1],
      [1, 2 ** -54, 1], [1, -(2 ** -54), 1], [Number.MIN_VALUE, 0, Number.MIN_VALUE],
      [Number.MIN_VALUE, Number.MIN_VALUE, 0], [Number.MIN_VALUE, -Number.MIN_VALUE, Number.MIN_VALUE],
      [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE],
      [-Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
      [1e308, -1e308, 1e308], [1e308, 1e308, Number.MIN_VALUE]];
    for (const threshold of neighbors(1e-9)) speeds.push([threshold, 0, 1e-9]);
    for (const [aSpeed, bSpeed, threshold] of speeds) {
      for (const angle of [0, 0.1, 30, 72, 150, 180]) {
        const configured = custom({ aspects: [{ type: "test", angle, orb: 180 }], stationaryRelativeSpeed: threshold });
        for (const [a, b] of [[0, 0], [180, 0], [359, 1], [0.1, 0], [72.25, 0], [71.75, 0]]) {
          const rows = pair(a!, b!, aSpeed, bSpeed);
          compare(rows, configured, `speed=${aSpeed}/${bSpeed}/${threshold}, angle=${angle}, ${a}/${b}`);
          compare([...rows].reverse(), configured, `reversed speed=${aSpeed}/${bSpeed}/${threshold}, angle=${angle}, ${a}/${b}`);
        }
      }
    }
  });

  it("applies luminary replacement, both body caps and each motion-specific allowance", () => {
    const configured = policies({ bodies: ["Sun", "Moon", "Mars", "sun"],
      aspects: [{ type: "conjunction", orb: { applying: 8, separating: 6, stationary: 4 },
        luminaryOrb: { applying: 10, separating: 8, stationary: 6 } }],
      bodyOrbs: { Sun: 4, Mars: { applying: 3, separating: 2, stationary: 1 } } });
    for (const a of configured.actual.bodies) for (const b of configured.actual.bodies) {
      if (a === b) continue;
      for (const longitude of [0, 1, 2, 3, 4, 6, 8, 10]) {
        for (const speed of [-1, 0, 1]) {
          const rows = [position(a, 0, 0), position(b, longitude, speed)];
          compare(rows, configured, `caps ${a}/${b}/${longitude}/${speed}`);
          compare([...rows].reverse(), configured, `reversed caps ${a}/${b}/${longitude}/${speed}`);
        }
      }
    }
  });

  it("accepts empty selections, special keys and distinct UTF-16 labels without changing their identity", () => {
    compare(pair(0, 0), custom({ bodies: [] }), "empty bodies");
    compare(pair(0, 0), custom({ aspects: [] }), "empty aspects");
    compare([position("A", 0), position("b", 0)], custom(), "case-sensitive selection");
    const labels = ["__proto__", "constructor", "toString", "North Node", "Ascendant", "\ud800", "\ud801", "\udc00",
      "\ufffd", "\u0080", "\u200b", "\ud83c\udf19".repeat(40)];
    const configured = policies({ bodies: labels, bodyOrbs: JSON.parse('{"__proto__":0}') as Record<string, number>,
      aspects: [{ type: "conjunction", orb: 5 }] });
    compare(labels.map((label, index) => position(label, index % 4)), configured, "UTF-16 and prototype labels");
    const unselected = [position("Unselected", 0), position("A", 0), position("B", 0)];
    const extra = unselected.map(row => ({ ...row, extra: { retainedByCaller: true } }));
    compare(extra, custom(), "ordinary extra row data");
  });

  it("compares all named aspects, custom sets and caps on seeded synthetic inputs", () => {
    const next = randomUint32(0x65786163);
    const names = [...reference.DEFAULT_ASPECT_POLICY.bodies, "North Node", "South Node"];
    const configurations = [policies(), policies({ bodies: names,
      aspects: Object.keys(reference.CONFIGURED_ASPECT_ANGLES).map(type => ({ type, orb: 3 })) }),
    policies({ bodies: names, aspects: [{ type: "seventh", angle: 360 / 7, orb: 10 },
      { type: "nearby", angle: 51.5, orb: { applying: 5, separating: 1, stationary: 0.5 } },
      { type: "opposition", orb: 12, luminaryOrb: 15 }],
    bodyOrbs: { Sun: 5, Moon: { applying: 4, separating: 3, stationary: 1 } }, stationaryRelativeSpeed: 0.25 })];
    for (let sample = 0; sample < 192; sample++) {
      const rows = names.map(body => position(body, next() / 0x1_0000_0000 * 360,
        sample % 7 === 0 ? 0 : next() / 0x1_0000_0000 * 30 - 15));
      for (const configured of configurations) compare(rows, configured, `synthetic sample=${sample}`);
    }
  });

  it("compares shared planetary inputs from 1800 through 2200 under every named and custom set", () => {
    const configurations = [policies(), policies({
      aspects: Object.keys(reference.CONFIGURED_ASPECT_ANGLES).map(type => ({ type, orb: 2 })) }),
    policies({ bodies: [...reference.DEFAULT_ASPECT_POLICY.bodies, "North Node", "South Node"],
      aspects: [{ type: "seventh", angle: 360 / 7, orb: 2 }, { type: "decimal", angle: 179.9, orb: 3 },
        { type: "quintile", orb: { applying: 3, separating: 2, stationary: 1 } }] })];
    const dates = [Date.UTC(1800, 0, 1), Date.UTC(2200, 11, 31, 23, 59, 59, 999)];
    for (let year = 1800; year <= 2200; year++) dates.push(Date.UTC(year, year % 12, 17, 11, 23, 41, 173));
    for (const ms of dates) {
      const rows = positions(ms);
      for (const configured of configurations) compare(rows, configured, `planetary ms=${ms}`);
    }
  }, 30_000);
});

describe("configured aspect validation parity", () => {
  it("rejects malformed policies with the same error class and message", () => {
    const invalid: unknown[] = [null, [], 1, "policy", new Date(0), { unexpected: true }, { bodies: null },
      { bodies: ["A", "A"] }, { bodies: [""] }, { bodies: [" A"] }, { bodies: ["A\ufeff"] },
      { bodies: ["A\nB"] }, { bodies: ["A\u007fB"] }, { bodies: ["A".repeat(81)] },
      { bodies: ["\ud83c\udf19".repeat(41)] }, { bodies: [false] }, { bodies: Array(257).fill("A") },
      { aspects: null }, { aspects: Array(65).fill({ type: "conjunction", orb: 1 }) },
      { aspects: [{ type: "Square", orb: 1 }] }, { aspects: [{ type: "a".repeat(65), angle: 0, orb: 1 }] },
      { aspects: [{ type: "custom", orb: 1 }] }, { aspects: [{ type: "square", angle: 91, orb: 1 }] },
      { aspects: [{ type: "custom", angle: -1, orb: 1 }] }, { aspects: [{ type: "custom", angle: 181, orb: 1 }] },
      { aspects: [{ type: "conjunction", orb: -1 }] }, { aspects: [{ type: "conjunction", orb: 181 }] },
      { aspects: [{ type: "conjunction", orb: NaN }] }, { aspects: [{ type: "conjunction", orb: Infinity }] },
      { aspects: [{ type: "conjunction", orb: null }] }, { aspects: [{ type: "conjunction", orb: { applying: 1 } }] },
      { aspects: [{ type: "square", orb: 1 }, { type: "square", orb: 2 }] },
      { aspects: [{ type: "square", orb: 1, extra: 0 }] }, { bodyOrbs: { Unknown: 1 } },
      { stationaryRelativeSpeed: null }, { stationaryRelativeSpeed: -1 }, { stationaryRelativeSpeed: NaN },
      { stationaryRelativeSpeed: Infinity }, { [Symbol("configuration")]: 1 }];
    for (const [index, input] of invalid.entries())
      sameFailure(() => rust.createAspectPolicy(input as AspectPolicyInput),
        () => reference.createAspectPolicy(input as AspectPolicyInput), `policy case=${index}`);
  });

  it("validates every supplied row, including excluded rows, without accepting sparse or oversized arrays", () => {
    const configured = custom();
    const invalid: unknown[] = [null, {}, Array(1), Array(257).fill(position("A", 0)), [null], [new Date(0)],
      [position("A", 0), position("A", 1)], [position("A", 360)], [position("A", -Number.MIN_VALUE)],
      [position("A", NaN)], [position("A", Infinity)], [position("A", 0, Infinity)], [position("A", 0, NaN)],
      [position("Excluded", 0, NaN)], [{ body: "A", lon: 0 }], [{ body: "A", lon: 0, speed: null }],
      [{ body: "A", lon: "0", speed: 0 }], [position(" A", 0)], [position("", 0)],
      [{ ...position("A", 0), [Symbol("extra")]: 0 }]];
    for (const [index, rows] of invalid.entries())
      sameFailure(() => rust.findConfiguredAspects(rows as AspectPosition[], configured.actual),
        () => reference.findConfiguredAspects(rows as AspectPosition[], configured.expected), `row case=${index}`);
  });

  it("refuses accessor and hidden data slots without running caller getters", () => {
    let called = 0;
    const getter = () => { called++; return 0; };
    const configured = custom();
    const accessorPolicy = Object.defineProperty({}, "aspects", { enumerable: true, get: getter });
    const hiddenPolicy = Object.defineProperty({}, "bodies", { enumerable: false, value: [] });
    const accessorBodies = Object.defineProperty(["A"], "0", { get: getter });
    const accessorRule = Object.defineProperty({ type: "conjunction", orb: 1 }, "angle", { enumerable: true, get: getter });
    for (const input of [accessorPolicy, hiddenPolicy, { bodies: accessorBodies }, { bodies: Array(1) },
      { aspects: Array(1) }, { aspects: [accessorRule] }])
      sameFailure(() => rust.createAspectPolicy(input as AspectPolicyInput),
        () => reference.createAspectPolicy(input as AspectPolicyInput), "policy data slots");
    const accessorRow = Object.defineProperty({ body: "A", lon: 0 }, "speed", { enumerable: true, get: getter });
    const hiddenRow = Object.defineProperty({ body: "A", lon: 0 }, "speed", { enumerable: false, value: 0 });
    const accessorRows = Object.defineProperty([position("A", 0)], "0", { get: getter });
    for (const rows of [[accessorRow], [hiddenRow], accessorRows])
      sameFailure(() => rust.findConfiguredAspects(rows as AspectPosition[], configured.actual),
        () => reference.findConfiguredAspects(rows as AspectPosition[], configured.expected), "position data slots");
    expect(called).toBe(0);
  });
});
