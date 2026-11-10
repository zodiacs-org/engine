#!/usr/bin/env node
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { identifyArtifact } from '../src/identity.mjs';
import { digest, sha256 } from '../src/common.mjs';
import { FROZEN_BASELINE_DIGEST } from '../src/declaration.mjs';

const read = relative => fs.readFile(new URL(relative, import.meta.url));
const original = JSON.parse(await read('../reports/validation-20260928/self-comparison/baseline-artifact.json'));
const expected = JSON.parse(await read('../data/baseline-artifact.json'));
const lock = await read('../preparation/package-lock.json');
const lockSha256 = '0ab582863d9a06943350114d7ce9b8e65698d1bd8f73dc9f9465bb069e6218f9';
assert.equal(original.digest, '4691195c5e4b192c45638378270514bc99ce3f2a168d82d5cd3c472b9aeef599');
for (const artifact of [original, expected]) {
  const { digest: recorded, ...identity } = artifact;
  assert.equal(digest(identity), recorded, 'Inventory digest mismatch');
}
assert.equal(expected.digest, FROZEN_BASELINE_DIGEST);
assert.equal(sha256(lock), lockSha256, 'Source-commit lockfile hash mismatch');
assert.deepEqual(expected.files['package-lock.json'], { sha256: lockSha256, bytes: lock.length });
assert.deepEqual(Object.keys(expected.files), Object.keys(original.files));
const changed = Object.keys(original.files).filter(file =>
  JSON.stringify(original.files[file]) !== JSON.stringify(expected.files[file]));
assert.deepEqual(changed, ['package-lock.json'], 'Replacement may change only the root lockfile');
const withoutLock = artifact => {
  const copy = structuredClone(artifact);
  copy.installedBytes -= copy.files['package-lock.json'].bytes;
  delete copy.files['package-lock.json'];
  delete copy.digest;
  return copy;
};
assert.deepEqual(withoutLock(expected), withoutLock(original), 'Executable, metadata or dependency identity changed');

const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Usage: check-preparation.mjs --engine ABSOLUTE_DIST_INDEX');
assert.equal(args[0], '--engine');
const actual = await identifyArtifact(args[1]);
assert.deepEqual(actual, expected, 'Prepared installation differs from the reviewed baseline');
console.log(JSON.stringify({
  scope: 'Historical rc.10 standalone preparation; full inventory checked without importing engine code.',
  lockSource: 'https://raw.githubusercontent.com/zodiacs-org/engine/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/package-lock.json',
  originalDigest: original.digest,
  replacementDigest: expected.digest,
  changedFiles: changed,
  originalLock: original.files['package-lock.json'],
  replacementLock: expected.files['package-lock.json'],
  unchangedFiles: expected.fileCount - changed.length,
  dependencyResolutionUnchanged: true,
  preparedInventoryMatches: true
}, null, 2));
