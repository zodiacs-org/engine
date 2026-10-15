/** Reinstall and run the source companion from a populated npm cache, offline. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));
const npmCache = join(project, ".cache/npm");

async function copyBoundedFile(source, destination) {
  const info = await lstat(source);
  assert(info.isFile() && !info.isSymbolicLink(), `Expected a regular source file: ${source}`);
  assert(info.size < 2_000_000, `Source exceeds the file cap: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copyTree(source, destination, engineSource = false) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (engineSource && (entry.name === "fixtures" || entry.name.endsWith(".test.ts"))) continue;
    assert(!entry.isSymbolicLink(), `Unexpected source symlink: ${join(source, entry.name)}`);
    if (entry.isDirectory()) await copyTree(join(source, entry.name), join(destination, entry.name), engineSource);
    else if (!engineSource || entry.name.endsWith(".ts")) {
      await copyBoundedFile(join(source, entry.name), join(destination, entry.name));
    }
  }
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 1_999_999,
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` }
  });
}

async function main() {
  assert.equal(process.version, "v22.22.2", "Use the frozen pilot generator's Node 22.22.2 runtime.");
  // Existing pilot bytes must already be present; this command never prepares
  // the working installation or silently downloads a missing prerequisite.
  const names = ["chiron.json", "descriptor.json"];
  const original = await Promise.all(names.map(name => readFile(join(project, "generated/pilot", name))));
  await mkdir(join(project, ".cache"), { recursive: true });
  const fixture = await mkdtemp(join(project, ".cache/offline-install-"));
  const companion = join(fixture, "minorbodies");
  try {
    await copyBoundedFile(join(repository, "package.json"), join(fixture, "package.json"));
    await copyTree(join(repository, "src"), join(fixture, "src"), true);
    for (const name of ["package.json", "package-lock.json"]) {
      await copyBoundedFile(join(project, name), join(companion, name));
    }
    for (const name of ["src", "scripts", "examples", "tests/fixtures/pilot"]) {
      await copyTree(join(project, name), join(companion, name));
    }
    await writeFile(join(fixture, "runtime-boundary.mjs"), `
const root = new URL("./", import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.startsWith("file:") && !result.url.startsWith(root)) {
    throw new Error("Offline smoke resolved a file module outside its isolated fixture.");
  }
  return result;
}
`);
    await writeFile(join(fixture, "guard-register.mjs"), `
import { register } from "node:module";
globalThis.fetch = () => { throw new Error("Offline smoke must not fetch."); };
register("./runtime-boundary.mjs", import.meta.url);
`);
    run("npm", ["ci", "--offline", "--ignore-scripts", "--cache", npmCache, "--no-audit", "--no-fund"], companion);
    const native = ["--import", join(fixture, "guard-register.mjs"), "--import",
      join(companion, "scripts/register-source.mjs"), "--experimental-strip-types"];
    // Prove the resolver guard is active instead of merely assuming that a
    // successful run happened to avoid ancestor modules.
    const outside = spawnSync(process.execPath, [...native, "--input-type=module", "--eval",
      `await import(${JSON.stringify(pathToFileURL(join(project, "src/catalog.ts")).href)});`], {
      cwd: companion, encoding: "utf8", timeout: 60_000, maxBuffer: 1_999_999
    });
    assert.equal(outside.error, undefined);
    assert.notEqual(outside.status, 0, "Runtime module guard allowed an ancestor source module.");
    assert.match(outside.stderr, /outside its isolated fixture/);
    run(process.execPath, [...native, "scripts/generate-pilot.ts", "--build"], companion);
    for (const [index, name] of names.entries()) {
      assert.deepEqual(await readFile(join(companion, "generated/pilot", name)), original[index],
        `Offline pilot rebuild differs from the prepared original: ${name}`);
    }
    const example = JSON.parse(run(process.execPath, [...native, "examples/offline-pilot.ts"], companion));
    assert.deepEqual(example.expectedRefusals, ["body-unavailable", "sample-budget"]);
    const cli = JSON.parse(run(process.execPath, [...native, "scripts/cli.ts", "position",
      "--body", "Chiron", "--dataset", "pilot", "--jd", "2451600.25", "--scale", "tt"], companion));
    assert.equal(cli.status, "ok");
    assert.equal(cli.provider, "minorbodies");
    assert.equal(cli.receipt.schema, "minorbodies-body-adapter-v1");
    console.log(JSON.stringify({
      schema: "minorbodies-offline-install-smoke-v1", status: "passed", nodeVersion: process.version,
      install: "npm-ci-offline-ignore-scripts-from-existing-cache",
      pilot: "coefficient-and-descriptor-byte-identical",
      runtime: "example-and-CLI;fetch-disabled;file-module-resolution-confined-to-fixture",
      scope: "runtime-installation-and-reproduction;not-accuracy-validation"
    }, null, 2));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

await main();
