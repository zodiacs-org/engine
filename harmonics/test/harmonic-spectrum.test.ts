import { afterEach, describe, expect, it, vi } from "vitest";
import * as matcher from "../../src/configured-aspects.js";
import { castChart } from "../src/engine.js";
import { harmonicSpectrum } from "../src/index.js";
import type { HarmonicAspectPosition, HarmonicSpectrumOptions } from "../src/index.js";

// All coordinates are invented. Expectations follow integer turn subtraction
// and dyadic fractions, with each derivation stated beside the case.
const pair = (lon: number, speed = 0): HarmonicAspectPosition[] => [
  { body: "A", lon: 0, speed: 0 }, { body: "B", lon, speed }
];
const policy = { bodies: ["A", "B"], aspects: [{ type: "conjunction", orb: 8 }] };
afterEach(() => vi.restoreAllMocks());

describe("harmonic strength spectrum", () => {
  it("ranks a hand-derived trisection and ties by ascending harmonic", () => {
    // N=3 and 6 turn 0,120,240 into 0,0,0: three exact pairs, sum=3,
    // capacity=3, score=1. N=1 and 2 have only 120-degree separations,
    // outside conjunction limits, so their scores are zero.
    const result = harmonicSpectrum([
      { body: "Sun", lon: 0, speed: 0 },
      { body: "Moon", lon: 120, speed: 0 },
      { body: "Mercury", lon: 240, speed: 0 }
    ], { harmonics: [6, 2, 3, 1] });
    expect(result.formula).toBe("weighted-linear-orb-falloff/v1");
    expect(result.harmonics).toEqual([1, 2, 3, 6]);
    expect(result.rows.map(({ harmonic, totalContribution, score }) => [harmonic, totalContribution, score]))
      .toEqual([[1, 0, 0], [2, 0, 0], [3, 3, 1], [6, 3, 1]]);
    expect(result.ranking.map(({ harmonic }) => harmonic)).toEqual([3, 6, 1, 2]);
    expect(result.possiblePairs).toBe(3);
    expect(result.weightCapacity).toBe(3);
    expect(result.rows[2]!.contributions.map(({ contribution }) => contribution)).toEqual([1, 1, 1]);
  });

  it("enumerates the default span and clips it to a smaller configured ceiling", () => {
    // Coincident coordinates remain coincident at every N: score=1.
    const points = [{ body: "Sun", lon: 0, speed: 0 }, { body: "Moon", lon: 0, speed: 0 }];
    const result = harmonicSpectrum(points);
    expect(result.harmonics).toEqual(Array.from({ length: 180 }, (_, i) => i + 1));
    expect(result.rows.every(({ score }) => score === 1)).toBe(true);
    expect(result.ranking.map(({ harmonic }) => harmonic)).toEqual(result.harmonics);
    expect(harmonicSpectrum(points, { maxHarmonic: 2 }).harmonics).toEqual([1, 2]);
    expect(harmonicSpectrum(points, { maxHarmonic: 720 }).harmonics).toEqual(result.harmonics);
    // .5*720=360 -> 0, an exact conjunction at an explicitly extended N.
    expect(harmonicSpectrum(pair(0.5), { maxHarmonic: 720, harmonics: [720], policy }).rows[0]!.score).toBe(1);
  });

  it("uses weights for all eligible pairs, including pairs that do not match", () => {
    // A=0,B=120,C=180. At N=2 only AC is conjunct; at N=3 only AB.
    // Weights A=1,B=3,C=1 give pair weights 3,1,3; capacity=7.
    const points = [...pair(120), { body: "C", lon: 180, speed: 0 }];
    const options = {
      harmonics: [1, 2, 3], policy: { ...policy, bodies: ["A", "B", "C"] }, bodyWeights: { B: 3 }
    };
    const result = harmonicSpectrum(points, options);
    expect(result.weightCapacity).toBe(7);
    expect(result.rows.map(({ totalContribution, score }) => [totalContribution, score]))
      .toEqual([[0, 0], [1, 1 / 7], [3, 3 / 7]]);
    expect(result.ranking.map(({ harmonic }) => harmonic)).toEqual([3, 2, 1]);
    expect(result.rows[2]!.contributions[0]).toMatchObject({
      aspect: { a: "A", b: "B", orb: 0 }, aWeight: 1, bWeight: 3,
      aspectWeight: 1, pairWeight: 3, closeness: 1, contribution: 3
    });
    // Swapping B,C weights reverses the emphasis: AC now has weight 3.
    expect(harmonicSpectrum(points, { ...options, bodyWeights: { C: 3 } }).ranking.map(({ harmonic }) => harmonic))
      .toEqual([2, 3, 1]);
  });

  it("uses the effective scaled limit in linear falloff", () => {
    // N=4 maps B=90.25 to 1 degree. Inverse limit=8/4=2:
    // closeness=1-1/2=1/2. Fixed limit=8: closeness=7/8.
    const inverse = harmonicSpectrum(pair(90.25), { harmonics: [4, 8], policy });
    expect(inverse.rows[0]!.contributions[0]).toMatchObject({
      aspect: { orb: 1, maximumOrb: 2 }, closeness: 0.5, contribution: 0.5
    });
    expect(inverse.rows.map(({ score }) => score)).toEqual([0.5, 0]);
    // N=8 maps B to 2, exceeding the inverse limit 1 but within fixed 8.
    const fixed = harmonicSpectrum(pair(90.25), { harmonics: [4, 8], policy, orbScaling: "fixed" });
    expect(fixed.rows.map(({ score }) => score)).toEqual([0.875, 0.75]);
  });

  it("keeps an inclusive boundary match with zero contribution", () => {
    // N=4: B=90.5 -> 2, limit=8/4=2, closeness=0.
    const run = (lon: number) => harmonicSpectrum(pair(lon), { harmonics: [4], policy }).rows[0]!;
    expect(run(90.5).contributions).toHaveLength(1);
    expect(run(90.5).contributions[0]).toMatchObject({ closeness: 0, contribution: 0 });
    expect(run(90.5).score).toBe(0);
    expect(run(90.5 + 2 ** -30).contributions).toEqual([]);
    // Just inside: orb=2-2^-28, closeness=2^-29.
    expect(run(90.5 - 2 ** -30).score).toBe(2 ** -29);
  });

  it("gives full weight to eligible zero-orb matches without division by zero", () => {
    // N=4: 90 -> 0 exactly, while 90.25 -> 1 is not eligible at orb=0.
    const settings = { harmonics: [4], policy: { ...policy, aspects: [{ type: "conjunction", orb: 0 }] } };
    const exact = harmonicSpectrum(pair(90), settings);
    expect(exact.rows[0]!.contributions[0]).toMatchObject({ closeness: 1, contribution: 1 });
    expect(exact.rows[0]!.score).toBe(1);
    expect(harmonicSpectrum(pair(90.25), settings).rows[0]!.score).toBe(0);
  });

  it("weights custom and major aspects against the largest configured aspect weight", () => {
    // B=20 at N=4 gives exact custom 80, and N=9 gives exact opposition.
    // Body weights 2 and 3 give 6. Aspect weights custom=4, opposition=1
    // give capacity=6*4=24, contributions 24 and 6, scores 1 and 1/4.
    const result = harmonicSpectrum(pair(20), {
      harmonics: [4, 9], bodyWeights: { A: 2, B: 3 },
      aspectWeights: { "custom-eighty": 4, opposition: 1 },
      policy: { bodies: ["A", "B"], aspects: [
        { type: "custom-eighty", angle: 80, orb: 0 }, { type: "opposition", orb: 0 }
      ] }
    });
    expect(result.weightCapacity).toBe(24);
    expect(result.rows.map(({ totalContribution, score }) => [totalContribution, score])).toEqual([[24, 1], [6, 0.25]]);
  });

  it("scores only the engine's chosen closest rule rather than optimizing by weight", () => {
    // Distance=5 ties angles 4 and 6; definition order chooses first.
    // Both limits are 2, so closeness=1/2. First weight=1, second=4:
    // contribution=1/2, capacity=4, score=1/8.
    const result = harmonicSpectrum(pair(5), {
      harmonics: [1], aspectWeights: { first: 1, second: 4 },
      policy: { bodies: ["A", "B"], aspects: [
        { type: "first", angle: 4, orb: 2 }, { type: "second", angle: 6, orb: 2 }
      ] }
    });
    expect(result.rows[0]!.contributions).toHaveLength(1);
    expect(result.rows[0]!.contributions[0]!.aspect.type).toBe("first");
    expect(result.rows[0]!.score).toBe(0.125);
  });

  it("uses luminary replacement, caps and the actual motion-specific limit", () => {
    // At N=4 Sun=0, B=90.25 -> 1. Rule=1 is replaced by luminary=16/4=4.
    // B caps become applying=8/4=2, separating=4/4=1, stationary=16/4=4.
    // The resulting scores are 1/2, 0, 3/4 for known speeds -1/4,+1/4,0.
    const settings = { harmonics: [4], policy: {
      bodies: ["Sun", "B"], aspects: [{ type: "conjunction", orb: 1, luminaryOrb: 16 }],
      bodyOrbs: { B: { applying: 8, separating: 4, stationary: 16 } }
    } };
    const run = (speed: number) => harmonicSpectrum([
      { body: "Sun", lon: 0, speed: 0 }, { body: "B", lon: 90.25, speed }
    ], settings).rows[0]!;
    expect(run(-0.25).score).toBe(0.5);
    expect(run(0.25).score).toBe(0);
    expect(run(0).score).toBe(0.75);
    expect(run(-0.25).contributions[0]!.aspect.motion).toBe("applying");
  });

  it("delegates each selected harmonic to the configured matcher", () => {
    const spy = vi.spyOn(matcher, "findConfiguredAspects");
    const result = harmonicSpectrum(pair(90), { harmonics: [4, 2], policy });
    expect(spy).toHaveBeenCalledTimes(2);
    result.rows.forEach((row, index) => {
      expect(row.aspectResult.analysis).toBe(spy.mock.results[index]!.value);
      expect(spy.mock.calls[index]![0]).toBe(row.aspectResult.harmonicChart.points);
      expect(spy.mock.calls[index]![1]).toBe(row.aspectResult.analysis.policy);
    });
  });

  it("distinguishes its conjunction default from an explicitly empty policy input", () => {
    // Sun=0,Moon=180: no default conjunction, but an exact opposition in
    // the engine's five-major-aspect policy selected by explicit {}.
    const points = [{ body: "Sun", lon: 0, speed: 0 }, { body: "Moon", lon: 180, speed: 0 }];
    expect(harmonicSpectrum(points, { harmonics: [1] }).rows[0]!.score).toBe(0);
    expect(harmonicSpectrum(points, { harmonics: [1], policy: {} }).rows[0]!.score).toBe(1);
    expect(harmonicSpectrum(pair(0), { harmonics: [1] }).possiblePairs).toBe(0);
  });

  it("returns zero scores for absent selected bodies, empty rules or zero weights", () => {
    for (const settings of [
      { ...policy, bodies: [] }, { ...policy, bodies: ["Absent"] }, { ...policy, aspects: [] }
    ]) {
      const result = harmonicSpectrum(pair(0), { harmonics: [1, 2], policy: settings });
      expect(result.weightCapacity).toBe(0);
      expect(result.rows.map(({ score }) => score)).toEqual([0, 0]);
    }
    for (const weights of [{ bodyWeights: { A: 0 } }, { aspectWeights: { conjunction: 0 } }]) {
      const result = harmonicSpectrum(pair(0), { harmonics: [1], policy, ...weights });
      expect(result.possiblePairs).toBe(1);
      expect(result.weightCapacity).toBe(0);
      expect(result.rows[0]!.score).toBe(0);
      expect(result.rows[0]!.contributions[0]!.contribution).toBe(0);
    }
    expect(harmonicSpectrum([pair(0)[0]!], { harmonics: [1], policy }).rows[0]!.score).toBe(0);
  });

  it("preserves arbitrary valid labels as own weight keys", () => {
    const result = harmonicSpectrum([
      { body: "__proto__", lon: 0, speed: 0 }, { body: "constructor", lon: 0, speed: 0 }
    ], { harmonics: [1], policy: { ...policy, bodies: ["__proto__", "constructor"] },
      bodyWeights: JSON.parse('{"__proto__":2,"constructor":3}') as Record<string, number> });
    expect(result.weightCapacity).toBe(6);
    expect(result.rows[0]!.score).toBe(1);
    expect(Object.hasOwn(result.weights.bodies, "__proto__")).toBe(true);
  });

  it("orders labels, summation and ranking deterministically across permutations", () => {
    // N=4 maps A=0,B=90.25,C=180.5 to 0,1,2. At limit 2,
    // AB and BC contribute 1/2, AC contributes 0; sum=1, capacity=3.
    const points = [...pair(90.25), { body: "C", lon: 180.5, speed: 0 }];
    const settings = { harmonics: [4, 2], policy: { ...policy, bodies: ["C", "B", "A"] } };
    const first = harmonicSpectrum(points, settings);
    const reversed = harmonicSpectrum([...points].reverse(), { ...settings, harmonics: [2, 4] });
    expect(JSON.stringify(first)).toBe(JSON.stringify(reversed));
    expect(first.rows[1]!.totalContribution).toBe(1);
    expect(first.rows[1]!.score).toBe(1 / 3);
    expect(first.rows[1]!.contributions.map(({ aspect }) => [aspect.a, aspect.b])).toEqual([
      ["A", "B"], ["A", "C"], ["B", "C"]
    ]);
  });

  it("handles the circular seam through the existing aspect wrapper", () => {
    // N=2 maps 179.75 and .25 to 359.5 and .5: seam distance=1.
    // Limit=8/2=4, closeness=3/4.
    const result = harmonicSpectrum([
      { body: "A", lon: 179.75, speed: 0 }, { body: "B", lon: 0.25, speed: 0 }
    ], { harmonics: [2], policy });
    expect(result.rows[0]!.score).toBe(0.75);
  });

  it("freezes all result data and snapshots caller settings", () => {
    const points = pair(90.25);
    const settings = { harmonics: [4], policy: { ...policy, bodies: ["A", "B"] }, bodyWeights: { A: 2 } };
    const result = harmonicSpectrum(points, settings);
    const snapshot = JSON.stringify(result);
    points[1] = { body: "C", lon: 0, speed: 1 };
    settings.harmonics[0] = 1;
    settings.policy.bodies[0] = "C";
    settings.bodyWeights.A = 4;
    expect(JSON.stringify(result)).toBe(snapshot);
    const checkFrozen = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(checkFrozen);
    };
    checkFrozen(result);
    expect(result.ranking[0]).toBe(result.rows[0]);
    expect(Object.hasOwn(result, "envelope")).toBe(false);
  });

  it("retains an engine receipt separately when analyzing cast source rows", () => {
    // Delegation and scope check only. No ephemeris values are pinned.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 }, { includeAngles: true });
    const receipt = JSON.stringify(source.envelope);
    const known = source.points.filter((point): point is HarmonicAspectPosition => point.speed !== undefined);
    const result = { source, spectrum: harmonicSpectrum(known, { harmonics: [1, 3] }) };
    expect(JSON.stringify(result.source.envelope)).toBe(receipt);
    expect(result.spectrum.rows.every((row) => row.aspectResult.harmonicChart.points.every((point) => point.body !== "Ascendant"))).toBe(true);
    expect(() => harmonicSpectrum(source.points as readonly HarmonicAspectPosition[], { harmonics: [1] })).toThrow(RangeError);
  });
});

describe("spectrum validation", () => {
  it.each([null, [], "options", { extra: true }, { harmonics: null }, { harmonics: [] },
    { harmonics: [1, 1] }, { harmonics: [0] }, { harmonics: [1.5] }, { harmonics: [181] },
    { harmonics: [Infinity] }, { harmonics: [NaN] }, { harmonics: ["1"] }, { harmonics: new Array(1) },
    { harmonics: [2], maxHarmonic: 1 }, { maxHarmonic: null }, { maxHarmonic: 0 },
    { orbScaling: null }, { orbScaling: "linear" }, { policy: null },
    { bodyWeights: null }, { bodyWeights: [] }, { bodyWeights: { Typo: 1 } },
    { aspectWeights: { opposition: 1 } }, { aspectWeights: { conjunction: undefined } }])(
    "rejects malformed selections or settings %j", (options) => {
      expect(() => harmonicSpectrum(pair(0), options as unknown as HarmonicSpectrumOptions)).toThrow(RangeError);
    }
  );

  it.each([-1, NaN, Infinity, "1", null, undefined, 1n])("rejects invalid body and aspect weight %s", (weight) => {
    for (const weights of [{ bodyWeights: { A: weight } }, { aspectWeights: { conjunction: weight } }]) {
      expect(() => harmonicSpectrum(pair(0), { harmonics: [1], policy, ...weights } as HarmonicSpectrumOptions)).toThrow(RangeError);
    }
  });

  it("rejects weight accessors, symbols and nonordinary objects", () => {
    let reads = 0;
    const accessor = { get A() { reads += 1; return 1; } };
    for (const bodyWeights of [accessor, new Date(), { [Symbol("A")]: 1 }]) {
      expect(() => harmonicSpectrum(pair(0), { harmonics: [1], policy, bodyWeights: bodyWeights as Record<string, number> })).toThrow(RangeError);
    }
    expect(reads).toBe(0);
  });

  it("rejects overflow in pair weights, capacities and sums", () => {
    for (const weights of [
      { bodyWeights: { A: Number.MAX_VALUE, B: 2 } },
      { bodyWeights: { A: Number.MAX_VALUE }, aspectWeights: { conjunction: 2 } }
    ]) {
      expect(() => harmonicSpectrum(pair(0), { harmonics: [1], policy, ...weights })).toThrow(RangeError);
    }
    const points = [...pair(0), { body: "C", lon: 0, speed: 0 }];
    expect(() => harmonicSpectrum(points, { harmonics: [1], policy: { ...policy, bodies: ["A", "B", "C"] },
      bodyWeights: { A: Number.MAX_VALUE / 2, B: 1, C: 2 } })).toThrow(RangeError);
  });

  it("retains the underlying row, speed and policy validation", () => {
    for (const points of [[], new Array(1), [null], pair(Infinity), [...pair(0), pair(1)[0]],
      [{ body: "A", lon: 0 }], [{ body: "A", lon: 0, speed: NaN }]]) {
      expect(() => harmonicSpectrum(points as readonly HarmonicAspectPosition[], { harmonics: [1], policy })).toThrow(RangeError);
    }
    expect(() => harmonicSpectrum(pair(0, Number.MAX_VALUE), { harmonics: [2], policy })).toThrow(RangeError);
    expect(() => harmonicSpectrum(pair(0), { harmonics: [2], policy: { ...policy, stationaryRelativeSpeed: Number.MAX_VALUE } })).toThrow(RangeError);
    expect(() => harmonicSpectrum(pair(0), { harmonics: [1], policy: { ...policy, aspects: [{ type: "conjunction", orb: -1 }] } })).toThrow(RangeError);
  });
});
