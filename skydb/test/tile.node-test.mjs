import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { encodePositionTile as encode, decodePositionTile as decode, TILE_LIMITS, TILE_CONVENTIONS } from '../src/tile.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { COVERAGE, BODIES } from '../src/config.mjs';

function fixture() {
  return { metadata: { startMs: -1000, endMs: 1000, bodies: ['Moon', 'Sun'],
    engineSha256: ENGINE_IDENTITY.sha256, timeScale: 'utc', conventions: TILE_CONVENTIONS },
  samples: [-1000, 0, 999, 1000].map((atMs, i) => ({ atMs, rows: [
    { body: 'Moon', lon: [359.99, 0, 0.01, 0.02][i], lat: -0, speed: -0.25 },
    { body: 'Sun', lon: 123.456789012345, lat: 0.00001, speed: 1.000000000000001 }
  ] })) };
}

// Repair the digest and envelope to reach structural validation, beyond checksum rejection.
function repack(bytes, edit) {
  let raw = inflateSync(bytes.subarray(52));
  raw = edit(raw) ?? raw;
  const compressed = deflateSync(raw);
  const header = Buffer.from(bytes.subarray(0, 52));
  header.writeUInt32LE(raw.length, 12);
  header.writeUInt32LE(compressed.length, 16);
  createHash('sha256').update(raw).digest().copy(header, 20);
  return Buffer.concat([header, compressed]);
}
const recordsOffset = raw => 8 + raw.readUInt32LE(0);

test('binary envelope layout and lossless round trip with wrap, retrograde and signed zero', () => {
  const tile = fixture();
  const bytes = encode(tile);
  assert.equal(bytes.subarray(0, 8).toString('ascii'), 'SKYDBTL\0');
  assert.equal(bytes.readUInt16LE(8), 1);
  assert.equal(bytes[10], 1);
  assert.equal(bytes[11], 0);
  assert.equal(bytes.readUInt32LE(16), bytes.length - 52);
  const raw = inflateSync(bytes.subarray(52));
  assert.equal(raw.length, bytes.readUInt32LE(12));
  assert.equal(raw.readUInt32LE(4 + raw.readUInt32LE(0)), tile.samples.length);
  assert.equal(raw.readDoubleLE(recordsOffset(raw)), -1000);
  assert.equal(raw.readDoubleLE(recordsOffset(raw) + 8), 359.99);
  assert.deepEqual(decode(bytes), tile);
  assert.deepEqual(encode(tile), bytes);
  const padded = Buffer.concat([Buffer.from([1, 2]), bytes, Buffer.from([3])]);
  assert.deepEqual(decode(new Uint8Array(padded.buffer, padded.byteOffset + 2, bytes.length)), tile);
  const decoded = decode(bytes);
  decoded.samples[0].rows[0].lon = 2;
  assert.deepEqual(decode(bytes), tile);
});

test('round trips coverage edges and every supported body', () => {
  for (const [startMs, endMs] of [[COVERAGE.startMs, COVERAGE.startMs + 2], [COVERAGE.endMs - 2, COVERAGE.endMs]]) {
    const tile = fixture();
    tile.metadata.startMs = startMs;
    tile.metadata.endMs = endMs;
    tile.metadata.bodies = [...BODIES];
    tile.samples = [startMs, endMs].map(atMs => ({ atMs, rows: BODIES.map(body =>
      ({ body, lon: 0, lat: -90, speed: -0 })) }));
    assert.deepEqual(decode(encode(tile)), tile);
  }
});

test('rejects malformed encoder inputs before serialization', () => {
  for (const mutate of [
    t => { t.extra = 1; }, t => { t.metadata.extra = 1; },
    t => { t.metadata.engineSha256 = '0'.repeat(64); }, t => { t.metadata.timeScale = 'tt'; },
    t => { t.metadata.conventions = 'unknown'; }, t => { t.metadata.bodies = ['Moon', 'Moon']; },
    t => { t.metadata.bodies = ['Node']; }, t => { t.metadata.bodies = new Array(2); },
    t => { t.metadata.startMs = COVERAGE.startMs - 1; }, t => { t.metadata.endMs = COVERAGE.endMs + 1; },
    t => { t.metadata.endMs = t.metadata.startMs; }, t => { t.samples = []; },
    t => { t.samples[1].atMs = -1000; }, t => { t.samples[0].atMs = -1001; },
    t => { t.samples[0].atMs = 0.5; }, t => { t.samples[0].rows.reverse(); },
    t => { t.samples[0].rows.pop(); }, t => { t.samples[0].rows[0].lon = 360; },
    t => { t.samples[0].rows[0].lon = -1; }, t => { t.samples[0].rows[0].lat = 91; },
    t => { t.samples[0].rows[0].speed = Infinity; }, t => { t.samples[0].rows[0].lon = NaN; },
    t => { delete t.samples[0].rows[0].lat; }, t => { t.samples = new Array(1); },
    t => { t.samples = new Array(TILE_LIMITS.rawBytes); }
  ]) {
    const tile = fixture(); mutate(tile);
    assert.throws(() => encode(tile), RangeError);
  }
  for (const value of [null, [], {}]) assert.throws(() => encode(value), RangeError);
});

test('rejects header corruption, truncation, trailing bytes and unsupported versions', () => {
  const bytes = encode(fixture());
  for (const at of [0, 7, 8, 9, 10, 11, 12, 16, 20, 51, 52, bytes.length - 1]) {
    const corrupt = Buffer.from(bytes); corrupt[at] ^= 1;
    assert.throws(() => decode(corrupt), RangeError, `offset ${at}`);
  }
  for (let length = 0; length < bytes.length; length++) assert.throws(() => decode(bytes.subarray(0, length)), RangeError);
  assert.throws(() => decode(Buffer.concat([bytes, Buffer.from([0])])), RangeError);
  const trailing = Buffer.concat([bytes, Buffer.from([0])]);
  trailing.writeUInt32LE(trailing.length - 52, 16);
  assert.throws(() => decode(trailing), RangeError);
  for (const value of [null, 'tile', new ArrayBuffer(100), Buffer.alloc(TILE_LIMITS.fileBytes + 1)]) {
    assert.throws(() => decode(value), RangeError);
  }
});

test('rejects structurally invalid payloads even with matching SHA-256', () => {
  const bytes = encode(fixture());
  for (const edit of [
    raw => { raw.writeUInt32LE(0, 0); },
    raw => { raw.writeUInt32LE(TILE_LIMITS.metadataBytes + 1, 0); },
    raw => { raw[4] = 0xff; },
    raw => { raw[4] = 0x5b; },
    raw => { raw.writeUInt32LE(0, 4 + raw.readUInt32LE(0)); },
    raw => { raw.writeUInt32LE(0xffffffff, 4 + raw.readUInt32LE(0)); },
    raw => { raw.writeDoubleLE(NaN, recordsOffset(raw)); },
    raw => { raw.writeDoubleLE(-1000, recordsOffset(raw) + 56); },
    raw => { raw.writeDoubleLE(360, recordsOffset(raw) + 8); },
    raw => { raw.writeDoubleLE(-91, recordsOffset(raw) + 16); },
    raw => { raw.writeDoubleLE(Infinity, recordsOffset(raw) + 24); },
    raw => Buffer.concat([raw, Buffer.from([0])])
  ]) assert.throws(() => decode(repack(bytes, edit)), RangeError);
});

test('decompression output is bounded independently of compressed size', () => {
  const bytes = encode(fixture());
  const bomb = repack(bytes, () => Buffer.alloc(TILE_LIMITS.rawBytes + 1));
  assert.throws(() => decode(bomb), RangeError);
  bomb.writeUInt32LE(100, 12);
  assert.throws(() => decode(bomb), RangeError);
  const short = Buffer.from(bytes);
  short.writeUInt32LE(bytes.readUInt32LE(12) + 1, 12);
  assert.throws(() => decode(short), RangeError);
});
