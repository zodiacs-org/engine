import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { loadLocalEngine } from "../lib/local-engine.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const example = {
  schemaVersion: "1.0.0", id: "synthetic-example", synthetic: true,
  birth: { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12 }
};

test("concurrent loads share one local engine with the repository's pinned dependency", async () => {
  const [first, second] = await Promise.all([loadLocalEngine(), loadLocalEngine()]);
  assert.equal(first, second);
  const metadata = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const installed = JSON.parse(await readFile(new URL("../node_modules/astronomy-engine/package.json", import.meta.url), "utf8"));
  assert.equal(first.provenance.engine.version, metadata.version);
  assert.equal(first.api.ENGINE_VERSION, metadata.version);
  assert.equal(first.provenance.ephemeris.version, metadata.dependencies[installed.name]);
  assert.deepEqual(first.api.EPHEMERIS, { name: installed.name, version: installed.version });
  assert.equal(first.provenance.engine.license, metadata.license);
  assert.ok(first.provenance.bundle.bytes > 0 && first.provenance.bundle.bytes < 2_000_000);
});

test("loading the cached engine releases its bundler child before subprocess checks", () => {
  const source = `
    import assert from "node:assert/strict";
    import childProcess from "node:child_process";
    const original = childProcess.spawn;
    const exits = [];
    childProcess.spawn = (...args) => {
      const child = original(...args);
      exits.push(new Promise((resolve) => child.once("exit", resolve)));
      return child;
    };
    const { loadLocalEngine } = await import(${JSON.stringify(new URL("../lib/local-engine.mjs", import.meta.url).href)});
    let timer;
    try {
      const first = await loadLocalEngine();
      assert.equal(await loadLocalEngine(), first);
      assert.equal(exits.length, 1);
      await Promise.race([
        Promise.all(exits),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Bundler child was not released")), 2000);
        })
      ]);
    } finally {
      clearTimeout(timer);
      childProcess.spawn = original;
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: project, encoding: "utf8", timeout: 10000, maxBuffer: 10000
  });
});

test("fresh processes and working directories produce the same facts and provenance without a root build", async () => {
  const expected = await computeChartFacts(example);
  const scratch = join(project, "scratch");
  await mkdir(scratch, { recursive: true });
  const cwd = await mkdtemp(join(scratch, "loader-check-"));
  const rootBuild = new URL("../../dist/", import.meta.url);
  const before = await stat(rootBuild).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  try {
    const source = `
      globalThis.fetch = () => { throw new Error('No fetch in offline evals'); };
      const { computeChartFacts } = await import(${JSON.stringify(new URL("../lib/chart-facts.mjs", import.meta.url).href)});
      process.stdout.write(JSON.stringify(await computeChartFacts(${JSON.stringify(example)})));
    `;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd, encoding: "utf8", timeout: 30000, maxBuffer: 1_000_000
    });
    assert.deepEqual(JSON.parse(stdout), expected);
    const after = await stat(rootBuild).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    assert.equal(after?.mtimeMs, before?.mtimeMs);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("the shared loader cannot change provenance or aspect scope through mutable exported copies", async () => {
  const engine = await loadLocalEngine();
  const before = await computeChartFacts(example);
  assert.throws(() => { engine.provenance.engine.version = "modified"; }, TypeError);
  assert.throws(() => { engine.provenance.bundle.digest = "modified"; }, TypeError);
  assert.throws(() => { engine.api = {}; }, TypeError);
  assert.throws(() => { engine.aspectBodies.push("North Node"); }, TypeError);
  const original = [...engine.api.ASPECT_BODIES];
  try {
    engine.api.ASPECT_BODIES.clear();
    const result = await computeChartFacts(example);
    assert.deepEqual(result, before);
    assert.deepEqual(result.conventions.aspects.bodies, original);
    assert.ok(result.reference.aspects.length > 0);
  } finally {
    for (const body of original) engine.api.ASPECT_BODIES.add(body);
  }
});
