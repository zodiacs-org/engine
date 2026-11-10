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

// The arbiter is a finite set of integer points, not another interval algorithm.
// All subsets of [-3,3) are represented by bits, then supplied as unsorted unit
// spans with duplicates and empties. OR, AND and AND NOT determine expectations.
const firstPoint = -3;
const width = 6;
const setCount = 1 << width;
const fullMask = setCount - 1;
const domain: Interval = { startMs: firstPoint, endMs: firstPoint + width };

function intervalsFromMask(mask: number): Interval[] {
  const intervals: Interval[] = [{ startMs: 0, endMs: 0 }];
  for (let bit = width - 1; bit >= 0; bit--) {
    if ((mask & (1 << bit)) !== 0) {
      const span = { startMs: firstPoint + bit, endMs: firstPoint + bit + 1 };
      intervals.push(span);
      if (bit % 2 === 0) intervals.push({ ...span });
    }
  }
  return intervals;
}

function rawMembership(intervals: readonly Interval[], atMs: number): boolean {
  return intervals.some(({ startMs, endMs }) => startMs <= atMs && atMs < endMs);
}

function assertSet(intervals: readonly Interval[], expectedMask: number): void {
  let mask = 0;
  for (let bit = 0; bit < width; bit++) {
    if (rawMembership(intervals, firstPoint + bit)) mask |= 1 << bit;
  }
  expect(mask).toBe(expectedMask);
  // Results must be the unique canonical representation with no members outside
  // the domain, no empty spans, and a strict gap between consecutive spans.
  for (let index = 0; index < intervals.length; index++) {
    const span = intervals[index]!;
    expect(Number.isInteger(span.startMs)).toBe(true);
    expect(Number.isInteger(span.endMs)).toBe(true);
    expect(span.startMs).toBeGreaterThanOrEqual(domain.startMs);
    expect(span.endMs).toBeLessThanOrEqual(domain.endMs);
    expect(span.startMs).toBeLessThan(span.endMs);
    if (index > 0) expect(intervals[index - 1]!.endMs).toBeLessThan(span.startMs);
  }
}

describe('finite-set membership arbiter over synthetic milliseconds', () => {
  it('checks normalization, membership, clipping and complement for every subset', () => {
    for (let mask = 0; mask < setCount; mask++) {
      const input = intervalsFromMask(mask);
      assertSet(normalizeIntervals(input), mask);
      assertSet(clipIntervals(input, domain), mask);
      assertSet(complementIntervals(domain, input), fullMask ^ mask);
      for (let atMs = domain.startMs - 1; atMs <= domain.endMs; atMs++) {
        const expected = atMs >= domain.startMs && atMs < domain.endMs
          && (mask & (1 << (atMs - firstPoint))) !== 0;
        expect(containsInstant(input, atMs)).toBe(expected);
      }
      // Narrow every subset to every possible subdomain, including empty ones.
      for (let startMs = domain.startMs; startMs <= domain.endMs; startMs++) {
        for (let endMs = startMs; endMs <= domain.endMs; endMs++) {
          let domainMask = 0;
          for (let t = startMs; t < endMs; t++) domainMask |= 1 << (t - firstPoint);
          const subdomain = { startMs, endMs };
          assertSet(clipIntervals(input, subdomain), mask & domainMask);
          assertSet(complementIntervals(subdomain, input), domainMask & ~mask);
        }
      }
    }
  });

  it('checks union, intersection and subtraction for every ordered pair of subsets', () => {
    for (let leftMask = 0; leftMask < setCount; leftMask++) {
      const left = intervalsFromMask(leftMask);
      for (let rightMask = 0; rightMask < setCount; rightMask++) {
        const right = intervalsFromMask(rightMask);
        assertSet(unionIntervals(left, right), leftMask | rightMask);
        assertSet(intersectIntervals(left, right), leftMask & rightMask);
        assertSet(subtractIntervals(left, right), leftMask & ~rightMask);
      }
    }
  });
});
