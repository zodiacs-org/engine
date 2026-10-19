import { fileURLToPath } from 'node:url';
import { relative, resolve, sep } from 'node:path';
import { requireNode22 } from '../src/identity.mjs';
import { migrateDatabaseLayout } from '../src/migrate-layout.mjs';

try {
  requireNode22();
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--directory' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: node skydb/scripts/migrate-layout.mjs --directory DIRECTORY');
  }
  const root = fileURLToPath(new URL('../generated/', import.meta.url));
  const directory = resolve(args[1]), child = relative(root, directory);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || resolve(root, child) !== directory) {
    throw new Error('Migration directory must be a child of skydb/generated/');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    console.log(JSON.stringify(await migrateDatabaseLayout(directory, { signal: controller.signal })));
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
} catch (error) {
  console.error(`skydb migration: ${error.message}`);
  process.exitCode = 1;
}
