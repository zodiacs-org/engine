import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inspectSpk, requireCoverage, acquireKernel, CHUNK_BYTES } from '../lib/kernels.mjs';

function fixture(big = false) {
  const b = Buffer.alloc(4096);
  const int = (v, o) => big ? b.writeInt32BE(v, o) : b.writeInt32LE(v, o);
  const dbl = (v, o) => big ? b.writeDoubleBE(v, o) : b.writeDoubleLE(v, o);
  b.write('DAF/SPK '); int(2, 8); int(6, 12); int(2, 76); int(2, 80); int(513, 84);
  b.write(big ? 'BIG-IEEE' : 'LTL-IEEE', 88);
  dbl(0, 1024); dbl(0, 1032); dbl(1, 1040);
  dbl(-100, 1048); dbl(100, 1056);
  [301, 399, 1, 2, 385, 512].forEach((v, i) => int(v, 1064 + i * 4));
  return b;
}
const inspect = b => inspectSpk(async (o, n) => b.subarray(o, o + n), b.length);

test('Independent synthetic DAF descriptors in both byte orders', async () => {
  for (const big of [false, true]) {
    const { segments } = await inspect(fixture(big));
    assert.deepEqual(segments, [{ startTdbSeconds: -100, endTdbSeconds: 100, target: 301, center: 399, frame: 1, type: 2, startWord: 385, endWord: 512 }]);
    requireCoverage(segments, { target: 301, center: 399, startTdbSeconds: -100, endTdbSeconds: 100 });
    for (const change of [{ target: 3 }, { center: 0 }, { frame: 2 }, { startTdbSeconds: -101 }, { endTdbSeconds: 101 }]) {
      assert.throws(() => requireCoverage(segments, { target: 301, center: 399, startTdbSeconds: -100, endTdbSeconds: 100, ...change }), /not covered/);
    }
  }
});

test('Coverage joins contiguous spans, rejects gaps and unsupported types', () => {
  const s = { target: 10, center: 0, frame: 1, type: 2 };
  const request = { target: 10, center: 0, startTdbSeconds: 0, endTdbSeconds: 20 };
  requireCoverage([{ ...s, startTdbSeconds: 0, endTdbSeconds: 10 }, { ...s, startTdbSeconds: 10, endTdbSeconds: 20 }], request);
  assert.throws(() => requireCoverage([{ ...s, startTdbSeconds: 0, endTdbSeconds: 9 }, { ...s, startTdbSeconds: 10, endTdbSeconds: 20 }], request));
  assert.throws(() => requireCoverage([{ ...s, type: 99, startTdbSeconds: 0, endTdbSeconds: 20 }], request));
  assert.throws(() => requireCoverage([], { ...request, endTdbSeconds: NaN }));
});

test('Malformed descriptors and summary chains fail closed', async () => {
  for (const mutate of [b => b.write('NOT/SPK '), b => b.write('VAX-GFLT', 88), b => b.writeInt32LE(3, 8), b => b.writeDoubleLE(2, 1024), b => b.writeDoubleLE(26, 1040), b => b.writeDoubleLE(NaN, 1048), b => b.writeInt32LE(514, 1084), b => b.writeInt32LE(0, 80)]) {
    const b = fixture(); mutate(b); await assert.rejects(inspect(b));
  }
  await assert.rejects(inspectSpk(async () => Buffer.alloc(0), 1025));
});

test('Download refusal cleans staging files and restricts destinations', async () => {
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(join(runtime, 'kernel-test-'));
  try {
    for (const response of [new Response('bad', { status: 404 }), new Response('bad'), new Response('bad', { headers: { 'content-encoding': 'gzip' } })]) {
      await assert.rejects(acquireKernel('de440s.bsp', { root, fetchImpl: async () => response }));
      assert.deepEqual(await readdir(root), []);
    }
    await assert.rejects(acquireKernel('unknown', { root }));
    await assert.rejects(acquireKernel('de440.bsp', { root: '/tmp' }), /inside runtime/);
    assert.ok(CHUNK_BYTES < 2_000_000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Stream chunks stay bounded, preserve bytes, and propagate interruptions', async () => {
  const { writeChunks } = await import('../lib/kernels.mjs');
  const { readFile, stat } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(join(runtime, 'chunk-test-'));
  try {
    const input = Buffer.alloc(CHUNK_BYTES * 2 + 71, 37);
    input[CHUNK_BYTES] = 89;
    async function* body() { yield input.subarray(0, 13); yield input.subarray(13); }
    const result = await writeChunks(body(), root);
    assert.equal(result.bytes, input.length);
    assert.equal(result.sha256, createHash('sha256').update(input).digest('hex'));
    assert.equal(result.md5, createHash('md5').update(input).digest('hex'));
    const output = [];
    for (const name of (await readdir(root)).sort()) {
      assert.ok((await stat(join(root, name))).size <= CHUNK_BYTES);
      output.push(await readFile(join(root, name)));
    }
    assert.deepEqual(Buffer.concat(output), input);
    async function* broken() { yield Buffer.alloc(12); throw Error('interrupted'); }
    await assert.rejects(writeChunks(broken(), root), /interrupted/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Existing invalid caches are refused without redownload or replacement', async () => {
  const { writeFile, symlink } = await import('node:fs/promises');
  const { openKernel } = await import('../lib/kernels.mjs');
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  const root = await mkdtemp(join(runtime, 'cache-test-'));
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error('must not fetch'); };
  try {
    const directory = join(root, 'de440s');
    await mkdir(directory);
    await assert.rejects(acquireKernel('de440s.bsp', { root, fetchImpl }));
    await writeFile(join(directory, 'receipt.json'), '{}');
    await assert.rejects(openKernel(directory), /Invalid kernel receipt/);
    await assert.rejects(acquireKernel('de440s.bsp', { root, fetchImpl }), /Invalid kernel receipt/);
    assert.equal(calls, 0);
    const linked = join(root, 'linked');
    await symlink(directory, linked);
    await assert.rejects(openKernel(linked), /Cache directory required/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
