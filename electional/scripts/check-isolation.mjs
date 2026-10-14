import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const parent = fileURLToPath(new URL('../../', import.meta.url));
const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
const localPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(localPackage.private, true, 'The workbench must remain private.');

// Do not run the parent prepack hook: it builds the released engine into dist/.
// A dry run asks npm for its real file selection without creating an archive.
const report = JSON.parse(execFileSync('npm', [
  'pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache,
], { cwd: parent, encoding: 'utf8' }));
assert.equal(report.length, 1);
assert(Array.isArray(report[0].files), 'npm must return a file listing.');
assert(report[0].files.length > 0, 'An empty package listing cannot establish isolation.');
for (const file of report[0].files) {
  assert(!file.path.startsWith('electional/'), `Workbench file would ship: ${file.path}`);
}

// filesOnly discovers paths without collecting or executing engine tests. Run
// from the parent so its normal defaults apply, and disable the result cache.
const discovered = execFileSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'list', '--root', parent, '--filesOnly', '--cache=false',
], { cwd: parent, encoding: 'utf8' });
const paths = discovered.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  .map((path) => resolve(parent, path));
assert(paths.some((path) => relative(parent, path).startsWith(`src${sep}`)
  && path.endsWith('.test.ts')),
  'Parent discovery must find engine tests before checking isolation.');
assert(!paths.some((path) => path.startsWith(project)),
  'The parent test runner must not discover workbench tests.');

console.log('Isolation passed: npm excludes electional/ and parent Vitest discovers no workbench tests.');
console.log('This checks file selection and test discovery, not parent build, size budgets or archive binding.');
