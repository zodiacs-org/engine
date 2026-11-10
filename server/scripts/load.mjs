import autocannon from 'autocannon';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, loadavg, platform, release, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { check, clientKeySetup, observations, readOptions, summarize, verifyResponse, WORKLOADS } from './load-support.mjs';

const server = fileURLToPath(new URL('..', import.meta.url));
const repository = dirname(server);
const controller = new AbortController();
let active;
let child;
let childClosed;
let stage = 'options';
let failureDetail;
const interrupt = () => { controller.abort(); active?.stop(); };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

function uninterrupted() { check(!controller.signal.aborted, 'Load test interrupted.'); }
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function identity() {
  const meta = JSON.parse(await readFile(join(server, 'build/meta.json'), 'utf8'));
  const paths = [...new Set([
    ...Object.keys(meta.inputs).map((path) => resolve(server, path)),
    ...['package.json', 'package-lock.json', 'scripts/build.mjs', 'scripts/load.mjs', 'scripts/load-support.mjs']
      .map((path) => join(server, path)),
  ])].sort();
  const inputs = await Promise.all(paths.map(async (path) => ({
    path: relative(repository, path), sha256: digest(await readFile(path)),
  })));
  const bundles = await Promise.all(['build/main.js', 'build/calculation-worker.js'].map(async (path) => {
    const bytes = await readFile(join(server, path));
    return { path: `server/${path}`, bytes: bytes.length, sha256: digest(bytes) };
  }));
  const packages = {};
  for (const name of ['autocannon', 'fastify', 'astronomy-engine', 'esbuild']) {
    packages[name] = JSON.parse(await readFile(join(server, 'node_modules', name, 'package.json'), 'utf8')).version;
  }
  return { algorithm: 'sha256', inputsDigest: digest(JSON.stringify(inputs)), inputs, bundles, packages };
}

async function cgroups() {
  // Read both the process's cgroup and visible ancestors. A container may hide
  // stricter outer limits; absence or "max" is never proof of dedicated CPUs.
  try {
    const self = (await readFile('/proc/self/cgroup', 'utf8')).split('\n').find((line) => line.startsWith('0::'))?.slice(3);
    if (!self) return null;
    const root = '/sys/fs/cgroup';
    let directory = resolve(root, `.${self}`);
    if (directory !== root && !directory.startsWith(root + '/')) return null;
    const levels = [];
    while (true) {
      const limits = {};
      for (const name of ['cpu.max', 'cpu.stat', 'memory.max', 'cpuset.cpus.effective']) {
        try { limits[name] = (await readFile(join(directory, name), 'utf8')).trim(); } catch { limits[name] = null; }
      }
      levels.push({ ancestor: levels.length, ...limits });
      if (directory === root) break;
      directory = dirname(directory);
    }
    return levels;
  } catch { return null; }
}

async function machine() {
  const processors = cpus();
  return {
    platform: platform(), release: release(), arch: process.arch,
    node: process.version, v8: process.versions.v8,
    cpuModels: [...new Set(processors.map(({ model }) => model))],
    logicalCpus: processors.length, availableParallelism: availableParallelism(),
    hostMemoryBytes: totalmem(), loadAverage: loadavg(), cgroupV2: await cgroups(),
  };
}

async function launch(keys) {
  child = spawn(process.execPath, ['build/main.js'], {
    cwd: server, stdio: ['ignore', 'pipe', 'pipe'],
    // Do not inherit operator secrets, Node injection flags or tuning. All
    // operational settings are deliberate, and are checked through OpenAPI.
    env: {
      HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'info', TZ: 'UTC', LANG: 'C',
      API_KEYS: JSON.stringify(keys), RATE_LIMIT_CAPACITY: '10000', RATE_LIMIT_REFILL_PER_SECOND: '10000',
    },
  });
  childClosed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  return new Promise((resolve, reject) => {
    let pending = '';
    let settled = false;
    const timer = setTimeout(() => finish(), 15_000);
    const finish = (address) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (address) resolve(address);
      else reject(new Error('Load server startup failed.'));
      pending = '';
    };
    child.on('error', () => finish());
    child.once('close', () => finish());
    child.stderr.on('data', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      // Drain info-level JSON logs throughout the run without persisting them.
      if (settled) return;
      pending += chunk;
      if (Buffer.byteLength(pending) > 65_536) return finish();
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try {
          const log = JSON.parse(line);
          if (log.event === 'server_started' && /^http:\/\/127\.0\.0\.1:[0-9]+$/u.test(log.address)) finish(log.address);
        } catch { finish(); }
      }
    });
  });
}

async function stop() {
  if (!child) return;
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 12_000);
  try {
    const result = await childClosed;
    check(result.code === 0 && result.signal === null, 'Load server did not exit cleanly.');
  } finally { clearTimeout(killTimer); }
}

async function request(address, path, key, body) {
  uninterrupted();
  const response = await fetch(address + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: key ? { authorization: `Bearer ${key}`, 'content-type': 'application/json' } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
  });
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    check(length <= 1_000_000, 'Load preflight response too large.');
    chunks.push(Buffer.from(chunk));
  }
  return { status: response.status, text: Buffer.concat(chunks).toString('utf8') };
}

async function measure(address, keys, engine, workload, connections, duration) {
  uninterrupted();
  const observed = observations();
  const start = performance.now();
  const { result, durationSeconds } = await new Promise((resolve, reject) => {
    active = autocannon({
      url: address + workload.path, method: 'POST', body: JSON.stringify(workload.body),
      setupClient: clientKeySetup(keys),
      connections, pipelining: 1, duration, timeout: 10, sampleInt: 1000,
      verifyBody: (body) => verifyResponse(body, workload, engine),
    }, (error, result) => error ? reject(new Error('Load client failed.')) : resolve({
      result, durationSeconds: (performance.now() - start) / 1000,
    }));
    active.on('response', (_client, status, _bytes, milliseconds) => observed.record(status, milliseconds));
  });
  active = undefined;
  uninterrupted();
  return summarize(result, observed, { durationSeconds, requestedDurationSeconds: duration });
}

async function barrier(address, key, engine, workload) {
  // Autocannon destroys sockets at the cutoff, but the worker can still have
  // admitted jobs. Yield for closed sockets, then await a calculation through
  // the same FIFO. Up to eight leftover jobs plus this request fit the queue.
  await nextTurn();
  const response = await request(address, workload.path, key, workload.body);
  if (response.status !== 200 || !verifyResponse(response.text, workload, engine)) {
    let errorCode = 'unrecognized_response';
    try {
      const code = JSON.parse(response.text)?.error?.code;
      if (['not_ready', 'server_busy', 'calculation_timeout', 'calculation_failed', 'rate_limited',
        'invalid_request', 'receipt_unavailable', 'unauthorized'].includes(code)) errorCode = code;
    } catch { /* No response contents enter the diagnostic. */ }
    failureDetail = { phase: 'between-phases', httpStatus: response.status, errorCode };
    throw new Error('Between-phase calculation failed.');
  }
}

async function writeJson(directory, name, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  check(Buffer.byteLength(text) < 1_900_000, 'Load output too large.');
  await writeFile(join(directory, name), text, { flag: 'wx' });
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  check(major === 22 && (minor > 22 || (minor === 22 && patch >= 2)),
    'Use the server package Node 22 runtime.');
  stage = 'build';
  execFileSync(process.execPath, ['scripts/build.mjs'], {
    cwd: server, env: { PATH: process.env.PATH, TZ: 'UTC', LANG: 'C' }, timeout: 30_000, stdio: 'pipe', maxBuffer: 65_536,
  });
  uninterrupted();
  const build = await identity();
  const before = await machine();
  const keys = Array.from({ length: Math.max(...options.connections) }, () => randomBytes(32).toString('base64url'));
  const key = keys[0];
  stage = 'startup';
  const address = await launch(keys);
  stage = 'preflight';
  const ready = await request(address, '/readyz');
  const { engine, data } = JSON.parse(ready.text);
  check(ready.status === 200 && data?.status === 'ready', 'Load server not ready.');
  const discovery = await request(address, '/openapi.json');
  const spec = JSON.parse(discovery.text);
  check(discovery.status === 200 && spec['x-rate-limit']?.capacity === 10000, 'Load configuration differs.');
  const workloads = options.routes.map((name) => WORKLOADS.find((workload) => workload.name === name));
  const preflight = [];
  for (const workload of workloads) {
    const response = await request(address, workload.path, key, workload.body);
    check(response.status === 200 && verifyResponse(response.text, workload, engine), 'Load preflight calculation failed.');
    preflight.push({ name: workload.name, status: response.status, responseBytes: Buffer.byteLength(response.text) });
  }
  await mkdir(join(server, '.cache/load'), { recursive: true });
  const directory = await mkdtemp(join(server, '.cache/load/run-'));
  await writeJson(directory, 'context.json', {
    schema: 'zodiacs-http-load-context/1', status: 'not-a-result',
    command: ['node', 'server/scripts/load.mjs', ...process.argv.slice(2)],
    options, engine, build, machine: before, workloads, preflight,
    configuredKeys: keys.length, rateLimit: spec['x-rate-limit'], resources: spec['x-resource-limits'],
  });
  const runs = [];
  for (let repetition = 1; repetition <= options.repetitions; repetition++) {
    for (const workload of workloads) {
      for (const connections of options.connections) {
        stage = `${workload.name}, connections ${connections}, repetition ${repetition}`;
        console.log(`Load: ${stage}, warming then measuring.`);
        const warmup = await measure(address, keys, engine, workload, connections, options.warmup);
        await writeJson(directory, `${runs.length + 1}-warmup.json`, warmup);
        check(warmup.passed, 'Load warmup failed.');
        await barrier(address, key, engine, workload);
        const measurement = await measure(address, keys, engine, workload, connections, options.duration);
        await writeJson(directory, `${runs.length + 1}-measurement.json`, measurement);
        check(measurement.passed, 'Load measurement failed.');
        await barrier(address, key, engine, workload);
        runs.push({ workload: workload.name, repetition, connections, warmup, measurement });
      }
    }
  }
  stage = 'final verification';
  const readyAfter = await request(address, '/readyz');
  check(readyAfter.status === 200 && JSON.parse(readyAfter.text).data?.status === 'ready', 'Load server lost readiness.');
  check(JSON.stringify(build) === JSON.stringify(await identity()), 'Build inputs changed during the load test.');
  const after = { loadAverage: loadavg(), cgroupV2: await cgroups() };
  stage = 'shutdown';
  await stop();
  child = undefined;
  uninterrupted();
  const report = {
    schema: 'zodiacs-http-load/1', passed: true, generatedAt: new Date().toISOString(),
    command: ['node', 'server/scripts/load.mjs', ...process.argv.slice(2)],
    options, engine, build, machine: before, machineAfter: after,
    configuration: { rateLimit: spec['x-rate-limit'], resources: spec['x-resource-limits'], logLevel: 'info', timeZone: 'UTC', locale: 'C',
      logSink: 'child stdout pipe continuously drained and discarded', workers: 1, keys: keys.length,
      keyAssignment: 'one distinct key per concurrent connection; the same pool remains configured across all trials' },
    methodology: {
      transport: 'HTTP/1.1 loopback keep-alive; client and server are separate processes on this machine',
      load: 'closed loop, fixed connections, pipelining 1, no target arrival rate; uncorrected observed latency',
      latency: 'autocannon full-response events in ms, ceil to ns, Node HDR histogram with 3 significant digits; p50 and p95 queried directly',
      throughput: 'completed HTTP 200 responses divided by monotonic elapsed seconds from performance.now around the autocannon invocation through its completion callback, including client setup and aggregation',
      clocks: 'durationSeconds is monotonic; requestedDurationSeconds is the configured target; autocannonDurationSeconds is its wall-clock duration rounded to 0.01s; start/finish timestamps are wall clock',
      cutoff: 'autocannon destroys in-flight requests at the time limit; sent minus completed are excluded from latency',
      verification: 'every full body parsed and checked for engine identity, receipt scopes and minimal receipt shape; no independent accuracy claim',
      order: 'repetition, then workload order, then connection order; a separate warmup precedes each measurement',
      barriers: 'after each warmup and measurement, await an unmeasured calculation on the same FIFO to finish earlier-admitted jobs',
    },
    limitations: [
      'Shared host; CPU model and visible limits do not establish exclusive resources or hidden ancestor limits.',
      'Client JSON checks and log draining consume this machine too; no remote client, TLS, reverse proxy or container is measured.',
      'One repeated synthetic input per route; no mix, varied dates, long soak, overload capacity or astronomical accuracy claim.',
      'Buckets are raised for throughput measurement; production defaults impose lower per-key allowances.',
      'Closed-loop results and unfinished tails do not represent latency under a fixed external arrival rate.',
      'No general service-level objective or production sizing guarantee follows from these runs.',
    ],
    workloads, preflight, runs,
  };
  stage = 'report';
  await writeJson(directory, 'report.json', report);
  console.log(`Load passed. Report: server/${relative(server, directory)}/report.json`);
}

try { await main(); }
catch {
  // Never echo a library error, body, options object, credential or local URL.
  process.stderr.write(`Load test failed during ${stage}. No successful report written.\n`);
  if (failureDetail) process.stderr.write(JSON.stringify(failureDetail) + '\n');
  process.exitCode = 1;
} finally {
  active?.stop();
  try { await stop(); } catch { process.exitCode = 1; }
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
