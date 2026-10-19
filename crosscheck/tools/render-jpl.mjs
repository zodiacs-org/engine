// Editorial rendering only: never rerun instruments or replace measurement receipts.
import { readFile, writeFile } from 'node:fs/promises';
import { renderJplMarkdown } from '../lib/jpl-report.mjs';
import { MAX_FILE_BYTES } from './check.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--check')) {
  throw Error('Usage: node crosscheck/tools/render-jpl.mjs [--check]');
}
const receipt = JSON.parse(await readFile(new URL('../reports/jpl-reduction.json', import.meta.url), 'utf8'));
const markdown = renderJplMarkdown(receipt);
if (Buffer.byteLength(markdown) >= MAX_FILE_BYTES) throw Error('Rendered report exceeds file limit.');
const destination = new URL('../reports/jpl-reduction.md', import.meta.url);
if (args[0] === '--check') {
  if (await readFile(destination, 'utf8') !== markdown) throw Error('JPL aggregate markdown differs.');
} else await writeFile(destination, markdown);
console.log('JPL aggregate markdown verified; measurement receipt unchanged.');
