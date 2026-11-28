import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import reference from '../references/hour-cases.json';
import { evaluateHourRule, loadSkyRuntime } from '../src/index.js';

// Parse UT coordinate labels without relying on the host local timezone.
// Adding Z here encodes the numeric coordinate only; it does not convert the
// physical UT instant to UTC. No such coordinates enter the UTC evaluator.
const utCoordinate = (label: string): number => Date.parse(`${label}Z`);

describe('independent published USNO planetary-hour reference', () => {
  it('binds the published rise/set instants to the committed independent parent fixture', () => {
    const bytes = readFileSync(new URL(reference.sourceFixture, new URL('../references/hour-cases.json', import.meta.url)));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reference.sourceFixtureSha256);
    const table = JSON.parse(bytes.toString()) as { days: { date: string; latitude: number; longitude: number;
      url: string; events: [string, string, string][] }[] };
    const day = table.days.find(d => d.date === reference.date && d.latitude === reference.location.latitude && d.longitude === reference.location.longitude)!;
    expect(day.url).toBe(reference.sourceUrl);
    for (const [kind, instant] of [['rise', reference.publishedSunrise], ['set', reference.publishedSunset]]) {
      expect(day.events).toContainEqual(['Sun', kind, instant!.slice(11, 16)]);
    }
    expect(new Date(utCoordinate(reference.publishedSunrise)).getUTCDay()).toBe(5);
    expect((utCoordinate(reference.publishedSunset) - utCoordinate(reference.publishedSunrise)) / (12 * 60000)).toBe(reference.dayHourMinutes);
    expect(reference.referenceClock).toBe('ut'); expect(reference.comparisonClock).toBe('utc');
    expect(reference.selectedHourNumbers).toEqual([1, 8]);
    // Derive each reference boundary from the published minutes, independently
    // of the engine, and clip the first start to the declared range.
    const derived = reference.selectedHourNumbers.map(number => [
      new Date(Math.max(Date.parse(reference.range.start), utCoordinate(reference.publishedSunrise)
        + (number - 1) * reference.dayHourMinutes * 60000)).toISOString().replace('.000Z', ''),
      new Date(utCoordinate(reference.publishedSunrise) + number * reference.dayHourMinutes * 60000).toISOString().replace('.000Z', ''),
    ]);
    expect(derived).toEqual(reference.satisfied);
    expect(reference.boundaryAcceptanceMs).toBe(60000);
  });
  it('compares native selected windows with hand-reduced USNO ephemeris minutes', async () => {
    const result = evaluateHourRule({ id: 'published-hour', kind: 'planetary-hour', mode: 'require',
      options: { rulers: ['Venus'], utcOffsetMinutes: 0 } },
      { startMs: Date.parse(reference.range.start), endMs: Date.parse(reference.range.end), clock: 'utc' },
      reference.location, await loadSkyRuntime(), { maxEvaluations: 20, maxSamples: 10000 });
    expect(result.status).toBe('complete');
    expect(result.satisfied).toHaveLength(reference.satisfied.length);
    reference.satisfied.forEach(([start, end], index) => {
      expect(Math.abs(result.satisfied[index]!.startMs - utCoordinate(start!))).toBeLessThanOrEqual(reference.boundaryAcceptanceMs);
      expect(Math.abs(result.satisfied[index]!.endMs - utCoordinate(end!))).toBeLessThanOrEqual(reference.boundaryAcceptanceMs);
    });
    expect(result.days.find(d => d.date === reference.date)?.ruler).toBe(reference.ruler);
    expect(result.receipts.every(r => r.engine.ephemeris.version === '2.1.19')).toBe(true);
  });
});
