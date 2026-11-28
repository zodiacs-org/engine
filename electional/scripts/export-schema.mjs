import { mkdir, writeFile } from 'node:fs/promises';
import { ruleSchema } from '../build/rule-schema.js';

const directory = new URL('../generated/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('rules.schema.json', directory), `${JSON.stringify(ruleSchema, null, 2)}\n`);
console.log('Wrote electional/generated/rules.schema.json; runtime clock and cross-field checks still apply.');
