import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { executeQuery } from '../src/index.js';
import type { EventBody, EclipseOptions, QuerySearchEvent } from '../src/index.js';

const project = new URL('../../', import.meta.url);
const horizons = JSON.parse(readFileSync(new URL('references/horizons.json', project), 'utf8')) as {
  events: { case: { id: string; kind: string; body: EventBody; otherBody?: EventBody;
    start: string; direction: string; natalLongitude?: number; toleranceMs: number }; atMs: number }[];
};
for (const { case: c, atMs } of horizons.events) {
  test(`DSL whole-year search retains independent Horizons date: ${c.id}`, () => {
    const year = c.start.slice(0, 4);
    const event = c.kind === 'station' ? `${c.body} stations ${c.direction}`
      : c.kind === 'ingress' ? `${c.body} ingresses into Aries`
      : c.kind === 'fixed-aspect' ? `${c.body} square natal Sun`
      : `${c.body} opposition ${c.otherBody}`;
    const result = executeQuery(`all ${event} from ${year}-01-01 to ${Number(year)+1}-01-01 clock tt`, {
      stepMs: 86400000, maxEvaluations: 10000,
      ...(c.natalLongitude === undefined ? {} : { natalLongitudes: { Sun: c.natalLongitude } })
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.events.filter(e => 'atMs' in e &&
      Math.abs(e.atMs-atMs) <= c.toleranceMs && 'direction' in e && e.direction === c.direction).length, 1);
  });
}
const nasa = JSON.parse(readFileSync(new URL('references/nasa.json', project), 'utf8')) as {
  configuration: { cases: { kind: 'solar' | 'lunar'; catalogNumber: string; date: string;
    classification: string }[]; toleranceMs: number; options: EclipseOptions;
    radiusKm: { sun: number; moon: number; earth: number }; auKm: number };
  events: { kind: 'solar' | 'lunar'; catalogNumber: string; atMs: number }[];
};
const config = nasa.configuration;
for (const kind of ['solar', 'lunar'] as const) {
  const years = new Set(config.cases.filter(c => c.kind === kind).map(c => c.date.slice(0, 4)));
  for (const year of years) {
    test(`DSL whole-year ${kind} search retains independent NASA dates: ${year}`, () => {
      const result = executeQuery(`all ${kind} eclipses from ${year}-01-01 to ${Number(year)+1}-01-01 clock tt`, {
        stepMs: config.options.stepMs, maxEvaluations: 100000,
        eclipse: { derivativeStepMs: config.options.derivativeStepMs,
          model: { sunRadiusAu: config.radiusKm.sun/config.auKm,
            moonRadiusAu: config.radiusKm.moon/config.auKm,
            earthRadiusAu: config.radiusKm.earth/config.auKm } }
      });
      assert.equal(result.status, 'complete');
      for (const c of config.cases.filter(c => c.kind === kind && c.date.startsWith(year))) {
        const ref = nasa.events.find(e => e.kind === kind && e.catalogNumber === c.catalogNumber)!;
        const matches: readonly QuerySearchEvent[] = result.events.filter(e => 'atMs' in e && Math.abs(e.atMs-ref.atMs) <= config.toleranceMs);
        assert.equal(matches.length, 1, c.catalogNumber);
        const event = matches[0]!;
        assert.equal(event.kind, kind);
        if (event.kind === 'solar' || event.kind === 'lunar') assert.equal(event.classification, c.classification);
      }
      // Sparse selected catalog rows cannot establish an exhaustive yearly count.
      assert.ok(result.status === 'complete' && result.unresolved.length === 0);
    });
  }
}
