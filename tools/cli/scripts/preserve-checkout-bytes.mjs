import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
function git(args) {
  const result = spawnSync('git', args, { cwd: repo, shell: false, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Selected checkout byte restoration failed');
  return result.stdout;
}
const paths = git(['ls-files', '-z', '--', 'tools/cli', 'conformance', 'LICENSE'])
  .toString('utf8').split('\0').filter(Boolean);
const changed = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const path of paths) {
  if (!(path === 'LICENSE' || path.startsWith('tools/cli/') || path.startsWith('conformance/'))
    || path.split('/').some((part) => part === '..' || part === '.')) throw new Error('Unexpected selected checkout path');
  const destination = resolve(repo, path);
  const before = readFileSync(destination);
  const committed = git(['cat-file', 'blob', 'HEAD:' + path]);
  if (!before.equals(committed)) {
    changed.push({ path, beforeSha256: sha256(before), committedSha256: sha256(committed),
      beforeBytes: before.length, committedBytes: committed.length });
    writeFileSync(destination, committed);
  }
  if (!readFileSync(destination).equals(committed)) throw new Error('Selected checkout byte verification failed');
}
const receipt = { schema: 'zodiacs.cli-checkout-bytes.v1', checkedFiles: paths.length,
  method: 'Only tracked tools/cli/, conformance/ and root LICENSE, restored from HEAD Git blobs without text conversion',
  changed };
writeFileSync(resolve(repo, 'cli-checkout-byte-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log('CLI checkout byte receipt: ' + JSON.stringify(receipt));
