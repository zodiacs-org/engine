import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { EvaluationContext, searchExactAspects, searchLongitudeCrossings } from '../src/index.js';
import type { CrossingDirection, EventBody, LongitudeCrossing, LongitudeProvider, SearchResult } from '../src/index.js';

const project = new URL('../../', import.meta.url);
interface LoopCase {
  readonly id: string;
  readonly body: EventBody;
  readonly start: string;
  readonly end: string;
  readonly targetDegrees: number;
  readonly events: readonly { readonly atMs: number; readonly direction: CrossingDirection }[];
  readonly rows: readonly (readonly [number, number])[];
}
const fixture = JSON.parse(execFileSync('python3',
  ['scripts/loops.py', '--verify', 'references/loop-cases.json', '--json', '--rows'],
  { cwd: project, encoding: 'utf8' })) as {
    readonly clock: 'tt'; readonly toleranceMs: number; readonly cases: readonly LoopCase[];
  };

test('paired Horizons crossings reproduce offline from the original acquisition', () => {
  execFileSync('python3', ['scripts/loops_test.py'], { cwd: project, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(fixture.clock, 'tt');
  assert.equal(fixture.toleranceMs, 600000);
  for (const c of fixture.cases) {
    assert.equal(c.events.length, 2);
    assert.notEqual(c.events[0]!.direction, c.events[1]!.direction);
  }
});

function context(c: LoopCase) {
  return new EvaluationContext({ startMs: Date.parse(c.start + 'T00:00:00Z'),
    endMs: Date.parse(c.end + 'T00:00:00Z'), clock: fixture.clock }, { maxEvaluations: 10000 });
}
function compare(result: SearchResult<Pick<LongitudeCrossing, 'atMs' | 'direction' | 'clock'>>, c: LoopCase,
  checkInterpolatedDates = false) {
  assert.equal(result.status, 'complete');
  assert.equal(result.events.length, c.events.length);
  for (const [index, expected] of c.events.entries()) {
    const actual: Pick<LongitudeCrossing, 'atMs' | 'direction' | 'clock'> = result.events[index]!;
    assert.equal(actual.direction, expected.direction);
    assert.equal(actual.clock, fixture.clock);
    if (checkInterpolatedDates) assert.ok(Math.abs(actual.atMs - expected.atMs) <= fixture.toleranceMs,
      `${c.id}: ${actual.direction} differs by ${actual.atMs - expected.atMs} ms`);
  }
}

// C1 cubic Hermite interpolation of independent hourly longitudes. Nodal
// derivatives are centered secants, one-sided at the edges. No engine samples
// enter this provider. It checks discovery on reference rows, not a new sky model.
function interpolated(c: LoopCase, ctx: EvaluationContext): LongitudeProvider {
  const rows = c.rows;
  const slopes = rows.map((_r, i) => {
    const a = rows[Math.max(0, i - 1)]!, b = rows[Math.min(rows.length - 1, i + 1)]!;
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return { context: ctx, sample: (_body, t, withSpeed) => ctx.evaluate(() => {
    assert.ok(t >= ctx.window.startMs && t <= ctx.window.endMs);
    const i = Math.min(rows.length - 2, Math.floor((t - rows[0]![0]) / 3600000));
    const a = rows[i]!, b = rows[i + 1]!, h = b[0] - a[0], u = (t - a[0]) / h;
    const m0 = slopes[i]!, m1 = slopes[i + 1]!;
    const longitude = (2*u**3 - 3*u**2 + 1)*a[1] + (u**3 - 2*u**2 + u)*h*m0
      + (-2*u**3 + 3*u**2)*b[1] + (u**3 - u**2)*h*m1;
    const speed = ((6*u**2 - 6*u)*a[1] + (3*u**2 - 4*u + 1)*h*m0
      + (-6*u**2 + 6*u)*b[1] + (3*u**2 - 2*u)*h*m1) / h;
    return { longitude, ...(withSpeed ? { speedDegreesPerDay: speed * 86400000 } : {}) };
  }) };
}

const options = { stepMs: 2 * 86400000, stationStepMs: 2 * 86400000 };
for (const c of fixture.cases) {
  test(`station-aware longitude discovery retains both independent passes: ${c.id}`, () => {
    compare(searchLongitudeCrossings(context(c), c.body, c.targetDegrees, options), c);
  });
  test(`station-aware fixed conjunction retains both independent passes: ${c.id}`, () => {
    compare(searchExactAspects(context(c), c.body, { kind: 'fixed', longitude: c.targetDegrees },
      { aspects: [{ id: 'conjunction', angleDegrees: 0 }] }, options), c);
  });
  test(`scanner resolves independent interpolated row dates: ${c.id}`, () => {
    for (const aspect of [false, true]) {
      const ctx = context(c), source = interpolated(c, ctx);
      compare(aspect ? searchExactAspects(ctx, c.body, { kind: 'fixed', longitude: c.targetDegrees },
        { aspects: [{ id: 'conjunction', angleDegrees: 0 }] }, options, source)
        : searchLongitudeCrossings(ctx, c.body, c.targetDegrees, options, source), c, true);
    }
  });
}

test('default-engine timing discrepancies reproduce with the original threshold unchanged', () => {
  const output = execFileSync(process.execPath, ['scripts/loop-report.mjs', '--check'],
    { cwd: project, encoding: 'utf8' });
  assert.match(output, /Loop discovery and timing evidence reproduces/);
});
