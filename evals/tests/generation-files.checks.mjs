import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fsPromises from "node:fs/promises";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";

const project = fileURLToPath(new URL("..", import.meta.url));
let scratch;
let io;

before(async () => {
  await mkdir(join(project, "scratch"), { recursive: true });
  scratch = await mkdtemp(join(project, "scratch", "generation-files-"));
  const library = join(scratch, "project", "lib");
  await mkdir(library, { recursive: true });
  for (const name of ["generation-files.mjs", "generator-data.mjs"]) {
    await copyFile(join(project, "lib", name), join(library, name));
  }
  // Give these tests an isolated generated root; CLI tests can run concurrently.
  io = await import(pathToFileURL(join(library, "generation-files.mjs")).href);
});
after(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

const fixture = (id) => ({ dataset: { id, entries: [] }, manifest: { id, schemaVersion: "1.0.0" } });
const outputPath = (summary) => join(io.GENERATION_DIRECTORY, basename(summary.directory));
const fails = (code) => (error) => {
  assert.ok(error instanceof io.GenerationFileError);
  assert.equal(error.code, code);
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.ok(!String(error).includes("private-input-marker"));
  return true;
};

test("generation file writer publishes a canonical pair and reuses identical bytes", async () => {
  const value = fixture("writer-repeat");
  const snapshot = structuredClone(value);
  const first = await io.writeGeneration(value);
  assert.deepEqual(value, snapshot);
  assert.deepEqual(Object.keys(first).sort(), ["directory", "reused"]);
  assert.equal(first.reused, false);
  assert.ok(Object.isFrozen(first));
  assert.match(first.directory, /^evals\/generated\/[a-f0-9]{64}$/);
  const directory = outputPath(first);
  assert.deepEqual((await readdir(directory)).sort(), ["dataset.json", "manifest.json"]);
  assert.equal(await readFile(join(directory, "dataset.json"), "utf8"),
    '{"entries":[],"id":"writer-repeat"}\n');
  assert.equal(await readFile(join(directory, "manifest.json"), "utf8"),
    '{"id":"writer-repeat","schemaVersion":"1.0.0"}\n');
  const before = await lstat(join(directory, "dataset.json"));
  const again = await io.writeGeneration({
    manifest: { schemaVersion: "1.0.0", id: "writer-repeat" },
    dataset: { entries: [], id: "writer-repeat" }
  });
  assert.deepEqual(again, { ...first, reused: true });
  const after = await lstat(join(directory, "dataset.json"));
  assert.equal(before.ino, after.ino);
  assert.equal(before.mtimeMs, after.mtimeMs);
  assert.ok(!(await readdir(io.GENERATION_DIRECTORY)).some((name) => name.startsWith(".")));
});

test("generation directory identity covers both artifacts", async () => {
  const original = fixture("writer-identity");
  const first = await io.writeGeneration(original);
  const changedDataset = structuredClone(original);
  changedDataset.dataset.id = "writer-new-dataset";
  const second = await io.writeGeneration(changedDataset);
  const changedManifest = structuredClone(original);
  changedManifest.manifest.id = "writer-new-manifest";
  const third = await io.writeGeneration(changedManifest);
  assert.equal(new Set([first.directory, second.directory, third.directory]).size, 3);
});

test("writer refuses a held lock and leaves it for its owner", async () => {
  const value = fixture("writer-locked");
  const summary = await io.writeGeneration(value);
  const lock = join(io.GENERATION_DIRECTORY, `.lock-${basename(summary.directory)}`);
  await mkdir(lock);
  try {
    await assert.rejects(io.writeGeneration(value), fails("write"));
    assert.ok((await lstat(lock)).isDirectory());
    assert.equal(await readFile(join(outputPath(summary), "dataset.json"), "utf8"),
      '{"entries":[],"id":"writer-locked"}\n');
  } finally {
    await rm(lock, { recursive: true });
  }
  assert.equal((await io.writeGeneration(value)).reused, true);
});

test("writer refuses conflicting, incomplete and unexpected existing output without changes", async () => {
  for (const kind of ["changed", "missing", "extra", "empty", "file"]) {
    const value = fixture(`writer-${kind}`);
    const summary = await io.writeGeneration(value);
    const directory = outputPath(summary);
    if (kind === "changed") await writeFile(join(directory, "dataset.json"), "private-input-marker");
    if (kind === "missing") await rm(join(directory, "manifest.json"));
    if (kind === "extra") await writeFile(join(directory, "extra.json"), "{}");
    if (kind === "empty") {
      await rm(directory, { recursive: true });
      await mkdir(directory);
    }
    if (kind === "file") {
      await rm(directory, { recursive: true });
      await writeFile(directory, "private-input-marker");
      await assert.rejects(io.writeGeneration(value), fails("write"));
      assert.equal(await readFile(directory, "utf8"), "private-input-marker");
      continue;
    }
    const names = (await readdir(directory)).sort();
    const before = await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")));
    await assert.rejects(io.writeGeneration(value), fails("write"));
    assert.deepEqual((await readdir(directory)).sort(), names);
    assert.deepEqual(await Promise.all(names.map((name) => readFile(join(directory, name), "utf8"))), before);
    assert.ok(!(await readdir(io.GENERATION_DIRECTORY)).some((name) => name.startsWith(".")));
  }
});

test("writer removes staging and locks when writing or publishing fails", async () => {
  for (const method of ["writeFile", "rename"]) {
    const names = (await readdir(io.GENERATION_DIRECTORY)).sort();
    const original = fsPromises[method];
    let calls = 0;
    fsPromises[method] = async (...args) => {
      if (++calls === (method === "writeFile" ? 2 : 1)) throw new Error("private-input-marker");
      return original(...args);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(io.writeGeneration(fixture(`writer-failure-${method}`)), fails("write"));
      assert.equal(calls, method === "writeFile" ? 2 : 1);
    } finally {
      fsPromises[method] = original;
      syncBuiltinESMExports();
    }
    assert.deepEqual((await readdir(io.GENERATION_DIRECTORY)).sort(), names);
  }
});

test("writer rejects symlinked artifacts and destinations", async () => {
  for (const kind of ["dataset", "manifest", "directory"]) {
    const value = fixture(`writer-link-${kind}`);
    const summary = await io.writeGeneration(value);
    const directory = outputPath(summary);
    const target = join(scratch, `saved-${kind}`);
    const source = kind === "directory" ? directory : join(directory, `${kind}.json`);
    await rename(source, target);
    await symlink(target, source);
    await assert.rejects(io.writeGeneration(value), fails("write"));
    assert.ok((await lstat(source)).isSymbolicLink());
  }
});

test("writer refuses a symlinked generated root without touching its target", async () => {
  const saved = join(scratch, "saved-generated");
  const target = join(scratch, "linked-output-target");
  await mkdir(target);
  await rename(io.GENERATION_DIRECTORY, saved);
  await symlink(target, io.GENERATION_DIRECTORY);
  try {
    await assert.rejects(io.writeGeneration(fixture("writer-root-link")), fails("write"));
    assert.deepEqual(await readdir(target), []);
  } finally {
    await rm(io.GENERATION_DIRECTORY);
    await rename(saved, io.GENERATION_DIRECTORY);
  }
});

test("writer bounds each artifact including its newline and rejects non-JSON values", async () => {
  // A JSON string uses a quote at each end, followed by the file's newline.
  const exact = "x".repeat(io.GENERATION_FILE_BYTES - 3);
  const summary = await io.writeGeneration({ dataset: exact, manifest: {} });
  assert.equal((await lstat(join(outputPath(summary), "dataset.json"))).size, io.GENERATION_FILE_BYTES);
  assert.equal(await io.readGenerationJson(join(outputPath(summary), "dataset.json")), exact);
  for (const value of [
    { dataset: `${exact}x`, manifest: {} },
    { dataset: {}, manifest: `${exact}x` },
    { dataset: "月".repeat(Math.floor(io.GENERATION_FILE_BYTES / 3)), manifest: {} },
    { dataset: undefined, manifest: {} },
    { dataset: { invalid: Number.NaN }, manifest: {} },
    { dataset: "\ud800", manifest: {} },
    undefined
  ]) await assert.rejects(io.writeGeneration(value), fails("write"));
});

test("reader accepts regular JSON and inclusive byte limit without changing bytes", async () => {
  const path = join(scratch, "readable.json");
  const text = '{"label":"月"}'.padEnd(io.GENERATION_FILE_BYTES - 2, " ");
  assert.equal(Buffer.byteLength(text), io.GENERATION_FILE_BYTES);
  await writeFile(path, text);
  assert.deepEqual(await io.readGenerationJson(path), { label: "月" });
  assert.equal(await readFile(path, "utf8"), text);
  await writeFile(path, `${text} `);
  await assert.rejects(io.readGenerationJson(path), fails("read"));
});

test("reader rejects invalid JSON, invalid UTF-8, directories and symlink components", async () => {
  const paths = [];
  for (const [name, bytes] of [
    ["invalid.json", '{"private-input-marker":'],
    ["invalid-utf8.json", Buffer.from([0x22, 0xc0, 0xaf, 0x22])]
  ]) {
    const path = join(scratch, name);
    await writeFile(path, bytes);
    paths.push(path);
  }
  const realDirectory = join(scratch, "real-parent");
  await mkdir(realDirectory);
  await writeFile(join(realDirectory, "value.json"), "{}");
  const linkedDirectory = join(scratch, "linked-parent");
  await symlink(realDirectory, linkedDirectory);
  const linkedFile = join(scratch, "linked-file.json");
  await symlink(join(realDirectory, "value.json"), linkedFile);
  paths.push(scratch, join(scratch, "missing-private-input-marker"), linkedFile,
    join(linkedDirectory, "value.json"));
  for (const path of paths) await assert.rejects(io.readGenerationJson(path), fails("read"));
});

test("reader refuses a FIFO without waiting for another process", () => {
  const fifo = join(scratch, "input-fifo");
  const made = spawnSync("mkfifo", [fifo], { encoding: "utf8", timeout: 5000 });
  assert.ifError(made.error);
  assert.equal(made.status, 0);
  const script = `
    import { readGenerationJson } from ${JSON.stringify(pathToFileURL(join(scratch, "project/lib/generation-files.mjs")).href)};
    try { await readGenerationJson(process.argv[1]); process.exitCode = 1; }
    catch (error) { if (error.code !== "read") process.exitCode = 2; }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, fifo], {
    encoding: "utf8", timeout: 5000
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
