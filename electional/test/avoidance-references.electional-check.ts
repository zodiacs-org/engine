import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import nasa from '../references/avoidance-nasa.json';
import cases from '../references/avoidance-cases.json';
import horizons from '../references/horizons.json';
import { containsInstant, evaluateAvoidanceRule, loadEngineRuntime, normalizeIntervals } from '../src/index.js';
import type { AvoidanceRule, AvoidanceRuleWindowResult, EventRecord, EventsCapability, EventsRuntime } from '../src/index.js';

interface Reducer {
  verify(file?: URL): Promise<unknown>;
  parseRow(row: string): { atMs: number; tdLabel: string; catalogType: string };
  selectedRow(html: string, catalogNumber: string): string;
  reduce(rows: unknown): unknown;
}
const reducer = await import(new URL('../scripts/avoidance-nasa.mjs', import.meta.url).href) as Reducer;
const DAY = 86400000;
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function nativeCapability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
function usable(result: AvoidanceRuleWindowResult): EventRecord {
  expect(['complete', 'unresolved']).toContain(result.status);
  expect(result.searches).toHaveLength(1); expect(result.searches[0]?.events).toHaveLength(1);
  expect(result.receipts).toHaveLength(result.evaluations);
  expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
  expect(result.searches[0]?.sourceWindow?.clock).toBe('tt');
  expect(normalizeIntervals([...result.satisfied, ...result.failed, ...result.unresolved]))
    .toEqual([{ startMs: result.window.startMs, endMs: result.window.endMs }]);
  return result.searches[0]!.events[0]!;
}
describe('independent NASA avoidance reference reduction', () => {
  it('reproduces all selected rows, clocks, configuration, provenance and digests offline', async () => {
    expect(await reducer.verify()).toEqual(nasa);
  });
  it('derives epoch, leap-day and explicit TT labels without engine calculations', () => {
    expect(reducer.parseRow('00001 1970 Jan 01 00:00:00 0 0 1 P')).toMatchObject({ atMs: 0, tdLabel: '1970-01-01T00:00:00' });
    expect(reducer.parseRow('00001 2000 Feb 29 12:00:00 0 0 1 P').atMs).toBe(951825600000);
    for (const row of ['00001 1900 Feb 29 12:00:00 0 0 1 P', '00001 2000 Feb 30 12:00:00 0 0 1 P',
      '00001 2000 Feb 29 24:00:00 0 0 1 P', '00001 2000 Feb 29 00:60:00 0 0 1 P',
      '00001 2000 Feb 29 00:00:60 0 0 1 P', '00001 2000 Foo 01 00:00:00 0 0 1 P']) expect(() => reducer.parseRow(row)).toThrow();
  });
  it('extracts normalized HTML table rows and rejects missing or duplicate identifiers', () => {
    const row = nasa.rows[0]!.row;
    const html = `<pre>\n<a href="#">09560</a>   ${row.slice(6)}\n</pre>`;
    expect(reducer.selectedRow(html, '09560')).toBe(row);
    expect(() => reducer.selectedRow(html, '00001')).toThrow();
    expect(() => reducer.selectedRow(`${html}\n${html}`, '09560')).toThrow();
  });
  it('rejects row, clock, source, selection and date tampering', async () => {
    for (const patch of [{ row: nasa.rows[0]!.row.replace('18:00:41', '18:00:42') }, { url: 'untrusted-source' }, { kind: 'lunar' }]) {
      const rows = structuredClone(nasa.rows); Object.assign(rows[0]!, patch);
      expect(() => reducer.reduce(rows)).toThrow();
    }
    const directory = await mkdtemp(fileURLToPath(new URL('../generated/m8-reference-test-', import.meta.url)));
    try {
      const path = `${directory}/reference.json`;
      for (const patch of [{ clock: 'utc' }, { attribution: 'missing' }, { selection: {} }, { retrievedAt: 'invalid' },
        { pages: { ...nasa.pages, time: { ...nasa.pages.time, sha256: 'invalid' } } }]) {
        await writeFile(path, JSON.stringify({ ...nasa, ...patch }));
        await expect(reducer.verify(new URL(`file://${path}`))).rejects.toThrow();
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe.runIf(present)('independent NASA eclipse avoidance comparison', () => {
  it.each(nasa.events)('$kind $date: excludes the declared margin around the published greatest eclipse', async reference => {
    const dateMs = Date.parse(`${reference.date}T00:00:00Z`); // Calendar arithmetic for TT labels, never UTC conversion.
    const domain = { startMs: dateMs - 2 * DAY, endMs: dateMs + 3 * DAY, clock: 'tt' as const };
    const rule: AvoidanceRule = { id: `nasa-${reference.catalogNumber}`, kind: 'avoid-eclipses', mode: 'require',
      options: { kinds: [reference.kind as 'solar' | 'lunar'], withinDays: cases.withinDays } };
    const result = evaluateAvoidanceRule(rule, domain, await loadEngineRuntime(), await nativeCapability(), {
      stepMs: cases.options.stepMs, maxEvaluations: 10000,
      eclipse: { derivativeStepMs: cases.options.derivativeStepMs, model: {
        sunRadiusAu: cases.radiusKm.sun / cases.auKm, moonRadiusAu: cases.radiusKm.moon / cases.auKm,
        earthRadiusAu: cases.radiusKm.earth / cases.auKm } },
    });
    const event = usable(result);
    expect(Math.abs((event.atMs as number) - reference.atMs)).toBeLessThanOrEqual(cases.eclipseToleranceMs);
    expect(event.classification).toBe(cases.cases.find(c => c.catalogNumber === reference.catalogNumber)!.classification);
    const expected = { startMs: reference.atMs - DAY, endMs: reference.atMs + DAY + 1 };
    expect(result.failed).toHaveLength(1); expect(result.satisfied).toHaveLength(2);
    expect(Math.abs(result.failed[0]!.startMs - expected.startMs)).toBeLessThanOrEqual(cases.eclipseToleranceMs);
    expect(Math.abs(result.failed[0]!.endMs - expected.endMs)).toBeLessThanOrEqual(cases.eclipseToleranceMs);
    expect(Math.abs(result.satisfied[0]!.endMs - expected.startMs)).toBeLessThanOrEqual(cases.eclipseToleranceMs);
    expect(Math.abs(result.satisfied[1]!.startMs - expected.endMs)).toBeLessThanOrEqual(cases.eclipseToleranceMs);
    expect(containsInstant(result.failed, reference.atMs)).toBe(true);
  });
});
describe.runIf(present)('independent Horizons station avoidance comparison', () => {
  it.each(horizons.events.stations)('$id: excludes both sides of the independent longitude extremum', async reference => {
    const result = evaluateAvoidanceRule({ id: reference.id, kind: 'avoid-stations', mode: 'require',
      options: { bodies: [reference.body as 'Mercury' | 'Venus'], withinDays: cases.withinDays } },
      { startMs: reference.atMs - 2 * DAY, endMs: reference.atMs + 2 * DAY, clock: 'tt' },
      await loadEngineRuntime(), await nativeCapability(), { stepMs: cases.options.stepMs, maxEvaluations: 3000 });
    const event = usable(result);
    expect(event.body).toBe(reference.body); expect(event.direction).toBe(reference.direction);
    expect(Math.abs((event.atMs as number) - reference.atMs)).toBeLessThanOrEqual(cases.stationToleranceMs);
    expect(result.failed).toHaveLength(1); expect(result.satisfied).toHaveLength(2);
    expect(Math.abs(result.failed[0]!.startMs - (reference.atMs - DAY))).toBeLessThanOrEqual(cases.stationToleranceMs);
    expect(Math.abs(result.failed[0]!.endMs - (reference.atMs + DAY + 1))).toBeLessThanOrEqual(cases.stationToleranceMs);
    expect(Math.abs(result.satisfied[0]!.endMs - (reference.atMs - DAY))).toBeLessThanOrEqual(cases.stationToleranceMs);
    expect(Math.abs(result.satisfied[1]!.startMs - (reference.atMs + DAY + 1))).toBeLessThanOrEqual(cases.stationToleranceMs);
  });
  it.each(['before', 'after'] as const)('%s: retains the margin of a station outside the requested window', async side => {
    const reference = horizons.events.stations[0]!;
    const domain = side === 'before' ? { startMs: reference.atMs - 2 * DAY, endMs: reference.atMs - DAY / 2, clock: 'tt' as const }
      : { startMs: reference.atMs + DAY / 2, endMs: reference.atMs + 2 * DAY, clock: 'tt' as const };
    const result = evaluateAvoidanceRule({ id: 'padded-horizons', kind: 'avoid-stations', mode: 'require',
      options: { bodies: [reference.body as 'Mercury'], withinDays: cases.withinDays } }, domain,
      await loadEngineRuntime(), await nativeCapability(), { stepMs: cases.options.stepMs, maxEvaluations: 3000 });
    const event = usable(result);
    expect((event.atMs as number) >= domain.startMs && (event.atMs as number) < domain.endMs).toBe(false);
    expect(result.failed).toHaveLength(1); expect(result.satisfied).toHaveLength(1);
    if (side === 'before') {
      expect(result.failed[0]!.endMs).toBe(domain.endMs);
      expect(Math.abs(result.failed[0]!.startMs - (reference.atMs - DAY))).toBeLessThanOrEqual(cases.stationToleranceMs);
    } else {
      expect(result.failed[0]!.startMs).toBe(domain.startMs);
      expect(Math.abs(result.failed[0]!.endMs - (reference.atMs + DAY + 1))).toBeLessThanOrEqual(cases.stationToleranceMs);
    }
  });
});
