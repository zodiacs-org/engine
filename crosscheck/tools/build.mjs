import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MAX_FILE_BYTES } from './check.mjs';

export const project = fileURLToPath(new URL('../', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const buildDirectory = join(project, 'runtime/build');
const receiptPath = join(project, 'runtime/build-identity.json');
export const digest = value => createHash('sha256').update(value).digest('hex');

export function requireNode22(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major !== 22 || minor < 13) throw new Error('Crosscheck requires Node 22.13 or later in the Node 22 series.');
}

export async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Paths and content both contribute. No timestamps or absolute paths enter identity.
export async function fingerprintTree(root, select = () => true) {
  const entries = [];
  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const label = prefix + name;
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Symbolic link forbidden: ${label}`);
      if (info.isDirectory()) await visit(path, `${label}/`);
      else if (!info.isFile()) throw new Error(`Regular file required: ${label}`);
      else if (select(label)) {
        if (info.size >= MAX_FILE_BYTES) throw new Error(`Oversized file: ${label}`);
        entries.push({ path: label, bytes: info.size, sha256: await fileDigest(path) });
      }
    }
  }
  await visit(root);
  return { sha256: digest(JSON.stringify(entries)), entries };
}

const sourceSelection = path => path.endsWith('.ts') && !path.endsWith('.test.ts');
async function inputs() {
  const manifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  const dependencyPath = join(project, 'node_modules/astronomy-engine');
  const dependency = JSON.parse(await readFile(join(dependencyPath, 'package.json'), 'utf8'));
  if (dependency.version !== manifest.dependencies['astronomy-engine'] || dependency.version !== '2.1.19') {
    throw new Error('Installed astronomy-engine does not match the pinned engine dependency.');
  }
  return {
    source: await fingerprintTree(join(repository, 'src'), sourceSelection),
    engineManifest: await fileDigest(join(repository, 'package.json')),
    engineLock: await fileDigest(join(repository, 'package-lock.json')),
    toolingManifest: await fileDigest(join(project, 'package.json')),
    toolingLock: await fileDigest(join(project, 'package-lock.json')),
    builder: await fileDigest(fileURLToPath(import.meta.url)),
    safeguards: await fileDigest(join(project, 'tools/check.mjs')),
    dependency: { name: dependency.name, version: dependency.version,
      ...await fingerprintTree(dependencyPath) },
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      versions: process.versions, executableSha256: await fileDigest(process.execPath) },
    compiler: 'node:module.stripTypeScriptTypes;mode=transform'
  };
}

export async function build() {
  requireNode22();
  await mkdir(join(project, 'runtime'), { recursive: true });
  // An unsuccessful build must not leave an apparently valid receipt.
  await rm(receiptPath, { force: true });
  const before = await inputs();
  const { stripTypeScriptTypes } = await import('node:module');
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(buildDirectory, { recursive: true });
  await writeFile(join(buildDirectory, 'package.json'), '{"type":"module","private":true}\n');
  for (const entry of before.source.entries) {
    const source = await readFile(join(repository, 'src', entry.path), 'utf8');
    if (digest(source) !== entry.sha256) throw new Error('Source changed during build.');
    const output = stripTypeScriptTypes(source, { mode: 'transform' });
    if (Buffer.byteLength(output) >= MAX_FILE_BYTES) throw new Error('Oversized build output.');
    const path = join(buildDirectory, entry.path.replace(/\.ts$/, '.js'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, output);
  }
  if (JSON.stringify(before) !== JSON.stringify(await inputs())) throw new Error('Inputs changed during build.');
  const output = await fingerprintTree(buildDirectory);
  const identity = { schema: 'crosscheck-build/1', inputs: before, output };
  const receipt = { ...identity, sha256: digest(JSON.stringify(identity)),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim() };
  const serialized = JSON.stringify(receipt, null, 2) + '\n';
  if (Buffer.byteLength(serialized) >= MAX_FILE_BYTES) throw new Error('Oversized build receipt.');
  await writeFile(receiptPath, serialized);
  return receipt;
}

export async function verifyBuild() {
  requireNode22();
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const identity = { schema: receipt.schema, inputs: receipt.inputs, output: receipt.output };
  if (receipt.schema !== 'crosscheck-build/1' || digest(JSON.stringify(identity)) !== receipt.sha256) {
    throw new Error('Invalid build receipt.');
  }
  if (JSON.stringify(receipt.inputs) !== JSON.stringify(await inputs())) throw new Error('Build inputs changed; rebuild required.');
  if (JSON.stringify(receipt.output) !== JSON.stringify(await fingerprintTree(buildDirectory))) {
    throw new Error('Build output changed; rebuild required.');
  }
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--verify')) throw new Error('Usage: node crosscheck/tools/build.mjs [--verify]');
    const receipt = process.argv[2] ? await verifyBuild() : await build();
    console.log(`Crosscheck build ${process.argv[2] ? 'verified' : 'created'}: ${receipt.sha256}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
