import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { requireNode22, verifyEngineArchive } from '../src/identity.mjs';

export function installLockedDependencies(directory = new URL('../', import.meta.url), run = spawnSync) {
  if (!existsSync(new URL('package-lock.json', directory))) {
    throw new Error('Missing skydb package-lock.json; restore the committed lockfile before setup');
  }
  const result = run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache',
    fileURLToPath(new URL('.cache/npm', directory))], { cwd: directory, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Locked dependency installation failed (status ${result.status})`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  requireNode22();
  const identity = await verifyEngineArchive();
  installLockedDependencies();
  console.log(`Verified ${identity.name}@${identity.version} archive SHA-256 ${identity.sha256}`);
}
