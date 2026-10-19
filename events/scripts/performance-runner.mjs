// One fresh process per measured query; no event payloads are written to disk.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const [bundle, planPath, id] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const entry = plan.cases.find(c => c.id === id);
assert.ok(entry);
const { executeQuery } = await import(pathToFileURL(bundle).href);
// Import/startup is outside the timed region; no query warmup or result cache.
const start = performance.now();
const result = executeQuery(entry.query, entry.options);
const elapsedMs = performance.now() - start;
const encoded = JSON.stringify(result, (_key, value) => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  return Object.is(value, -0) ? { number: '-0' } : value;
});
process.stdout.write(JSON.stringify({
  elapsedMs,
  maxRssKiB: process.resourceUsage().maxRSS,
  result: { status: result.status, ...(result.status === 'refused' ? { reason: result.reason } : {}),
    events: result.events.length, evaluations: result.evaluations,
    sha256: createHash('sha256').update(encoded).digest('hex') }
}) + '\n');
