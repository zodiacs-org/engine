import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import golden from './fixtures/composition-windows.json';
import { evaluateBasicRule } from '../src/basic-rules.js';
import { clipIntervals, subtractIntervals } from '../src/intervals.js';
import { runCli, CLI_HELP } from '../src/cli.js';
import type { CliIO } from '../src/cli.js';
import { parseCliControls } from '../src/cli-controls.js';
import { parseRuleSet } from '../src/rules.js';
import { RULE_LIMITS } from '../src/rule-schema.js';
import type { RuleSet, ElectionalRule } from '../src/rule-types.js';
import type { SearchDependencies } from '../src/search.js';
import type { StreamChunk, StreamEnd } from '../src/stream.js';
import type { EngineReceipt } from '../src/adapter-contract.js';
vi.mock('../src/basic-rules.js', () => ({ evaluateBasicRule: vi.fn() }));
const receipt: EngineReceipt = { schema: 'cli-hand-derived-contract', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['integer-sets;no-astronomical-reference'], engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };
const config: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic CLI integer sets', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: new Date(0).toISOString(), end: new Date(100).toISOString(), clock: 'utc' },
  rules: golden.rules.map(r => ({ id: r.id, kind: 'moon-sign', mode: r.mode, ...(r.mode === 'prefer' ? { weight: r.weight } : {}), options: { signs: ['aries'] } })) as ElectionalRule[] };
const controls = { stepMs: 10, lookaheadMs: 20, maxEvaluations: 1000, maxSkySamples: 1000,
  chunkMs: 25, maxChunks: 4, maxChunkEvaluations: 100, maxChunkSkySamples: 100, maxFrameBytes: 1000000 };
const span = ([startMs, endMs]: readonly number[]) => ({ startMs: startMs!, endMs: endMs! });
function harness(configuration: unknown = config, settings: unknown = controls) {
  const output: string[] = [], errors: string[] = [], files: Record<string, string> = {
    'rules.json': JSON.stringify(configuration), 'rules.yaml': stringify(configuration), 'controls.json': JSON.stringify(settings),
  };
  const io: CliIO = {
    readText: vi.fn(async (path, limit) => { expect(limit).toBe(RULE_LIMITS.documentBytes); if (!(path in files)) throw new Error('private-path'); return files[path]!; }),
    write: vi.fn(async text => { output.push(text); }), error: vi.fn(async text => { errors.push(text); }),
    loadDependencies: vi.fn(async () => ({ engine: {}, events: { status: 'missing' } }) as SearchDependencies),
  };
  return { output, errors, files, io, args: ['search', '--rules', 'rules.json', '--controls', 'controls.json'] };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(evaluateBasicRule).mockImplementation((rule, window) => {
    const row = golden.rules.find(r => r.id === rule.id)!;
    const satisfied = clipIntervals(row.satisfied.map(span), window), unknown = clipIntervals(row.unknown.map(span), window);
    const covered = subtractIntervals([window], unknown);
    return { rule, window, status: unknown.length ? 'unresolved' : 'complete', satisfied, failed: subtractIntervals(covered, satisfied), covered,
      unresolved: unknown.map(w => ({ ...w, reason: 'hand-derived-unknown' })), evaluations: 1,
      receipts: [receipt], searches: [], explanation: 'Independent hand-derived integer membership.', completeness: 'source-scan-assumptions' };
  });
});
describe('CLI independent hand-derived window transport', () => {
  it.each(['json', 'yaml'])('loads %s and preserves golden membership, chronological facts, receipts and unresolved status', async format => {
    const h = harness(); h.args[2] = `rules.${format}`;
    expect(await runCli(h.args, h.io)).toBe(2); expect(h.errors).toEqual([]);
    const frames = h.output.map(text => JSON.parse(text)) as (StreamChunk | StreamEnd)[];
    expect(frames.at(-1)).toMatchObject({ type: 'end', status: 'unresolved', chunks: 4, remaining: null });
    const chunks = frames.filter((frame): frame is StreamChunk => frame.type === 'chunk');
    const fragments = chunks.flatMap(c => c.fragments);
    for (const cell of golden.windows) {
      const parts = fragments.filter(f => f.startMs >= cell.span[0]! && f.endMs <= cell.span[1]!);
      expect(parts.reduce((sum, f) => sum + f.durationMs, 0)).toBe(cell.span[1]! - cell.span[0]!);
      expect(parts.every(f => f.explanations.map(e => e.state).join() === cell.states.join())).toBe(true);
    }
    expect(fragments.reduce((sum, f) => sum + f.durationMs, 0)).toBe(100);
    expect(chunks.every(c => !('scoring' in c.facts) && !('ranking' in c.facts))).toBe(true);
    expect(fragments.every(f => !('score' in f) && !('internalScore' in f) && !('chunkRank' in f) && !('rank' in f))).toBe(true);
    expect(fragments.every(f => f.explanations.every(e => !('contribution' in e)) && f.receipts.every(r => JSON.stringify(r) === JSON.stringify(receipt)))).toBe(true);
    expect(h.output.every(line => line.endsWith('\n') && line.indexOf('\n') === line.length - 1)).toBe(true);
  });
  it('returns complete even when hard rules exclude the entire known range', async () => {
    const h = harness({ ...config, rules: [config.rules[0]] });
    vi.mocked(evaluateBasicRule).mockImplementation((rule, window) => ({ rule, window, status: 'complete', satisfied: [], failed: [window], covered: [window],
      unresolved: [], evaluations: 1, receipts: [receipt], searches: [], explanation: 'Hand-derived empty set.', completeness: 'source-scan-assumptions' }));
    expect(await runCli(h.args, h.io)).toBe(0);
    expect(h.output.map(t => JSON.parse(t)).at(-1)).toMatchObject({ type: 'end', status: 'complete', remaining: null });
  });
  it('returns refused and preserves an unattempted suffix when chunk budget runs out', async () => {
    const h = harness(config, { ...controls, maxChunks: 1 });
    expect(await runCli(h.args, h.io)).toBe(3);
    expect(JSON.parse(h.output.at(-1)!)).toMatchObject({ type: 'end', status: 'refused', reason: 'chunk-budget', remaining: { startMs: 25, endMs: 100 } });
  });
  it('preserves missing-capability refusal instead of emitting a completed empty search', async () => {
    const h = harness();
    vi.mocked(evaluateBasicRule).mockImplementation((rule, window) => ({ rule, window, status: 'refused', reason: 'missing-capability', detail: null,
      satisfied: [], failed: [], covered: [], unresolved: [], evaluations: 0, receipts: [], searches: [], explanation: 'Missing events capability.', completeness: 'source-scan-assumptions' }));
    expect(await runCli(h.args, h.io)).toBe(3);
    const chunk = JSON.parse(h.output[0]!); expect(chunk.facts.status).toBe('refused'); expect(chunk.fragments).toEqual([]);
    expect(chunk.facts.ruleResults.every((rule: { reason: string }) => rule.reason === 'missing-capability')).toBe(true);
    expect(JSON.parse(h.output.at(-1)!)).toMatchObject({ type: 'end', status: 'refused', reason: 'chunk-refused' });
  });
  it('never pulls another chunk until the current write completes', async () => {
    const h = harness(); let release!: () => void;
    h.io.write = vi.fn(async text => { h.output.push(text); if (h.output.length === 1) await new Promise<void>(resolve => { release = resolve; }); });
    const running = runCli(h.args, h.io);
    await vi.waitFor(() => expect(h.output).toHaveLength(1));
    expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    await new Promise(resolve => setImmediate(resolve)); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    release(); expect(await running).toBe(2);
  });
  it('stops on a broken output transport, retaining no false terminal success', async () => {
    const h = harness(); h.io.write = vi.fn(async () => { throw new Error('secret-output-path'); });
    expect(await runCli(h.args, h.io)).toBe(1); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    expect(h.output).toEqual([]); expect(h.errors.join()).not.toContain('secret');
  });
  it('emits cancellation and stops work between frames', async () => {
    const h = harness(), controller = new AbortController();
    const io = { ...h.io, signal: controller.signal, write: async (text: string) => { h.output.push(text); controller.abort(); } };
    expect(await runCli(h.args, io)).toBe(130); expect(evaluateBasicRule).toHaveBeenCalledTimes(4);
    expect(JSON.parse(h.output.at(-1)!)).toMatchObject({ type: 'end', reason: 'cancelled', remaining: { startMs: 25 } });
  });
  it('does no native work when cancelled before search', async () => {
    const h = harness(), controller = new AbortController(); controller.abort();
    expect(await runCli(h.args, { ...h.io, signal: controller.signal })).toBe(130);
    expect(evaluateBasicRule).not.toHaveBeenCalled(); expect(h.output).toHaveLength(1);
  });
  it('reports unexpected source failures after a provisional prefix with no terminal completion', async () => {
    const h = harness();
    const implementation = vi.mocked(evaluateBasicRule).getMockImplementation()!;
    vi.mocked(evaluateBasicRule).mockImplementation((...args) => { if (args[1].startMs === 25) throw new Error('private-details'); return implementation(...args); });
    expect(await runCli(h.args, h.io)).toBe(1); expect(h.output).toHaveLength(1);
    expect(h.errors.join()).not.toContain('private-details');
  });
});
describe('CLI strict arguments and configuration', () => {
  it.each([[], ['help'], ['--help']].map(args => ({ args })))('prints help without loading files or runtimes $args', async ({ args }) => {
    const h = harness(); expect(await runCli(args, h.io)).toBe(0); expect(h.output).toEqual([CLI_HELP]);
    expect(h.io.readText).not.toHaveBeenCalled(); expect(h.io.loadDependencies).not.toHaveBeenCalled();
  });
  it.each([
    ['unknown'], ['help', 'extra'], ['presets', 'extra'], ['search'], ['search', '--rules', 'rules.json'],
    ['validate', '--rules'], ['validate', '--rules', ''], ['validate', '--rules', 'rules.json', '--rules', 'rules.json'],
    ['validate', '--rules', 'rules.json', '--unknown', 'secret'], ['validate', '--rules', 'rules.txt'],
    ['validate', '--rules', 'rules.json', '--format', 'auto'], ['validate', '--rules', 'rules.json', 'extra'],
    ['search', '--rules=rules.json', '--controls', 'controls.json'], ['validate', '--rules', '--format', 'json'],
    ['search', '--rules', 'rules.json', '--controls', 'controls.json', '--internal-scoring', 'true'],
  ].map(args => ({ args })))('rejects malformed arguments $args before loading a runtime', async ({ args }) => {
    const h = harness(); expect(await runCli(args, h.io)).toBe(1); expect(h.output).toEqual([]);
    expect(h.io.loadDependencies).not.toHaveBeenCalled(); expect(h.errors).toHaveLength(1);
  });
  it('validates using an explicit format for an otherwise unknown extension', async () => {
    const h = harness(); h.files['rules.data'] = h.files['rules.yaml']!;
    expect(await runCli(['validate', '--rules', 'rules.data', '--format', 'yaml'], h.io)).toBe(0);
    expect(JSON.parse(h.output[0]!)).toEqual({ status: 'valid', schemaVersion: 'electional/v1' });
    expect(h.io.loadDependencies).not.toHaveBeenCalled();
  });
  it.each(['{}', '{"token":"never-echo-this"}', '{"rules": invalid-secret}'])('rejects malformed rule data with bounded diagnostics', async text => {
    const h = harness(); h.files['rules.json'] = text;
    expect(await runCli(h.args, h.io)).toBe(1); expect(h.output).toEqual([]); expect(h.io.loadDependencies).not.toHaveBeenCalled();
    expect(h.errors.join()).not.toContain('secret'); expect(h.errors.join()).not.toContain('never-echo');
  });
  it('reports file/runtime errors without echoing paths or source messages', async () => {
    const h = harness(); h.args[2] = 'private-path.json';
    expect(await runCli(h.args, h.io)).toBe(1); expect(h.errors.join()).not.toContain('private-path');
    h.args[2] = 'rules.json'; h.io.loadDependencies = async () => { throw new Error('private-module'); };
    expect(await runCli(h.args, h.io)).toBe(1); expect(h.errors.join()).not.toContain('private-module');
  });
  it('lists authored preset metadata without loading an engine', async () => {
    const h = harness(); expect(await runCli(['presets'], h.io)).toBe(0);
    expect(JSON.parse(h.output[0]!).map((p: { name: string }) => p.name)).toEqual(['launch', 'contract-signing', 'travel']);
    expect(h.io.loadDependencies).not.toHaveBeenCalled();
  });
  it.each(['launch', 'contract-signing', 'travel'])('prints an editable %s document with explicit place/range/solar clock', async name => {
    const h = harness();
    expect(await runCli(['preset', name, '--start', config.range.start, '--end', config.range.end, '--latitude', '-12.5', '--longitude', '+40',
      '--house-system', 'whole', '--utc-offset-minutes', '-60'], h.io)).toBe(0);
    const result = parseRuleSet(h.output[0]!, 'json'); expect(result.location).toEqual({ latitude: -12.5, longitude: 40 });
    expect(result.range).toEqual(config.range); expect(h.io.loadDependencies).not.toHaveBeenCalled();
  });
  it.each(['NaN', 'Infinity', '0x10', '1e2', ' 1', '1 ', '', '91'])('rejects invalid preset latitude %s', async latitude => {
    const h = harness();
    expect(await runCli(['preset', 'launch', '--start', config.range.start, '--end', config.range.end, '--latitude', latitude, '--longitude', '0',
      '--house-system', 'whole', '--utc-offset-minutes', '0'], h.io)).toBe(1);
    expect(h.output).toEqual([]);
  });
});
describe('CLI bounded explicit controls', () => {
  it('preserves all explicit controls and freezes the parsed snapshot', () => {
    const result = parseCliControls(JSON.stringify(controls), config.rules);
    expect(result).toEqual(controls); expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(Object.keys(controls))('rejects missing control %s before runtime loading', async key => {
    const missing = { ...controls } as Record<string, unknown>; delete missing[key];
    const h = harness(config, missing); expect(await runCli(h.args, h.io)).toBe(1);
    expect(h.io.loadDependencies).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, '1', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid positive chunk control %s', value => {
    expect(() => parseCliControls(JSON.stringify({ ...controls, maxChunks: value }), config.rules)).toThrow(RangeError);
  });
  it.each(['internalScoring', 'signal', 'deadline', 'extra'])('rejects unsupported public control %s', key => {
    expect(() => parseCliControls(JSON.stringify({ ...controls, [key]: true }), config.rules)).toThrow(RangeError);
  });
  it.each(['[]', 'null', '{', JSON.stringify(controls).replace('"chunkMs":25', '"chunkMs":25,"chunkMs":25')])('rejects invalid/duplicate JSON %s', text => {
    expect(() => parseCliControls(text, config.rules)).toThrow(RangeError);
  });
  it('requires an explicit eclipse model and refuses nested duplicate radius fields', () => {
    const eclipseRule: ElectionalRule = { id: 'eclipse', kind: 'avoid-eclipses', mode: 'require', options: { kinds: ['solar'], withinDays: 1 } };
    expect(() => parseCliControls(JSON.stringify(controls), [eclipseRule])).toThrow(RangeError);
    const eclipse = { model: { sunRadiusAu: 0.004, moonRadiusAu: 0.00001, earthRadiusAu: 0.00004 }, derivativeStepMs: 1000 };
    const valid = JSON.stringify({ ...controls, eclipse });
    expect(parseCliControls(valid, [eclipseRule]).eclipse).toEqual(eclipse);
    expect(() => parseCliControls(valid.replace('"sunRadiusAu":0.004', '"sunRadiusAu":0.004,"sunRadiusAu":0.004'), [eclipseRule])).toThrow(RangeError);
  });
  it('enforces the inclusive UTF-8 document byte limit', () => {
    const text = JSON.stringify(controls);
    expect(() => parseCliControls(text.padEnd(RULE_LIMITS.documentBytes, ' '), config.rules)).not.toThrow();
    expect(() => parseCliControls(text.padEnd(RULE_LIMITS.documentBytes + 1, ' '), config.rules)).toThrow(RangeError);
  });
});
