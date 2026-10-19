import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { changedPaths, checkScope, checkDocumentation, checkLocalLinks } from '../scripts/check-project.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), tip = 'c'.repeat(40);
const nul = paths => paths.length ? paths.join('\0') + '\0' : '';

// Model a clean CI checkout without writing any repository metadata.
function snapshot({ committed = [], working = [], untracked = [], sameHead = false,
  baseRef = 'origin/main', baseTip = base } = {}) {
  const headCommit = sameHead ? base : head;
  const replies = [
    [['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`], baseTip + '\n'],
    [['rev-parse', '--verify', 'HEAD^{commit}'], headCommit + '\n'],
    [['merge-base', baseTip, headCommit], base + '\n'],
    [['diff', '--name-only', '--no-renames', '-z', base, headCommit], nul(committed)],
    [['diff', '--name-only', '--no-renames', '-z', 'HEAD'], nul(working)],
    [['ls-files', '--others', '--exclude-standard', '-z'], nul(untracked)]
  ];
  return args => {
    const next = replies.shift();
    assert.ok(next, 'Unexpected git call');
    assert.deepEqual(args, next[0]);
    return next[1];
  };
}

test('clean PR checkout rejects committed paths outside the allowed scope', () => {
  assert.throws(() => checkScope(changedPaths(snapshot({
    committed: ['skydb/src/config.mjs', 'src/index.ts']
  }))), /src\/index.ts/);
  checkScope(changedPaths(snapshot({ committed: ['skydb/README.md', '.github/workflows/skydb.yml'] })));
  for (const path of ['package.json', 'artifacts/archive.tgz', '.github/workflows/ci.yml']) {
    assert.throws(() => checkScope(changedPaths(snapshot({ committed: [path] }))), /Changes must stay/);
  }
});

test('comparison uses merge base and includes staged, unstaged and untracked paths', () => {
  const options = { baseRef: tip, baseTip: tip, committed: ['skydb/a.mjs'],
    working: ['skydb/a.mjs', 'skydb/a b.mjs'], untracked: ['skydb/a\nb.mjs'] };
  assert.deepEqual(changedPaths(snapshot(options), tip), ['skydb/a.mjs', 'skydb/a b.mjs', 'skydb/a\nb.mjs']);
  for (const type of ['working', 'untracked']) {
    assert.throws(() => checkScope(changedPaths(snapshot({
      committed: ['skydb/a.mjs'], [type]: ['README.md']
    }))), /README.md/);
  }
  // With rename detection disabled, deletion of an outside source is retained.
  assert.throws(() => checkScope(changedPaths(snapshot({ committed: ['src/old.mjs', 'skydb/new.mjs'] }))), /src\/old.mjs/);
});

test('missing history and unexpectedly empty committed lists fail closed', () => {
  assert.throws(() => changedPaths(snapshot()), /empty although HEAD differs/);
  assert.deepEqual(changedPaths(snapshot({ sameHead: true })), []);
  const failure = new Error('comparison ref unavailable');
  assert.throws(() => changedPaths(() => { throw failure; }), error => error === failure);
  let calls = 0;
  assert.throws(() => changedPaths(() => ++calls === 3 ? '' : base), /Cannot resolve comparison base/);
});

test('both prohibited dash characters reject authored docs with exact upstream notice exceptions', () => {
  for (const dash of ['\u2013', '\u2014']) {
    for (const path of ['skydb/README.md', 'skydb/CHANGES.txt', 'skydb/docs/example.md', 'skydb/samples/other.txt']) {
      assert.throws(() => checkDocumentation(path, `example ${dash} example`), /Prohibited dash/);
    }
    for (const path of ['skydb/samples/ENGINE-LICENSING.txt', 'skydb/samples/NOTICE.txt']) {
      checkDocumentation(path, `verbatim ${dash} notice`);
    }
  }
  checkDocumentation('skydb/README.md', 'Ordinary - punctuation.');
});

test('local documentation links resolve relative to their file and missing targets fail', async () => {
  const seen = [];
  await checkLocalLinks('skydb/docs/example.md',
    '[source](../src/config.mjs#part) [directory](../) [space](<../a b.md>) ' +
    '[encoded](../a%20b.md) [web](https://example.org/a) [fragment](#part)',
    async path => seen.push(path));
  const project = fileURLToPath(new URL('../', import.meta.url));
  assert.deepEqual(seen, [project + 'src/config.mjs', project.slice(0, -1), project + 'a b.md', project + 'a b.md']);
  await checkLocalLinks('skydb/README.md', '[source](src/config.mjs)');
  await assert.rejects(checkLocalLinks('skydb/README.md', '[missing](missing-file.mjs)'), /Missing local link/);
});

test('dedicated workflow supplies history and event base and filters unrelated paths', async () => {
  const contents = await readFile(new URL('../../.github/workflows/skydb.yml', import.meta.url), 'utf8');
  assert.match(contents, /fetch-depth: 0/);
  assert.match(contents, /SKYDB_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/);
  assert.equal((contents.match(/paths: \['skydb\/\*\*', '\.github\/workflows\/skydb.yml'\]/g) ?? []).length, 2);
  // Real read-only git invocation also preserves the checkout's full change list.
  const git = args => execFileSync('git', args, { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  checkScope(changedPaths(git));
});
