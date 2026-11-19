#!/usr/bin/env node
/*
 * Stands between the conformance harness and an adapter, unchanged in both
 * directions, and keeps a copy of every line the adapter writes, so that a
 * runtime's own values (not only the harness's residuals) can be compared
 * with Node's.
 *
 *   node tee-adapter.mjs --raw <responses.jsonl> [--runtime <runtime.json>] -- <adapter command>
 *
 * With --runtime, the adapter's first line, {"adapter": {...}}, gains
 * `runtime`, read from that file, which native-extras.mjs wrote from inside
 * the same runtime: the harness then records it in the results file. Nothing
 * else is changed. The exit status is the adapter's.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const split = process.argv.indexOf('--');
const own = process.argv.slice(2, split === -1 ? undefined : split);
const command = split === -1 ? [] : process.argv.slice(split + 1);
const option = (name) => {
  const index = own.indexOf(`--${name}`);
  return index === -1 ? undefined : own[index + 1];
};
const rawPath = option('raw');
const runtimePath = option('runtime');
if (!rawPath || !command.length) {
  console.error('usage: tee-adapter.mjs --raw <file> [--runtime <file>] -- <adapter command>');
  process.exit(2);
}
const runtime = runtimePath ? JSON.parse(readFileSync(runtimePath, 'utf8')) : null;

const raw = createWriteStream(rawPath);
const child = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(child.stdin);
child.stdin.on('error', () => {});
let first = true;
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
lines.on('line', (line) => {
  let out = line;
  if (first && line.trim()) {
    first = false;
    if (runtime) {
      const message = JSON.parse(line);
      message.adapter = { ...message.adapter, runtime };
      out = JSON.stringify(message);
    }
  }
  raw.write(`${out}\n`);
  process.stdout.write(`${out}\n`);
});
child.on('error', (error) => {
  console.error(`tee-adapter: ${error.message}`);
  process.exit(127);
});
child.on('close', (code, signal) => {
  raw.end(() => process.exit(code ?? (signal ? 1 : 0)));
});
