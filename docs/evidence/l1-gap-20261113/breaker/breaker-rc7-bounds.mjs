#!/usr/bin/env node
/*
 * Score the default source's whole-angle differences (breaker-cases.tsv)
 * against the geocentric/apparent bounds of another revision's
 * src/calc-bounds.ts, read with `git show` (nothing is checked out).
 *
 *   node docs/evidence/l1-gap-20261113/breaker/breaker-rc7-bounds.mjs origin/admin/engine-1.1.0-rc.7
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const revision = process.argv[2];
const commit = execFileSync('git', ['rev-parse', revision], { encoding: 'utf8' }).trim();
const text = execFileSync('git', ['show', `${commit}:src/calc-bounds.ts`], { encoding: 'utf8' });
const bounds = JSON.parse(/"geocentric\/apparent": (\{[^}]*\})/u.exec(text)[1]);
const rows = readFileSync(resolve(here, 'breaker-cases.tsv'), 'utf8').trim().split('\n').slice(1).map((line) => line.split('\t'));
const over = [];
let closest = null;
for (const [id, body, , , , , , angle] of rows) {
  const bound = bounds[body][0];
  if (Number(angle) > bound) over.push(`${id} ${body} ${angle} > ${bound}`);
  const margin = bound - Number(angle);
  if (!closest || margin < closest.margin) closest = { id, body, angle, bound, margin };
}
console.log(`${revision} at ${commit}: src/calc-bounds.ts geocentric/apparent, first figure (arcseconds)`);
console.log(Object.entries(bounds).filter(([body]) => rows.some((row) => row[1] === body)).map(([body, row]) => `${body} ${row[0]}`).join(', '));
console.log(`default source, whole angle within that bound: ${rows.length - over.length} of ${rows.length}`);
for (const line of over) console.log(`  over: ${line}`);
console.log(`smallest margin: ${closest.id} ${closest.body} ${closest.angle} against ${closest.bound}`);
