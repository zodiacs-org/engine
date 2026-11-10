import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SHARD_SCHEMA, SHARD_CONVENTIONS, SHARD_LIMITS, validateCoefficientShard,
  encodeCoefficientShard, decodeCoefficientShard, evaluateCoefficientShard,
  measureSegmentJoin, measureShardSeams, assertShardContinuity
} from "../src/coefficient-shard.ts";
import type { CoefficientShard, ShardDescriptor } from "../src/coefficient-shard.ts";
import { fitChebyshevSegment } from "../src/chebyshev.ts";
import type { CartesianTriple, ChebyshevSegment } from "../src/chebyshev.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const first: ChebyshevSegment = { startJdTt: 100, endJdTt: 102, coefficientsAu: [[1, 1], [3, -1], [5, 0]] };
const second: ChebyshevSegment = { startJdTt: 102, endJdTt: 104, coefficientsAu: [[3, 1], [1, -1], [5, 0]] };
function input(segments: readonly ChebyshevSegment[] = [first, second]): CoefficientShard {
  return {
    schema: SHARD_SCHEMA, body: "Chiron", conventions: SHARD_CONVENTIONS,
    provenance: {
      source: "analytic-test", sourceManifestSha256: hash("synthetic x=t-100; y=104-t; z=5"),
      generator: "analytic-test-v1", generatorSha256: hash("hand-derived linear Chebyshev coefficients")
    },
    validation: "unvalidated", segments
  };
}
function repin(text: string, original: ShardDescriptor): ShardDescriptor {
  return { ...original, sha256: hash(text), byteLength: Buffer.byteLength(text) };
}

describe("coefficient shard encoding and integrity", () => {
  it("round-trips exact coefficient numbers with an independently computed SHA-256", () => {
    const encoded = encodeCoefficientShard(input());
    expect(encoded.text.endsWith("\n")).toBe(true);
    expect(encoded.descriptor).toEqual({
      sha256: hash(encoded.text), byteLength: Buffer.byteLength(encoded.text), body: "Chiron",
      startJdTt: 100, endJdTt: 104, segmentCount: 2,
      sourceManifestSha256: input().provenance.sourceManifestSha256
    });
    const decoded = decodeCoefficientShard(encoded.text, encoded.descriptor);
    expect(decoded).toEqual(input());
    expect(encodeCoefficientShard(decoded)).toEqual(encoded);
    expect(Object.isFrozen(encoded)).toBe(true);
    expect(Object.isFrozen(encoded.descriptor)).toBe(true);
    expect(decoded.validation).toBe("unvalidated");
  });

  it("canonicalizes caller field order and negative zero, without mutating input", () => {
    const a = input([{ ...first, coefficientsAu: [[1, 1], [3, -1], [5, -0]] }]);
    const b = {
      segments: a.segments, validation: a.validation,
      provenance: { generatorSha256: a.provenance.generatorSha256, generator: a.provenance.generator,
        sourceManifestSha256: a.provenance.sourceManifestSha256, source: a.provenance.source },
      conventions: { ...a.conventions }, body: a.body, schema: a.schema
    };
    const encoded = encodeCoefficientShard(b);
    expect(encoded).toEqual(encodeCoefficientShard(input([first])));
    expect(Object.is(a.segments[0]!.coefficientsAu[2][1], -0)).toBe(true);
    expect(decodeCoefficientShard(encoded.text, encoded.descriptor)).toEqual(input([first]));
  });

  it("does not retain mutable caller objects after validation", () => {
    const mutable = structuredClone(input());
    const shard = validateCoefficientShard(mutable);
    (mutable.segments[0]!.coefficientsAu[0] as number[])[0] = 900;
    Object.assign(mutable.provenance, { source: "jpl-horizons" });
    expect(evaluateCoefficientShard(shard, 100).positionAu).toEqual([0, 4, 5]);
    expect(shard.provenance.source).toBe("analytic-test");
    expect(Object.isFrozen(shard)).toBe(true);
    expect(Object.isFrozen(shard.provenance)).toBe(true);
    expect(Object.isFrozen(shard.segments)).toBe(true);
    expect(Object.isFrozen(shard.segments[0]!.coefficientsAu[0])).toBe(true);
    expect(validateCoefficientShard(shard)).toBe(shard);
  });

  it("rejects changed bytes, missing pins and independently changed descriptor fields", () => {
    const { text, descriptor } = encodeCoefficientShard(input());
    expect(() => decodeCoefficientShard(text.replace("Chiron", "Pallas"), descriptor)).toThrow(/digest/);
    expect(() => decodeCoefficientShard(text, undefined as unknown as ShardDescriptor)).toThrow(RangeError);
    for (const patch of [
      { sha256: "0".repeat(64) }, { sha256: descriptor.sha256.toUpperCase() },
      { byteLength: descriptor.byteLength + 1 }, { body: "Ceres" },
      { startJdTt: 99 }, { endJdTt: 105 }, { segmentCount: 1 },
      { sourceManifestSha256: "0".repeat(64) }, { extra: true }
    ]) {
      expect(() => decodeCoefficientShard(text, { ...descriptor, ...patch } as ShardDescriptor)).toThrow(RangeError);
    }
  });

  it("rejects invalid or noncanonical JSON even when its external digest matches", () => {
    const { text, descriptor } = encodeCoefficientShard(input());
    for (const other of [
      "{", "null\n", "[]\n", text.trimEnd(), ` ${text}`,
      text.replace('"body":"Chiron"', '"body":"Ceres","body":"Chiron"'),
      text.replace('"startJdTt":100', '"startJdTt":1e2'),
      text.replace('"startJdTt":100', '"startJdTt":1e309')
    ]) {
      expect(() => decodeCoefficientShard(other, repin(other, descriptor))).toThrow(RangeError);
    }
  });

  it("enforces encoded size and segment caps without writing generated files", () => {
    const { descriptor } = encodeCoefficientShard(input());
    expect(SHARD_LIMITS.maxBytesExclusive).toBe(2_000_000);
    expect(SHARD_LIMITS.maxSegments).toBe(1024);
    const oversized = " ".repeat(SHARD_LIMITS.maxBytesExclusive);
    expect(() => decodeCoefficientShard(oversized, repin(oversized, descriptor))).toThrow(/file-size/);
    const multibyte = "é".repeat(SHARD_LIMITS.maxBytesExclusive / 2);
    expect(() => decodeCoefficientShard(multibyte, repin(multibyte, descriptor))).toThrow(/file-size/);
    expect(() => validateCoefficientShard(input(Array(SHARD_LIMITS.maxSegments + 1).fill(first)))).toThrow(/segment count/);
    const coefficients = Array.from({ length: 65 }, () => 0.12345678901234568);
    const large = input(Array.from({ length: SHARD_LIMITS.maxSegments }, (_, i) => ({
      startJdTt: 100 + i, endJdTt: 101 + i, coefficientsAu: [coefficients, coefficients, coefficients]
    })));
    expect(() => encodeCoefficientShard(large)).toThrow(/file-size/);
  });
});

describe("shard metadata validation", () => {
  it.each([
    null, [], {}, { ...input(), schema: "v2" }, { ...input(), body: "Pholus" },
    { ...input(), extra: true }, { ...input(), validation: "validated" },
    { ...input(), conventions: { ...SHARD_CONVENTIONS, timeScale: "tdb" } },
    { ...input(), conventions: { ...SHARD_CONVENTIONS, center: "500@10" } },
    { ...input(), conventions: { ...SHARD_CONVENTIONS, corrections: "NONE" } },
    { ...input(), conventions: { ...SHARD_CONVENTIONS, frame: "EQJ" } },
    { ...input(), provenance: { ...input().provenance, source: "unknown" } },
    { ...input(), provenance: { ...input().provenance, sourceManifestSha256: "bad" } },
    { ...input(), provenance: { ...input().provenance, generatorSha256: null } },
    { ...input(), provenance: { ...input().provenance, generator: "" } },
    { ...input(), provenance: { ...input().provenance, generator: "x".repeat(161) } },
    { ...input(), provenance: { ...input().provenance, generator: "hello\nworld" } },
    input([]), input([second, first]), input([first, first]),
    input([first, { ...second, startJdTt: 102.01 }]),
    input([first, { ...second, startJdTt: 101.99 }]),
    input(Array(2) as ChebyshevSegment[]),
    input([{ ...first, endJdTt: 100 }]),
    input([{ ...first, coefficientsAu: [[1, NaN], [3, -1], [5, 0]] }]),
    input([{ ...first, coefficientsAu: [[1, 1], [3], [5, 0]] }])
  ])("rejects malformed shard %#", (value) => {
    expect(() => validateCoefficientShard(value)).toThrow(RangeError);
  });

  it("rejects unknown segment fields instead of dropping provenance silently", () => {
    expect(() => validateCoefficientShard(input([{ ...first, unknown: true } as ChebyshevSegment]))).toThrow(/fields/);
  });

  it("rejects accessor fields and sparse slots without invoking caller getters", () => {
    let calls = 0;
    const getter = () => { calls++; return "Chiron"; };
    const bodyAccessor = Object.defineProperty(input(), "body", { enumerable: true, get: getter });
    expect(() => validateCoefficientShard(bodyAccessor)).toThrow(/data fields/);
    const sourceAccessor = input();
    Object.defineProperty(sourceAccessor.provenance, "source", { enumerable: true, get: getter });
    expect(() => validateCoefficientShard(sourceAccessor)).toThrow(/data fields/);
    const segments = [first, second];
    Object.defineProperty(segments, "0", { enumerable: true, get: getter });
    expect(() => validateCoefficientShard(input(segments))).toThrow(/array slots/);
    const limits = Object.defineProperty({ positionAu: 0, velocityAuPerDay: 0 }, "positionAu", {
      enumerable: true, get: getter
    });
    expect(() => assertShardContinuity(input(), limits)).toThrow(/data fields/);
    expect(calls).toBe(0);
    const symbolField = { ...input(), [Symbol("extra")]: true };
    expect(() => validateCoefficientShard(symbolField)).toThrow(/fields/);
    const hiddenField = Object.defineProperty(input(), "extra", { value: true, enumerable: false });
    expect(() => validateCoefficientShard(hiddenField)).toThrow(/fields/);
  });
});

describe("piecewise evaluation and seams", () => {
  it("matches a separately defined linear motion on both sides of the join", () => {
    const shard = validateCoefficientShard(input());
    for (const t of [100, 100.125, 101.99999999, 102, 102.00000001, 103.99999999]) {
      const actual = evaluateCoefficientShard(shard, t);
      expect(actual.positionAu).toEqual([t - 100, 104 - t, 5]);
      expect(actual.velocityAuPerDay).toEqual([1, -1, 0]);
      expect(actual.segmentIndex).toBe(t < 102 ? 0 : 1);
      expect(actual.jdTt).toBe(t);
    }
    expect(measureShardSeams(shard)).toEqual([{ jdTt: 102, positionAu: 0, velocityAuPerDay: 0 }]);
    expect(assertShardContinuity(shard, { positionAu: 0, velocityAuPerDay: 0 })).toEqual(measureShardSeams(shard));
    expect(measureShardSeams(input([first]))).toEqual([]);
  });

  it("selects the right segment at a seam and excludes the final endpoint", () => {
    const discontinuous = input([first, { ...second, coefficientsAu: [[4, 1], [1, -1], [5, 0]] }]);
    expect(evaluateCoefficientShard(discontinuous, 102).positionAu[0]).toBe(3);
    for (const t of [99, 99.99999999, 104, 104.00000001, NaN, Infinity, -Infinity, "101", null]) {
      expect(() => evaluateCoefficientShard(input(), t as number)).toThrow(/coverage/);
    }
    expect(measureSegmentJoin(first, second)).toEqual({ jdTt: 102, positionAu: 0, velocityAuPerDay: 0 });
    expect(() => measureSegmentJoin(first, { ...second, startJdTt: 102.01 })).toThrow(/adjacent/);
  });

  it("finds every segment in an irregular layout", () => {
    let edge = 100;
    const segments = Array.from({ length: 17 }, (_, i): ChebyshevSegment => {
      const startJdTt = edge;
      edge += (i + 1) / 2;
      return { startJdTt, endJdTt: edge, coefficientsAu: [[i], [0], [0]] };
    });
    const shard = validateCoefficientShard(input(segments));
    for (const [i, segment] of segments.entries()) {
      for (const t of [segment.startJdTt, (segment.startJdTt + segment.endJdTt) / 2, segment.endJdTt - 1e-8]) {
        const actual = evaluateCoefficientShard(shard, t);
        expect(actual.segmentIndex).toBe(i);
        expect(actual.positionAu).toEqual([i, 0, 0]);
      }
    }
    expect(() => evaluateCoefficientShard(shard, edge)).toThrow(/coverage/);
  });

  it("detects a velocity jump even when endpoint positions agree", () => {
    const shard = input([first, { ...second, coefficientsAu: [[4, 2], [1, -1], [5, 0]] }]);
    expect(measureShardSeams(shard)).toEqual([{ jdTt: 102, positionAu: 0, velocityAuPerDay: 1 }]);
    expect(() => assertShardContinuity(shard, { positionAu: 0, velocityAuPerDay: 0.99 })).toThrow(/discontinuity/);
    expect(assertShardContinuity(shard, { positionAu: 0, velocityAuPerDay: 1 })).toHaveLength(1);
    const step = input([first, { ...second, coefficientsAu: [[3.25, 1], [1, -1], [5, 0]] }]);
    expect(() => assertShardContinuity(step, { positionAu: 0.24, velocityAuPerDay: 0 })).toThrow(/discontinuity/);
  });

  it("requires finite, nonnegative and explicit seam limits", () => {
    for (const limits of [null, {}, { positionAu: -1, velocityAuPerDay: 0 },
      { positionAu: 0, velocityAuPerDay: Infinity }, { positionAu: NaN, velocityAuPerDay: 0 }]) {
      expect(() => assertShardContinuity(input(), limits as Parameters<typeof assertShardContinuity>[1])).toThrow(RangeError);
    }
  });

  it("fits, encodes and replays independent analytic positions and derivatives", () => {
    const start = 2451545;
    const position = (jd: number): CartesianTriple => {
      const t = jd - start;
      return [3 + Math.sin(t / 8), 2 * Math.cos(t / 8), 1 + t * t / 100];
    };
    const velocity = (jd: number): CartesianTriple => {
      const t = jd - start;
      return [Math.cos(t / 8) / 8, -Math.sin(t / 8) / 4, t / 50];
    };
    const segments = [0, 2].map((offset) => {
      const a = start + offset;
      const b = a + 2;
      // Rounded TT epochs intentionally differ from ideal Chebyshev nodes.
      const epochs = Array.from({ length: 20 }, (_, i) => Number((a + 1 - Math.cos(Math.PI * i / 19)).toFixed(9)));
      return fitChebyshevSegment({ startJdTt: a, endJdTt: b, degree: 12,
        samples: epochs.map((jdTt) => ({ jdTt, positionAu: position(jdTt) })) });
    });
    const encoded = encodeCoefficientShard({ ...input(segments), provenance: {
      ...input().provenance, sourceManifestSha256: hash(position.toString() + velocity.toString())
    } });
    const shard = decodeCoefficientShard(encoded.text, encoded.descriptor);
    for (const offset of [0, 0.0037, 0.387, 1.27631, 1.99999, 2, 2.00001, 3.493, 3.99999]) {
      const jd = start + offset;
      const actual = evaluateCoefficientShard(shard, jd);
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(actual.positionAu[axis]! - position(jd)[axis]!)).toBeLessThan(1e-11);
        expect(Math.abs(actual.velocityAuPerDay[axis]! - velocity(jd)[axis]!)).toBeLessThan(1e-10);
      }
    }
    assertShardContinuity(shard, { positionAu: 1e-11, velocityAuPerDay: 1e-10 });
    expect(encodeCoefficientShard(shard)).toEqual(encoded);
  });
});
