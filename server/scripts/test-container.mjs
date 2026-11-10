import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Opt-in integration check against a local Linux Docker daemon. Requires no
// host npm dependencies and never reads operator credentials or prints logs.
const repository = fileURLToPath(new URL('../..', import.meta.url));
const server = join(repository, 'server');
const id = randomUUID();
const image = `zodiacs-engine-http-smoke:${id}`;
const containers = new Map();
const children = new Set();
const secrets = [];
let temporaryDirectory;
let built = false;
let buildAttempted = false;
let interrupted = false;
let stage = 'checking Docker';
const heartbeat = setInterval(() => console.log(`Container smoke: ${stage}.`), 15_000);
heartbeat.unref();

class SmokeError extends Error {}

function check(condition, message) {
  // Assertions carry fixed messages, never inspected values or credential data.
  if (!condition) throw new SmokeError(message);
}

function json(value, message) {
  try { return JSON.parse(value); } catch { throw new SmokeError(message); }
}

function kill(child) {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch { /* The child may already have exited. */ }
}

function interrupt() {
  interrupted = true;
  for (const child of children) kill(child);
}
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

async function docker(args, label, { timeout = 30_000, env = {}, allowFailure = false, cleanup = false } = {}) {
  if (interrupted && !cleanup) throw new SmokeError('Container smoke interrupted.');
  // Credentials only enter explicitly selected child environments. --env NAME
  // passes them into Docker without placing their values in process arguments.
  const inherited = { ...process.env };
  delete inherited.API_KEYS;
  delete inherited.API_KEYS_FILE;
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: repository, env: { ...inherited, ...env },
      stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    });
    children.add(child);
    const output = { stdout: '', stderr: '' };
    let size = 0;
    let failure;
    const timer = setTimeout(() => {
      failure = `Docker timed out while ${label}.`;
      kill(child);
    }, timeout);
    for (const stream of ['stdout', 'stderr']) {
      child[stream].setEncoding('utf8');
      child[stream].on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size > 1_900_000) {
          failure = `Docker output exceeded the limit while ${label}.`;
          kill(child);
        } else output[stream] += chunk;
      });
    }
    child.once('error', (error) => {
      failure = error.code === 'ENOENT'
        ? 'Docker CLI is unavailable. Install Docker with a local Linux daemon to run test:container.'
        : `Docker could not start while ${label}.`;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (failure) reject(new SmokeError(failure));
      else if (code !== 0 && !allowFailure) {
        reject(new SmokeError(`Docker failed while ${label}. Output is withheld to protect credentials.`));
      } else resolve({ ...output, code });
    });
  });
}

async function inspect(name, field) {
  const result = await docker(['inspect', '--format', `{{json ${field}}}`, name], 'inspecting the container');
  return json(result.stdout, 'Docker inspect returned invalid JSON.');
}

async function launch(suffix, { keys, file, malformed = false } = {}) {
  const name = `zodiacs-engine-http-smoke-${id}-${suffix}`;
  containers.set(name, false);
  const args = [
    'run', '--detach', '--name', name,
    '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--memory=512m', '--cpus=1', '--pids-limit=128',
    '--log-driver=local', '--log-opt=max-size=1m', '--log-opt=max-file=1',
    '--publish', '127.0.0.1::3000',
    '--health-interval=1s', '--health-start-period=2s', '--health-timeout=5s',
    '--env', 'LOG_LEVEL=trace',
  ];
  const env = {};
  if (keys !== undefined) {
    args.push('--env', 'API_KEYS');
    env.API_KEYS = malformed ? keys : JSON.stringify([keys]);
  }
  if (file !== undefined) {
    check(!file.includes(','), 'The checkout path must not contain commas for this bind-mount smoke check.');
    args.push('--mount', `type=bind,source=${file},target=/run/secrets/api-keys.json,readonly`,
      '--env', 'API_KEYS_FILE=/run/secrets/api-keys.json');
  }
  args.push(image);
  await docker(args, 'starting the container', { env });
  containers.set(name, true);
  return name;
}

async function request(address, path, { key, body } = {}) {
  try {
    const response = await fetch(new URL(path, address), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5_000),
    });
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      check(bytes <= 1_000_000, 'Container response exceeded the size limit.');
      chunks.push(Buffer.from(chunk));
    }
    return { status: response.status, body: json(Buffer.concat(chunks).toString('utf8'), 'Container returned invalid JSON.') };
  } catch {
    throw new SmokeError('Container HTTP request failed or exceeded its deadline.');
  }
}

async function ready(name) {
  const ports = await inspect(name, '.NetworkSettings.Ports');
  const binding = ports['3000/tcp']?.find((entry) => entry.HostIp === '127.0.0.1');
  check(binding && /^[0-9]+$/u.test(binding.HostPort), 'Container did not publish a loopback port.');
  const address = `http://127.0.0.1:${binding.HostPort}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await inspect(name, '.State');
    check(state.Running, 'Container exited before readiness.');
    try {
      const response = await request(address, '/readyz');
      if (response.status === 200 && state.Health?.Status === 'healthy') return address;
    } catch { /* Listener startup can race the first probe. */ }
    await delay(250);
  }
  throw new SmokeError('Container did not become ready and Docker-healthy before its deadline.');
}

async function checkPublicRoutes(address) {
  for (const [path, status] of [['/healthz', 'ok'], ['/readyz', 'ready']]) {
    const response = await request(address, path);
    check(response.status === 200 && response.body.data?.status === status,
      'A public container probe failed.');
    check(Array.isArray(response.body.receipts) && response.body.receipts.length === 0,
      'An infrastructure response contained an unexpected receipt.');
    check(response.body.engine?.name === '@zodiacs/engine', 'A probe omitted engine identity.');
  }
  const spec = await request(address, '/openapi.json');
  check(spec.status === 200 && /^3\.1\./u.test(spec.body.openapi) && spec.body.paths?.['/v1/natal'],
    'Public OpenAPI discovery failed in the container.');
}

// Invented instant and coordinates, unrelated to any person's birth.
const birth = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };

async function checkUnauthorized(address, key) {
  const response = await request(address, '/v1/natal', { key, body: birth });
  check(response.status === 401 && response.body.error?.code === 'unauthorized'
    && Array.isArray(response.body.receipts) && response.body.receipts.length === 0,
  'Container calculation authentication did not fail closed.');
}

async function checkNatal(address, key) {
  const response = await request(address, '/v1/natal', { key, body: birth });
  const body = response.body;
  check(response.status === 200 && body.data?.input?.utc === birth.utc, 'Authenticated container natal request failed.');
  check(body.receipts?.length === 1 && body.receipts[0].scope === '/data', 'Natal receipt scope was not preserved.');
  const envelope = body.receipts[0].envelope;
  check(envelope?.schema === 'zodiacs.natal-envelope.draft-v1'
    && envelope.receipt?.schema === 'zodiacs.calculation-receipt.draft-v1'
    && envelope.receipt.instant === birth.utc && envelope.receipt.sourceInstant === birth.utc
    && isDeepStrictEqual(envelope.receipt.engine, body.engine)
    && isDeepStrictEqual(envelope.receipt.coordinates, { latitude: birth.latitude, longitude: birth.longitude }),
  'The container natal response omitted engine receipt provenance.');
  check(envelope.result && Object.entries(envelope.result).every(([field, value]) => isDeepStrictEqual(value, body.data[field])),
    'The container receipt does not describe its returned chart.');
  // The server unit suite parses and replays the engine's codec. This check
  // verifies the container transport, without adding a second receipt codec.
}

async function checkRuntime(name) {
  const result = await docker(['exec', name, 'node', '--input-type=module', '-e', `
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    const absent = [
      '/app/src', '/app/package.json', '/app/node_modules', '/app/server/src', '/app/server/test',
      '/app/server/.cache', '/app/server/secrets', '/app/server/api-keys.json',
      '/app/server/.env', '/app/server/node_modules/typescript',
      '/app/server/node_modules/vitest', '/app/server/node_modules/esbuild',
      '/app/server/node_modules/@vitest', '/app/server/build/meta.json',
    ];
    let writable = false;
    try { writeFileSync('/app/server/.container-write-probe', 'unexpected'); writable = true; } catch {}
    const notices = Object.fromEntries(['LICENSE', 'LICENSING.md', 'NOTICE'].map((name) =>
      [name, readFileSync('/app/licenses/engine/' + name).toString('base64')]));
    console.log(JSON.stringify({ uid: process.getuid(), gid: process.getgid(), node: process.version, writable,
      missing: absent.every((path) => !existsSync(path)), notices,
      main: existsSync('/app/server/build/main.js'),
      worker: existsSync('/app/server/build/calculation-worker.js') }));
  `], 'checking runtime contents');
  const runtime = json(result.stdout, 'Runtime inspection returned invalid JSON.');
  check(runtime.uid === 1000 && runtime.gid === 1000 && /^v22\./u.test(runtime.node),
    'Container must use Node 22 as UID and GID 1000.');
  check(!runtime.writable && runtime.missing && runtime.main && runtime.worker,
    'Container runtime contains development/configuration files or lacks its read-only build.');
  const config = await inspect(name, '.HostConfig');
  check(config.ReadonlyRootfs === true, 'Container root filesystem is not read-only.');
  for (const name of ['LICENSE', 'LICENSING.md', 'NOTICE']) {
    check(Buffer.from(runtime.notices[name], 'base64').equals(await readFile(join(repository, name))),
      'Container engine licence notices differ from the checkout.');
  }
  await docker(['exec', name, 'node', 'scripts/healthcheck.mjs'], 'running the image healthcheck');
}

async function checkLogs(name, expectedEvents) {
  const result = await docker(['logs', name], 'checking structured logs');
  const output = result.stdout + result.stderr;
  check(![...secrets, birth.utc].some((secret) => output.includes(secret)), 'Container logs exposed private input.');
  const records = output.trim().split('\n').filter(Boolean).map((line) => json(line, 'Container emitted a non-JSON log line.'));
  for (const event of expectedEvents) {
    check(records.some((record) => record.event === event), 'Container omitted an expected lifecycle log.');
  }
  return records;
}

async function stop(name) {
  await docker(['stop', '--signal', 'SIGTERM', '--time', '15', name], 'stopping the container', { timeout: 20_000 });
  const state = await inspect(name, '.State');
  check(!state.Running && state.ExitCode === 0 && !state.OOMKilled, 'Container did not exit gracefully after SIGTERM.');
  await checkLogs(name, ['server_started', 'request_completed', 'server_stopping', 'server_stopped']);
}

async function main() {
  const version = await docker(['version', '--format', '{{.Server.Os}}'], 'contacting the local Docker daemon');
  check(version.stdout.trim() === 'linux', 'Container smoke requires a reachable local Linux Docker daemon.');
  stage = 'building the test image';
  console.log('Container smoke: building a temporary test image. Docker output stays private.');
  buildAttempted = true;
  await docker(['build', '--file', 'server/Dockerfile', '--tag', image, '.'], 'building the test image', { timeout: 600_000 });
  built = true;
  // Build first: ephemeral test credentials never enter the build context.
  const key = randomBytes(32).toString('base64url');
  const canary = randomUUID();
  secrets.push(key, canary);
  const cache = join(server, '.cache');
  await mkdir(cache, { recursive: true });
  temporaryDirectory = await mkdtemp(join(cache, 'container-smoke-'));
  const file = join(temporaryDirectory, 'api-keys.json');
  // The private parent directory protects the host file; the bind-mounted
  // file must be readable by the image's nonroot user and is mounted read-only.
  await writeFile(file, JSON.stringify([key]), { mode: 0o600 });
  await chmod(file, 0o444);
  secrets.push(file);

  stage = 'checking mounted configuration and runtime';
  const mounted = await launch('file', { file });
  const address = await ready(mounted);
  await checkRuntime(mounted);
  await checkPublicRoutes(address);
  await checkUnauthorized(address);
  const unconfiguredKey = randomBytes(32).toString('base64url');
  secrets.push(unconfiguredKey);
  await checkUnauthorized(address, unconfiguredKey);
  await checkNatal(address, key);
  const invalid = await request(address, '/v1/natal', { key, body: { utc: canary } });
  check(invalid.status === 400 && invalid.body.error?.code === 'invalid_request', 'Container input validation failed.');
  await stop(mounted);

  stage = 'checking environment configuration';
  const fromEnv = await launch('env', { keys: key });
  const envAddress = await ready(fromEnv);
  await checkNatal(envAddress, key);
  await stop(fromEnv);

  stage = 'checking missing configuration';
  const noKeys = await launch('no-keys');
  const lockedAddress = await ready(noKeys);
  await checkPublicRoutes(lockedAddress);
  await checkUnauthorized(lockedAddress, key);
  await stop(noKeys);

  stage = 'checking sanitized startup failure';
  const invalidConfig = await launch('invalid', { keys: `["${key}"]${canary}`, malformed: true });
  const exited = await docker(['wait', invalidConfig], 'waiting for invalid configuration to fail', { timeout: 15_000 });
  check(exited.stdout.trim() === '1', 'Malformed container configuration did not fail startup.');
  const logs = await checkLogs(invalidConfig, ['startup_failed']);
  check(logs.length === 1 && isDeepStrictEqual(logs[0], { level: 'error', event: 'startup_failed' }),
    'Malformed configuration produced unsanitized startup diagnostics.');
}

let failure;
try {
  await main();
} catch (error) {
  // Only our fixed diagnostics leave this harness; external error messages
  // and subprocess output may contain credentials and are deliberately hidden.
  failure = error;
} finally {
  stage = 'removing temporary containers and files';
  let cleanupFailed = false;
  for (const [name, created] of containers) {
    try {
      const removed = await docker(['rm', '--force', name], 'removing a test container', { allowFailure: true, cleanup: true });
      if (created && removed.code !== 0) cleanupFailed = true;
    } catch { cleanupFailed = true; }
  }
  if (buildAttempted) {
    try {
      const removed = await docker(['image', 'rm', '--force', image], 'removing the test image', { allowFailure: true, cleanup: true });
      if (built && removed.code !== 0) cleanupFailed = true;
    }
    catch { cleanupFailed = true; }
  }
  if (temporaryDirectory) {
    try { await rm(temporaryDirectory, { recursive: true, force: true }); }
    catch { cleanupFailed = true; }
  }
  clearInterval(heartbeat);
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  if (failure) {
    // Filesystem/fetch failures outside controlled wrappers can include paths.
    const message = failure instanceof SmokeError ? failure.message : 'Container smoke failed.';
    console.error(message.replace(/[\r\n]/gu, ' '));
  }
  if (cleanupFailed) console.error('Container smoke cleanup failed. Remove resources named zodiacs-engine-http-smoke and retry.');
  if (failure || cleanupFailed || interrupted) process.exitCode = 1;
  else console.log('Container smoke passed: notices, runtime isolation, probes, receipts, auth, configuration, logs and SIGTERM.');
}
