#!/usr/bin/env node
import { createReadStream, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { chart, calc, events } from '@zodiacs/engine/calc';
import { ENGINE_VERSION } from '@zodiacs/engine';
import { runConformance } from './conformance.mjs';

const SCHEMA = 'zodiacs.cli-result.v1';
const MAX_INPUT = 1_048_576;
const commands = ['chart', 'positions', 'events', 'verify', 'conformance'];
const usage = 'zodiacs <chart|positions|events|verify|conformance> [--input <file|->] [--format text|json|svg]\n'
  + 'Read calculation JSON or a previous JSON result from a file or standard input.\n'
  + 'Computations run offline; receipts contain supplied instants and places.\n';
class CliError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CliError('invalid-input');
  return value;
}
function keys(value, allowed) {
  object(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new CliError('invalid-input');
}
export async function calculate(command, input) {
  if (command === 'chart') return chart(object(input));
  if (command === 'positions') {
    const requests = Array.isArray(input) ? input : [input];
    if (!requests.length || requests.length > 128) throw new CliError('invalid-input');
    return requests.map((request) => calc(object(request)));
  }
  if (command === 'events') {
    object(input);
    const maxSamples = input.maxSamples ?? 20_000;
    if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 20_000) {
      throw new CliError('invalid-input');
    }
    return events({ ...input, maxSamples });
  }
  throw new CliError('invalid-command');
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function envelope(command, result) {
  return { schema: SCHEMA, command, engineVersion: ENGINE_VERSION, result: plain(result) };
}
function refused(result) {
  return Array.isArray(result)
    ? result.some((row) => row.status === 'refused')
    : result.status === 'refused';
}
export async function verify(input) {
  keys(input, ['schema', 'command', 'engineVersion', 'result']);
  if (input.schema !== SCHEMA || input.engineVersion !== ENGINE_VERSION
    || !['chart', 'positions', 'events'].includes(input.command)) throw new CliError('unsupported-record');
  const rows = input.command === 'positions' ? input.result : [input.result];
  if (!Array.isArray(rows) || !rows.length || rows.length > 128) throw new CliError('invalid-input');
  const requests = rows.map((row) => {
    object(row);
    if (row.status !== 'ok' || row.receipt?.schema !== 'zodiacs.calc-receipt.v1'
      || row.receipt?.engine?.version !== ENGINE_VERSION) throw new CliError('unsupported-record');
    return object(row.receipt.request);
  });
  const fresh = await calculate(input.command, input.command === 'positions' ? requests : requests[0]);
  if (!isDeepStrictEqual(plain(fresh), input.result)) throw new CliError('verification-mismatch');
  return {
    status: 'verified', engineVersion: ENGINE_VERSION,
    scope: 'Recomputed result and recorded conventions; not origin, authenticity or astronomical accuracy.',
  };
}
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[ch]);
}
function linesFor(record) {
  const heading = 'Zodiacs ' + record.command + ' · engine ' + record.engineVersion;
  const result = record.result;
  if (record.command === 'verify') return [heading, result.status, result.scope];
  if (record.command === 'conformance') {
    const t = result.summary.total;
    return [heading, 'Suite ' + result.suiteVersion,
      t.count + ' vectors: ' + t.pass + ' pass, ' + t.fail + ' fail, '
        + t.unsupported + ' unsupported, ' + t.error + ' error',
      'Independent tolerances are unchanged. Matching a saved baseline is not an accuracy pass.'];
  }
  const rowLine = (row) => row.status === 'refused'
    ? 'Refused: ' + row.reason
    : row.body + ': ' + row.lon.toFixed(6)
      + (row.frame.startsWith('equatorial-') ? ' right ascension, ' : ' longitude, ')
      + row.lat.toFixed(6)
      + (row.frame.startsWith('equatorial-') ? ' declination (' : ' latitude (')
      + (row.receipt.request.flags?.units ?? 'degrees') + ') · ' + row.frame;
  if (record.command === 'positions') {
    return [heading, ...result.map(rowLine),
      ...result.filter((r) => r.status === 'ok').map((r) => 'Receipt: ' + JSON.stringify(r.receipt))];
  }
  if (result.status === 'refused') return [heading, 'Refused: ' + result.reason];
  if (record.command === 'chart') {
    const bodies = result.sidereal?.bodies ?? result.chart.bodies;
    return [heading, ...bodies.map((row) => row.body + ': ' + row.lon.toFixed(6) + '°'),
      'Receipt: ' + JSON.stringify(result.receipt)];
  }
  return [heading, ...result.events.map((row) => row.at + (row.retrograde ? ' · retrograde' : ' · direct')),
    'Search: scan and bisect; no proven-complete verdict.',
    'Receipt: ' + JSON.stringify(result.receipt)];
}
export function render(record, format) {
  if (format === 'json') return JSON.stringify(record, null, 2) + '\n';
  const lines = linesFor(record);
  if (format === 'text') return lines.join('\n') + '\n';
  if (format !== 'svg') throw new CliError('invalid-format');
  // Portable text receipt, not a natal wheel. Metadata holds the full record.
  const summary = lines.filter((line) => !line.startsWith('Receipt: ')).flatMap((line) => {
    const output = [];
    let rest = line;
    while (rest.length > 80) {
      const space = rest.lastIndexOf(' ', 80);
      const end = space > 0 ? space : 80;
      output.push(rest.slice(0, end));
      rest = rest.slice(end).trimStart();
    }
    output.push(rest);
    return output;
  });
  const height = 64 + summary.length * 28;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="' + height
    + '" viewBox="0 0 960 ' + height + '">'
    + '<title>' + escapeXml(summary[0]) + '</title>'
    + '<metadata>' + escapeXml(JSON.stringify(record)) + '</metadata>'
    + '<rect width="100%" height="100%" fill="#080b12"/>'
    + '<g fill="#eef0f5" font-family="sans-serif" font-size="16">'
    + summary.map((line, i) => '<text x="24" y="' + (40 + i * 28) + '">'
      + escapeXml(line) + '</text>').join('') + '</g></svg>\n';
}
async function inputJson(path) {
  const stream = path === '-' ? process.stdin : createReadStream(path);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_INPUT) { stream.destroy(); throw new CliError('input-size-limit'); }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('invalid-input');
  }
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage); return 0;
  }
  const command = args.shift();
  if (!commands.includes(command)) throw new CliError('invalid-command');
  let inputPath = '-', format = 'text';
  const seen = new Set();
  while (args.length) {
    const option = args.shift(), value = args.shift();
    if (!['--input', '--format'].includes(option) || value === undefined || seen.has(option)) {
      throw new CliError('invalid-options');
    }
    seen.add(option);
    if (option === '--input') inputPath = value;
    else format = value;
  }
  if (!['text', 'json', 'svg'].includes(format)) throw new CliError('invalid-format');
  if (command === 'conformance' && seen.has('--input')) throw new CliError('invalid-options');
  const input = command === 'conformance' ? null : await inputJson(inputPath);
  const result = command === 'conformance' ? await runConformance()
    : command === 'verify' ? await verify(input) : await calculate(command, input);
  const record = envelope(command, result);
  process.stdout.write(render(record, format));
  if (command === 'conformance') {
    const t = result.summary.total;
    return t.fail || t.unsupported || t.error ? 1 : 0;
  }
  return command !== 'verify' && refused(result) ? 1 : 0;
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { process.exitCode = await main(); }
  catch (error) {
    const code = error instanceof CliError ? error.code : 'calculation-failed';
    // Engine errors can echo inputs. Keep stderr fixed and value-free.
    process.stderr.write('zodiacs: ' + code + '\n');
    process.exitCode = code === 'verification-mismatch' ? 1 : 2;
  }
}
