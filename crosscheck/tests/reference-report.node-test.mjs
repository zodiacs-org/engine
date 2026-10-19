import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderReferencePlan } from '../tools/reference-plan.mjs';
import { createReferencePlan } from '../lib/reference-plan.mjs';
import { KERNEL_BYTES } from '../lib/kernels.mjs';
import { checkDiskBudget, DISK_LIMIT_BYTES } from '../lib/disk-budget.mjs';

test('committed availability evidence reproduces and makes no chart accuracy claim', async () => {
  const base = new URL('../reports/reference-plan.', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL(base.href + 'json'), 'utf8'));
  assert.equal(receipt.schema, 'crosscheck-reference-plan/1');
  assert.deepEqual(receipt.command, ['node', 'crosscheck/tools/reference-plan.mjs']);
  assert.deepEqual(receipt.plan, createReferencePlan([{ receipt: receipt.kernel }]));
  assert.equal(receipt.kernel.bytes, KERNEL_BYTES['de440.bsp']);
  assert.match(receipt.kernel.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.disk.limitBytes, DISK_LIMIT_BYTES);
  checkDiskBudget(receipt.disk.usedBytes, 0);
  assert.equal(receipt.plan.groups.DE441.status, 'empty');
  assert.deepEqual(Object.entries(receipt.plan.bodies).filter(([, value]) => value.status === 'available')
    .map(([name]) => name), ['Sun', 'Moon', 'Mercury', 'Venus']);
  const artifacts = renderReferencePlan(receipt);
  for (const [extension, bytes] of Object.entries(artifacts)) {
    assert.equal(await readFile(new URL(base.href + extension), 'utf8'), bytes);
    assert(!/[\u2013\u2014]/u.test(bytes));
  }
  assert.match(artifacts.md, /No engine accuracy measurement/);
  assert.match(artifacts.md, /no chart comparisons evaluated|no requested outside-span cases/);
  assert.match(artifacts.md, /Swiss Ephemeris is not installed/);
});
