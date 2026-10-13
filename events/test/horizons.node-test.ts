import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { EvaluationContext, searchSignIngresses, searchExactAspects, searchStations } from '../src/index.js';
import type { EventBody, CrossingDirection } from '../src/index.js';

const project = new URL('../../', import.meta.url);
interface ReferenceCase {
  id: string; kind: string; body: EventBody; otherBody?: EventBody;
  start: string; end: string; targetDegrees?: number; natalLongitude?: number;
  direction: CrossingDirection; toleranceMs: number;
}
const fixture = JSON.parse(readFileSync(new URL('references/horizons.json', project), 'utf8')) as {
  clock: 'tt'; events: { case: ReferenceCase; atMs: number }[];
};
test('committed Horizons dates reproduce offline from hashed responses and declared requests', () => {
  const output = execFileSync('python3', ['scripts/horizons.py', '--verify', 'references/horizons.json'],
    { cwd: project, encoding: 'utf8' });
  assert.match(output, /verified/);
  execFileSync('python3', ['scripts/horizons_test.py'], { cwd: project, encoding: 'utf8' });
});
for (const { case: c, atMs } of fixture.events) {
  test(`independent TT event date: ${c.id}`, () => {
    const context = new EvaluationContext({ startMs: Date.parse(c.start + 'T00:00:00Z'),
      endMs: Date.parse(c.end + 'T00:00:00Z'), clock: fixture.clock }, { maxEvaluations: 10000 });
    const options = { stepMs: 3600000, direction: c.direction };
    const result = c.kind === 'station'
      ? searchStations(context, c.body, { stepMs: options.stepMs })
      : c.kind === 'ingress'
        ? searchSignIngresses(context, c.body, options)
        : searchExactAspects(context, c.body,
          c.kind === 'fixed-aspect' ? { kind: 'fixed', longitude: c.natalLongitude! }
            : { kind: 'moving', body: c.otherBody! },
          { aspects: [{ id: 'reference', angleDegrees: c.targetDegrees! }] }, options);
    assert.equal(result.status, 'complete');
    assert.equal(result.events.length, 1);
    const event = result.events[0]!;
    assert.equal(event.direction, c.direction);
    assert.equal(event.clock, 'tt');
    assert.ok(Math.abs(event.atMs - atMs) <= c.toleranceMs,
      `${c.id}: difference ${event.atMs - atMs} ms exceeds declared ${c.toleranceMs} ms`);
    if (event.kind === 'sign-ingress') {
      assert.equal(event.fromSign, 'Pisces');
      assert.equal(event.toSign, 'Aries');
    }
    if (event.kind === 'exact-aspect') assert.equal(event.relativeLongitude, c.targetDegrees);
  });
}
