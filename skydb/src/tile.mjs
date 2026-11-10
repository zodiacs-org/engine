import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { TextDecoder } from 'node:util';
import { BODIES, COVERAGE } from './config.mjs';
import { ENGINE_IDENTITY } from './identity.mjs';

export const TILE_VERSION = 1;
export const TILE_LIMITS = Object.freeze({ rawBytes: 1_000_000, fileBytes: 1_500_000, metadataBytes: 4096 });
export const TILE_CONVENTIONS = 'engine-root/tropical-geocentric-ecliptic-of-date/1';
const MAGIC = Buffer.from('SKYDBTL\0', 'ascii');
const HEADER = 52;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const fail = () => { throw new RangeError('Invalid skydb position tile'); };
const digest = bytes => createHash('sha256').update(bytes).digest();

function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail();
}

function metadata(value) {
  keys(value, ['startMs', 'endMs', 'bodies', 'engineSha256', 'timeScale', 'conventions']);
  if (!Number.isSafeInteger(value.startMs) || !Number.isSafeInteger(value.endMs) ||
      value.startMs < COVERAGE.startMs || value.endMs > COVERAGE.endMs || value.startMs >= value.endMs ||
      value.engineSha256 !== ENGINE_IDENTITY.sha256 || value.timeScale !== 'utc' ||
      value.conventions !== TILE_CONVENTIONS || !Array.isArray(value.bodies) ||
      !value.bodies.length || value.bodies.length > BODIES.length ||
      new Set(value.bodies).size !== value.bodies.length ||
      Array.from(value.bodies).some(body => !BODIES.includes(body))) fail();
  // Stable key order for reproducible uncompressed bytes.
  return { startMs: value.startMs, endMs: value.endMs, bodies: [...value.bodies],
    engineSha256: value.engineSha256, timeScale: value.timeScale, conventions: value.conventions };
}

function validateSample(sample, meta, previous) {
  keys(sample, ['atMs', 'rows']);
  if (!Number.isSafeInteger(sample.atMs) || sample.atMs < meta.startMs || sample.atMs > meta.endMs ||
      sample.atMs <= previous || !Array.isArray(sample.rows) || sample.rows.length !== meta.bodies.length) fail();
  for (let b = 0; b < meta.bodies.length; b++) {
    const row = sample.rows[b];
    keys(row, ['body', 'lon', 'lat', 'speed']);
    if (row.body !== meta.bodies[b] || ![row.lon, row.lat, row.speed].every(Number.isFinite) ||
        row.lon < 0 || row.lon >= 360 || row.lat < -90 || row.lat > 90) fail();
  }
}

export function encodePositionTile(tile) {
  keys(tile, ['metadata', 'samples']);
  const meta = metadata(tile.metadata);
  const json = Buffer.from(JSON.stringify(meta), 'utf8');
  if (json.length > TILE_LIMITS.metadataBytes || !Array.isArray(tile.samples) || !tile.samples.length) fail();
  const stride = 8 + meta.bodies.length * 24;
  const length = 8 + json.length + tile.samples.length * stride;
  if (length > TILE_LIMITS.rawBytes) fail();
  const raw = Buffer.alloc(length);
  raw.writeUInt32LE(json.length, 0);
  json.copy(raw, 4);
  raw.writeUInt32LE(tile.samples.length, 4 + json.length);
  let offset = 8 + json.length;
  let previous = -Infinity;
  for (const sample of tile.samples) {
    validateSample(sample, meta, previous);
    previous = sample.atMs;
    raw.writeDoubleLE(sample.atMs, offset); offset += 8;
    for (const row of sample.rows) {
      for (const field of ['lon', 'lat', 'speed']) {
        raw.writeDoubleLE(row[field], offset); offset += 8;
      }
    }
  }
  const compressed = deflateSync(raw, { level: 9 });
  if (HEADER + compressed.length > TILE_LIMITS.fileBytes) fail();
  const header = Buffer.alloc(HEADER);
  MAGIC.copy(header);
  header.writeUInt16LE(TILE_VERSION, 8);
  header[10] = 1; // zlib-wrapped DEFLATE
  header.writeUInt32LE(raw.length, 12);
  header.writeUInt32LE(compressed.length, 16);
  digest(raw).copy(header, 20);
  return Buffer.concat([header, compressed]);
}

export function decodePositionTile(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < HEADER || input.byteLength > TILE_LIMITS.fileBytes) fail();
  const bytes = Buffer.from(input); // Independent of caller's mutable buffer and byte offset.
  if (!bytes.subarray(0, 8).equals(MAGIC) || bytes.readUInt16LE(8) !== TILE_VERSION ||
      bytes[10] !== 1 || bytes[11] !== 0) fail();
  const rawLength = bytes.readUInt32LE(12);
  const compressedLength = bytes.readUInt32LE(16);
  if (rawLength < 8 || rawLength > TILE_LIMITS.rawBytes || compressedLength === 0 ||
      compressedLength !== bytes.length - HEADER) fail();
  let raw;
  try {
    const result = inflateSync(bytes.subarray(HEADER), { maxOutputLength: rawLength, info: true });
    raw = result.buffer;
    if (result.engine.bytesWritten !== compressedLength) fail();
  } catch { fail(); }
  if (raw.length !== rawLength || !digest(raw).equals(bytes.subarray(20, HEADER))) fail();
  const jsonLength = raw.readUInt32LE(0);
  if (!jsonLength || jsonLength > TILE_LIMITS.metadataBytes || jsonLength > raw.length - 8) fail();
  let meta;
  try { meta = metadata(JSON.parse(utf8.decode(raw.subarray(4, 4 + jsonLength)))); }
  catch { fail(); }
  const count = raw.readUInt32LE(4 + jsonLength);
  const stride = 8 + meta.bodies.length * 24;
  if (!count || raw.length !== 8 + jsonLength + count * stride) fail();
  const samples = [];
  let offset = 8 + jsonLength;
  let previous = -Infinity;
  for (let i = 0; i < count; i++) {
    const atMs = raw.readDoubleLE(offset); offset += 8;
    const rows = meta.bodies.map(body => {
      const row = { body, lon: raw.readDoubleLE(offset), lat: raw.readDoubleLE(offset + 8), speed: raw.readDoubleLE(offset + 16) };
      offset += 24;
      return row;
    });
    const sample = { atMs, rows };
    validateSample(sample, meta, previous);
    previous = atMs;
    samples.push(sample);
  }
  return { metadata: meta, samples };
}
