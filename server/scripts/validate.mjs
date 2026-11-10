import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local validation only. No root build, archive creation or git mutation.
const server = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [major, minor, patch] = process.versions.node.split('.').map(Number);
assert(major === 22 && (minor > 22 || (minor === 22 && patch >= 2)), 'Use the Node range in server/package.json.');
assert(process.argv.length === 2, 'Usage: node server/scripts/validate.mjs');

const report = {
  schema: 'zodiacs-http-validation/1',
  generatedAt: null,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  localChecksPassed: false,
  checks: [],
  loadEvidence: null,
  inputs: [],
  inputsDigest: null,
  limitations: [
    'Local checks do not execute Docker. Run npm --prefix server run test:container on a Docker host.',
    'Root package, archive, conformance and atlas gates are separate; no root dist is built here.',
    'Load identity verification rechecks retained measurements, not current machine performance.',
    'Engine parity and receipt replay are integration checks, not independent astronomical accuracy evidence.',
  ],
};

async function records(paths) {
  return Promise.all(paths.sort().map(async (path) => ({ path, sha256: digest(await readFile(join(root, path))) })));
}

async function validationInputs() {
  const paths = [
    'server/package.json', 'server/package-lock.json', 'server/tsconfig.json', 'server/vitest.config.ts',
    'server/Dockerfile', 'server/Dockerfile.dockerignore',
    'server/CLIENTS.md', 'server/README.md', 'server/DEPLOYMENT.md', 'server/LOAD-TESTING.md', 'server/VALIDATION.md',
  ];
  async function collect(directory) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await collect(path);
      else {
        assert(entry.isFile(), 'Validation inputs must be regular files.');
        paths.push(path);
      }
    }
  }
  for (const directory of ['server/src', 'server/test', 'server/scripts']) await collect(directory);
  return records(paths);
}

async function verifyLoadEvidence() {
  const path = 'server/docs/evidence/load-local.json';
  const bytes = await readFile(join(root, path));
  const evidence = JSON.parse(bytes);
  assert(evidence.schema === 'zodiacs-http-load/1' && evidence.passed === true, 'Expected successful load evidence.');
  assert(evidence.build.algorithm === 'sha256', 'Unknown load digest algorithm.');
  assert(Array.isArray(evidence.build.inputs) && evidence.build.inputs.length > 0, 'Missing load inputs.');
  assert.equal(new Set(evidence.build.inputs.map(({ path }) => path)).size, evidence.build.inputs.length, 'Duplicate load inputs.');
  assert.deepEqual(evidence.build.bundles.map(({ path }) => path).sort(),
    ['server/build/calculation-worker.js', 'server/build/main.js'], 'Missing or unexpected load bundles.');
  assert.equal(digest(JSON.stringify(evidence.build.inputs)), evidence.build.inputsDigest, 'Load input digest is inconsistent.');
  for (const record of [...evidence.build.inputs, ...evidence.build.bundles]) {
    assert(!record.path.includes('..') && !record.path.startsWith('/'), 'Load paths must be relative.');
    assert.equal(digest(await readFile(join(root, record.path))), record.sha256, `Load evidence is stale: ${record.path}`);
  }
  for (const record of evidence.build.bundles) {
    assert.equal((await readFile(join(root, record.path))).length, record.bytes, 'Load bundle size is inconsistent.');
  }
  return { path, sha256: digest(bytes), inputsDigest: evidence.build.inputsDigest, inputsMatch: true, bundlesMatch: true };
}

const before = await validationInputs();
// npm and its scripts must use the same Node executable as this command.
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, npm_config_cache: join(server, '.cache/npm') };
for (const name of ['API_KEY', 'API_KEYS', 'API_KEYS_FILE']) delete env[name];
for (const name of ['typecheck', 'test', 'build', 'check:package']) {
  const args = ['run', name];
  console.log(`Running server check: ${name}`);
  const output = execFileSync('npm', args, { cwd: server, env, encoding: 'utf8', maxBuffer: 1_500_000 });
  process.stdout.write(output);
  report.checks.push({ command: ['npm', '--prefix', 'server', ...args], exitCode: 0 });
}
report.loadEvidence = await verifyLoadEvidence();
report.inputs = await validationInputs();
assert.deepEqual(report.inputs, before, 'Validation inputs changed during the run. Repeat after editing.');
report.inputsDigest = digest(JSON.stringify(report.inputs));
report.localChecksPassed = true;
report.generatedAt = new Date().toISOString();
const bytes = JSON.stringify(report, null, 2) + '\n';
assert(Buffer.byteLength(bytes) < 2_000_000, 'Validation report is too large.');
await mkdir(join(server, '.cache/validation'), { recursive: true });
const directory = await mkdtemp(join(server, '.cache/validation/run-'));
const path = join(directory, 'report.json');
await writeFile(path, bytes, { flag: 'wx' });
console.log(`Local validation passed. Report: ${path}`);
