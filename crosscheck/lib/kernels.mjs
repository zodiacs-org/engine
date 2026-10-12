import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHUNK_BYTES = 1_048_576;
export const SOURCE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/';
// NAIF aa_checksums.txt, fetched and read 2026-10-13. MD5 is a transport
// corruption check, not authentication. SHA-256 receipts bind later reuse.
export const KERNELS = Object.freeze({
  'de440.bsp': 'c9d581bfd84209dbeee8b1583939b148',
  'de440s.bsp': '3917ee56769db332790c751e2168843d',
  'de441_part-1.bsp': '7e5fcf9ecb5d08e1ab70c049baa60cd3',
  'de441_part-2.bsp': 'ad8dfa4e505ef0e3a5d587a5b4705632',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const chunkName = i => `${String(i).padStart(6, '0')}.chunk`;
const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));

async function cacheRoot(root) {
  await mkdir(runtime, { recursive: true });
  if ((await lstat(runtime)).isSymbolicLink()) throw Error('Runtime symlink forbidden');
  const base = await realpath(runtime);
  const rel = relative(base, root);
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw Error('Cache must be inside runtime');
  // Reject existing symlinks in every component before creating directories.
  let current = base;
  for (const part of rel.split('/')) {
    current = join(current, part);
    try { if (!(await lstat(current)).isDirectory() || (await lstat(current)).isSymbolicLink()) throw Error('Cache directory required'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(current); }
  }
  return current;
}

export async function inspectSpk(read, size) {
  if (!Number.isSafeInteger(size) || size < 1024 || size % 1024) throw Error('Invalid DAF size');
  const header = await read(0, 1024);
  if (header.toString('ascii', 0, 8) !== 'DAF/SPK ') throw Error('Expected DAF/SPK');
  const format = header.toString('ascii', 88, 96);
  if (!['LTL-IEEE', 'BIG-IEEE'].includes(format)) throw Error('Unsupported DAF encoding');
  const integer = (b, offset) => format === 'LTL-IEEE' ? b.readInt32LE(offset) : b.readInt32BE(offset);
  const double = (b, offset) => format === 'LTL-IEEE' ? b.readDoubleLE(offset) : b.readDoubleBE(offset);
  if (integer(header, 8) !== 2 || integer(header, 12) !== 6) throw Error('Invalid SPK summary layout');
  const segments = [], seen = new Set();
  let record = integer(header, 76), previous = 0;
  const last = integer(header, 80), free = integer(header, 84);
  if (!Number.isInteger(free) || free < 1 || free > size / 8 + 1) throw Error('Invalid free address');
  while (record) {
    if (!Number.isSafeInteger(record) || record < 2 || record > size / 1024 || seen.has(record)) throw Error('Invalid summary chain');
    seen.add(record);
    const b = await read((record - 1) * 1024, 1024);
    const next = double(b, 0), prev = double(b, 8), count = double(b, 16);
    if (prev !== previous || !Number.isInteger(count) || count < 1 || count > 25) throw Error('Invalid summary record');
    for (let i = 0; i < count; i++) {
      const offset = 24 + i * 40;
      const s = { startTdbSeconds: double(b, offset), endTdbSeconds: double(b, offset + 8) };
      ['target', 'center', 'frame', 'type', 'startWord', 'endWord'].forEach((key, j) => { s[key] = integer(b, offset + 16 + j * 4); });
      if (!Number.isFinite(s.startTdbSeconds) || !Number.isFinite(s.endTdbSeconds) || s.startTdbSeconds > s.endTdbSeconds || s.startWord < 1 || s.endWord < s.startWord || s.endWord >= free) throw Error('Invalid segment');
      segments.push(s);
    }
    previous = record; record = next;
    if (segments.length > 10000) throw Error('Too many segments');
  }
  if (!segments.length || previous !== last) throw Error('Invalid last summary');
  return { format, segments };
}

export function requireCoverage(segments, { target, center, frame = 1, startTdbSeconds, endTdbSeconds }) {
  if (![startTdbSeconds, endTdbSeconds].every(Number.isFinite) || startTdbSeconds > endTdbSeconds || ![target, center, frame].every(Number.isInteger)) throw Error('Invalid coverage request');
  let end = startTdbSeconds;
  const spans = segments.filter(s => s.target === target && s.center === center && s.frame === frame && [2, 3].includes(s.type)).sort((a,b) => a.startTdbSeconds - b.startTdbSeconds);
  for (const s of spans) {
    if (s.startTdbSeconds > end) break;
    if (s.endTdbSeconds < end) continue;
    end = s.endTdbSeconds;
    if (end >= endTdbSeconds) return;
  }
  throw Error('Requested target/center/frame span is not covered');
}

export async function openKernel(directory, expectedSha256) {
  const root = await cacheRoot(directory);
  const receiptPath = join(root, 'receipt.json');
  const info = await lstat(receiptPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size >= 2_000_000) throw Error('Invalid receipt file');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (receipt.schema !== 1 || !Object.hasOwn(KERNELS, receipt.name) || receipt.source !== SOURCE + receipt.name || receipt.md5 !== KERNELS[receipt.name] || receipt.chunkBytes !== CHUNK_BYTES || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1024 || receipt.bytes > 4_000_000_000 || !Array.isArray(receipt.chunks) || receipt.chunks.length !== Math.ceil(receipt.bytes / CHUNK_BYTES)) throw Error('Invalid kernel receipt');
  const md5 = createHash('md5'), hash = createHash('sha256');
  async function chunk(i) {
    const path = join(root, chunkName(i)), stat = await lstat(path);
    const length = Math.min(CHUNK_BYTES, receipt.bytes - i * CHUNK_BYTES);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== length) throw Error('Invalid cache chunk');
    const bytes = await readFile(path);
    if (sha(bytes) !== receipt.chunks[i]) throw Error('Chunk digest mismatch');
    return bytes;
  }
  for (let i = 0; i < receipt.chunks.length; i++) { const b = await chunk(i); md5.update(b); hash.update(b); }
  if (md5.digest('hex') !== receipt.md5 || hash.digest('hex') !== receipt.sha256 || (expectedSha256 && expectedSha256 !== receipt.sha256)) throw Error('Kernel digest mismatch');
  async function read(offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > CHUNK_BYTES || offset + length > receipt.bytes) throw Error('Invalid kernel read');
    const out = Buffer.alloc(length);
    let filled = 0;
    while (filled < length) {
      const position = offset + filled, i = Math.floor(position / CHUNK_BYTES), b = await chunk(i);
      const n = Math.min(length - filled, b.length - position % CHUNK_BYTES);
      b.copy(out, filled, position % CHUNK_BYTES, position % CHUNK_BYTES + n); filled += n;
    }
    return out;
  }
  const coverage = await inspectSpk(read, receipt.bytes);
  if (JSON.stringify(coverage) !== JSON.stringify(receipt.coverage)) throw Error('Coverage receipt mismatch');
  return { receipt, read };
}

// Internal transport helper; acquisition always enforces the pinned catalog.
export async function writeChunks(body, temporary) {
    const md5 = createHash('md5'), hash = createHash('sha256'), chunks = [];
    let bytes = 0, used = 0, buffer = Buffer.alloc(CHUNK_BYTES);
    async function flush() { const b = buffer.subarray(0, used); chunks.push(sha(b)); await writeFile(join(temporary, chunkName(chunks.length - 1)), b, { flag: 'wx' }); used = 0; }
    for await (const value of body) {
      const b = Buffer.from(value); bytes += b.length;
      if (bytes > 4_000_000_000) throw Error('Kernel exceeds download cap');
      md5.update(b); hash.update(b);
      let offset = 0;
      while (offset < b.length) { const n = Math.min(CHUNK_BYTES - used, b.length - offset); b.copy(buffer, used, offset, offset + n); used += n; offset += n; if (used === CHUNK_BYTES) await flush(); }
    }
    if (used) await flush();
    return { bytes, chunks, sha256: hash.digest('hex'), md5: md5.digest('hex') };
}

export async function acquireKernel(name, { root = join(runtime, 'cache'), fetchImpl = fetch, expectedSha256, signal = AbortSignal.timeout(600_000) } = {}) {
  if (!Object.hasOwn(KERNELS, name)) throw Error('Unknown public kernel');
  root = await cacheRoot(root);
  const destination = join(root, name.replace('.bsp', ''));
  let exists = false;
  try { await lstat(destination); exists = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) return await openKernel(destination, expectedSha256);
  const temporary = await mkdtemp(join(root, '.download-'));
  try {
    const response = await fetchImpl(SOURCE + name, { redirect: 'error', signal });
    if (response.status !== 200 || !response.body || response.headers.get('content-encoding')) throw Error('Expected unencoded full kernel response');
    const stored = await writeChunks(response.body, temporary);
    const { bytes, chunks, sha256: digest } = stored;
    if (stored.md5 !== KERNELS[name] || (expectedSha256 && digest !== expectedSha256)) throw Error('Downloaded kernel digest mismatch');
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) !== bytes) throw Error('Content length mismatch');
    const read = async (offset, length) => {
      const a = await readFile(join(temporary, chunkName(Math.floor(offset / CHUNK_BYTES))));
      if (offset % CHUNK_BYTES + length > a.length) throw Error('Descriptor crosses chunk');
      return a.subarray(offset % CHUNK_BYTES, offset % CHUNK_BYTES + length);
    };
    const receipt = { schema: 1, name, source: SOURCE + name, checksumSource: SOURCE + 'aa_checksums.txt', fetchedAt: new Date().toISOString(), bytes, chunkBytes: CHUNK_BYTES, md5: KERNELS[name], sha256: digest, chunks, coverage: await inspectSpk(read, bytes) };
    const serialized = JSON.stringify(receipt, null, 2) + '\n';
    if (Buffer.byteLength(serialized) >= 2_000_000) throw Error('Receipt exceeds file limit');
    await writeFile(join(temporary, 'receipt.json'), serialized, { flag: 'wx' });
    await rename(temporary, destination);
    return await openKernel(destination, expectedSha256);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
