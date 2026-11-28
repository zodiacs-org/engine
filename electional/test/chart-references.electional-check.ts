import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import cases from '../references/chart-cases.json';
import reference from '../references/chart-horizons.json';
import { containsInstant, evaluateChartRule, loadChartRuntime } from '../src/index.js';
import type { ChartRule, EventsCapability, EventsRuntime, Interval } from '../src/index.js';

const reducer = await import(new URL('../scripts/chart-horizons.mjs', import.meta.url).href) as {
  verify(): Promise<unknown>;
  applyingWindows(points: readonly { atMs: number; longitude: number }[], orb: number,
    domain: Interval): readonly Interval[];
};
describe('independent applying reference reduction', () => {
  it('checks stored input digests and reproduces every independent window offline', async () => {
    expect(await reducer.verify()).toEqual(reference);
  });
  it('reduces an invented direct relative passage and wrapping conjunction by hand', () => {
    expect(reducer.applyingWindows([{ atMs: 0, longitude: 50 }, { atMs: 20, longitude: 70 }], 5,
      { startMs: 0, endMs: 20 })).toEqual([{ startMs: 5, endMs: 10 }]);
    expect(reducer.applyingWindows([{ atMs: 0, longitude: 350 }, { atMs: 20, longitude: 10 }], 5,
      { startMs: 0, endMs: 20 })).toEqual([{ startMs: 5, endMs: 10 }]);
  });
  it('rejects an independent series outside its direct-motion reduction convention', () => {
    expect(() => reducer.applyingWindows([{ atMs: 0, longitude: 60 }, { atMs: 20, longitude: 50 }], 5,
      { startMs: 0, endMs: 20 })).toThrow('strictly direct');
  });
});
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function capability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
describe.runIf(present)('independent Horizons applying-window comparison', () => {
  it.each(['any', 'all'] as const)('Moon applying to %s selected targets on the reference TT span', async match => {
    const rule: ChartRule = { id: 'reference-applying', kind: 'applying-aspect', mode: 'require',
      options: { body: 'Moon', targets: ['Sun', 'Jupiter'], aspects: ['conjunction', 'sextile', 'square', 'trine', 'opposition'],
        maxOrbDegrees: cases.maxOrbDegrees, match } };
    const result = evaluateChartRule(rule, { ...cases.range, clock: 'tt' }, { latitude: 0, longitude: 0 }, 'whole',
      await loadChartRuntime(), await capability(), { stepMs: 21600000, maxEvaluations: 50000 });
    expect(['complete', 'unresolved']).toContain(result.status);
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
    expect(result.searches.every(s => s.sourceWindow.clock === 'tt')).toBe(true);
    const expected = reference[match], tol = cases.boundaryToleranceMs;
    // Compare independently computed Boolean membership away from all source
    // boundaries. A composed any interval can contain a root of the other
    // target, so avoid per-target edges as well as composed set edges.
    const edges = reference.perTarget.flatMap(t => t.windows.flatMap(s => [s.startMs, s.endMs]));
    for (let t = cases.range.startMs; t < cases.range.endMs; t += 1800000) {
      if (edges.some(edge => Math.abs(edge - t) <= tol)) continue;
      expect(containsInstant(result.unresolved, t)).toBe(false);
      expect(containsInstant(result.satisfied, t), `TT label ${t}`).toBe(containsInstant(expected, t));
    }
    for (const span of expected) {
      expect(containsInstant(result.satisfied, Math.floor((span.startMs + span.endMs) / 2))).toBe(true);
      expect(result.satisfied.some(s => Math.abs(s.startMs - span.startMs) <= tol)).toBe(true);
      expect(result.satisfied.some(s => Math.abs(s.endMs - span.endMs) <= tol)).toBe(true);
    }
    for (const actual of result.satisfied) {
      expect(expected.some(s => actual.startMs >= s.startMs - tol && actual.endMs <= s.endMs + tol)).toBe(true);
    }
  }, 30000);
});
