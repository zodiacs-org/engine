import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadSearchDependencies, searchElectional, containsInstant } from '../src/index.js';
import type { EngineReceipt, EngineRuntime, EventsCapability, EventsRuntime, RuleSet, SearchOptions } from '../src/index.js';
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function capability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
const options: SearchOptions = { stepMs: 100, lookaheadMs: 0, maxEvaluations: 10000, maxSkySamples: 10000 };
const contractReceipt: EngineReceipt = { schema: 'hand-derived-native-composition', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['invented-linear-equations;not-an-astronomical-ephemeris'],
  engine: { name: 'linear-test-function', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };
const linear: EngineRuntime = { calc(request) {
  if (!(request.time instanceof Date)) throw new Error('Expected explicit UTC labels.');
  const ms = request.time.getTime(), rate = request.body === 'Moon' ? 0.1 : request.body === 'Sun' ? 0 : 0.01;
  return { status: 'ok', lon: ((ms * rate % 360) + 360) % 360, lat: 0, bounds: {},
    speeds: request.flags.speeds ? { lon: rate * 86400000 } : null, receipt: contractReceipt };
} };
const config: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic interval integration', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: '1970-01-01T00:00:00Z', end: '1970-01-01T00:00:01Z', clock: 'utc' }, rules: [
    { id: 'hard-sign', kind: 'moon-sign', mode: 'require', options: { signs: ['taurus'] } },
    { id: 'hard-direct', kind: 'direct-motion', mode: 'require', options: { bodies: ['Mercury', 'Venus'] } },
    { id: 'phase-preference', kind: 'moon-phase', mode: 'prefer', weight: 5, options: { phases: ['Waxing Crescent'] } },
  ] };
describe('search capability loading', () => {
  it('loads existing engine bridges and records missing local events without side effects', async () => {
    const dependencies = await loadSearchDependencies();
    expect(typeof dependencies.engine.calc).toBe('function'); expect(typeof dependencies.chart?.birthWindow).toBe('function');
    expect(typeof dependencies.sky?.planetaryHours).toBe('function'); expect(typeof dependencies.synastry?.findInterAspects).toBe('function');
    expect(['available', 'missing']).toContain(dependencies.events.status);
  });
  it('retains a real missing-events refusal with no invented engine receipts', async () => {
    const dependencies = await loadSearchDependencies();
    const found = searchElectional(config, { ...dependencies, events: { status: 'missing' } }, options);
    expect(found).toMatchObject({ status: 'refused', windows: [], evaluations: 0, receipts: [] });
    expect(found.ruleResults.every(r => r.status === 'refused' && r.reason === 'missing-capability')).toBe(true);
    expect(found.unresolvedRequired).toEqual([{ startMs: 0, endMs: 1000 }]);
  });
});
describe.runIf(present)('native composed search with independent hand-derived interval logic', () => {
  it('composes linear Moon sectors and positive motion through the existing events solver', async () => {
    const found = searchElectional(config, { engine: linear, events: await capability() }, options);
    expect(['complete', 'unresolved']).toContain(found.status); expect(found.windows.length).toBeGreaterThan(0);
    // Independent equation: Moon longitude = 0.1 * ms. Taurus is [30,60)
    // degrees, hence [300,600). Waxing Crescent is [22.5,67.5), hence
    // [225,675), covering the entire Taurus interval. Both planet rates > 0.
    // Numerical source brackets remain unknown and are never assigned truth.
    for (let t = 0; t < 1000; t++) {
      if (containsInstant(found.unresolved, t)) continue;
      expect(containsInstant(found.eligible, t), `label ${t}`).toBe(t >= 300 && t < 600);
    }
    expect(found.windows.every(w => !('score' in w) && !('rank' in w))).toBe(true);
    expect(found.receipts.length).toBe(found.evaluations);
    expect(found.ruleResults.every(r => 'searches' in r && r.searches.every(s => 'source' in s && s.source?.moduleUrl === eventsUrl.href))).toBe(true);
    expect(found.windows.every(w => w.receipts.every(r => r.engine.name === 'linear-test-function'))).toBe(true);
  });
  it('carries native receipts and full audits through a tautological real-engine search', async () => {
    const dependencies = await loadSearchDependencies();
    const real: RuleSet = { ...config, range: { start: '2000-09-22T12:00:00Z', end: '2000-09-22T12:01:00Z', clock: 'utc' }, rules: [
      { id: 'all-signs', kind: 'moon-sign', mode: 'require', options: { signs: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] } },
      { id: 'all-houses', kind: 'benefic-house', mode: 'require', options: { bodies: ['Venus', 'Jupiter'], houses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], match: 'all', polarFallback: 'allow' } },
      { id: 'all-rulers', kind: 'planetary-hour', mode: 'prefer', weight: 0.5, options: { rulers: ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'], utcOffsetMinutes: 0 } },
    ] };
    const found = searchElectional(real, { ...dependencies, events: await capability() }, { ...options, stepMs: 60000, maxSkySamples: 100000 });
    expect(found.status).toBe('complete');
    // All signs, all houses and all classical hour rulers select the universe
    // in a resolved nonpolar solar day. No numerical planet position is pinned.
    expect(found.windows).toHaveLength(1);
    expect(found.windows[0]).toMatchObject({ startMs: Date.parse(real.range.start), endMs: Date.parse(real.range.end),
      clock: 'utc' });
    expect(found.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
    expect(found.windows[0]?.explanations.every(e => e.receipts.length > 0)).toBe(true);
    expect(found.ruleResults[1]).toHaveProperty('partitions'); expect(found.ruleResults[2]).toHaveProperty('days');
    expect(Object.isFrozen(found.ruleResults[1]?.receipts[0]?.instants)).toBe(true);
  }, 30000);
});
