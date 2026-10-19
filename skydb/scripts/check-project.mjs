import { execFileSync } from 'node:child_process';
import { access, readFile, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { requireNode22 } from '../src/identity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = '.github/workflows/skydb.yml';
// Preserve verbatim upstream notices, including their original punctuation.
const upstreamNotices = new Set(['skydb/samples/ENGINE-LICENSING.txt', 'skydb/samples/NOTICE.txt']);
const pathsFrom = output => output.split('\0').filter(Boolean);

export function changedPaths(git, baseRef = 'origin/main') {
  const baseCommit = git(['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]).trim();
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const base = git(['merge-base', baseCommit, head]).trim();
  assert.ok(/^[a-f0-9]{40,64}$/.test(base), 'Cannot resolve comparison base; full git history is required');
  // Disable rename detection so moving an outside file into skydb cannot hide it.
  const committed = pathsFrom(git(['diff', '--name-only', '--no-renames', '-z', base, head]));
  assert.ok(committed.length > 0 || base === head,
    'Committed change list is empty although HEAD differs from the comparison base');
  return [...new Set([...committed,
    ...pathsFrom(git(['diff', '--name-only', '--no-renames', '-z', 'HEAD'])),
    ...pathsFrom(git(['ls-files', '--others', '--exclude-standard', '-z']))])];
}

export function checkScope(paths) {
  const outside = paths.filter(path => !path.startsWith('skydb/') && path !== workflow);
  assert.deepEqual(outside, [], `Changes must stay in skydb/ or ${workflow}: ${outside.join(', ')}`);
}

export function checkDocumentation(path, contents) {
  if (!upstreamNotices.has(path)) {
    assert.ok(!/[\u2013\u2014]/u.test(contents), `Prohibited dash in documentation: ${path}`);
  }
}

export async function checkLocalLinks(path, contents, checkExists = access) {
  // Inline file links, including angle-bracket destinations with spaces.
  for (const match of contents.matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
    const destination = match[1] ?? match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(destination)) continue;
    const local = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
    if (!local) continue;
    const target = resolve(root, dirname(path), local);
    try { await checkExists(target); }
    catch { throw new Error(`Missing local link in ${path}: ${destination}`); }
  }
}

async function main() {
  requireNode22();
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  checkScope(changedPaths(git, process.env.SKYDB_BASE_REF ?? 'origin/main'));
  const files = [...new Set(pathsFrom(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'skydb/', workflow])))];
  const deleted = new Set(pathsFrom(git(['ls-files', '--deleted', '-z', '--', 'skydb/', workflow])));
  for (const path of files) {
    if (deleted.has(path)) continue;
    const info = await lstat(join(root, path));
    assert.ok(info.isFile(), `Candidate must be a regular file: ${path}`);
    assert.ok(info.size < 2_000_000, `Candidate exceeds file limit: ${path}`);
    if (path.endsWith('.md') || path.endsWith('.txt')) {
      const contents = await readFile(join(root, path), 'utf8');
      checkDocumentation(path, contents);
      if (path.endsWith('.md')) await checkLocalLinks(path, contents);
    }
  }
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json',
    '--cache', join(root, 'skydb/.cache/npm')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.ok(packed[0].files.every(file => !file.path.startsWith('skydb/')), 'skydb must not ship in the engine package');
  execFileSync('git', ['diff', '--check'], { cwd: root, stdio: 'inherit' });
  console.log('SkyDB base and working-tree isolation, candidate sizes, documentation, local links, whitespace and npm exclusion pass.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
