import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { generateDatabase } from '../src/store.mjs';
import { openDatabase } from '../src/query.mjs';
import { verifyDatabase } from '../src/verify.mjs';
import { decodePositionTile, encodePositionTile } from '../src/tile.mjs';
import { validateEvents } from '../src/validate-events.mjs';

const startMs = Date.parse('2001-01-01Z'), hour = 3_600_000;
const descriptor = { startMs, endMs: startMs + hour, lastSampleMs: startMs + hour };
const event = { kind: 'aspect', bodies: ['Sun', 'Moon'], angle: 60, target: -60, unit: 'degrees',
  atMs: startMs + 1, bracket: [startMs, startMs + 1], residual: 0.00001, direction: 'increasing' };

test('persisted event schema rejects invalid roots, definitions and duplicates', () => {
  validateEvents([event], descriptor, ['Sun', 'Moon']);
  for (const patch of [ { bracket: [startMs, startMs + 2] }, { bracket: [startMs + 1, startMs] },
    { bracket: [startMs - 1, startMs] }, { atMs: startMs + 3 }, { atMs: descriptor.endMs },
    { unit: 'radians' }, { bodies: ['Moon', 'Sun'] }, { bodies: ['Sun', 'Sun'] },
    { angle: 45 }, { target: 90 }, { direction: 'unknown' }, { residual: NaN }, { extra: true } ]) {
    assert.throws(() => validateEvents([{ ...event, ...patch }], descriptor, ['Sun', 'Moon']), /Invalid event/);
  }
  assert.throws(() => validateEvents([event, event], descriptor, ['Sun', 'Moon']), /Invalid event/);
  const lunation = { ...event, kind: 'lunation', phase: 'new', target: 0 }; delete lunation.angle;
  validateEvents([lunation], descriptor, ['Sun', 'Moon']);
  assert.throws(() => validateEvents([{ ...lunation, phase: 'full' }], descriptor, ['Sun', 'Moon']), /Invalid event/);
  const ingress = { ...event, kind: 'ingress', bodies: ['Moon'], target: 30 }; delete ingress.angle;
  validateEvents([ingress], descriptor, ['Sun', 'Moon']);
  assert.throws(() => validateEvents([{ ...ingress, target: 31 }], descriptor, ['Sun', 'Moon']), /Invalid event/);
  const station = { ...ingress, kind: 'station', unit: 'degrees/day' }; delete station.target;
  validateEvents([station], descriptor, ['Sun', 'Moon']);
});

test('resume, queries and verification reject malformed content even with matching checksums', async t => {
  for (const failure of ['version', 'root', 'cadence', 'bodies']) {
    const directory = await mkdtemp(join(tmpdir(), 'skydb-hardening-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const config = { startMs, endMs: startMs + hour, stepMs: hour / 2, tileMs: hour, bodies: ['Sun', 'Moon'] };
    await generateDatabase(directory, config);
    const folder = join(directory, 'tile-00000000');
    const filename = ['version', 'root'].includes(failure) ? 'events.json.gz' : 'positions.sky';
    const original = await readFile(join(folder, filename));
    let bytes;
    if (filename === 'events.json.gz') {
      const value = JSON.parse(gunzipSync(original));
      if (failure === 'version') value.version = 2;
      else value.events = [{ ...event, bracket: [startMs, startMs + 3] }];
      bytes = gzipSync(Buffer.from(JSON.stringify(value)));
    } else {
      const tile = decodePositionTile(original);
      if (failure === 'cadence') tile.samples.splice(1, 1);
      else {
        tile.metadata.bodies.reverse();
        for (const sample of tile.samples) sample.rows.reverse();
      }
      bytes = encodePositionTile(tile);
    }
    await writeFile(join(folder, filename), bytes);
    const receiptPath = join(folder, 'receipt.json'), receipt = JSON.parse(await readFile(receiptPath));
    receipt.files[filename] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    await writeFile(receiptPath, JSON.stringify(receipt));
    const db = await openDatabase(directory);
    const error = /content mismatch|Invalid event|cadence mismatch|bodies mismatch/;
    await assert.rejects(db.positions(startMs), error);
    await assert.rejects(verifyDatabase(directory), error);
    await assert.rejects(generateDatabase(directory, config), error);
    assert.deepEqual(await readFile(join(folder, filename)), bytes);
  }
});

test('oversized store files fail before JSON or tile decoding', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'skydb-size-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { startMs, endMs: startMs + hour, stepMs: hour, tileMs: hour, bodies: ['Sun'] };
  await generateDatabase(directory, config);
  await writeFile(join(directory, 'tile-00000000', 'receipt.json'), Buffer.alloc(1_500_001, 32));
  await assert.rejects(generateDatabase(directory, config), /size limit/);
  await assert.rejects(verifyDatabase(directory), /size limit/);
});
