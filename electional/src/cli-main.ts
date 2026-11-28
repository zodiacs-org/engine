import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { runCli } from './cli.js';

/** Regular local files only, with bounded reads even if a file grows. */
export async function readBoundedText(path: string, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid read limit.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new RangeError('Expected a bounded regular file.');
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maxBytes) throw new RangeError('Input exceeded its read limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await handle.close(); }
}
function write(stream: Writable, text: string): Promise<void> {
  return new Promise((resolve, reject) => stream.write(text, error => error ? reject(error) : resolve()));
}
export async function cliMain(): Promise<void> {
  const controller = new AbortController();
  let interrupted: number | undefined;
  const sigint = () => { interrupted ??= 130; controller.abort(); };
  const sigterm = () => { interrupted ??= 143; controller.abort(); };
  // Writable emits errors in addition to reporting them to write callbacks.
  // Keep listeners installed until writes finish, including a broken pipe.
  const outputError = () => { controller.abort(); };
  process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
  process.stdout.on('error', outputError); process.stderr.on('error', outputError);
  try {
    const code = await runCli(process.argv.slice(2), { readText: readBoundedText,
      write: text => write(process.stdout, text), error: text => write(process.stderr, text), signal: controller.signal });
    process.exitCode = interrupted ?? code;
  } finally {
    process.off('SIGINT', sigint); process.off('SIGTERM', sigterm);
    process.stdout.off('error', outputError); process.stderr.off('error', outputError);
  }
}
