import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createConfig } from '../src/config.mjs';
import { MAJOR_ASPECTS, EVENT_SCAN_MAX_MS } from '../src/events.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';

const sourcePaths = [
  'skydb/src/config.mjs', 'skydb/src/identity.mjs', 'skydb/src/engine.mjs',
  'skydb/src/generate.mjs', 'skydb/src/events.mjs', 'skydb/src/query.mjs'
];
const receipt = JSON.parse(await readFile(new URL('../docs/evidence/events-conventions.json', import.meta.url), 'utf8'));

async function checkLocalReceipt(report) {
  assert.equal(report.version, 1);
  assert.deepEqual(report.skydb.sources.map(source => source.path), sourcePaths,
    'Local source receipts must cover the reviewed source set');
  for (const source of report.skydb.sources) {
    const bytes = await readFile(new URL(`../../${source.path}`, import.meta.url));
    assert.equal(source.bytes, bytes.length, `Stale source byte length: ${source.path}`);
    assert.equal(source.sha256, createHash('sha256').update(bytes).digest('hex'),
      `Stale source hash: ${source.path}`);
  }
  assert.deepEqual(report.skydb.engine, ENGINE_IDENTITY, 'Stale engine identity');
  assert.deepEqual(report.skydb.config, createConfig(), 'Stale default configuration');
  assert.deepEqual(report.skydb.majorAspectsDegrees, MAJOR_ASPECTS, 'Stale aspect definitions');
  assert.equal(report.skydb.eventScanMaxMs, EVENT_SCAN_MAX_MS, 'Stale event scan limit');
  assert.deepEqual(report.skydb.timeBoundariesMs, TIME_BOUNDARIES, 'Stale time boundaries');
}

test('events convention evidence matches the reviewed local sources and current declarations offline', async () => {
  await checkLocalReceipt(receipt);
});

test('events convention evidence rejects stale source hashes and byte lengths', async () => {
  for (const source of receipt.skydb.sources) {
    for (const field of ['sha256', 'bytes']) {
      const stale = structuredClone(receipt);
      const entry = stale.skydb.sources.find(candidate => candidate.path === source.path);
      entry[field] = field === 'sha256' ? '0'.repeat(64) : entry.bytes + 1;
      await assert.rejects(checkLocalReceipt(stale), /Stale source (hash|byte length):/);
    }
  }
});

test('events convention evidence rejects missing, duplicated and unexpected local source receipts', async () => {
  for (const replace of [
    sources => sources.slice(1),
    sources => [...sources.slice(0, -1), sources[0]],
    sources => [...sources, { ...sources[0], path: 'events/src/engine.ts' }]
  ]) {
    const stale = structuredClone(receipt);
    stale.skydb.sources = replace(stale.skydb.sources);
    await assert.rejects(checkLocalReceipt(stale), /must cover the reviewed source set/);
  }
});

test('events convention evidence rejects stale local convention summaries', async () => {
  for (const [field, value] of [
    ['engine', { ...receipt.skydb.engine, sha256: '0'.repeat(64) }],
    ['config', { ...receipt.skydb.config, timeScale: 'tt' }],
    ['majorAspectsDegrees', [0, 90, 180]],
    ['eventScanMaxMs', receipt.skydb.eventScanMaxMs + 1],
    ['timeBoundariesMs', receipt.skydb.timeBoundariesMs.slice(1)]
  ]) {
    const stale = structuredClone(receipt);
    stale.skydb[field] = value;
    await assert.rejects(checkLocalReceipt(stale), /Stale (engine|default|aspect|event|time)/);
  }
});
