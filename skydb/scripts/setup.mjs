import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireNode22, verifyEngineArchive } from '../src/identity.mjs';

requireNode22();
const identity = await verifyEngineArchive();
const cwd = new URL('..', import.meta.url);
const command = existsSync(new URL('../package-lock.json', import.meta.url)) ? 'ci' : 'install';
const result = spawnSync('npm', [command, '--ignore-scripts', '--no-audit', '--no-fund', '--cache', fileURLToPath(new URL('../.cache/npm', import.meta.url))], { cwd, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Verified ${identity.name}@${identity.version} archive SHA-256 ${identity.sha256}`);
