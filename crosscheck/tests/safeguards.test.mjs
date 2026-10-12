import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { checkFiles, checkLocalSizes, MAX_FILE_BYTES } from '../tools/check.mjs';

test('rejects unsafe publishable files and skips runtime', async () => {
  const runtime = new URL('../runtime/', import.meta.url);
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(join(runtime.pathname, 'safeguards-test-'));
  try {
    await writeFile(join(root, 'README.md'), 'plain documentation\n');
    assert.deepEqual(await checkFiles(root), []);
    await writeFile(join(root, 'bad.txt'), '\u2014');
    await writeFile(join(root, 'de440.bsp'), 'synthetic test marker');
    await writeFile(join(root, 'large.csv'), Buffer.alloc(MAX_FILE_BYTES));
    await symlink('README.md', join(root, 'link'));
    await mkdir(join(root, 'runtime'));
    await writeFile(join(root, 'runtime', 'ignored.txt'), '\u2014');
    const errors = await checkFiles(root);
    assert.equal(errors.length, 4);
    for (const name of ['bad.txt', 'de440.bsp', 'large.csv', 'link']) {
      assert(errors.some(error => error.startsWith(`${name}:`)));
    }
    await writeFile(join(root, 'runtime', 'oversized.chunk'), Buffer.alloc(MAX_FILE_BYTES));
    const localErrors = await checkLocalSizes(root);
    assert.equal(localErrors.length, 3);
    assert(localErrors.some(error => error.startsWith('runtime/oversized.chunk:')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('runtime destinations are ignored by git', () => {
  const paths = ['crosscheck/runtime/cache/chunk', 'crosscheck/runtime/build/index.js',
    'crosscheck/runtime/checkpoints/state.json', 'crosscheck/node_modules/example/index.js'];
  const result = execFileSync('git', ['check-ignore', '--no-index', ...paths], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.deepEqual(result.trim().split('\n'), paths);
});

test('npm dry-run excludes crosscheck without invoking build scripts', () => {
  const root = new URL('../../', import.meta.url);
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, npm_config_cache: new URL('../runtime/npm-cache/', import.meta.url).pathname }
  });
  const [report] = JSON.parse(output);
  assert(report.files.length > 0);
  assert(!report.files.some(file => file.path.startsWith('crosscheck/')));
});
