#!/usr/bin/env node
/*
 * What two packed archives of the package hold, file by file and by kind, and
 * the difference.
 *
 *   node sizes.mjs <earlier.tgz> <later.tgz> > sizes.json
 *
 * Reads the archives only (tar's own listing gives each file's bytes, and
 * `tar -xO` its text). The kinds: the DE440 pack's base64 text (the one long
 * base64 string, in whichever one file of dist/ holds it); the JavaScript of
 * the root's import graph (dist/index.js and every chunk it imports,
 * statically and transitively), without that text; other JavaScript, which
 * only opt-in entries load; the zone
 * histories; declarations; documents (README.md, CHANGELOG.md, LICENSE,
 * LICENSING.md, NOTICE); and the manifest. `entryGraphs` gives, for each
 * entry point of the archive's package.json, the bytes of its static import
 * graph without the pack's text, as scripts/verify-package-contents.mjs
 * measures it, and whether the graph loads the file that holds the pack.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const PACK_DATA = /"([A-Za-z0-9+/]{1000,}={0,2})"/u;
const DOCUMENTS = ['README.md', 'CHANGELOG.md', 'LICENSE', 'LICENSING.md', 'NOTICE'];

function describe(path) {
  const bytes = readFileSync(path);
  const names = execFileSync('tar', ['-tzf', path], { encoding: 'utf8' }).trim().split('\n');
  const text = (name) => execFileSync('tar', ['-xzOf', path, name], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const files = Object.fromEntries(names.map((name) => [name.replace(/^package\//u, ''), Buffer.byteLength(text(name))]));
  const rootGraph = new Set();
  const visit = (file) => {
    if (rootGraph.has(file)) return;
    rootGraph.add(file);
    for (const match of text(`package/${file}`).matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["'](\.\/[^"']+)["']|^import\s*["'](\.\/[^"']+)["']/gmu)) {
      visit(`dist/${(match[1] ?? match[2]).slice(2)}`);
    }
  };
  visit('dist/index.js');
  const holders = Object.keys(files).filter((name) => name.endsWith('.js') && PACK_DATA.test(text(`package/${name}`)));
  if (holders.length > 1) throw new Error(`the pack's text is in ${holders.join(', ')}`);
  const packFile = holders[0] ?? null;
  const packText = packFile ? PACK_DATA.exec(text(`package/${packFile}`))[1] : '';
  const manifest = JSON.parse(text('package/package.json'));
  const entryGraphs = Object.fromEntries(Object.entries(manifest.exports).filter(([, target]) => target.import).map(([name, target]) => {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const match of text(`package/${file}`).matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["'](\.\/[^"']+)["']|^import\s*["'](\.\/[^"']+)["']/gmu)) {
        walk(`dist/${(match[1] ?? match[2]).slice(2)}`);
      }
    };
    walk(target.import.replace(/^\.\//u, ''));
    const all = [...seen].reduce((sum, file) => sum + files[file], 0);
    const loadsPack = packFile !== null && seen.has(packFile);
    return [name, { files: seen.size, bytesBesideThePack: all - (loadsPack ? packText.length : 0), loadsPack }];
  }));
  const kinds = { de440Pack: packText.length, rootJavaScript: 0, optInJavaScript: 0, zoneHistories: 0, declarations: 0, documents: 0, manifest: 0 };
  for (const [name, size] of Object.entries(files)) {
    if (name === 'package.json') kinds.manifest += size;
    else if (DOCUMENTS.includes(name)) kinds.documents += size;
    else if (name.endsWith('.d.ts')) kinds.declarations += size;
    else if (/^dist\/tzdb-/u.test(name)) kinds.zoneHistories += size;
    else if (rootGraph.has(name)) kinds.rootJavaScript += name === packFile ? size - packText.length : size;
    else kinds.optInJavaScript += name === packFile ? size - packText.length : size;
  }
  const unpacked = Object.values(files).reduce((sum, size) => sum + size, 0);
  return {
    version: JSON.parse(text('package/package.json')).version,
    archive: { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
    files: names.length,
    unpacked,
    unpackedBesideThePack: unpacked - packText.length,
    kinds,
    entryGraphs,
    de440Pack: packText
      ? { file: packFile, rootLoadsIt: rootGraph.has(packFile), base64Characters: packText.length, bytes: Buffer.from(packText, 'base64').length, sha256: createHash('sha256').update(Buffer.from(packText, 'base64')).digest('hex'), base64Gzip9: gzipSync(packText, { level: 9 }).length }
      : null,
    byFile: files,
  };
}

const [earlier, later] = process.argv.slice(2).map(describe);
const difference = {
  files: later.files - earlier.files,
  archiveBytes: later.archive.bytes - earlier.archive.bytes,
  archiveRatio: Number((later.archive.bytes / earlier.archive.bytes).toFixed(3)),
  unpacked: later.unpacked - earlier.unpacked,
  unpackedRatio: Number((later.unpacked / earlier.unpacked).toFixed(3)),
  kinds: Object.fromEntries(Object.keys(later.kinds).map((kind) => [kind, later.kinds[kind] - earlier.kinds[kind]])),
  added: Object.keys(later.byFile).filter((name) => !(name in earlier.byFile)),
  removed: Object.keys(earlier.byFile).filter((name) => !(name in later.byFile)),
};
console.log(JSON.stringify({ earlier, later, difference }, null, 1));
