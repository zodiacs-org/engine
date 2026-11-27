#!/usr/bin/env node
/*
 * Run inside Node, Bun or Deno (not by the harness): prints one JSON line
 * naming the runtime that runs it, as that runtime reports itself, and the
 * five synthetic receipts of receipt-cases.mjs computed in it. It loads the
 * build in ../../dist; ZODIACS_ENGINE_DIST points it at another, as it does
 * the adapter, for example an extracted release archive's `package/dist`.
 *
 *   bun tools/runtime-conformance/native-extras.mjs
 *   deno run -A tools/runtime-conformance/native-extras.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { receiptTexts } from './receipt-cases.mjs';

const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL('../../dist', import.meta.url)));
const entryIndex = process.argv.indexOf('--entry');
const entry = entryIndex === -1 ? 'root' : process.argv[entryIndex + 1];
if (!['root', 'core'].includes(entry)) {
  console.error('usage: native-extras.mjs [--entry core]');
  process.exit(2);
}

/** Whether the build has the pack entry: its de440-pack.js, or a package.json beside it that exports ./de440/pack. */
function hasPack() {
  if (existsSync(resolve(dist, 'de440-pack.js'))) return true;
  const path = resolve(dist, '../package.json');
  if (!existsSync(path)) return false;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  return manifest.name === '@zodiacs/engine' && Object.hasOwn(manifest.exports ?? {}, './de440/pack');
}

const engine = await import(pathToFileURL(resolve(dist, entry === 'core' ? 'core.js' : 'index.js')).href);
if (entry === 'root' && hasPack()) {
  // The root's receipts on the shipped DE440 pack, as the adapter answers: from
  // 3.0.0 useDe440() makes it the default; from 1.1.0-rc.9 to 2.1.0 the entry
  // has no useDe440, and the pack was the default already. A build before
  // 1.1.0-rc.9 has no pack and computes on astronomy-engine, which its receipts
  // name. A build that has the entry loads it here, so that one whose pack does
  // not load fails rather than answering on astronomy-engine.
  const pack = await import(pathToFileURL(resolve(dist, 'de440-pack.js')).href);
  if (typeof pack.useDe440 === 'function') pack.useDe440();
}
const receipt = await import(pathToFileURL(resolve(dist, 'receipt.js')).href);

/** The runtime, from its own globals: Bun and Deno also define process.versions.node, so they are asked first. */
function describeRuntime() {
  const versions = globalThis.process?.versions ?? {};
  const tz = typeof versions.tz === 'string' ? versions.tz : 'not exposed';
  const icu = typeof versions.icu === 'string' ? versions.icu : 'not exposed';
  if (globalThis.Bun) {
    return { name: 'bun', version: globalThis.Bun.version, revision: globalThis.Bun.revision, engine: 'JavaScriptCore', engineVersion: versions.webkit ?? 'not exposed', intlTzdb: tz, icu };
  }
  if (globalThis.Deno) {
    return { name: 'deno', version: globalThis.Deno.version.deno, engine: 'V8', engineVersion: globalThis.Deno.version.v8, intlTzdb: tz, icu };
  }
  return { name: 'node', version: versions.node, engine: 'V8', engineVersion: versions.v8, intlTzdb: tz, icu };
}

process.stdout.write(`${JSON.stringify({
  runtime: { ...describeRuntime(), platform: globalThis.process?.platform, arch: globalThis.process?.arch },
  engineVersion: engine.ENGINE_VERSION,
  receipts: receiptTexts(engine, receipt),
})}\n`);
