import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fsPromises from "node:fs/promises";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
let scratch;
let library;
let io;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "evaluation-files-"));
  library = join(scratch, "project", "lib");
  await mkdir(library, { recursive: true });
  for (const name of ["evaluation-files.mjs", "generation-files.mjs", "generator-data.mjs"]) {
    await copyFile(join(project, "lib", name), join(library, name));
  }
  // Each test process gets an isolated reports root without changing the API.
  io = await import(pathToFileURL(join(library, "evaluation-files.mjs")).href);
});
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

const outputPath = (summary) => join(io.EVALUATION_DIRECTORY, basename(summary.report));
const fails = (code) => (error) => {
  assert.ok(error instanceof io.EvaluationFileError);
  assert.equal(error.name, "EvaluationFileError");
  assert.equal(error.code, code);
  assert.equal(error.message, new io.EvaluationFileError(code).message);
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.ok(!String(error).includes("private-input-marker"));
  assert.ok(!String(error).includes(scratch));
  return true;
};
const clean = async () => {
  assert.ok(!(await readdir(io.EVALUATION_DIRECTORY)).some((name) => name.startsWith(".")));
};

test("report writer hashes exact canonical bytes and reuses matching output unchanged", async () => {
  const value = { label: "report-repeat", claims: [{ z: 1, a: "月" }] };
  const snapshot = structuredClone(value);
  const first = await io.writeEvaluationReport(value);
  const expected = '{"claims":[{"a":"月","z":1}],"label":"report-repeat"}\n';
  const digest = createHash("sha256").update(expected).digest("hex");
  assert.deepEqual(value, snapshot);
  assert.deepEqual(first, {
    report: `evals/reports/${digest}.json`, reused: false, digest: `sha256:${digest}`
  });
  assert.ok(Object.isFrozen(first));
  assert.equal(await readFile(outputPath(first), "utf8"), expected);
  const before = await lstat(outputPath(first));
  assert.ok(before.isFile());
  const again = await io.writeEvaluationReport({ claims: [{ a: "月", z: 1 }], label: "report-repeat" });
  assert.deepEqual(again, { ...first, reused: true });
  const after = await lstat(outputPath(first));
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.notEqual((await io.writeEvaluationReport({ ...value, label: "report-changed" })).digest, first.digest);
  await clean();
});

test("writer refuses a held lock without removing it or changing its report", async () => {
  const value = { label: "report-locked" };
  const summary = await io.writeEvaluationReport(value);
  const lock = join(io.EVALUATION_DIRECTORY, `.lock-${summary.digest.slice(7)}`);
  const bytes = await readFile(outputPath(summary));
  await mkdir(lock);
  try {
    await assert.rejects(io.writeEvaluationReport(value), fails("write"));
    assert.ok((await lstat(lock)).isDirectory());
    assert.deepEqual(await readFile(outputPath(summary)), bytes);
  } finally {
    await rm(lock, { recursive: true });
  }
  assert.equal((await io.writeEvaluationReport(value)).reused, true);
  await clean();
});

test("concurrent writers reject while a complete report is awaiting atomic publication", async () => {
  const original = fsPromises.link;
  const value = { label: "report-concurrent" };
  let release;
  const resumed = new Promise((resolve) => { release = resolve; });
  let reached;
  const waiting = new Promise((resolve) => { reached = resolve; });
  fsPromises.link = async (...args) => {
    assert.equal(await readFile(args[0], "utf8"), '{"label":"report-concurrent"}\n');
    await assert.rejects(lstat(args[1]), { code: "ENOENT" });
    reached();
    await resumed;
    return original(...args);
  };
  syncBuiltinESMExports();
  const first = io.writeEvaluationReport(value);
  try {
    await waiting;
    await assert.rejects(io.writeEvaluationReport(value), fails("write"));
  } finally {
    release();
    fsPromises.link = original;
    syncBuiltinESMExports();
  }
  assert.equal((await first).reused, false);
  assert.equal((await io.writeEvaluationReport(value)).reused, true);
  await clean();
});

test("writer preserves conflicting report bytes and rejects nonregular destinations", async () => {
  for (const kind of ["bytes", "equal-size", "same-json", "directory", "symlink", "fifo"]) {
    const value = { label: `report-conflict-${kind}` };
    const summary = await io.writeEvaluationReport(value);
    const path = outputPath(summary);
    const expected = await readFile(path, "utf8");
    await rm(path);
    if (kind === "bytes") await writeFile(path, "private-input-marker");
    if (kind === "equal-size") await writeFile(path, "x".repeat(Buffer.byteLength(expected)));
    if (kind === "same-json") await writeFile(path, expected.slice(0, -1) + " ");
    if (kind === "directory") await mkdir(path);
    if (kind === "symlink") {
      const target = join(scratch, "private-input-marker-link-target");
      await writeFile(target, JSON.stringify(value));
      await symlink(target, path);
    }
    if (kind === "fifo") {
      const made = spawnSync("mkfifo", [path], { encoding: "utf8", timeout: 5000 });
      assert.ifError(made.error);
      assert.equal(made.status, 0);
    }
    const before = await lstat(path);
    await assert.rejects(io.writeEvaluationReport(value), fails("write"));
    const after = await lstat(path);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mode, before.mode);
    if (kind === "bytes") assert.equal(await readFile(path, "utf8"), "private-input-marker");
    if (kind === "equal-size") assert.equal(await readFile(path, "utf8"), "x".repeat(Buffer.byteLength(expected)));
    if (kind === "same-json") assert.equal(await readFile(path, "utf8"), expected.slice(0, -1) + " ");
    await clean();
  }
});

test("writer never clobbers a destination appearing after the final conflict check", async () => {
  const original = fsPromises.link;
  let destination;
  fsPromises.link = async (...args) => {
    destination = args[1];
    await writeFile(destination, "private-input-marker", { flag: "wx" });
    return original(...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(io.writeEvaluationReport({ label: "report-raced-destination" }), fails("write"));
  } finally {
    fsPromises.link = original;
    syncBuiltinESMExports();
  }
  assert.equal(await readFile(destination, "utf8"), "private-input-marker");
  await clean();
});

test("writer cleans staging files and locks after writing or publishing fails", async () => {
  for (const method of ["writeFile", "link"]) {
    const names = (await readdir(io.EVALUATION_DIRECTORY)).sort();
    const original = fsPromises[method];
    let calls = 0;
    fsPromises[method] = async () => {
      calls += 1;
      throw new Error("private-input-marker");
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(io.writeEvaluationReport({ label: `report-failed-${method}` }), fails("write"));
      assert.equal(calls, 1);
    } finally {
      fsPromises[method] = original;
      syncBuiltinESMExports();
    }
    assert.deepEqual((await readdir(io.EVALUATION_DIRECTORY)).sort(), names);
  }
});

test("writer refuses symlinked report roots and parents without touching their targets", async () => {
  for (const kind of ["root", "parent"]) {
    const source = kind === "root" ? io.EVALUATION_DIRECTORY : join(scratch, "project");
    const saved = join(scratch, `saved-${kind}`);
    await rename(source, saved);
    await symlink(saved, source);
    const names = (await readdir(saved)).sort();
    try {
      await assert.rejects(io.writeEvaluationReport({ label: `report-linked-${kind}` }), fails("write"));
      assert.deepEqual((await readdir(saved)).sort(), names);
      assert.ok((await lstat(source)).isSymbolicLink());
    } finally {
      await rm(source);
      await rename(saved, source);
    }
  }
  await clean();
});

test("writer includes the newline in its byte limit and refuses non-JSON data", async () => {
  assert.equal(io.EVALUATION_FILE_BYTES, 1_048_576);
  const exact = "x".repeat(io.EVALUATION_FILE_BYTES - 3);
  const result = await io.writeEvaluationReport(exact);
  assert.equal((await lstat(outputPath(result))).size, io.EVALUATION_FILE_BYTES);
  assert.equal(await io.readEvaluationJson(outputPath(result)), exact);
  const cycle = {};
  cycle.self = cycle;
  const accessor = Object.defineProperty({}, "private-input-marker", {
    enumerable: true, get() { assert.fail("must not invoke getters"); }
  });
  for (const value of [
    `${exact}x`, "月".repeat(Math.floor(io.EVALUATION_FILE_BYTES / 3)),
    undefined, { invalid: Number.NaN }, "\ud800", cycle, accessor, new Date(0)
  ]) await assert.rejects(io.writeEvaluationReport(value), fails("write"));
  await clean();
});

test("reader accepts bounded strict UTF-8 JSON and preserves its original bytes", async () => {
  const path = join(scratch, "readable.json");
  const text = '{"label":"月"}'.padEnd(io.EVALUATION_FILE_BYTES - 2, " ");
  assert.equal(Buffer.byteLength(text), io.EVALUATION_FILE_BYTES);
  await writeFile(path, text);
  assert.deepEqual(await io.readEvaluationJson(path), { label: "月" });
  assert.equal(await readFile(path, "utf8"), text);
  await writeFile(path, `${text} `);
  await assert.rejects(io.readEvaluationJson(path), fails("read"));
});

test("reader rejects invalid JSON, UTF-8, paths, nonfiles and symlink components", async () => {
  const paths = [];
  for (const [name, bytes] of [
    ["invalid.json", '{"private-input-marker":'],
    ["invalid-utf8.json", Buffer.from([0x22, 0xc0, 0xaf, 0x22])]
  ]) {
    const path = join(scratch, name);
    await writeFile(path, bytes);
    paths.push(path);
  }
  const real = join(scratch, "real-parent");
  await mkdir(real);
  await writeFile(join(real, "value.json"), "{}");
  const linkedParent = join(scratch, "linked-parent");
  const linkedFile = join(scratch, "linked-file.json");
  await symlink(real, linkedParent);
  await symlink(join(real, "value.json"), linkedFile);
  paths.push(undefined, null, 1, "", scratch, join(scratch, "missing-private-input-marker"),
    linkedFile, join(linkedParent, "value.json"));
  for (const path of paths) await assert.rejects(io.readEvaluationJson(path), fails("read"));
});

test("reader refuses FIFOs without waiting for another process", () => {
  const fifo = join(scratch, "input-fifo");
  const made = spawnSync("mkfifo", [fifo], { encoding: "utf8", timeout: 5000 });
  assert.ifError(made.error);
  assert.equal(made.status, 0);
  const script = `
    import { readEvaluationJson } from ${JSON.stringify(pathToFileURL(join(library, "evaluation-files.mjs")).href)};
    try { await readEvaluationJson(process.argv[1]); process.exitCode = 1; }
    catch (error) { if (error.name !== "EvaluationFileError" || error.code !== "read") process.exitCode = 2; }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, fifo], {
    encoding: "utf8", timeout: 5000
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
