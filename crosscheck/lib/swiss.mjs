// The permitted adapter runs externally. Raw responses and diagnostics never escape this module.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, readFile } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { emptyStats, addResidual, angularResidual } from './statistics.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const adapter = fileURLToPath(new URL('../../conformance/adapters/pyswisseph.py', import.meta.url));
const bodies = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
const safeError = () => new Error('Swiss instrument unavailable or invalid; raw diagnostics discarded.');
const outside = (root, path) => { const rel = relative(root, path); return rel === '..' || rel.startsWith('../') || isAbsolute(rel); };

export async function verifyExternalPaths(paths, root = repository) {
  const base = await realpath(root);
  for (const path of paths) if (!outside(base, await realpath(path))) throw new Error('Swiss installation and data must be outside the checkout.');
}

export async function openSwiss({ python = 'python3', ephemerisPath, timeoutMs = 10000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new RangeError('Invalid Swiss timeout');
  if (!ephemerisPath) throw new Error('Explicit external ephemerisPath required.');
  await verifyExternalPaths([ephemerisPath]);
  const env = { ...process.env, SE_EPHE_PATH: ephemerisPath, PYTHONDONTWRITEBYTECODE: '1' };
  // Inspect origin without importing Swiss; importing is reserved for the permitted adapter.
  let origin;
  try {
    const result = await promisify(execFile)(python, ['-B', '-c',
      'import importlib.util; s=importlib.util.find_spec("swisseph"); print(s.origin if s else "")'],
    { env, timeout: timeoutMs, maxBuffer: 16384 });
    origin = result.stdout.trim();
    if (!origin) throw safeError();
    await verifyExternalPaths([origin]);
  } catch { throw safeError(); }
  const child = spawn(python, ['-B', '-u', adapter], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const channel = new SwissChannel(child, timeoutMs);
    const handshake = await channel.read();
    const a = handshake?.adapter;
    if (a?.name !== 'pyswisseph' || a.engine !== 'Swiss Ephemeris' ||
        !/^[0-9.]+$/.test(a.engineVersion) || !/^pyswisseph [0-9.]+$/.test(a.configuration?.binding)) throw safeError();
    const files = a.configuration.ephemerisFiles;
    if (!files || Array.isArray(files) || typeof files !== 'object' || Object.keys(files).length > 10000 ||
        Object.entries(files).some(([name, hash]) => !/^[A-Za-z0-9_.-]+\.se1$/.test(name) || !/^[a-f0-9]{64}$/.test(hash))) throw safeError();
    const identity = { adapterSha256: createHash('sha256').update(await readFile(adapter)).digest('hex'),
      bindingSha256: createHash('sha256').update(await readFile(origin)).digest('hex'),
      engineVersion: a.engineVersion, binding: a.configuration.binding, ephemerisFiles: { ...files } };
    return { identity, comparePosition: args => channel.comparePosition(args), close: () => channel.close() };
  } catch { child.kill(); throw safeError(); }
}

// Transport injection supports invented protocol tests only; production uses openSwiss.
export class SwissChannel {
  constructor(child, timeoutMs) {
    this.child = child; this.timeoutMs = timeoutMs; this.buffer = ''; this.pending = null; this.failed = false; this.busy = false;
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      if (this.failed) return;
      this.buffer += chunk.toString('utf8');
      if (Buffer.byteLength(this.buffer) > 65536) return this.fail();
      const end = this.buffer.indexOf('\n');
      if (end < 0) return;
      if (!this.pending || this.buffer.slice(end + 1).length) return this.fail();
      const line = this.buffer.slice(0, end); this.buffer = '';
      try { const value = JSON.parse(line); this.pending.resolve(value); this.pending = null; }
      catch { this.fail(); }
    });
    child.on('error', () => this.fail()); child.on('exit', () => this.fail());
    child.stdin.on('error', () => this.fail());
  }
  fail() {
    this.failed = true; this.buffer = ''; this.pending?.reject(safeError()); this.pending = null; this.child.kill();
  }
  read() {
    if (this.failed || this.pending) return Promise.reject(safeError());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), this.timeoutMs);
      this.pending = { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } };
    });
  }
  async comparePosition({ body, jdTT, actual, toleranceArcsec }) {
    if (!bodies.has(body) || !Number.isFinite(jdTT) || !actual ||
        !Number.isFinite(actual.lon) || actual.lon < 0 || actual.lon >= 360 ||
        !Number.isFinite(actual.lat) || Math.abs(actual.lat) > 90) throw new RangeError('Invalid position comparison');
    const stats = { lon: emptyStats(toleranceArcsec), lat: emptyStats(toleranceArcsec) };
    if (this.busy) throw new Error('Swiss instrument accepts one request at a time.');
    this.busy = true;
    try {
      const response = this.read();
      this.child.stdin.write(JSON.stringify({ id: 'position', kind: 'position.apparent.ecliptic-true-of-date', input: { body, jd_tt: jdTT } }) + '\n');
      const r = await response;
      if (r?.id !== 'position') { this.fail(); throw safeError(); }
      if (typeof r.error === 'string') return { verdict: 'error' };
      if (typeof r.unsupported === 'string') return { verdict: 'unsupported' };
      const flags = r.meta?.retflags;
      if (!Number.isSafeInteger(flags) || flags < 0 || flags > 0x7fffffff ||
          !Number.isFinite(r.output?.lon) || r.output.lon < 0 || r.output.lon >= 360 ||
          !Number.isFinite(r.output?.lat) || Math.abs(r.output.lat) > 90) { this.fail(); throw safeError(); }
      // SWIEPH is bit 2. Refuse numerical aggregation when another backend answered.
      if ((flags & 7) !== 2) return { verdict: 'fallback', retflags: flags };
      stats.lon = addResidual(stats.lon, angularResidual(actual.lon, r.output.lon) * 3600);
      stats.lat = addResidual(stats.lat, (actual.lat - r.output.lat) * 3600);
      return { verdict: stats.lon.passed && stats.lat.passed ? 'pass' : 'fail', retflags: flags, stats };
    } finally { this.busy = false; }
  }
  close() { this.fail(); }
}
