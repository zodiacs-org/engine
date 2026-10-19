import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { build, verifyBuild, requireNode22, fingerprintTree, project } from '../tools/build.mjs';

test('refuses unsupported runtimes', () => {
  for (const version of ['20.19.2', '22.12.0', '24.0.0']) assert.throws(() => requireNode22(version));
  requireNode22('22.13.0');
  requireNode22();
});

test('fingerprint detects content, renames, additions and unsafe inputs', async () => {
  const root = await mkdtemp(join(project, 'runtime/fingerprint-test-'));
  try {
    await writeFile(join(root, 'a'), 'original');
    const first = await fingerprintTree(root);
    assert.deepEqual(first, await fingerprintTree(root));
    await writeFile(join(root, 'a'), 'changed');
    assert.notEqual(first.sha256, (await fingerprintTree(root)).sha256);
    await rm(join(root, 'a'));
    await writeFile(join(root, 'b'), 'original');
    assert.notEqual(first.sha256, (await fingerprintTree(root)).sha256);
    await writeFile(join(root, 'a'), 'original');
    assert.notEqual(first.sha256, (await fingerprintTree(root)).sha256);
    await symlink('a', join(root, 'link'));
    await assert.rejects(fingerprintTree(root), /Symbolic link/);
    await rm(join(root, 'link'));
    await writeFile(join(root, 'oversized'), Buffer.alloc(2_000_000));
    await assert.rejects(fingerprintTree(root), /Oversized/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('isolated engine builds repeatably, loads both entries and rejects tampering', async () => {
  const first = await build();
  assert.equal((await verifyBuild()).sha256, first.sha256);
  const second = await build();
  assert.equal(second.sha256, first.sha256);
  const engine = await import('../runtime/build/index.js');
  const { calc } = await import('../runtime/build/calc.js');
  assert.equal(engine.EPHEMERIS.version, '2.1.19');
  const chart = engine.natalChart({ utc: '2000-01-02T12:00:00Z', latitude: 10, longitude: 20 });
  assert(chart.bodies.length > 0);
  assert(chart.bodies.every(body => Number.isFinite(body.lon)));
  assert.equal(typeof calc, 'function');
  const outputPath = join(project, 'runtime/build/index.js');
  const original = await readFile(outputPath);
  try {
    await writeFile(outputPath, Buffer.concat([original, Buffer.from('\n// tampered\n')]));
    await assert.rejects(verifyBuild(), /output changed/);
  } finally { await writeFile(outputPath, original); }
  const dependencyPath = join(project, 'node_modules/astronomy-engine/package.json');
  const dependency = await readFile(dependencyPath);
  try {
    await writeFile(dependencyPath, dependency.toString() + '\n');
    await assert.rejects(verifyBuild(), /inputs changed/);
  } finally { await writeFile(dependencyPath, dependency); }
  const receiptPath = join(project, 'runtime/build-identity.json');
  const receipt = await readFile(receiptPath);
  try {
    await writeFile(receiptPath, receipt.toString().replace(first.sha256, '0'.repeat(64)));
    await assert.rejects(verifyBuild(), /Invalid build receipt/);
  } finally { await writeFile(receiptPath, receipt); }
  assert.equal((await verifyBuild()).sha256, first.sha256);
});

// All tests create their temporary files under the ignored project runtime.
await mkdir(join(project, 'runtime'), { recursive: true });
