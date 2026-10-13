import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateDatabase } from '../src/store.mjs';
import { requireNode22 } from '../src/identity.mjs';
requireNode22();
if (process.argv.length !== 2) throw new RangeError('Sample script takes no arguments');
const config = JSON.parse(await readFile(new URL('../samples/config.json', import.meta.url), 'utf8'));
console.log(await generateDatabase(fileURLToPath(new URL('../samples/database/', import.meta.url)), config));
