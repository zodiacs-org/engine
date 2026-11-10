import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import reference from '../references/horizons.json';
import cases from '../references/cases.json';
import { evaluateBasicRule, loadEngineRuntime, normalizeIntervals } from '../src/index.js';
import type { BasicRule, EventsCapability, EventsRuntime, RuleWindowResult } from '../src/index.js';

// Read-only relative import from the events worktree of this same repository.
// Never build or install there; an absent build leaves integration explicitly skipped.
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsPresent = false;
try { await access(eventsUrl); eventsPresent = true; }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function liveCapability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
interface Point { atMs: number; longitude: number }
interface Reducers {
  verify(file: URL): Promise<unknown>;
  crossings(points: readonly Point[], targets: readonly number[]): unknown;
  stations(points: readonly Point[]): unknown;
  reduce(responses: unknown): unknown;
}
const reducers = await import(new URL('../scripts/horizons.mjs', import.meta.url).href) as Reducers;

describe('independent reference acquisition and reduction', () => {
  it('verifies raw response hashes, clock, requests, coverage and golden reductions offline', async () => {
    expect(await reducers.verify(new URL('../references/horizons.json', import.meta.url))).toEqual(reference);
  });
  it('reduces wrapping crossings and a quadratic extremum by hand', () => {
    expect(reducers.crossings([{ atMs: 0, longitude: 359 }, { atMs: 100, longitude: 1 }], [0]))
      .toEqual([{ atMs: 50, targetDegrees: 0, direction: 'direct', referenceBracket: [0, 100] }]);
    expect(reducers.crossings([{ atMs: 0, longitude: 1 }, { atMs: 100, longitude: 359 }], [0]))
      .toEqual([{ atMs: 50, targetDegrees: 0, direction: 'retrograde', referenceBracket: [0, 100] }]);
    expect(reducers.crossings([{ atMs: 0, longitude: 179 }, { atMs: 100, longitude: 181 }], [0])).toEqual([]);
    // The parabola 100 + (t-200)^2 / 10000 has its minimum at t=200.
    expect(reducers.stations([0, 100, 200, 300, 400].map(atMs => ({ atMs, longitude: 100 + (atMs - 200) ** 2 / 10000 }))))
      .toEqual([{ atMs: 200, direction: 'direct', referenceBracket: [150, 250] }]);
  });
  it('rejects tampered provenance and incompatible request metadata', () => {
    for (const key of ['sha256', 'raw', 'url', 'parameters'] as const) {
      const copy = structuredClone(reference.responses);
      Object.assign(copy[0]!, { [key]: key === 'parameters' ? { ...copy[0]!.parameters, TIME_TYPE: "'UT'" } : 'tampered' });
      expect(() => reducers.reduce(copy)).toThrow();
    }
  });
});

function known(result: RuleWindowResult): asserts result is Extract<RuleWindowResult, { status: 'complete' | 'unresolved' }> {
  expect(['complete', 'unresolved']).toContain(result.status);
  if (result.status === 'refused') throw new Error(`Native rule refused: ${result.reason}`);
  expect(result.receipts.length).toBe(result.evaluations);
  expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
  expect(result.receipts.every(r => r.instants.every(i => i !== null && typeof i === 'object'))).toBe(true);
}
const names = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;

describe.runIf(eventsPresent)('native event delegation against independent Horizons dates', () => {
  it('assembles selected Moon sign windows over the independently referenced lunar cycle', async () => {
    const startMs = Date.parse('2023-10-01T00:00:00Z'), endMs = Date.parse('2023-11-01T00:00:00Z');
    const selected = ['taurus', 'cancer', 'libra', 'pisces'] as const;
    const rule: BasicRule = { id: 'moon-sign', kind: 'moon-sign', mode: 'require', options: { signs: selected } };
    const result = evaluateBasicRule(rule, { startMs, endMs, clock: 'tt' }, await loadEngineRuntime(), await liveCapability(),
      { stepMs: 21600000, maxEvaluations: 20000 });
    known(result);
    const actual = result.searches[0]!.events.filter(e => (e.atMs as number) >= startMs && (e.atMs as number) < endMs);
    expect(actual).toHaveLength(reference.events.ingress.length);
    reference.events.ingress.forEach((expected, i) => {
      expect(actual[i]?.direction).toBe(expected.direction);
      expect(actual[i]?.toSign?.toString().toLowerCase()).toBe(names[expected.targetDegrees / 30]);
      expect(Math.abs((actual[i]?.atMs as number) - expected.atMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
    });
    // Every selected span enters at its sign's reference and exits at the next ingress.
    // None of these selected signs owns the beginning/end of this reference month.
    const expected = reference.events.ingress.flatMap((event, i) => selected.includes(names[event.targetDegrees / 30]! as typeof selected[number])
      ? [{ startMs: event.atMs, endMs: reference.events.ingress[i + 1]?.atMs ?? endMs }] : []);
    expect(result.satisfied).toHaveLength(expected.length);
    expected.forEach((span, i) => {
      expect(Math.abs(result.satisfied[i]!.startMs - span.startMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
      expect(Math.abs(result.satisfied[i]!.endMs - span.endMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
    });
  });
  it('assembles New Moon and Full Moon sectors using independently paired longitudes', async () => {
    const startMs = Date.parse('2023-10-01T00:00:00Z'), endMs = Date.parse('2023-11-01T00:00:00Z');
    const rule: BasicRule = { id: 'phase', kind: 'moon-phase', mode: 'prefer', weight: 2, options: { phases: ['New Moon', 'Full Moon'] } };
    const result = evaluateBasicRule(rule, { startMs, endMs, clock: 'tt' }, await loadEngineRuntime(), await liveCapability(),
      { stepMs: 21600000, maxEvaluations: 20000 });
    known(result);
    const actual = result.searches[0]!.events.filter(e => (e.atMs as number) >= startMs && (e.atMs as number) < endMs);
    expect(actual).toHaveLength(reference.events.phase.length);
    reference.events.phase.forEach((expected, i) => {
      expect(actual[i]?.relativeLongitude).toBe(expected.targetDegrees);
      expect(Math.abs((actual[i]?.atMs as number) - expected.atMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
    });
    // Horizons begins this month in Full Moon. 202.5 exits it, 337.5 enters
    // New Moon, 22.5 exits New Moon, and 157.5 reenters Full Moon.
    const exits = reference.events.phase.filter(e => e.targetDegrees === 202.5);
    const newStart = reference.events.phase.find(e => e.targetDegrees === 337.5)!;
    const newEnd = reference.events.phase.find(e => e.targetDegrees === 22.5)!;
    const fullStart = reference.events.phase.find(e => e.targetDegrees === 157.5)!;
    const expected = [{ startMs, endMs: exits[0]!.atMs }, { startMs: newStart.atMs, endMs: newEnd.atMs },
      { startMs: fullStart.atMs, endMs: exits[1]!.atMs }];
    expect(result.satisfied).toHaveLength(expected.length);
    expected.forEach((span, i) => {
      expect(Math.abs(result.satisfied[i]!.startMs - span.startMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
      expect(Math.abs(result.satisfied[i]!.endMs - span.endMs)).toBeLessThanOrEqual(cases.crossingToleranceMs);
    });
  });
  it.each(reference.events.stations)('$id: direct windows respect the independent extremum', async event => {
    const series = cases.series.find(s => s.id === event.id)!;
    const startMs = Date.parse(`${series.start}T00:00:00Z`), endMs = Date.parse(`${series.end}T00:00:00Z`);
    const body = event.body as 'Mercury' | 'Venus';
    const result = evaluateBasicRule({ id: event.id, kind: 'direct-motion', mode: 'require', options: { bodies: [body] } },
      { startMs, endMs, clock: 'tt' }, await loadEngineRuntime(), await liveCapability(), { stepMs: 21600000, maxEvaluations: 2000 });
    known(result);
    expect(result.searches[0]!.events).toHaveLength(1);
    expect(result.searches[0]!.events[0]?.direction).toBe(event.direction);
    expect(Math.abs((result.searches[0]!.events[0]?.atMs as number) - event.atMs)).toBeLessThanOrEqual(cases.stationToleranceMs);
    expect(result.satisfied).toHaveLength(1);
    const edge = event.direction === 'direct' ? result.satisfied[0]!.startMs : result.satisfied[0]!.endMs;
    expect(Math.abs(edge - event.atMs)).toBeLessThanOrEqual(cases.stationToleranceMs);
    if (event.direction === 'direct') expect(result.satisfied[0]!.endMs).toBe(endMs);
    else expect(result.satisfied[0]!.startMs).toBe(startMs);
    expect(normalizeIntervals([...result.satisfied, ...result.failed, ...result.unresolved])).toEqual([{ startMs, endMs }]);
  });
});
