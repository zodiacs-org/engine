import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installLockedDependencies } from '../scripts/setup.mjs';

test('setup requires the project lockfile before invoking npm', async () => {
  const generated = new URL('../generated/', import.meta.url);
  await mkdir(generated, { recursive: true });
  const directory = await mkdtemp(new URL('setup-test-', generated));
  const url = pathToFileURL(directory + '/');
  try {
    let calls = 0;
    const run = () => { calls++; return { status: 0 }; };
    assert.throws(() => installLockedDependencies(url, run), /Missing skydb package-lock.json/);
    assert.equal(calls, 0);
    await writeFile(new URL('package-lock.json', url), '{}');
    installLockedDependencies(url, (command, args, options) => {
      assert.equal(command, 'npm');
      assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache',
        fileURLToPath(new URL('.cache/npm', url))]);
      assert.equal(options.cwd, url);
      assert.equal(options.stdio, 'inherit');
      calls++;
      return { status: 0 };
    });
    assert.equal(calls, 1);
    const failure = new Error('npm unavailable');
    assert.throws(() => installLockedDependencies(url, () => ({ error: failure })), error => error === failure);
    for (const status of [1, null]) {
      assert.throws(() => installLockedDependencies(url, () => ({ status })), /Locked dependency installation failed/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
