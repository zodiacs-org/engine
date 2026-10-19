import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertDiskBudget, checkDiskBudget, checkFileBytes, DISK_LIMIT_BYTES, MAX_FILE_BYTES, measureDiskUsage, withAcquisitionBudget } from '../lib/disk-budget.mjs';

const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
async function fixture(action) {
  await mkdir(runtime, { recursive: true });
  const project = await mkdtemp(join(runtime, 'disk-budget-test-'));
  try { await action(project); }
  finally { await rm(project, { recursive: true, force: true }); }
}

test('fixed disk cap accepts its exact edge and rejects invalid or excessive byte counts', () => {
  assert.equal(DISK_LIMIT_BYTES, 6_000_000_000);
  assert.equal(MAX_FILE_BYTES, 2_000_000);
  assert.equal(checkFileBytes(MAX_FILE_BYTES - 1), 1_999_999);
  assert.throws(() => checkFileBytes(MAX_FILE_BYTES), /File must be below 2000000 bytes/);
  assert.throws(() => checkFileBytes(MAX_FILE_BYTES + 1), /File must be below 2000000 bytes/);
  assert.deepEqual(checkDiskBudget(4_000_000_000, 2_000_000_000), {
    usedBytes: 4_000_000_000, additionalBytes: 2_000_000_000, totalBytes: 6_000_000_000,
    remainingBytes: 0, limitBytes: 6_000_000_000
  });
  assert.equal(checkDiskBudget(DISK_LIMIT_BYTES, 0).remainingBytes, 0);
  for (const [used, additional] of [[0, DISK_LIMIT_BYTES + 1], [DISK_LIMIT_BYTES, 1], [DISK_LIMIT_BYTES + 1, 0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) {
    assert.throws(() => checkDiskBudget(used, additional), /Disk budget exceeded/);
  }
  for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '12', null, undefined, 1n]) {
    assert.throws(() => checkDiskBudget(invalid, 0), /nonnegative safe integer/);
    assert.throws(() => checkDiskBudget(0, invalid), /nonnegative safe integer/);
    assert.throws(() => checkFileBytes(invalid), /nonnegative safe integer/);
  }
});

test('usage counts nested runtime cache once and includes top-level cache and abandoned staging files', async () => {
  await fixture(async project => {
    assert.deepEqual(await measureDiskUsage({ project }), { usedBytes: 0, fileCount: 0, limitBytes: DISK_LIMIT_BYTES });
    for (const name of ['runtime/cache', 'runtime/.download-abandoned', 'cache']) await mkdir(join(project, name), { recursive: true });
    await writeFile(join(project, 'runtime/cache/a.chunk'), Buffer.alloc(11));
    await writeFile(join(project, 'runtime/.download-abandoned/.partial'), Buffer.alloc(13));
    await writeFile(join(project, 'cache/b.chunk'), Buffer.alloc(17));
    await writeFile(join(project, 'unrelated.txt'), Buffer.alloc(19));
    assert.deepEqual(await measureDiskUsage({ project }), { usedBytes: 41, fileCount: 3, limitBytes: DISK_LIMIT_BYTES });
    const budget = await assertDiskBudget(23, { project });
    assert.equal(budget.totalBytes, 64);
    assert.equal(budget.additionalBytes, 23);
    assert.equal(budget.remainingBytes, DISK_LIMIT_BYTES - 64);
    assert.equal(budget.fileCount, 3);
    await assert.rejects(assertDiskBudget(DISK_LIMIT_BYTES - 40, { project }), /Disk budget exceeded/);
  });
});

test('usage rejects symbolic links at roots and inside nested directories', async () => {
  await fixture(async project => {
    await mkdir(join(project, 'runtime'));
    await writeFile(join(project, 'runtime/regular'), 'synthetic');
    for (const name of ['cache', 'runtime/link']) {
      await symlink(join(project, 'runtime/regular'), join(project, name));
      await assert.rejects(measureDiskUsage({ project }), /symbolic link forbidden/);
      await rm(join(project, name));
    }
    await rm(join(project, 'runtime'), { recursive: true });
    await mkdir(join(project, 'target'));
    await symlink(join(project, 'target'), join(project, 'runtime'));
    await assert.rejects(measureDiskUsage({ project }), /symbolic link forbidden/);
    await assert.rejects(withAcquisitionBudget(0, () => assert.fail('must not run'), { project }), /Regular runtime directory required/);
  });
});

test('usage rejects nonregular entries and regular files at directory roots', async () => {
  await fixture(async project => {
    await mkdir(join(project, 'runtime'));
    const fifo = join(project, 'runtime/pipe');
    execFileSync('mkfifo', [fifo]);
    await assert.rejects(measureDiskUsage({ project }), /regular file or directory required/);
    await rm(fifo);
    await writeFile(join(project, 'cache'), 'synthetic');
    await assert.rejects(measureDiskUsage({ project }), /regular directory required/);
    await rm(join(project, 'cache'));
    await rm(join(project, 'runtime'), { recursive: true });
    await writeFile(join(project, 'runtime'), 'synthetic');
    await assert.rejects(measureDiskUsage({ project }), /regular directory required/);
  });
});

test('acquisition checks the reservation before the action and releases its lock on success and failure', async () => {
  await fixture(async project => {
    let called = false;
    await assert.rejects(withAcquisitionBudget(DISK_LIMIT_BYTES + 1, () => { called = true; }, { project }), /Disk budget exceeded/);
    assert.equal(called, false);
    assert.deepEqual(await readdir(join(project, 'runtime')), []);
    const result = await withAcquisitionBudget(3, async budget => {
      assert.equal(budget.additionalBytes, 3);
      assert.equal(budget.usedBytes, 0);
      assert((await lstat(join(project, 'runtime/.acquisition.lock'))).isDirectory());
      await writeFile(join(project, 'runtime/data'), 'abc');
      return 'saved';
    }, { project });
    assert.equal(result, 'saved');
    assert.deepEqual(await readdir(join(project, 'runtime')), ['data']);
    await assert.rejects(withAcquisitionBudget(0, async () => { throw Error('synthetic interruption'); }, { project }), /synthetic interruption/);
    assert.deepEqual(await readdir(join(project, 'runtime')), ['data']);
    await assert.rejects(withAcquisitionBudget(-1, () => {}, { project }), /nonnegative safe integer/);
    await assert.rejects(withAcquisitionBudget(0, null, { project }), /Acquisition action required/);
  });
});

test('existing acquisition locks are never stolen and simultaneous reservations are refused', async () => {
  await fixture(async project => {
    await mkdir(join(project, 'runtime/.acquisition.lock'), { recursive: true });
    await writeFile(join(project, 'runtime/.acquisition.lock/owner'), 'synthetic');
    await assert.rejects(withAcquisitionBudget(0, () => assert.fail('must not run'), { project }), /acquisition is locked/);
    assert.deepEqual(await readdir(join(project, 'runtime/.acquisition.lock')), ['owner']);
    await rm(join(project, 'runtime/.acquisition.lock'), { recursive: true });
    await withAcquisitionBudget(0, async () => {
      await assert.rejects(withAcquisitionBudget(0, () => assert.fail('must not run'), { project }), /acquisition is locked/);
    }, { project });
    assert.deepEqual(await readdir(join(project, 'runtime')), []);
  });
});
