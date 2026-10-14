import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { streamElectional, searchElectional, loadSearchDependencies, containsInstant, normalizeIntervals } from '../src/index.js';
import type { EngineReceipt, EngineRuntime, EventsCapability, EventsRuntime, RuleSet, StreamChunk, StreamEnd, StreamOptions } from '../src/index.js';
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function capability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
const options: StreamOptions = { chunkMs: 150, maxChunks: 100, maxEvaluations: 100000, maxSkySamples: 100000,
  maxChunkEvaluations: 20000, maxChunkSkySamples: 20000, maxFrameBytes: 1900000, stepMs: 100, lookaheadMs: 700 };
const contractReceipt: EngineReceipt = { schema: 'stream-independent-linear-function', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['invented-linear-equations;not-an-astronomical-ephemeris'],
  engine: { name: 'linear-test-function', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };
function linear(otherLongitude = 0, moonOffset = 0): EngineRuntime {
  return { calc(request) {
    if (!(request.time instanceof Date)) throw new Error('Expected explicit clock labels.');
    const ms = request.time.getTime(), rate = request.body === 'Moon' ? 0.1 : 0;
    return { status: 'ok', lon: ((ms * rate + (request.body === 'Moon' ? moonOffset : otherLongitude)) % 360 + 360) % 360,
      lat: 0, bounds: {}, speeds: request.flags.speeds ? { lon: rate * 86400000 } : null, receipt: contractReceipt };
  } };
}
const config: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic streamed equations', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: new Date(0).toISOString(), end: new Date(1000).toISOString(), clock: 'utc' }, rules: [
    { id: 'sign', kind: 'moon-sign', mode: 'require', options: { signs: ['taurus'] } },
    { id: 'phase', kind: 'moon-phase', mode: 'prefer', weight: 5, options: { phases: ['Waxing Crescent'] } },
  ] };
async function drain(rules: RuleSet, engine: EngineRuntime, settings = options) {
  const chunks: StreamChunk[] = []; let end: StreamEnd | undefined;
  for await (const frame of streamElectional(rules, { engine, events: await capability() }, settings)) {
    if (frame.type === 'chunk') chunks.push(frame); else end = frame;
  }
  if (!end) throw new Error('Missing stream completion.');
  return { chunks, end };
}
describe.runIf(present)('native streaming with independent hand-derived equations', () => {
  it.each([100, 150, 300, 333, 1000])('partitions linear Moon sectors with chunk width %s without moving known ownership', async chunkMs => {
    const engine = linear(), { chunks, end } = await drain(config, engine, { ...options, chunkMs, internalScoring: true });
    const whole = searchElectional(config, { engine, events: await capability() },
      { maxEvaluations: options.maxEvaluations, maxSkySamples: options.maxSkySamples, stepMs: options.stepMs, lookaheadMs: options.lookaheadMs });
    expect(['complete', 'unresolved']).toContain(end.status); expect(end.remaining).toBe(null);
    const fragments = chunks.flatMap(c => c.fragments), unknown = normalizeIntervals([...whole.unresolved, ...chunks.flatMap(c => c.facts.unresolved)]);
    // Hand solution: Moon = .1*t, so Taurus selects [300,600).
    // Waxing Crescent = [22.5,67.5), which contains this whole interval.
    for (let t = 0; t < 1000; t++) {
      if (containsInstant(unknown, t)) continue;
      expect(containsInstant(fragments, t), `label ${t}`).toBe(t >= 300 && t < 600);
      expect(containsInstant(fragments, t)).toBe(containsInstant(whole.windows, t));
    }
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.every(f => f.internalScore?.lower === 5 && f.internalScore.upper === 5)).toBe(true);
    expect(end.evaluations).toBe(chunks.reduce((sum, c) => sum + c.facts.evaluations, 0));
    expect(chunks.every(c => c.facts.receipts.length === c.facts.evaluations && c.fragments.every(f => f.receipts.every(r => r.engine.name === 'linear-test-function')))).toBe(true);
    expect(chunks.every(c => c.facts.ruleResults.every(r => 'searches' in r && r.searches.every(s => s.source?.moduleUrl === eventsUrl.href)))).toBe(true);
  });
  it('keeps uncertain ingress brackets on both sides of an exact chunk seam', async () => {
    const { chunks } = await drain(config, linear(0, 0.05), { ...options, chunkMs: 300, stepMs: 97 });
    const first = chunks[0]!, second = chunks[1]!;
    // Independent ingress at t=299.5. The source brackets may differ between
    // partitions. They remain unknown rather than shrinking to an exact root.
    const boundaries = chunks.flatMap(c => c.facts.ruleResults.flatMap(r => r.unresolved));
    expect(boundaries.length).toBeGreaterThan(0);
    expect(normalizeIntervals([...first.facts.eligible, ...first.facts.excluded, ...first.facts.unresolvedRequired])).toEqual([{ startMs: 0, endMs: 300 }]);
    expect(normalizeIntervals([...second.facts.eligible, ...second.facts.excluded, ...second.facts.unresolvedRequired])).toEqual([{ startMs: 300, endMs: 600 }]);
    expect(chunks.flatMap(c => c.fragments).every(f => f.startMs >= 300 && f.endMs <= 600)).toBe(true);
    expect(chunks.every(c => c.facts.unresolved.every(u => u.startMs >= c.facts.window.startMs && u.endMs <= c.facts.window.endMs))).toBe(true);
  });
  it('finds a station outside a chunk whose avoidance margin crosses that chunk', async () => {
    const engine: EngineRuntime = { calc(request) {
      if (!(request.time instanceof Date)) throw new Error('Expected clock labels.');
      const t = request.time.getTime(), offset = t - 500;
      // Independent polynomial: longitude = 50 + offset^2 / 100000,
      // speed = 2*offset / 100000 degrees per millisecond. Station at 500.
      return { status: 'ok', lon: ((50 + offset * offset / 100000) % 360 + 360) % 360, lat: 0, bounds: {},
        speeds: request.flags.speeds ? { lon: 2 * offset / 100000 * 86400000 } : null, receipt: contractReceipt };
    } };
    const rules: RuleSet = { ...config, range: { ...config.range, end: new Date(2000).toISOString() }, rules: [
      { id: 'station', kind: 'avoid-stations', mode: 'require', options: { bodies: ['Mercury'], withinDays: 0.00001 } },
    ] };
    const { chunks, end } = await drain(rules, engine, { ...options, chunkMs: 400 });
    expect(['complete', 'unresolved']).toContain(end.status);
    const fragments = chunks.flatMap(c => c.fragments), unknown = chunks.flatMap(c => c.facts.unresolved);
    // 0.00001 elapsed days floors to 864 integer milliseconds. The closed
    // exclusion is [-364,1364], hence [-364,1365) in half-open arithmetic.
    for (let t = 0; t < 2000; t++) {
      if (containsInstant(unknown, t)) continue;
      expect(containsInstant(fragments, t), `label ${t}`).toBe(t >= 1365);
    }
    expect(chunks[0]?.fragments).toEqual([]);
    expect(chunks[0]?.facts.ruleResults[0]).toHaveProperty('convention.marginMs', 864);
    expect(fragments.length).toBeGreaterThan(0);
  });
  it('resolves next-ingress ownership with lookahead beyond each chunk and the full requested end', async () => {
    const rules: RuleSet = { ...config, range: { ...config.range, end: new Date(600).toISOString() }, rules: [
      { id: 'not-void', kind: 'moon-not-void', mode: 'require', options: { bodies: 'traditional' } },
    ] };
    const { chunks, end } = await drain(rules, linear(10), { ...options, maxFrameBytes: 20000000 });
    expect(['complete', 'unresolved'], JSON.stringify({ end, audit: chunks.map(c => c.facts.refusals) })).toContain(end.status);
    const unknown = chunks.flatMap(c => c.facts.unresolved), fragments = chunks.flatMap(c => c.fragments);
    // All targets are fixed at 10 degrees. Aries' last contact is at t=100;
    // its exit is 300. Taurus has no major contact and exits at 600. Thus
    // [100,600) is void, and [0,100) satisfies the rule on this domain.
    for (let t = 0; t < 600; t++) {
      if (containsInstant(unknown, t)) continue;
      expect(containsInstant(fragments, t), `label ${t}`).toBe(t < 100);
    }
    expect(fragments.length).toBeGreaterThan(0);
    expect(unknown.every(u => u.reason.startsWith('numerical-'))).toBe(true);
    expect(chunks.every(c => c.facts.ruleResults.every(r => 'searches' in r && r.searches.every(s => s.sourceWindow?.endMs === c.facts.window.endMs + options.lookaheadMs + options.stepMs)))).toBe(true);
    const noLookahead = await drain(rules, linear(10), { ...options, lookaheadMs: 0 });
    expect(noLookahead.end.status).toBe('unresolved');
    expect(noLookahead.chunks.some(c => c.facts.unresolved.some(u => !u.reason.startsWith('numerical-')))).toBe(true);
  });
});
describe('streaming native loading and missing capabilities', () => {
  it('stops a required missing events capability without a completed empty stream', async () => {
    const dependencies = await loadSearchDependencies(), frames = [];
    for await (const frame of streamElectional(config, { ...dependencies, events: { status: 'missing' } }, options)) frames.push(frame);
    expect(frames).toHaveLength(2); expect(frames[0]).toMatchObject({ type: 'chunk', fragments: [], facts: { status: 'refused', evaluations: 0, receipts: [] } });
    expect(frames[1]).toMatchObject({ type: 'end', status: 'refused', reason: 'chunk-refused', remaining: { startMs: 150, endMs: 1000 } });
  });
});
