import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(packageRoot, '../..');
const sourceRoot = resolve(repo, 'conformance');
const targetRoot = resolve(packageRoot, 'conformance');
const paths = new Set([
  'LICENSE', 'README.md', 'SPEC.md', 'DISCREPANCIES.md',
  'harness/lib.mjs', 'adapters/zodiacs-engine.mjs',
]);
// The suite version the harness runs, and its files (conformance/harness/lib.mjs).
const { LEVEL_FILES } = await import(pathToFileURL(resolve(sourceRoot, 'harness/lib.mjs')).href);
const vectorFiles = Object.values(LEVEL_FILES);
let vectorCount = 0;
for (const path of vectorFiles) {
  paths.add(path);
  const level = JSON.parse(await readFile(resolve(sourceRoot, path), 'utf8'));
  vectorCount += level.vectors.length;
  for (const arbiter of Object.values(level.arbiters)) {
    paths.add(arbiter.generator);
    for (const input of arbiter.inputs) if (input.path) paths.add(input.path);
  }
}
await rm(targetRoot, { recursive: true, force: true });
const files = {};
for (const path of [...paths].sort()) {
  const source = resolve(sourceRoot, path);
  const rel = relative(sourceRoot, source);
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Suite source escaped conformance/');
  const target = resolve(targetRoot, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  const bytes = await readFile(source);
  await writeFile(target, bytes);
  files[path] = createHash('sha256').update(bytes).digest('hex');
}
const { readSuite, validateLevel } = await import('../conformance/harness/lib.mjs');
if (readSuite(targetRoot).some((level) => validateLevel(level, targetRoot).length)) {
  throw new Error('Original suite validation failed before private packing');
}
await writeFile(resolve(targetRoot, 'manifest.json'), JSON.stringify({
  schema: 'zodiacs.cli-conformance-files.v1', vectorCount, files,
}, null, 2) + '\n');
await writeFile(resolve(packageRoot, 'LICENSE'), await readFile(resolve(repo, 'LICENSE')));
console.log('CLI suite bundle: ' + vectorCount + ' vectors, ' + paths.size + ' source files');
