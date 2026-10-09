import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../conformance/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function runConformance() {
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'zodiacs.cli-conformance-files.v1') throw new Error('Invalid suite bundle');
  for (const [path, sha] of Object.entries(manifest.files)) {
    const file = resolve(root, path);
    const rel = relative(root, file);
    if (isAbsolute(rel) || rel.startsWith('..') || digest(await readFile(file)) !== sha) {
      throw new Error('Suite bundle integrity failure');
    }
  }
  const { SUITE, SUITE_VERSION, readSuite, validateLevel, LEVEL_FILES, judge, summarize } =
    await import('../conformance/harness/lib.mjs');
  const suite = readSuite(root);
  if (suite.length !== Object.keys(LEVEL_FILES).length
    || suite.some((level) => validateLevel(level, root).length)) throw new Error('Invalid suite');
  const vectors = suite.flatMap((level) => level.file.vectors);
  if (vectors.length !== manifest.vectorCount) throw new Error('Incomplete suite');
  const { adapter, responses } = await runAdapter(vectors);
  const results = vectors.map((vector) => {
    const response = responses.get(vector.id);
    const judged = judge(vector, response);
    return {
      id: vector.id, verdict: judged.verdict,
      ...(judged.residual ? { residual: judged.residual } : {}),
      ...(judged.detail ? { detail: judged.detail } : {}),
      ...(response.meta ? { meta: response.meta } : {}),
    };
  });
  return {
    suite: SUITE, suiteVersion: SUITE_VERSION, adapter,
    vectors: Object.fromEntries(suite.map((level) => [LEVEL_FILES[level.level], level.digest])),
    summary: summarize(vectors, results), results,
    scope: 'Independent committed vectors; failed and unsupported tolerances are reported unchanged.',
  };
}
function runAdapter(vectors) {
  return new Promise((resolveRun, rejectRun) => {
    // Fixed executable/arguments; never interpolate a shell command or a
    // user-selected adapter. Only the packaged read-only engine adapter runs.
    const dist = dirname(fileURLToPath(import.meta.resolve('@zodiacs/engine')));
    const child = spawn(process.execPath, [resolve(root, 'adapters/zodiacs-engine.mjs')], {
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ZODIACS_ENGINE_DIST: dist },
    });
    const responses = new Map();
    let adapter = null, failed = false, outputBytes = 0;
    const fail = () => {
      if (failed) return;
      failed = true; clearTimeout(timer); child.kill();
      rejectRun(new Error('Conformance adapter failed'));
    };
    const timer = setTimeout(fail, 120_000);
    child.on('error', fail);
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 8 * 1024 * 1024) fail();
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => {
      if (failed || !line.trim()) return;
      try {
        const message = JSON.parse(line);
        if (adapter === null) {
          if (!message.adapter || typeof message.adapter !== 'object') return fail();
          adapter = message.adapter;
          for (const vector of vectors) {
            child.stdin.write(JSON.stringify({ id: vector.id, kind: vector.kind, input: vector.input }) + '\n');
          }
          child.stdin.end();
        } else {
          if (message.id !== vectors[responses.size]?.id) return fail();
          responses.set(message.id, message);
        }
      } catch { fail(); }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0 || !adapter || responses.size !== vectors.length) return fail();
      resolveRun({ adapter, responses });
    });
  });
}
