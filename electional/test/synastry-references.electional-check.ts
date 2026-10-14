import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import cases from '../references/synastry-cases.json';
import reference from '../references/synastry-horizons.json';
import { containsInstant, evaluateSynastryRule, loadSynastryRuntime } from '../src/index.js';
import type { EventsCapability, EventsRuntime, Interval, SynastryRule, SyntheticNatal } from '../src/index.js';
const reducer = await import(new URL('../scripts/synastry-horizons.mjs', import.meta.url).href) as {
  verify(file?: URL): Promise<unknown>;
  fixedWindows(points: readonly { atMs: number; longitude: number }[], fixed: number,
    aspects: readonly { angle: number; nativeLuminaryOrb: number }[], cap: number, domain: Interval): readonly Interval[];
};
describe('independent fixed-natal reference reduction', () => {
  it('verifies the raw digests, applicable leap row, natal clock arithmetic and reduced windows offline', async () => {
    expect(await reducer.verify()).toEqual(reference);
    expect(reference.all.length).toBeGreaterThan(0);
    expect(Date.parse(cases.natal.instant) + cases.natalTtMinusUtcMs).toBe(cases.natalTtMs);
  });
  it('reduces an invented wrapping transit independently and caps the native orb', () => {
    const points = [{ atMs: 0, longitude: 350 }, { atMs: 20, longitude: 10 }];
    const aspect = [{ angle: 0, nativeLuminaryOrb: 5 }];
    // Reference interpolation is continuous; exact singleton millisecond
    // ownership is tested by the separate hand-derived integer fixture.
    expect(reducer.fixedWindows(points, 0, aspect, 10, { startMs: 0, endMs: 20 })).toEqual([{ startMs: 5, endMs: 15 }]);
    expect(reducer.fixedWindows(points, 0, aspect, 2, { startMs: 0, endMs: 20 })).toEqual([{ startMs: 8, endMs: 12 }]);
  });
});
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function capability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
describe.runIf(present)('independent Horizons fixed-natal synastry comparison', () => {
  it.each(['any', 'all'] as const)('Moon to %s selected synthetic natal pairs on the reference TT span', async match => {
    const rule: SynastryRule = { id: 'reference-synastry', kind: 'synastry-aspect', mode: 'require', options: {
      movingBodies: ['Moon'], natalBodies: ['Sun', 'Jupiter'], aspects: ['sextile', 'square', 'trine'], maxOrbDegrees: cases.maxOrbDegrees, match,
    } };
    const result = evaluateSynastryRule(rule, { ...cases.range, clock: 'tt' }, cases.natal as SyntheticNatal,
      await loadSynastryRuntime(), await capability(), { maxEvaluations: 50000, stepMs: 21600000 });
    expect(['complete', 'unresolved']).toContain(result.status);
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.natal?.clock).toBe('utc'); expect(result.natal?.receipt.instants[0]).toMatchObject({ timeScale: { input: 'utc' } });
    expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
    expect(result.searches.every(s => s.sourceWindow.clock === 'tt')).toBe(true);
    expect(result.policy.pairs.every(p => p.aspects.map(a => a.effectiveOrbDegrees).join(',') === '5,6,6')).toBe(true);
    const tolerance = cases.boundaryToleranceMs, expected = reference[match];
    const edges = reference.perTarget.flatMap(pair => pair.windows.flatMap(s => [s.startMs, s.endMs]));
    for (let t = cases.range.startMs; t < cases.range.endMs; t += 1800000) {
      if (edges.some(edge => Math.abs(edge - t) <= tolerance)) continue;
      expect(containsInstant(result.unresolved, t), `TT label ${t}`).toBe(false);
      expect(containsInstant(result.satisfied, t), `TT label ${t}`).toBe(containsInstant(expected, t));
    }
    for (const span of expected) {
      expect(containsInstant(result.satisfied, Math.floor((span.startMs + span.endMs) / 2))).toBe(true);
      expect(result.satisfied.some(s => Math.abs(s.startMs - span.startMs) <= tolerance)).toBe(true);
      expect(result.satisfied.some(s => Math.abs(s.endMs - span.endMs) <= tolerance)).toBe(true);
    }
    for (const span of result.satisfied) expect(expected.some(s => span.startMs >= s.startMs - tolerance && span.endMs <= s.endMs + tolerance)).toBe(true);
  }, 30000);
});
