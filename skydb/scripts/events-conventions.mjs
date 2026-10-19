import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createConfig } from '../src/config.mjs';
import { MAJOR_ASPECTS, EVENT_SCAN_MAX_MS } from '../src/events.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
import { ENGINE_IDENTITY, requireNode22 } from '../src/identity.mjs';

// A source receipt, not an execution or numerical comparison of the projects.
requireNode22();
if (process.argv.length !== 2) throw new Error('Source receipt script takes no arguments');
const commit = 'bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7';
const base = `https://raw.githubusercontent.com/zodiacs-org/engine/${commit}/`;
const sources = [
  ['events/README.md', [[59, 64], [96, 118], [140, 219], [231, 278], [295, 306], [365, 420]]],
  ['events/LIMITATIONS.md', [[25, 49], [53, 70]]],
  ['events/src/types.ts', [[1, 21]]],
  ['events/src/context.ts', [[9, 19], [51, 79]]],
  ['events/src/engine.ts', [[1, 12], [28, 53]]],
  ['events/src/root.ts', [[19, 36], [50, 77]]],
  ['events/src/longitude.ts', [[63, 103], [111, 122]]],
  ['events/src/aspects.ts', [[29, 46], [76, 103]]],
  ['events/src/stations.ts', [[46, 83], [85, 124]]]
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const texts = new Map(), receipts = [];
for (const [path, inspectedLines] of sources) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Public source request failed: ${path} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < 2_000_000, 'Source exceeds receipt scope');
  texts.set(path, bytes.toString('utf8'));
  receipts.push({ path, url: base + path, sha256: digest(bytes), bytes: bytes.length, inspectedLines });
}
const extract = (path, pattern) => {
  const match = texts.get(path).match(pattern);
  assert.ok(match, `Reviewed declaration changed: ${path}`);
  return match[1];
};
const clocks = [...extract('events/src/types.ts', /export type Clock = ([^;]+);/).matchAll(/"([a-z0-9]+)"/g)]
  .map(match => match[1]);
const bodies = [...extract('events/src/engine.ts', /EVENT_BODIES = Object\.freeze\(\[([\s\S]*?)\]/)
  .matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]);
const ownsExpression = extract('events/src/context.ts', /return (atMs > this\.window\.startMs && atMs <= this\.window\.endMs);/);
const rootToleranceMs = Number(extract('events/src/root.ts', /const tolerance = options\.toleranceMs \?\? (\d+);/));
assert.deepEqual(clocks, ['utc', 'ut1', 'tt']);
assert.deepEqual(bodies, createConfig().bodies);
assert.equal(rootToleranceMs, 1);
const localSources = [];
for (const path of ['src/config.mjs', 'src/identity.mjs', 'src/engine.mjs', 'src/generate.mjs',
  'src/events.mjs', 'src/query.mjs']) {
  const bytes = await readFile(new URL(`../${path}`, import.meta.url));
  localSources.push({ path: `skydb/${path}`, sha256: digest(bytes), bytes: bytes.length });
}
console.log(JSON.stringify({
  version: 1,
  command: 'node skydb/scripts/events-conventions.mjs > skydb/docs/evidence/events-conventions.json',
  retrievedAt: new Date().toISOString(), node: process.versions.node,
  method: 'Unauthenticated public source reads at a fixed commit, with byte hashes and inclusive line locators; selected declarations checked; no events project execution or cross-project numerical agreement measurement',
  events: { pullRequest: 'https://github.com/zodiacs-org/engine/pull/43', commit,
    clocks, bodies, ownsExpression, rootToleranceMs, sources: receipts },
  skydb: { engine: ENGINE_IDENTITY, config: createConfig(), majorAspectsDegrees: MAJOR_ASPECTS,
    eventScanMaxMs: EVENT_SCAN_MAX_MS, timeBoundariesMs: TIME_BOUNDARIES, sources: localSources }
}, null, 2));
