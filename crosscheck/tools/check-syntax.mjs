import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Check committed JavaScript without executing modules or loading references.
const project = new URL('../', import.meta.url);
for (const directory of ['lib/', 'tools/', 'tests/']) {
  const root = new URL(directory, project);
  for (const name of (await readdir(root)).sort()) {
    if (name.endsWith('.mjs')) {
      execFileSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], { stdio: 'inherit' });
    }
  }
}
console.log('Crosscheck JavaScript syntax checks passed.');
