import { lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport } from '../lib/report.mjs';
import { MAX_FILE_BYTES } from './check.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
async function below(root, path) {
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Path outside permitted report directory.');
  let current = root;
  for (const part of ['', ...rel.split('/')]) {
    current = resolve(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Report path must not contain symlinks.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function reportFile(input, name, { check = false, allowPartial = false } = {}) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(name)) throw Error('Invalid report name.');
  input = resolve(input);
  await below(resolve(project, 'runtime'), input);
  const info = await lstat(input);
  if (!info.isFile() || info.size >= MAX_FILE_BYTES) throw Error('Invalid report input file.');
  let bundle;
  try { bundle = JSON.parse(await readFile(input, 'utf8')); }
  catch { throw Error('Invalid aggregate report JSON. Raw diagnostics discarded.'); }
  if (Object.keys(bundle).sort().join(',') !== 'campaign,metadata,states') throw Error('Invalid report input fields.');
  const outputs = renderReport(bundle, { allowPartial });
  const directory = resolve(project, 'reports');
  await below(project, directory);
  if (!check) await mkdir(directory, { recursive: true });
  for (const [field, extension] of [['json','json'],['markdown','md'],['csv','csv']]) {
    const path = resolve(directory, name + '.' + extension);
    await below(directory, path);
    if (check) {
      if (await readFile(path, 'utf8') !== outputs[field]) throw Error('Aggregate report differs.');
    } else await writeFile(path, outputs[field], { flag: 'wx' });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, name, ...flags] = process.argv.slice(2);
  if (!input || !name || flags.some(f => !['--check','--allow-partial'].includes(f)) || new Set(flags).size !== flags.length)
    throw Error('Usage: node crosscheck/tools/report.mjs RUNTIME_BUNDLE NAME [--check] [--allow-partial]');
  await reportFile(input, name, { check: flags.includes('--check'), allowPartial: flags.includes('--allow-partial') });
  console.log('Aggregate report ' + (flags.includes('--check') ? 'reproduced.' : 'written.'));
}
