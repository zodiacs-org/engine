import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { requireNode22 } from '../src/identity.mjs';

requireNode22();
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const changed = [...git(['diff', '--name-only', '-z', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])];
assert.ok(changed.every(path => path.startsWith('skydb/')), 'Changes must stay in skydb/');
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'skydb/']))];
for (const path of files) {
  const info = await lstat(join(root, path));
  assert.ok(info.isFile(), `Candidate must be a regular file: ${path}`);
  assert.ok(info.size < 2_000_000, `Candidate exceeds file limit: ${path}`);
  if (path.endsWith('.md') || path.endsWith('.txt')) {
    assert.ok(!(await readFile(join(root, path), 'utf8')).includes('\u2014'), `Em dash in documentation: ${path}`);
  }
}
const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json',
  '--cache', join(root, 'skydb/.cache/npm')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.ok(packed[0].files.every(file => !file.path.startsWith('skydb/')), 'skydb must not ship in the engine package');
execFileSync('git', ['diff', '--check'], { cwd: root, stdio: 'inherit' });
console.log('SkyDB folder isolation, candidate sizes, documentation, whitespace and npm exclusion pass.');
