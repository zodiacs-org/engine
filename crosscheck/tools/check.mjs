import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_FILE_BYTES = 2_000_000;
const ignored = new Set(['runtime', 'node_modules', '__pycache__']);

export async function checkFiles(root) {
  const errors = [];
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const label = relative(root, path);
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        errors.push(`${label}: symbolic link forbidden`);
      } else if (info.isDirectory()) {
        if (!(directory === root && ignored.has(name))) await visit(path);
      } else if (!info.isFile()) {
        errors.push(`${label}: regular file required`);
      } else {
        if (info.size >= MAX_FILE_BYTES) errors.push(`${label}: file must be below ${MAX_FILE_BYTES} bytes`);
        if (/\.(bsp|bpc|se1|so|dll|dylib|wasm|pyc|tgz|zip)$/i.test(name)) {
          errors.push(`${label}: binary or ephemeris file forbidden`);
        }
        if (/\.(md|txt)$/i.test(name) && info.size < MAX_FILE_BYTES) {
          if ((await readFile(path, 'utf8')).includes('\u2014')) errors.push(`${label}: em dash forbidden`);
        }
      }
    }
  }
  await visit(root);
  return errors;
}

// Run after test workers finish, since their transient refusal fixtures include symlinks.
export async function checkLocalSizes(root) {
  const errors = [];
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), info = await lstat(path), label = relative(root, path);
      if (info.isSymbolicLink()) errors.push(`${label}: local symbolic link forbidden`);
      else if (info.isDirectory()) await visit(path);
      else if (!info.isFile() || info.size >= MAX_FILE_BYTES) errors.push(`${label}: local file type or size invalid`);
    }
  }
  await visit(root);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--all-sizes')) throw Error('Usage: check.mjs [--all-sizes]');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const errors = await checkFiles(root);
  if (args.length) errors.push(...await checkLocalSizes(root));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Crosscheck file safeguards passed.');
}
