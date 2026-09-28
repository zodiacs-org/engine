#!/usr/bin/env node
/*
 * Check the vector files against SPEC.md and print what the suite holds.
 *
 *   node conformance/harness/validate.mjs [--expect-total 500]
 */
import { KINDS, LEVEL_FILES, readSuite, validateLevel } from './lib.mjs';

const suite = readSuite();
const problems = [];
for (const level of Object.keys(LEVEL_FILES)) {
  if (!suite.some((entry) => entry.level === level)) problems.push(`${LEVEL_FILES[level]} is missing`);
}
for (const level of suite) problems.push(...validateLevel(level));

const ids = new Set();
let total = 0;
for (const level of suite) {
  const kinds = {};
  for (const vector of level.file.vectors) {
    if (ids.has(vector.id)) problems.push(`${vector.id} appears in more than one file`);
    ids.add(vector.id);
    kinds[vector.kind] = (kinds[vector.kind] ?? 0) + 1;
  }
  total += level.file.vectors.length;
  console.log(`${level.level} ${level.file.title}: ${level.file.vectors.length} vectors, ${Object.keys(level.file.arbiters).length} arbiter(s), sha256 ${level.digest}`);
  for (const [kind, count] of Object.entries(kinds)) console.log(`  ${kind}: ${count}`);
}

const index = process.argv.indexOf('--expect-total');
if (index !== -1 && total !== Number(process.argv[index + 1])) problems.push(`the suite has ${total} vectors, not ${process.argv[index + 1]}`);
const unused = Object.keys(KINDS).filter((kind) => !suite.some((level) => level.file.vectors.some((vector) => vector.kind === kind)));
if (unused.length) problems.push(`no vector exercises ${unused.join(', ')}`);

if (problems.length) {
  console.error(`conformance: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`conformance: ${total} vectors conform to SPEC.md`);
