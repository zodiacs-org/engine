import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { SwissChannel, openSwiss, verifyExternalPaths } from '../lib/swiss.mjs';

// Invented protocol peers only. No Swiss installation, output or expectations.
function peer(response, mode = '') {
  const script = `process.stdout.write('{"ready":true}\\n');
  process.stdin.on('data', () => { ${mode || `process.stdout.write(${JSON.stringify(JSON.stringify(response) + '\n')});`} });`;
  return new SwissChannel(spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] }), 1000);
}
const args = { body: 'Mars', jdTT: 2451545, actual: { lon: 0, lat: 0 }, toleranceArcsec: 3600 };

test('external paths and explicit installation required', async () => {
  await assert.rejects(verifyExternalPaths([new URL('../', import.meta.url).pathname]), /outside/);
  await assert.rejects(openSwiss(), /external/);
  await assert.rejects(openSwiss({ ephemerisPath: '/tmp', python: '/no-such-python' }), /raw diagnostics discarded/);
});

test('invented position responses retain only aggregate residuals and flags', async () => {
  const channel = peer({ id: 'position', output: { lon: 359, lat: 1 }, meta: { retflags: 2, unwanted: 'not retained' } });
  try {
    await channel.read();
    const r = await channel.comparePosition(args);
    assert.equal(r.verdict, 'pass'); assert.equal(r.stats.lon.mean, 3600); assert.equal(r.stats.lat.mean, -3600);
    assert.deepEqual(Object.keys(r).sort(), ['retflags', 'stats', 'verdict']);
    assert(!JSON.stringify(r).includes('output'));
    const fail = await channel.comparePosition({ ...args, toleranceArcsec: 0 });
    assert.equal(fail.verdict, 'fail');
  } finally { channel.close(); }
});

for (const [name, response, expected] of [
  ['fallback', { output: { lon: 123, lat: 4 }, meta: { retflags: 4 } }, { verdict: 'fallback', retflags: 4 }],
  ['error', { error: 'private raw position marker 123.456' }, { verdict: 'error' }],
  ['unsupported', { unsupported: 'private diagnostic marker' }, { verdict: 'unsupported' }]
]) test(`discards ${name} values and messages`, async () => {
  const channel = peer({ id: 'position', ...response });
  try { await channel.read(); assert.deepEqual(await channel.comparePosition(args), expected); }
  finally { channel.close(); }
});

test('invalid response poisons transport without leaking diagnostics', async () => {
  const channel = peer({ id: 'wrong', output: { lon: 123.456 } });
  try { await channel.read(); await assert.rejects(channel.comparePosition(args), /raw diagnostics discarded/); }
  finally { channel.close(); }
});

for (const mode of [
  'process.stdout.write("raw secret diagnostic\\n");',
  'process.stdout.write("x".repeat(70000));',
  'process.exit(1);',
  '/* silence */'
]) test('malformed, oversized, exited or stalled peer fails closed', async () => {
  const channel = peer(null, mode);
  try { await channel.read(); await assert.rejects(channel.comparePosition(args), /raw diagnostics discarded/); }
  finally { channel.close(); }
});

test('rejects concurrent requests and invalid caller inputs', async () => {
  const channel = peer(null, 'setTimeout(() => process.stdout.write(JSON.stringify({id:"position", error:"discard"}) + "\\n"), 50);');
  try {
    await channel.read();
    await assert.rejects(channel.comparePosition({ ...args, body: 'unsupported' }), /Invalid/);
    await assert.rejects(channel.comparePosition({ ...args, toleranceArcsec: -1 }), /tolerance/);
    const first = channel.comparePosition(args);
    await assert.rejects(channel.comparePosition(args), /one request/);
    assert.deepEqual(await first, { verdict: 'error' });
  } finally { channel.close(); }
});
