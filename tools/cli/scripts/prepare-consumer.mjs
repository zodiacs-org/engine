import { mkdtemp, readFile, writeFile, mkdir, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(packageRoot, '../..');
const stage = await mkdtemp(resolve(tmpdir(), 'zodiacs-cli-review-'));
const packed = resolve(stage, 'packed');
const consumer = resolve(stage, 'consumer');
await mkdir(packed); await mkdir(consumer);
const npmCandidates = [
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
let npmCli;
for (const path of npmCandidates) {
  try { await access(path); npmCli = path; break; } catch {}
}
if (!npmCli) throw new Error('Node installation does not expose its npm CLI');
function node(args, cwd = repo, capture = false) {
  const result = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
    timeout: 300_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('CLI preparation command failed');
  return result.stdout;
}
node([resolve(packageRoot, 'scripts/build-conformance.mjs')]);
const info = JSON.parse(node([npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', packed], packageRoot, true));
if (info.length !== 1) throw new Error('Unexpected CLI pack count');
const archive = resolve(packed, info[0].filename);
const engineArchive = resolve(repo, 'artifacts/zodiacs-engine-1.0.0-rc.2.tgz');
const engineBytes = await readFile(engineArchive);
if (engineBytes.length !== 287011
  || createHash('sha256').update(engineBytes).digest('hex')
    !== '4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002') {
  throw new Error('Carried engine archive identity changed');
}
await writeFile(resolve(consumer, 'package.json'), JSON.stringify({
  name: 'zodiacs-cli-fresh-consumer', private: true, type: 'module',
}) + '\n');
node([npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact',
  engineArchive, archive], consumer);
node([resolve(packageRoot, 'scripts/verify-consumer.mjs'), consumer,
  resolve(packageRoot, 'scripts/no-network.mjs'), resolve(repo, 'conformance/results/zodiacs-engine.json'),
  resolve(repo, 'conformance/adapters/zodiacs-engine.mjs'), resolve(repo, 'conformance/harness/lib.mjs'), npmCli]);
const reportPath = resolve(consumer, 'cli-consumer-report.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const bytes = await readFile(archive);
report.checkoutBytes = JSON.parse(await readFile(resolve(repo, 'cli-checkout-byte-receipt.json'), 'utf8'));
report.package = {
  name: '@zodiacs/cli', version: '0.0.0', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  files: info[0].files.map(({ path, size, mode }) => ({ path, size, mode })),
};
report.engineArchive = {
  version: '1.0.0-rc.2', bytes: engineBytes.length,
  sha256: createHash('sha256').update(engineBytes).digest('hex'),
};
const content = JSON.stringify(report, null, 2) + '\n';
const destination = resolve(repo, 'cli-consumer-report.json');
await writeFile(destination, content);
console.log('PROGRAMME_FILE_FINAL ' + JSON.stringify({
  path: 'docs/evidence/offline-cli-20261009/producer-' + (process.env.GITHUB_RUN_ID ?? 'local') + '/' + process.platform + '-node' + process.versions.node.split('.')[0] + '.json',
  size: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex'),
  base64: Buffer.from(content).toString('base64'),
}));
