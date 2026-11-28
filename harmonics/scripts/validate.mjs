// Final source-checkout audit. Git is used only for read operations.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repository = dirname(project);
const env = { ...process.env, NODE_OPTIONS: "", npm_config_cache: join(project, ".cache/npm") };
const report = { node: process.versions.node };
assert.equal(process.versions.node.split(".")[0], "22", "Run this audit with Node 22 on PATH.");

function run(command, args, cwd = project, input) {
  const result = spawnSync(command, args, {
    cwd, env, input, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024
  });
  assert.ifError(result.error);
  return result;
}

function success(command, args, cwd = project, input) {
  const result = run(command, args, cwd, input);
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

const git = (...args) => success("git", args, repository);
const paths = (output) => output.split("\0").filter(Boolean);
const insideProject = (file) => file.startsWith("harmonics/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function checkIsolation() {
  // Include both old and new rename paths by disabling rename detection.
  const additions = git("log", "--diff-filter=A", "--format=%H", "--", "harmonics/PLAN.md")
    .trim().split("\n");
  assert.equal(additions.length, 1, "Expected a single project plan introduction in full history.");
  const base = `${additions[0]}^`;
  const changed = [
    ...paths(git("diff", "--no-renames", "--name-only", "-z", base, "HEAD")),
    ...paths(git("diff", "--no-renames", "--name-only", "-z", "HEAD")),
    ...paths(git("ls-files", "--others", "--exclude-standard", "-z"))
  ];
  assert(changed.every(insideProject), "Historical or working changes exist outside harmonics/.");
  git("diff", "--check", "HEAD");
  return { base: git("rev-parse", base).trim(), changesConfinedToProject: true, whitespace: "passed" };
}

function snapshotProtectedFiles() {
  const files = paths(git("ls-files", "-z")).filter((file) => !insideProject(file));
  // dist is usually absent and ignored. Check it explicitly if already present.
  function visit(directory) {
    if (!existsSync(directory)) return;
    assert(lstatSync(directory).isDirectory(), "dist must be an ordinary directory.");
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      if (lstatSync(file).isDirectory()) visit(file);
      else files.push(file.slice(repository.length + 1));
    }
  }
  visit(join(repository, "dist"));
  return {
    distPresent: existsSync(join(repository, "dist")),
    files: [...new Set(files)].sort().map((file) => {
      const absolute = join(repository, file);
      assert(lstatSync(absolute).isFile(), `Protected path must be a regular file: ${file}`);
      return [file, digest(readFileSync(absolute))];
    })
  };
}

function checkProjectFiles() {
  const files = [...new Set(paths(git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "harmonics/")))];
  for (const file of files) {
    const absolute = join(repository, file);
    const stat = lstatSync(absolute);
    assert(stat.isFile(), `Project path must be a regular file: ${file}`);
    assert(stat.size < 2_000_000, `Project file exceeds the requested size limit: ${file}`);
    if (file.endsWith(".md") || file.endsWith(".txt")) {
      assert(!readFileSync(absolute, "utf8").includes("\u2014"), `Documentation contains an em dash: ${file}`);
    }
    assert(!/^harmonics\/(?:node_modules|\.cache|coverage|generated)\//u.test(file), `Generated file is not ignored: ${file}`);
  }
  return { regularFiles: "passed", fileSizeLimitBytes: 2_000_000, fileSizes: "passed",
    documentationDashes: "passed", generatedFilesIgnored: "passed" };
}

report.isolation = checkIsolation();
const before = snapshotProtectedFiles();
const projectSourceFiles = paths(git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "harmonics/"))
  .filter((file) => /\.(?:ts|mjs|json)$/u.test(file) && !file.startsWith("harmonics/docs/")).sort();
report.sourceIdentity = {
  method: "SHA-256 of JSON-encoded sorted [path, file SHA-256] pairs",
  engineTrackedFilesSha256: digest(JSON.stringify(before.files)),
  projectSourcesTestsToolingFixturesSha256: digest(JSON.stringify(projectSourceFiles.map((file) =>
    [file, digest(readFileSync(join(repository, file)))])))
};
mkdirSync(join(project, ".cache"), { recursive: true });
success("npm", ["run", "typecheck"]);
report.typecheck = "passed";
success("npm", ["test", "--", "--reporter=json", "--outputFile=.cache/validation-vitest.json"]);
const tests = JSON.parse(readFileSync(join(project, ".cache/validation-vitest.json"), "utf8"));
assert.equal(tests.success, true);
assert.equal(tests.numFailedTests, 0);
assert.equal(tests.numPendingTests, 0);
assert.equal(tests.numTodoTests, 0);
report.vitest = { status: "passed", tests: tests.numPassedTests,
  files: tests.testResults.map(({ name }) => name.slice(project.length + 1)).sort() };

// These are same-runtime reproducibility checks, not accuracy references.
const sharedBirth = ["--include-angles", "--include-chart-points"];
const selectedBirth = [...sharedBirth, "--bodies", '["Sun","Moon","Mercury"]'];
const cases = [
  { command: "chart", fixture: "chart-points", options: ["--harmonic", "3"] },
  { command: "chart", fixture: "chart-birth", options: ["--harmonic", "3", ...sharedBirth] },
  { command: "spectrum", fixture: "chart-points", options: ["--harmonics", "3,1,2"] },
  { command: "spectrum", fixture: "chart-birth", options: ["--harmonics", "3,1,2", ...selectedBirth] },
  ...["90", "45", "22.5"].flatMap((circle) => [
    { command: "dial", fixture: "dial-points", options: ["--circle", circle, "--contact-orb", "0"] },
    { command: "dial", fixture: "chart-birth", options: ["--circle", circle, ...selectedBirth] }
  ])
];
let sourceEnvelope;
report.determinism = cases.map(({ command, fixture, options }) => {
  const file = `fixtures/${fixture}.json`;
  const invoke = (inputPath, input) => {
    const result = run(process.execPath, ["--import", "./test/no-network.mjs", "./bin/harmonics.mjs",
      command, "--input", inputPath, ...options], project, input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert(result.stdout.endsWith("\n"));
    return result.stdout;
  };
  const output = invoke(file);
  assert.equal(invoke(file), output, `Repeated file output differs for ${command}.`);
  assert.equal(invoke("-", readFileSync(join(project, file))), output, `Stdin output differs for ${command}.`);
  const decoded = JSON.parse(output);
  assert.equal(decoded.command, command);
  assert.equal(decoded.schema, "zodiacs-harmonics-cli/v1");
  if (fixture === "chart-birth") {
    assert.equal(decoded.sourceMode, "birth");
    sourceEnvelope ??= decoded.source.envelope;
    assert.deepEqual(decoded.source.envelope, sourceEnvelope, "Commands altered the original natal envelope.");
  } else {
    assert.equal(decoded.sourceMode, "points");
    assert(!Object.hasOwn(decoded, "source"));
  }
  return { command, fixture: file, options, repeatedFileAndStdin: "identical", stdoutSha256: digest(output) };
});

const packed = JSON.parse(success("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], repository));
assert.equal(packed.length, 1);
assert(packed[0].files.length > 0);
assert(packed[0].files.every(({ path }) => !insideProject(path)), "harmonics/ leaked into the engine package.");
report.packageExclusion = { status: "passed", method: "npm pack --dry-run --json --ignore-scripts",
  scope: "Current source-checkout manifest; no archive created and no dist build performed." };
const contents = run("npm", ["run", "package:contents"], repository);
if (contents.status === 0) report.packageContents = { status: "passed" };
else {
  assert(!existsSync(join(repository, "dist/calc.d.ts")), "Package gate failed with dist present.");
  assert(contents.stderr.includes("packed package is missing dist/calc.d.ts"), contents.stderr);
  report.packageContents = { status: "unavailable", reason: "Missing dist/calc.d.ts; engine build prohibited by project scope." };
}

assert.deepEqual(snapshotProtectedFiles(), before, "Validation changed files outside harmonics/ or dist presence.");
report.isolation = { ...checkIsolation(), protectedFilesUnchangedDuringAudit: true,
  distPresent: before.distPresent };
report.projectFiles = checkProjectFiles();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
