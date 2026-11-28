import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import reference from '../references/void-horizons.json';
import cases from '../references/void-cases.json';
import { evaluateVoidRule, loadEngineRuntime, containsInstant, normalizeIntervals } from '../src/index.js';
import type { EventsCapability, EventsRuntime } from '../src/index.js';

const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function live(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
interface ReferenceContact { atMs: number; body: string; aspect: string; targetDegrees: number }
interface Reducers {
  verify(): Promise<unknown>;
  reduce(responses: unknown): unknown;
  contacts(moon: unknown, other: unknown, body: string): unknown;
  residences(ingress: readonly { atMs: number; targetDegrees: number }[], contacts: readonly ReferenceContact[]): unknown;
}
const reducers = await import(new URL('../scripts/void-horizons.mjs', import.meta.url).href) as Reducers;

describe('independent void-reference provenance and derivation', () => {
  it('verifies independent raw response hashes and both policy reductions offline', async () => {
    expect(await reducers.verify()).toEqual(reference);
  });
  it('reduces a Moon/body short-arc conjunction using hand-derived longitude samples', () => {
    expect(reducers.contacts([{ atMs: 0, longitude: 359 }, { atMs: 100, longitude: 3 }],
      [{ atMs: 0, longitude: 0 }, { atMs: 100, longitude: 0 }], 'Sun'))
      .toEqual([{ atMs: 25, targetDegrees: 0, direction: 'direct', referenceBracket: [0, 100], body: 'Sun', aspect: 'conjunction' }]);
  });
  it('groups independent sign residences with no contacts and excludes contacts at sign exit', () => {
    const ingress = [{ atMs: 0, targetDegrees: 0 }, { atMs: 50, targetDegrees: 30 }, { atMs: 100, targetDegrees: 60 }];
    const contacts = [{ atMs: 25, body: 'Sun', aspect: 'trine', targetDegrees: 120 },
      { atMs: 50, body: 'Venus', aspect: 'sextile', targetDegrees: 60 }];
    expect(reducers.residences(ingress, contacts)).toEqual([
      { startMs: 25, endMs: 50, signIndex: 0, lastContact: contacts[0] },
      { startMs: 50, endMs: 100, signIndex: 1, lastContact: null },
    ]);
  });
  it('rejects raw-data and request-metadata tampering', () => {
    for (const key of ['sha256', 'raw', 'url', 'parameters'] as const) {
      const copy = structuredClone(reference.responses);
      Object.assign(copy[0]!, { [key]: key === 'parameters' ? { ...copy[0]!.parameters, TIME_TYPE: "'UT'" } : 'tampered' });
      expect(() => reducers.reduce(copy)).toThrow();
    }
  });
});

describe.runIf(present)('native void delegation against independent Horizons dates', () => {
  it.each(['traditional', 'modern'] as const)('matches %s last contacts and exits within the declared reference span', async bodies => {
    const startMs = Date.parse(cases.range.start), endMs = Date.parse(cases.range.end);
    const result = evaluateVoidRule({ id: 'moon-not-void', kind: 'moon-not-void', mode: 'require', options: { bodies } },
      { startMs, endMs, clock: 'tt' }, await loadEngineRuntime(), await live(),
      { stepMs: 21600000, lookaheadMs: 259200000, maxEvaluations: 30000 });
    expect(result.status).not.toBe('refused');
    if (result.status === 'refused') throw new Error(`Native void search refused: ${result.reason}`);
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
    const expected = reference.windows[bodies].filter(span => span.startMs < endMs && span.endMs > startMs);
    const actual = result.searches[0]!.events.filter(event => (event.startMs as number) < endMs && (event.endMs as number) > startMs);
    expect(actual).toHaveLength(expected.length);
    expected.forEach((span, i) => {
      const event = actual[i]!;
      expect(Math.abs((event.startMs as number) - span.startMs)).toBeLessThanOrEqual(cases.boundaryToleranceMs);
      expect(Math.abs((event.endMs as number) - span.endMs)).toBeLessThanOrEqual(cases.boundaryToleranceMs);
      const contact = event.lastContact as { atMs: number; target: { body: string }; aspect: { id: string } } | null;
      expect(contact?.target.body ?? null).toBe(span.lastContact?.body ?? null);
      expect(contact?.aspect.id ?? null).toBe(span.lastContact?.aspect ?? null);
    });
    // Unknown spans are numerical root neighborhoods only; the next-ingress tail
    // after lookahead must lie outside the requested range for these cases.
    expect(result.unresolved.every(u => u.reason.startsWith('numerical-'))).toBe(true);
    expect(result.failed).toHaveLength(expected.length);
    expected.forEach((span, i) => {
      expect(Math.abs(result.failed[i]!.startMs - Math.max(startMs, span.startMs))).toBeLessThanOrEqual(cases.boundaryToleranceMs);
      expect(Math.abs(result.failed[i]!.endMs - Math.min(endMs, span.endMs))).toBeLessThanOrEqual(cases.boundaryToleranceMs);
    });
    expect(normalizeIntervals([...result.satisfied, ...result.failed, ...result.unresolved])).toEqual([{ startMs, endMs }]);
    // Check interior labels against independent date intervals, away from the
    // preregistered boundary allowance; never pin the engine's own sky output.
    for (let atMs = startMs; atMs < endMs; atMs += 3600000) {
      if (expected.some(w => Math.abs(atMs - w.startMs) <= cases.boundaryToleranceMs
        || Math.abs(atMs - w.endMs) <= cases.boundaryToleranceMs) || containsInstant(result.unresolved, atMs)) continue;
      expect(containsInstant(result.satisfied, atMs)).toBe(!expected.some(w => w.startMs <= atMs && atMs < w.endMs));
    }
  }, 30000);
});
