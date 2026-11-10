import { describe, expect, it } from 'vitest';
import {
  clipIntervals,
  complementIntervals,
  containsInstant,
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  unionIntervals,
} from '../src/index.js';
import type { Interval } from '../src/index.js';
import golden from './fixtures/intervals.json';

const binaryOperations = [unionIntervals, intersectIntervals, subtractIntervals];

describe('hand-derived interval golden fixtures', () => {
  for (const fixture of golden.normalization) {
    it(`normalize: ${fixture.id}`, () => {
      expect(normalizeIntervals(fixture.input), fixture.derivation).toEqual(fixture.expected);
    });
  }

  for (const fixture of golden.binary) {
    it(`sets: ${fixture.id}`, () => {
      expect(unionIntervals(fixture.left, fixture.right), fixture.derivation).toEqual(fixture.union);
      expect(intersectIntervals(fixture.left, fixture.right), fixture.derivation)
        .toEqual(fixture.intersection);
      expect(subtractIntervals(fixture.left, fixture.right), fixture.derivation)
        .toEqual(fixture.difference);
    });
  }

  for (const fixture of golden.domain) {
    it(`domain: ${fixture.id}`, () => {
      expect(clipIntervals(fixture.input, fixture.domain), fixture.derivation).toEqual(fixture.clip);
      expect(complementIntervals(fixture.domain, fixture.input), fixture.derivation)
        .toEqual(fixture.complement);
    });
  }

  it('owns starts and excludes ends, including empty spans', () => {
    for (const check of golden.membership.checks) {
      expect(containsInstant(golden.membership.input, check.atMs), golden.membership.derivation)
        .toBe(check.expected);
    }
  });
});

describe('runtime input boundaries', () => {
  // These deliberately bypass TypeScript to model unvalidated external data.
  const invalidEndpoints: unknown[] = [
    NaN, Infinity, -Infinity, 0.5, -0.5,
    8_640_000_000_000_001, -8_640_000_000_000_001,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
    undefined, null, '0', false, 0n, Symbol('invalid'), new Date(0),
  ];

  it('refuses noninteger, nonnumeric, unsafe or unrepresentable endpoints and instants', () => {
    for (const value of invalidEndpoints) {
      expect(() => normalizeIntervals([{ startMs: value, endMs: 0 }] as Interval[]))
        .toThrow(RangeError);
      expect(() => normalizeIntervals([{ startMs: 0, endMs: value }] as Interval[]))
        .toThrow(RangeError);
      expect(() => containsInstant([], value as number)).toThrow(RangeError);
    }
  });

  const invalidCollections: unknown[] = [
    null, undefined, {}, 'intervals', new Set(),
    [null], [undefined], [{}], [0], ['0'], [[0, 1]],
    [{ startMs: 0 }], [{ endMs: 1 }],
    [{ startMs: 2, endMs: 1 }],
    [{ startMs: 0, endMs: 0.5 }],
    new Array(1),
    [{ startMs: 0, endMs: 1 }, , { startMs: 2, endMs: 3 }],
  ];

  it('validates the entire input even when the other operand is empty', () => {
    for (const value of invalidCollections) {
      const intervals = value as readonly Interval[];
      expect(() => normalizeIntervals(intervals)).toThrow(RangeError);
      expect(() => containsInstant(intervals, 0)).toThrow(RangeError);
      for (const operation of binaryOperations) {
        expect(() => operation(intervals, [])).toThrow(RangeError);
        expect(() => operation([], intervals)).toThrow(RangeError);
      }
      const empty = { startMs: 0, endMs: 0 };
      expect(() => clipIntervals(intervals, empty)).toThrow(RangeError);
      expect(() => complementIntervals(empty, intervals)).toThrow(RangeError);
    }
  });

  it('validates the declared domain even with no input windows', () => {
    const invalidDomains: unknown[] = [null, undefined, {}, { startMs: 1, endMs: 0 }];
    for (const value of invalidEndpoints) {
      invalidDomains.push({ startMs: value, endMs: 0 }, { startMs: 0, endMs: value });
    }
    for (const domain of invalidDomains) {
      expect(() => clipIntervals([], domain as Interval)).toThrow(RangeError);
      expect(() => complementIntervals(domain as Interval, [])).toThrow(RangeError);
    }
  });

  it('preserves exact ownership at both Date limits without endpoint shifts', () => {
    const limit = 8_640_000_000_000_000;
    const domain = { startMs: -limit, endMs: limit };
    const edges = [
      { startMs: limit - 1, endMs: limit },
      { startMs: -limit, endMs: -limit + 1 },
    ];
    expect(normalizeIntervals(edges)).toEqual([...edges].reverse());
    expect(clipIntervals(edges, domain)).toEqual([...edges].reverse());
    expect(complementIntervals(domain, edges))
      .toEqual([{ startMs: -limit + 1, endMs: limit - 1 }]);
    expect(containsInstant(edges, -limit)).toBe(true);
    expect(containsInstant(edges, -limit + 1)).toBe(false);
    expect(containsInstant(edges, limit - 1)).toBe(true);
    expect(containsInstant(edges, limit)).toBe(false);
    expect(unionIntervals(edges, [{ startMs: -limit + 1, endMs: limit - 1 }]))
      .toEqual([domain]);
    expect(subtractIntervals([domain], edges))
      .toEqual([{ startMs: -limit + 1, endMs: limit - 1 }]);
    expect(normalizeIntervals([
      { startMs: -limit, endMs: -limit }, { startMs: limit, endMs: limit },
    ])).toEqual([]);
  });
});

describe('independent immutable results', () => {
  it('copies and freezes every result without sorting or freezing caller data', () => {
    const input = [{ startMs: 5, endMs: 8 }, { startMs: 0, endMs: 3 }];
    const original = structuredClone(input);
    const domain = { startMs: -1, endMs: 10 };
    const results = [
      normalizeIntervals(input),
      unionIntervals(input, []),
      intersectIntervals(input, [domain]),
      subtractIntervals(input, []),
      clipIntervals(input, domain),
      complementIntervals(domain, input),
    ];
    expect(input).toEqual(original);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(domain)).toBe(false);
    for (const result of results) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(Reflect.set(result, '0', domain)).toBe(false);
      for (const interval of result) {
        expect(Object.isFrozen(interval)).toBe(true);
        expect(input).not.toContain(interval);
        expect(interval).not.toBe(domain);
        expect(Reflect.set(interval, 'endMs', 100)).toBe(false);
      }
    }
    const snapshots = structuredClone(results);
    input[0]!.startMs = 6;
    input.push({ startMs: 100, endMs: 200 });
    domain.endMs = 20;
    expect(results).toEqual(snapshots);
  });

  it('freezes empty results too', () => {
    const emptyDomain = { startMs: 0, endMs: 0 };
    const results = [
      normalizeIntervals([]), unionIntervals([], []), intersectIntervals([], []),
      subtractIntervals([], []), clipIntervals([], emptyDomain),
      complementIntervals(emptyDomain, []),
    ];
    for (const result of results) {
      expect(result).toEqual([]);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });
});
