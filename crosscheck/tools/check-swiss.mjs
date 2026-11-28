import { fileURLToPath } from 'node:url';
import { checkSwissBoundary } from '../lib/swiss-guard.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('Usage: node crosscheck/tools/check-swiss.mjs');
    const errors = await checkSwissBoundary(fileURLToPath(new URL('../../', import.meta.url)));
    for (const error of errors) console.error(`${error.path}${error.line ? `:${error.line}` : ''}: ${error.reason}`);
    if (errors.length) process.exitCode = 1;
    else console.log('Crosscheck Swiss import and dependency guard passed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
