import { extname } from 'node:path';
import { createPresetRuleSet, listPresetPacks } from './presets.js';
import type { PresetName } from './presets.js';
import type { HouseSystem } from './rule-types.js';
import { parseRuleSet, RuleValidationError } from './rules.js';
import { RULE_LIMITS } from './rule-schema.js';
import { parseCliControls } from './cli-controls.js';
import { loadSearchDependencies } from './search.js';
import type { SearchDependencies } from './search.js';
import { streamElectional } from './stream.js';

export const CLI_HELP = `Electional workbench: traditional selection conventions, not predictions.
Usage:
  electional presets
  electional preset NAME --start ISO --end ISO --latitude N --longitude N
    --house-system SYSTEM --utc-offset-minutes N
  electional validate --rules FILE [--format json|yaml]
  electional search --rules FILE [--format json|yaml] --controls JSON_FILE
  electional help
Preset names: launch, contract-signing, travel.
Rule format follows .json, .yaml or .yml unless explicitly supplied.
Search emits facts-only JSON Lines: chunk frames followed by an end frame.
Exit codes: 0 complete/valid, 1 input/runtime/output error, 2 unresolved,
3 refused, 130 cancelled (SIGTERM uses 143 in the executable).
Earlier chunks are provisional until the terminal end frame arrives.
Controls require explicit scan, lookahead, work, chunk and output limits.
See electional/CLI.md and electional/PRESETS.md for their definitions.
`;
export interface CliIO {
  /** Must enforce the limit on bytes before decoding text. */
  readText(path: string, maxBytes: number): Promise<string>;
  /** Resolves only after accepting a full line, providing backpressure. */
  write(text: string): Promise<void>;
  error(text: string): Promise<void>;
  loadDependencies?(): Promise<SearchDependencies>;
  readonly signal?: AbortSignal;
}
class UsageError extends Error {}
function usage(): never { throw new UsageError(); }
function options(args: readonly string[], allowed: readonly string[], required: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!, value = args[index + 1];
    if (!allowed.includes(flag) || result.has(flag) || value === undefined || value === '' || value.startsWith('--')) usage();
    result.set(flag, value);
  }
  if (required.some(flag => !result.has(flag))) usage();
  return result;
}
function decimal(value: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value) || !Number.isFinite(Number(value))) usage();
  return Number(value);
}
function ruleFormat(path: string, explicit?: string): 'json' | 'yaml' {
  const format = explicit ?? ({ '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml' } as Record<string, string>)[extname(path).toLowerCase()];
  if (format !== 'json' && format !== 'yaml') usage();
  return format;
}

/** Import-safe CLI coordinator; it never writes files or scores public output. */
export async function runCli(args: readonly string[], io: CliIO): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === undefined || command === 'help' || command === '--help') {
      if (rest.length) usage();
      await io.write(CLI_HELP); return 0;
    }
    if (command === 'presets') {
      if (rest.length) usage();
      await io.write(JSON.stringify(listPresetPacks()) + '\n'); return 0;
    }
    if (command === 'preset') {
      const [name, ...flags] = rest;
      const required = ['--start', '--end', '--latitude', '--longitude', '--house-system', '--utc-offset-minutes'];
      const values = options(flags, required, required);
      const config = createPresetRuleSet(name as PresetName, {
        range: { start: values.get('--start')!, end: values.get('--end')!, clock: 'utc' },
        location: { latitude: decimal(values.get('--latitude')!), longitude: decimal(values.get('--longitude')!) },
        houseSystem: values.get('--house-system')! as HouseSystem, utcOffsetMinutes: decimal(values.get('--utc-offset-minutes')!),
      });
      await io.write(JSON.stringify(config, null, 2) + '\n'); return 0;
    }
    if (command !== 'search' && command !== 'validate') usage();
    const allowed = ['--rules', '--format', ...(command === 'search' ? ['--controls'] : [])];
    const flags = options(rest, allowed, ['--rules', ...(command === 'search' ? ['--controls'] : [])]);
    const file = flags.get('--rules')!, format = ruleFormat(file, flags.get('--format'));
    const ruleSet = parseRuleSet(await io.readText(file, RULE_LIMITS.documentBytes), format);
    if (command === 'validate') {
      await io.write(JSON.stringify({ status: 'valid', schemaVersion: ruleSet.schemaVersion }) + '\n'); return 0;
    }
    const controls = parseCliControls(await io.readText(flags.get('--controls')!, RULE_LIMITS.documentBytes), ruleSet.rules);
    const dependencies = await (io.loadDependencies ?? loadSearchDependencies)();
    for await (const frame of streamElectional(ruleSet, dependencies, { ...controls, ...(io.signal ? { signal: io.signal } : {}) })) {
      await io.write(JSON.stringify(frame) + '\n');
      if (frame.type === 'end') return frame.reason === 'cancelled' ? 130
        : frame.status === 'complete' ? 0 : frame.status === 'unresolved' ? 2 : 3;
    }
    throw new Error('Missing terminal frame.');
  } catch (error) {
    // Parser and filesystem exceptions can contain submitted content or paths.
    // Keep diagnostics bounded and never claim a completed search after errors.
    const detail = error instanceof UsageError ? 'invalid-arguments; see electional help'
      : error instanceof RuleValidationError ? 'invalid-rule-set'
        : error instanceof RangeError ? 'invalid-input-or-controls' : 'input-runtime-or-output-error';
    try { await io.error(JSON.stringify({ type: 'error', code: detail }) + '\n'); } catch { /* output transport is already broken */ }
    return 1;
  }
}
