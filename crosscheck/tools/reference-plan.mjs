// Reference availability and storage evidence only; no sky positions are read.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openKernel, KERNEL_BYTES } from '../lib/kernels.mjs';
import { createReferencePlan, REFERENCE_CATALOG } from '../lib/reference-plan.mjs';
import { assertDiskBudget, checkDiskBudget, MAX_FILE_BYTES } from '../lib/disk-budget.mjs';

const project = new URL('../', import.meta.url);
const output = extension => new URL(`reports/reference-plan.${extension}`, project);
const csvCell = value => '"' + String(value).replaceAll('"', '""') + '"';
const command = ['node', 'crosscheck/tools/reference-plan.mjs'];

export function renderReferencePlan(receipt) {
  const { plan, disk, kernel } = receipt;
  const bodyRows = Object.entries(plan.bodies).map(([body, item]) =>
    [body, item.target, item.center, item.status, item.reason ?? 'Exact center chain covered.']);
  const rows = [['body', 'target_naif', 'observer_naif', 'availability', 'reason'], ...bodyRows];
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
  const markdown = [
    '# Phase 2 reference availability plan', '',
    'No engine accuracy measurement was made by this command. Full DE440 covers',
    'the requested synthetic TT interval from 1800-01-01 up to 2200-01-01,',
    'excluding the endpoint. DE441 has no requested outside-span cases.', '',
    `Command: \`${receipt.command.join(' ')}\``, '',
    `Runtime: ${receipt.runtime.node} (${receipt.runtime.platform}, ${receipt.runtime.arch}).`,
    `Executable SHA-256: \`${receipt.runtime.executableSha256}\`.`, '',
    `Coverage source: [NAIF summary](${plan.catalog.source}), read ${plan.catalog.readDate}.`,
    'Calendar labels in that summary denote TDB. Synthetic ISO input labels denote TT.',
    'The NAIF periodic TT/TDB conversion is used; civil time is outside this plan.', '',
    `Kernel: ${kernel.name}, ${kernel.bytes} bytes, SHA-256 \`${kernel.sha256}\`.`,
    `Source: [public kernel](${kernel.source}).`,
    'The whole payload, receipt and parsed descriptors were verified locally.',
    'Kernel bytes and per-case values are ignored and never enter this report.', '',
    `Coverage planning pads reception epochs backward by ${plan.paddingSeconds} seconds.`,
    'This is a conservative planning allowance, not a measured light-time bound.',
    'Reduction must still reject any actual emission epoch outside covered records.', '',
    '| Group | Availability | Selection |', '| --- | --- | --- |',
    ...Object.entries(plan.groups).map(([name, group]) => `| ${name} | ${group.status} | ${group.reason} |`), '',
    'DE440s is a shorter export and does not define the full DE440 boundary.',
    'DE441 parts overlap near 1969; neither part was acquired for this plan.',
    'Public catalog coverage is recorded in the JSON receipt. Only DE440 coverage',
    'has been verified from locally acquired descriptors here.', '',
    '| Body | Exact target | Observer | Availability | Reason |',
    '| --- | ---: | ---: | --- | --- |',
    ...bodyRows.map(row => '| ' + row.join(' | ') + ' |'), '',
    'Missing exact centers require separate satellite-kernel planning before',
    'accuracy comparisons. System barycenters must remain distinct conventions.', '',
    `Combined runtime/ and cache/ logical file bytes at planning: ${disk.usedBytes}.`,
    `Fixed disk cap: ${disk.limitBytes} bytes; files counted: ${disk.fileCount}.`,
    'Nested runtime/cache/ is counted once. Staging and abandoned files count.',
    'Acquisition reserves the catalog payload and a bounded receipt before fetching,',
    'rechecks each chunk write, and shares an exclusive lock with ERFA acquisition.',
    'An existing lock is never stolen. Other writers must remain within the cap.', '',
    ...plan.unavailableComparisons.map(item => '- ' + item), '',
    'The JSON receipt records catalog spans, verified kernel descriptors, exact',
    'tooling hashes, command and storage snapshot. Tests of planning and budgeting',
    'use invented descriptors and independent byte arithmetic, not engine outputs.', ''
  ].join('\n');
  return { md: markdown, csv };
}

async function toolingIdentity() {
  const files = ['lib/kernels.mjs', 'lib/disk-budget.mjs', 'lib/reference-plan.mjs',
    'lib/reduction.mjs', 'tools/reference-plan.mjs'];
  return Object.fromEntries(await Promise.all(files.map(async name => [name,
    createHash('sha256').update(await readFile(new URL(name, project))).digest('hex')])));
}

async function readReceipt(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size >= MAX_FILE_BYTES) throw Error('Unsafe plan receipt');
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function main(args) {
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw Error('Usage: reference-plan.mjs [--check]');
  const check = args.length === 1;
  const disk = await assertDiskBudget(0);
  const opened = await openKernel(fileURLToPath(new URL('runtime/cache/de440/', project)));
  const { name, source, bytes, md5, sha256, coverage } = opened.receipt;
  const kernel = { name, source, bytes, md5, sha256, coverage };
  const plan = createReferencePlan([opened]);
  if (plan.groups.DE440.status !== 'available') throw Error('Full reference span is unavailable');
  const tooling = await toolingIdentity();
  const receipt = check ? await readReceipt(output('json')) : {
    schema: 'crosscheck-reference-plan/1', command, runtime: { node: process.version,
      platform: process.platform, arch: process.arch,
      executableSha256: createHash('sha256').update(await readFile(process.execPath)).digest('hex') },
    tooling, plan, kernel, catalog: REFERENCE_CATALOG, catalogBytes: KERNEL_BYTES, disk
  };
  assert.equal(receipt.schema, 'crosscheck-reference-plan/1');
  assert.deepEqual(receipt.command, command);
  assert.deepEqual(receipt.plan, plan);
  assert.deepEqual(receipt.kernel, kernel);
  assert.deepEqual(receipt.tooling, tooling);
  assert.deepEqual(receipt.catalog, REFERENCE_CATALOG);
  assert.deepEqual(receipt.catalogBytes, KERNEL_BYTES);
  checkDiskBudget(receipt.disk.usedBytes, 0);
  const artifacts = { ...renderReferencePlan(receipt), json: JSON.stringify(receipt, null, 2) + '\n' };
  for (const bytes of Object.values(artifacts)) if (Buffer.byteLength(bytes) >= MAX_FILE_BYTES) throw Error('Plan artifact exceeds file limit');
  if (!check) {
    // Preflight all names before writing; never replace an existing report.
    for (const extension of Object.keys(artifacts)) {
      try { await lstat(output(extension)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw Error('Reference plan report already exists');
    }
  }
  for (const [extension, bytes] of Object.entries(artifacts)) {
    if (check) {
      const info = await lstat(output(extension));
      if (!info.isFile() || info.isSymbolicLink() || info.size >= MAX_FILE_BYTES) throw Error('Unsafe plan artifact');
      assert.equal(await readFile(output(extension), 'utf8'), bytes);
    } else await writeFile(output(extension), bytes, { flag: 'wx' });
  }
  console.log(check ? 'Reference plan artifacts verified; current storage is within budget.' : 'Reference plan artifacts created; no charts evaluated.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
