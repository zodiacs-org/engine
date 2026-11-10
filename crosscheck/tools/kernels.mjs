import { acquireKernel } from '../lib/kernels.mjs';
const [name, digest, ...extra] = process.argv.slice(2);
if (!name || extra.length || (digest && !/^[a-f0-9]{64}$/.test(digest))) {
  console.error('Usage: node crosscheck/tools/kernels.mjs NAME [EXPECTED_SHA256]');
  process.exitCode = 1;
} else {
  const { receipt } = await acquireKernel(name, { expectedSha256: digest });
  console.log(JSON.stringify({ name: receipt.name, bytes: receipt.bytes, sha256: receipt.sha256, coverage: receipt.coverage }, null, 2));
}
