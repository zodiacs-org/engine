// Run with a built package directory. npm dry-run supplies the unpacked file list.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const read = file => readFileSync(join(root, file), 'utf8');
const meta = JSON.parse(read('dist/metafile-esm.json'));
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
const sizes = new Map(pack.files.map(file => [file.path, file.size]));
const visited = new Set();
function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  for (const dependency of meta.outputs[file].imports) {
    if (!dependency.external && dependency.kind !== 'dynamic-import') visit(dependency.path);
  }
}
const calcEntry = 'dist/calc.js';
visit(calcEntry);
const graph = [...visited].reduce((sum, file) => sum + sizes.get(file), 0);
const strings = [...visited].flatMap(file => [...read(file).matchAll(/"([A-Za-z0-9+/]{1000,}={0,2})"/gu)]);
assert.equal(strings.length, 1, 'one sealed pack in the calc graph');
const packBytes = strings[0][1].length;
console.log(JSON.stringify({
  calcEntryBytes: sizes.get(calcEntry),
  calcDeclarationBytes: sizes.get('dist/calc.d.ts'),
  calcEntryInputs: Object.fromEntries(Object.entries(meta.outputs[calcEntry].inputs).map(
    ([file, { bytesInOutput }]) => [file, bytesInOutput]
  )),
  calcCodeBytes: graph - packBytes, calcGraphBytes: graph, packBase64Bytes: packBytes,
  unpackedBytes: pack.unpackedSize, unpackedBesidePackBytes: pack.unpackedSize - packBytes, packedFiles: pack.entryCount
}, null, 2));
