import test from 'node:test';
import assert from 'node:assert/strict';
import { chebyshev, segmentState, createSpkReader } from '../lib/spk.mjs';

function invented(type = 2, big = false, records = 1) {
  const coefficients = [[1, 2, 3, 4], [5, 0, 0, 0], [0, -2, 0, 0]];
  if (type === 3) coefficients.push([7, 1, 0, 0], [8, 0, 0, 0], [9, 0, 0, 0]);
  const size = 2 + coefficients.length * 4;
  const values = [];
  for (let i = 0; i < records; i++) values.push(10 + 20 * i, 10, ...coefficients.flat());
  values.push(0, 20, size, records);
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => big ? bytes.writeDoubleBE(v, i * 8) : bytes.writeDoubleLE(v, i * 8));
  const segment = { target: 399, center: 0, frame: 1, type, startWord: 1, endWord: values.length, startTdbSeconds: 0, endTdbSeconds: records * 20 };
  const kernel = { receipt: { coverage: { format: big ? 'BIG-IEEE' : 'LTL-IEEE', segments: [segment] } }, read: async (o, n) => bytes.subarray(o, o + n) };
  return { kernel, segment, bytes };
}

test('Chebyshev matches independently expanded cubic and derivative, including endpoints', () => {
  for (let j = -16; j <= 16; j++) {
    const x = j / 16;
    const result = chebyshev([1, 2, 3, 4], x);
    assert.equal(result.value, 16 * x ** 3 + 6 * x ** 2 - 10 * x - 2);
    assert.equal(result.derivative, 48 * x ** 2 + 12 * x - 10);
  }
  assert.deepEqual(chebyshev([4], 0), { value: 4, derivative: 0 });
  for (const [c, x] of [[[], 0], [[NaN], 0], [[1], 1.01], [[1], NaN]]) assert.throws(() => chebyshev(c, x));
});

test('Type 2 derivatives and type 3 stored velocities, both byte orders and record boundaries', async () => {
  for (const type of [2, 3]) for (const big of [false, true]) {
    const { kernel, segment } = invented(type, big, 2);
    for (const t of [0, 5, 10, 19, 20, 30, 40]) {
      const x = (t - (t < 20 ? 10 : 30)) / 10;
      const s = await segmentState(kernel, segment, t);
      const expected = [16 * x ** 3 + 6 * x ** 2 - 10 * x - 2, 5, -2 * x];
      expected.forEach((v, i) => assert.ok(Math.abs(s.position[i] - v) < 1e-12));
      assert.deepEqual(s.velocity, type === 2 ? [(48 * x ** 2 + 12 * x - 10) / 10, 0, -0.2] : [7 + x, 8, 9]);
    }
    await assert.rejects(segmentState(kernel, segment, -1));
    await assert.rejects(segmentState(kernel, segment, 41));
  }
});

test('Center chains preserve exact IDs and priority; subtraction uses matching epochs', async () => {
  const { kernel, segment } = invented();
  kernel.receipt.coverage.segments.push({ ...segment, target: 301, center: 399 });
  const read = createSpkReader([kernel]);
  assert.deepEqual((await read({ target: 301, tdbSeconds: 10 })).position, [-4, 10, 0]);
  assert.deepEqual((await read({ target: 301, center: 399, tdbSeconds: 10 })).position, [-2, 5, 0]);
  await assert.rejects(read({ target: 3, tdbSeconds: 10 }), /No covered/);
  await assert.rejects(read({ target: 301, tdbSeconds: NaN }));
  kernel.receipt.coverage.segments.push({ ...segment, center: 301 });
  await assert.rejects(read({ target: 399, tdbSeconds: 10 }), /Cyclic/);
  const invalid = invented(); invalid.segment.type = 99;
  await assert.rejects(createSpkReader([kernel, invalid.kernel])({ target: 399, tdbSeconds: 10 }), /Unsupported/);
});

test('Malformed directories, coefficients, frames and short reads fail closed', async () => {
  for (const modify of [f => { f.segment.frame = 2; }, f => { f.segment.endWord--; }, f => f.bytes.writeDoubleLE(0, f.bytes.length - 24), f => f.bytes.writeDoubleLE(3.5, f.bytes.length - 16), f => f.bytes.writeDoubleLE(NaN, 16), f => f.bytes.writeDoubleLE(0, 8), f => { f.kernel.read = async () => Buffer.alloc(0); }]) {
    const f = invented(); modify(f);
    await assert.rejects(segmentState(f.kernel, f.segment, 10));
  }
});
