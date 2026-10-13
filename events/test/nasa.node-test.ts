import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { EvaluationContext, searchEclipses } from '../src/index.js';
import type { EclipseKind, EclipseEvent, EclipseOptions } from '../src/index.js';

const project = new URL('../../', import.meta.url);
interface Case {
  kind: EclipseKind; catalogNumber: string; date: string; catalogType: string;
  classification: EclipseEvent['classification'];
}
const fixture = JSON.parse(readFileSync(new URL('references/nasa.json', project), 'utf8')) as {
  clock: 'tt';
  configuration: { cases: Case[]; toleranceMs: number; options: EclipseOptions;
    radiusKm: { sun: number; moon: number; earth: number }; auKm: number };
  events: { kind: EclipseKind; catalogNumber: string; atMs: number; tdLabel: string }[];
};
const config = fixture.configuration;
const model = { sunRadiusAu: config.radiusKm.sun/config.auKm,
  moonRadiusAu: config.radiusKm.moon/config.auKm, earthRadiusAu: config.radiusKm.earth/config.auKm };

test('NASA rows reproduce offline with hashes, source URLs, selection and TT labels', () => {
  const output = execFileSync('python3', ['scripts/nasa.py', '--verify', 'references/nasa.json'],
    { cwd: project, encoding: 'utf8' });
  assert.match(output, /verified/);
  execFileSync('python3', ['scripts/nasa_test.py'], { cwd: project, encoding: 'utf8' });
  assert.equal(fixture.clock, 'tt');
  // These policies were chosen before computing any engine comparison.
  assert.equal(config.toleranceMs, 180000);
  assert.deepEqual(config.options, { stepMs: 3600000, derivativeStepMs: 60000 });
});
for (const [index, c] of config.cases.entries()) {
  test(`independent NASA greatest eclipse: ${c.kind} ${c.catalogNumber} ${c.date}`, () => {
    const reference = fixture.events[index]!;
    const start = Date.parse(c.date + 'T00:00:00Z');
    // Search a full civil-date label, not a small bracket centered on the reference.
    // Padding recovers the eclipse scanner's guarded edges on the TT clock.
    const ctx = new EvaluationContext({ startMs: start-config.options.derivativeStepMs,
      endMs: start+86400000+config.options.derivativeStepMs, clock: 'tt' }, { maxEvaluations: 10000 });
    const result = searchEclipses(ctx, c.kind, model, config.options);
    assert.equal(result.status, 'complete');
    assert.equal(result.events.length, 1);
    const event = result.events[0]!;
    assert.equal(event.kind, reference.kind);
    assert.equal(event.clock, 'tt');
    assert.equal(event.definition, 'minimum-shadow-axis-distance');
    assert.equal(event.classification, c.classification);
    assert.ok(event.atMs > start && event.atMs <= start+86400000);
    assert.equal(reference.atMs, Date.parse(reference.tdLabel + 'Z'));
    const deltaMs = event.atMs-reference.atMs;
    assert.ok(Math.abs(deltaMs) <= config.toleranceMs,
      `${c.catalogNumber}: TT difference ${deltaMs} ms exceeds ${config.toleranceMs} ms`);
    assert.ok(event.bracket[1]-event.bracket[0] <= 1);
    // Diagnostic output is stored in ignored test logs, not used as an expectation.
    console.log(JSON.stringify({ catalogNumber: c.catalogNumber, kind: c.kind,
      referenceTd: reference.tdLabel, deltaMs, classification: event.classification }));
  });
}
