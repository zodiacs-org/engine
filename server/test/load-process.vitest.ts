import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engineIdentity } from '../src/engine.js';
import { DEFAULT_RESOURCE_LIMITS, HTTP_LIMITS } from '../src/resource-limits.js';

const sourceServerDirectory = fileURLToPath(new URL('..', import.meta.url));
let serverDirectory: string;
let repositoryDirectory: string;
let cacheDirectory: string;
type Exit = { code: number | null; signal: NodeJS.Signals | null };
interface RunningLoad {
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
  exited: Promise<Exit>;
}
interface Summary {
  passed: boolean;
  durationSeconds: number;
  autocannonDurationSeconds: number;
  requestedDurationSeconds: number;
  sent: number;
  completed: number;
  unfinishedAtStop: number;
  successfulResponsesPerSecond: number;
  statusCounts: Record<string, number>;
  errors: number;
  timeouts: number;
  bodyMismatches: number;
  non2xx: number;
  latencyMs: { samples: number; p50: number; p95: number; max: number };
}
interface Report {
  schema: string;
  passed: boolean;
  command: string[];
  options: object;
  engine: object;
  build: {
    algorithm: string;
    inputsDigest: string;
    inputs: { path: string; sha256: string }[];
    bundles: { path: string; sha256: string; bytes: number }[];
    packages: Record<string, string>;
  };
  machine: { node: string };
  configuration: object;
  workloads: { name: string; path: string }[];
  preflight: { name: string; status: number; responseBytes: number }[];
  runs: { workload: string; repetition: number; connections: number; warmup: Summary; measurement: Summary }[];
}

const processes: RunningLoad[] = [];
const descendants = new Set<number>();

function launch(args: string[], overrides: NodeJS.ProcessEnv = {}): RunningLoad {
  const child = spawn(process.execPath, ['scripts/load.mjs', ...args], {
    cwd: serverDirectory,
    env: { PATH: process.env.PATH, LANG: 'C', TZ: 'UTC', ...overrides },
    stdio: 'pipe',
  });
  const result: RunningLoad = {
    child, stdout: '', stderr: '',
    exited: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }),
  };
  for (const stream of ['stdout', 'stderr'] as const) {
    child[stream].setEncoding('utf8');
    child[stream].on('data', (chunk: string) => {
      result[stream] += chunk;
      if (result[stream].length > 256 * 1024) child.kill('SIGKILL');
    });
  }
  processes.push(result);
  return result;
}

async function bounded<T>(promise: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Load process deadline exceeded.')), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function warming(load: RunningLoad): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      load.child.stdout.off('data', inspect);
      load.child.off('close', closed);
    };
    const inspect = () => {
      if (load.stdout.includes('warming then measuring.')) {
        cleanup();
        resolve();
      }
    };
    const closed = () => {
      cleanup();
      reject(new Error('Load process exited before its warmup.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Load process warmup deadline exceeded.'));
    }, 10_000);
    load.child.stdout.on('data', inspect);
    load.child.once('close', closed);
    inspect();
    if (load.child.exitCode !== null || load.child.signalCode !== null) closed();
  });
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function newDirectories(): Promise<string[]> {
  try { return await readdir(cacheDirectory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

beforeEach(async () => {
  // The executable rebuilds before measuring. Give each CLI case its own
  // checkout layout so parallel process tests never observe rewritten bundles.
  const temporaryRoot = join(sourceServerDirectory, '.cache');
  await mkdir(temporaryRoot, { recursive: true });
  repositoryDirectory = await mkdtemp(join(temporaryRoot, 'load-process-'));
  serverDirectory = join(repositoryDirectory, 'server');
  cacheDirectory = join(serverDirectory, '.cache/load');
  await mkdir(join(serverDirectory, 'scripts'), { recursive: true });
  await Promise.all([
    cp(join(dirname(sourceServerDirectory), 'src'), join(repositoryDirectory, 'src'), { recursive: true }),
    copyFile(join(dirname(sourceServerDirectory), 'package.json'), join(repositoryDirectory, 'package.json')),
    cp(join(sourceServerDirectory, 'src'), join(serverDirectory, 'src'), { recursive: true }),
    ...['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/build.mjs', 'scripts/load.mjs', 'scripts/load-support.mjs']
      .map((path) => copyFile(join(sourceServerDirectory, path), join(serverDirectory, path))),
    symlink(join(sourceServerDirectory, 'node_modules'), join(serverDirectory, 'node_modules'), 'junction'),
  ]);
});

afterEach(async () => {
  for (const load of processes.splice(0)) {
    if (load.child.exitCode === null && load.child.signalCode === null) {
      load.child.kill('SIGTERM');
      try { await bounded(load.exited, 15_000); }
      catch { load.child.kill('SIGKILL'); await bounded(load.exited, 2000); }
    }
  }
  for (const pid of descendants) {
    if (alive(pid)) process.kill(pid, 'SIGKILL');
  }
  descendants.clear();
  await rm(repositoryDirectory, { recursive: true, force: true });
});

const digest = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function expectComplete(summary: Summary) {
  expect(summary.passed).toBe(true);
  expect(summary.completed).toBeGreaterThan(0);
  expect(summary.durationSeconds).toBeGreaterThan(0);
  expect(summary.autocannonDurationSeconds).toBeGreaterThan(0);
  expect(summary.requestedDurationSeconds).toBe(1);
  expect(summary.sent).toBeGreaterThanOrEqual(summary.completed);
  expect(summary.unfinishedAtStop).toBe(summary.sent - summary.completed);
  expect(summary.statusCounts).toEqual({ 200: summary.completed });
  expect(summary.latencyMs.samples).toBe(summary.completed);
  expect(summary.successfulResponsesPerSecond).toBe(summary.completed / summary.durationSeconds);
  expect(summary).toMatchObject({ errors: 0, timeouts: 0, bodyMismatches: 0, non2xx: 0 });
  expect(summary.latencyMs.p50).toBeGreaterThanOrEqual(0);
  expect(summary.latencyMs.p95).toBeGreaterThanOrEqual(summary.latencyMs.p50);
  expect(summary.latencyMs.max).toBeGreaterThanOrEqual(summary.latencyMs.p95);
}

describe('load harness executable', () => {
  it('writes a bounded report for a small real HTTP run, with build identity and explicit configuration', async () => {
    const canary = randomUUID();
    const args = ['--routes', 'natal', '--connections', '1,2', '--duration', '1', '--warmup', '1'];
    const load = launch(args, {
      // These inherited settings must not reach the server the harness owns.
      API_KEYS: JSON.stringify([canary]), API_KEYS_FILE: `/unavailable/${canary}`,
      HOST: canary, PORT: canary, LOG_LEVEL: canary,
      RATE_LIMIT_CAPACITY: '1', RATE_LIMIT_REFILL_PER_SECOND: '1',
      MAX_CONNECTIONS: '1', CALCULATION_QUEUE_SIZE: '0', REQUEST_TIMEOUT_MS: '100',
      INHERITED_OPERATOR_SECRET: canary,
    });
    expect(await bounded(load.exited)).toEqual({ code: 0, signal: null });
    expect(load.stderr).toBe('');
    const reportPath = load.stdout.match(/^Load passed\. Report: (server\/\.cache\/load\/run-[^/\r\n]+\/report\.json)$/mu)?.[1];
    expect(reportPath).toBeDefined();
    const path = resolve(repositoryDirectory, reportPath!);
    expect((await stat(path)).size).toBeLessThan(2_000_000);
    const text = await readFile(path, 'utf8');
    const report = JSON.parse(text) as Report;
    expect(report.schema).toBe('zodiacs-http-load/1');
    expect(report.passed).toBe(true);
    expect(report.command).toEqual(['node', 'server/scripts/load.mjs', ...args]);
    expect(report.options).toEqual({ duration: 1, warmup: 1, connections: [1, 2], repetitions: 1, routes: ['natal'] });
    expect(report.engine).toEqual(engineIdentity);
    expect(report.machine.node).toBe(process.version);
    expect(report.configuration).toMatchObject({
      rateLimit: { capacity: 10000, refillPerSecond: 10000, costPerAuthenticatedRequest: 1 },
      resources: { ...DEFAULT_RESOURCE_LIMITS, ...HTTP_LIMITS },
      logLevel: 'info', timeZone: 'UTC', locale: 'C', workers: 1, keys: 2,
    });
    expect(report.workloads).toEqual([expect.objectContaining({ name: 'natal', path: '/v1/natal' })]);
    expect(report.preflight).toEqual([{ name: 'natal', status: 200, responseBytes: expect.any(Number) }]);
    expect(report.preflight[0]!.responseBytes).toBeGreaterThan(0);
    expect(report.runs).toHaveLength(2);
    for (const [index, run] of report.runs.entries()) {
      expect(run).toMatchObject({ workload: 'natal', repetition: 1, connections: index + 1 });
      expectComplete(run.warmup);
      expectComplete(run.measurement);
    }
    expect(report.build.algorithm).toBe('sha256');
    expect(report.build.inputsDigest).toBe(digest(JSON.stringify(report.build.inputs)));
    expect(report.build.inputs.length).toBeGreaterThan(0);
    const paths = report.build.inputs.map(({ path }) => path);
    expect(paths).toContain('server/scripts/load.mjs');
    expect(paths).toContain('server/scripts/load-support.mjs');
    expect(paths).toContain('server/package-lock.json');
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([...paths].sort());
    for (const input of report.build.inputs) {
      expect(isAbsolute(input.path)).toBe(false);
      expect(input.path.split('/')).not.toContain('..');
      expect(input.sha256).toBe(digest(await readFile(join(repositoryDirectory, input.path))));
    }
    expect(report.build.bundles.map(({ path }) => path)).toEqual([
      'server/build/main.js', 'server/build/calculation-worker.js',
    ]);
    for (const bundle of report.build.bundles) {
      const bytes = await readFile(join(repositoryDirectory, bundle.path));
      expect(bundle.sha256).toBe(digest(bytes));
      expect(bundle.bytes).toBe(bytes.length);
    }
    for (const [name, version] of Object.entries(report.build.packages)) {
      const installed = JSON.parse(await readFile(join(serverDirectory, 'node_modules', name, 'package.json'), 'utf8'));
      expect(version).toBe(installed.version);
    }
    expect(Object.keys(report.build.packages).sort()).toEqual(['astronomy-engine', 'autocannon', 'esbuild', 'fastify']);
    const contextText = await readFile(join(dirname(path), 'context.json'), 'utf8');
    const context = JSON.parse(contextText);
    expect(context).toMatchObject({
      schema: 'zodiacs-http-load-context/1', status: 'not-a-result', configuredKeys: 2,
      command: report.command, options: report.options, engine: report.engine,
      build: report.build, workloads: report.workloads, preflight: report.preflight,
    });
    expect(context).not.toHaveProperty('passed');
    expect(context).not.toHaveProperty('runs');
    const combined = load.stdout + load.stderr + text + contextText;
    expect(combined).not.toContain(canary);
    for (const field of ['INHERITED_OPERATOR_SECRET', 'API_KEYS', 'API_KEYS_FILE', '"authorization"', '"headers"']) {
      expect(combined).not.toContain(field);
    }
    expect(combined).not.toMatch(/http:\/\/127\.0\.0\.1:[0-9]+/u);
    expect(combined).not.toContain('server_started');
    const files = await readdir(dirname(path));
    expect(files.sort()).toEqual(['1-measurement.json', '1-warmup.json', '2-measurement.json', '2-warmup.json', 'context.json', 'report.json']);
    for (const name of files) expect((await stat(join(dirname(path), name))).size).toBeLessThan(2_000_000);
    for (const [index, run] of report.runs.entries()) {
      expect(JSON.parse(await readFile(join(dirname(path), `${index + 1}-warmup.json`), 'utf8'))).toEqual(run.warmup);
      expect(JSON.parse(await readFile(join(dirname(path), `${index + 1}-measurement.json`), 'utf8'))).toEqual(run.measurement);
    }
  }, 30_000);

  it('rejects invalid options before building or creating a report and never echoes the raw value', async () => {
    const canary = randomUUID();
    expect(await readdir(serverDirectory)).not.toContain('build');
    const load = launch(['--routes', canary]);
    expect(await bounded(load.exited)).toEqual({ code: 1, signal: null });
    expect(load.stdout).toBe('');
    expect(load.stderr).toBe('Load test failed during options. No successful report written.\n');
    expect(load.stderr).not.toContain(canary);
    expect(await newDirectories()).toEqual([]);
    expect(await readdir(serverDirectory)).not.toContain('build');
  });

  it.skipIf(process.platform !== 'linux')('stops its server child on SIGTERM during warmup and writes no successful report', async () => {
    const load = launch(['--routes', 'natal', '--connections', '1', '--duration', '1', '--warmup', '30']);
    await warming(load);
    const pid = load.child.pid!;
    const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim().split(/\s+/u).filter(Boolean).map(Number);
    for (const childPid of children) descendants.add(childPid);
    expect(children).toHaveLength(1);
    const serverPid = children[0]!;
    expect(await readFile(`/proc/${serverPid}/cmdline`, 'utf8')).toContain('build/main.js');
    expect(alive(serverPid)).toBe(true);
    expect(load.child.kill('SIGTERM')).toBe(true);
    expect(await bounded(load.exited)).toEqual({ code: 1, signal: null });
    expect(alive(serverPid)).toBe(false);
    expect(load.stdout).not.toContain('Load passed.');
    expect(load.stderr).toBe('Load test failed during natal, connections 1, repetition 1. No successful report written.\n');
    const directories = await newDirectories();
    expect(directories).toHaveLength(1);
    for (const name of directories) {
      expect(await readdir(join(cacheDirectory, name))).toEqual(['context.json']);
      const context = JSON.parse(await readFile(join(cacheDirectory, name, 'context.json'), 'utf8'));
      expect(context).toMatchObject({ schema: 'zodiacs-http-load-context/1', status: 'not-a-result', configuredKeys: 1 });
      expect(context.build.inputsDigest).toMatch(/^[a-f0-9]{64}$/u);
      expect(context).not.toHaveProperty('passed');
      expect(context).not.toHaveProperty('runs');
    }
  }, 30_000);
});
