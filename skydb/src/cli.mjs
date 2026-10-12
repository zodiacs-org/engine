import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig } from './config.mjs';
import { generateDatabase } from './store.mjs';
import { openDatabase } from './query.mjs';
import { verifyDatabase } from './verify.mjs';

const fields = {
  generate: ['directory', 'config'], verify: ['directory'],
  positions: ['directory', 'at'], events: ['directory', 'start', 'end', 'kind', 'body']
};
export const USAGE = 'skydb generate --directory PATH --config FILE | verify --directory PATH | positions --directory PATH --at EPOCH_MS | events --directory PATH --start EPOCH_MS --end EPOCH_MS [--kind KIND] [--body BODY]';
export function parseArguments(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(fields, command)) throw new RangeError(USAGE);
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2), value = rest[i + 1];
    if (!rest[i].startsWith('--') || !fields[command].includes(key) || Object.hasOwn(options, key) ||
        !value || value.startsWith('--')) throw new RangeError('Unknown, duplicate or missing option');
    options[key] = value;
  }
  for (const key of fields[command].filter(key => !['kind', 'body'].includes(key))) {
    if (!Object.hasOwn(options, key)) throw new RangeError(`Missing --${key}`);
  }
  for (const key of ['at', 'start', 'end']) if (Object.hasOwn(options, key)) {
    if (!/^-?(0|[1-9]\d*)$/.test(options[key]) || !Number.isSafeInteger(Number(options[key]))) {
      throw new RangeError(`${key} must be integer epoch milliseconds`);
    }
    options[key] = Number(options[key]);
  }
  return { command, options };
}
export async function runCli(args, emit = value => process.stdout.write(JSON.stringify(value) + '\n')) {
  const { command, options } = parseArguments(args);
  const directory = resolve(options.directory);
  if (command === 'generate') {
    const root = fileURLToPath(new URL('../generated/', import.meta.url));
    const child = relative(root, directory);
    if (!child || child === '..' || child.startsWith('../') || isAbsolute(child)) {
      throw new RangeError('CLI generation directory must be a child of skydb/generated/');
    }
    const config = createConfig(JSON.parse(await readFile(options.config, 'utf8')));
    emit(await generateDatabase(directory, config));
  } else if (command === 'verify') emit(await verifyDatabase(directory));
  else {
    const database = await openDatabase(directory);
    if (command === 'positions') emit(await database.positions(options.at));
    else for await (const event of database.events(options.start, options.end,
      { ...(options.kind ? { kind: options.kind } : {}), ...(options.body ? { body: options.body } : {}) })) emit(event);
  }
}
