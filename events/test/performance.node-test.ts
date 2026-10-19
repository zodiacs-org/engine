import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('performance evidence retains complete before/after query results and work counts', () => {
  const project = new URL('../../', import.meta.url);
  const plan = JSON.parse(readFileSync(new URL('scripts/performance-plan.json', project), 'utf8'));
  assert.equal(plan.rounds, 3);
  assert.deepEqual(plan.cases.map((entry: { id: string }) => entry.id),
    ['mercury-stations', 'venus-leo-retrogrades', 'moon-void-periods', 'mercury-coverage-edge']);
  execFileSync(process.execPath, ['scripts/performance.mjs', '--check'],
    { cwd: project, stdio: 'pipe' });
});
