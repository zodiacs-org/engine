import { readFileSync } from 'node:fs';
import { argv } from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(argv[2]);
const original = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const staged = JSON.parse(readFileSync(resolve(root, 'deno.json'), 'utf8'));
if (original.name !== '@zodiacs/engine' || original.version !== '0.1.1-rc.16') throw Error('wrong package');
const keys = Object.keys(original.exports).sort();
if (keys.length !== 14 || JSON.stringify(keys) !== JSON.stringify(Object.keys(staged.exports).sort())) throw Error('entry set changed');
const rows = [];
for (const entry of keys) {
  const wrapped = await import(pathToFileURL(resolve(root, staged.exports[entry])).href);
  const direct = await import(pathToFileURL(resolve(root, original.exports[entry].import)).href);
  const a = Object.keys(wrapped).sort(), b = Object.keys(direct).sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('export set changed: ' + entry);
  for (const name of a) if (wrapped[name] !== direct[name]) throw Error('binding changed: ' + entry + ':' + name);
  rows.push({entry, exports: a.length});
}
console.log(JSON.stringify({passed: rows.length, rows}));
