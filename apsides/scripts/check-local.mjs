import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));

export const CHECKS = Object.freeze([
  "typecheck", "test", "validate:references", "check:isolation"
].map((name) => Object.freeze({
  name,
  args: Object.freeze(name === "validate:references"
    ? ["run", name, "--", "--check-evidence"] : ["run", name])
})));

// Continue after a failing gate, but never convert a failure into success.
// Injection keeps the orchestration tests independent of expensive searches.
export function runChecks(execute, announce = () => {}) {
  const stages = CHECKS.map(({ name, args }) => {
    announce(`Running npm ${args.join(" ")}`);
    let result;
    try {
      result = execute(args);
    } catch {
      result = { status: null, signal: null, error: true };
    }
    return {
      name, command: `npm ${args.join(" ")}`,
      exitCode: result.status ?? null, signal: result.signal ?? null,
      launchError: Boolean(result.error),
      passed: result.status === 0 && !result.error && !result.signal
    };
  });
  return { passed: stages.every((stage) => stage.passed), stages };
}

export function renderChecks(report) {
  return [
    "# M11 local checks", "",
    `Overall status: **${report.passed ? "PASS" : "FAIL"}**.`, "",
    `Runtime: Node ${report.runtime.node}, ${report.runtime.platform}, ${report.runtime.arch}.`, "",
    "Reproduce from `apsides/` with `npm run check -- --write-evidence`.",
    "Every gate runs even if an earlier gate fails. A nonzero overall status",
    "remains a failure, including the independent acceptance failures in",
    "[VALIDATION.md](../../../VALIDATION.md). Full test output is not copied here.", "",
    "| Command | Exit status | Signal | Launch error | Verdict |",
    "| --- | ---: | --- | --- | --- |",
    ...report.stages.map((stage) =>
      `| \`${stage.command}\` | ${stage.exitCode ?? "unavailable"} | ${stage.signal ?? "none"} | ${stage.launchError} | ${stage.passed ? "PASS" : "FAIL"} |`),
    "", "| Input | SHA-256 |", "| --- | --- |",
    ...Object.entries(report.identities).map(([path, hash]) => `| \`${path}\` | \`${hash}\` |`),
    "", "The isolation gate checks npm file selection in the checkout and runs",
    "the repository package-contents gate in an ignored copy using carried",
    "build output. It does not rebuild the engine or check archive history.",
    "The validation gate reproduces the M10 measured report using its frozen",
    "reference corpus; its search source and numerical limits are unchanged.", ""
  ].join("\n");
}

export function main(args) {
  if (args.length > 1 || args.some((arg) => arg !== "--write-evidence")) {
    throw new Error("Usage: node scripts/check-local.mjs [--write-evidence]");
  }
  const result = runChecks((commandArgs) => spawnSync("npm", commandArgs, {
    cwd: project, stdio: "inherit",
    // npm and its child commands must use the same Node as this runner.
    env: { ...process.env, PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
      npm_config_cache: join(project, ".cache/npm") }
  }), console.log);
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  const archive = manifest.dependencies["@zodiacs/engine"].slice("file:".length);
  const paths = ["package.json", "package-lock.json", "scripts/check-local.mjs", "scripts/check-isolation.mjs", archive];
  const report = {
    schema: "apsides-local-checks/1",
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch },
    identities: Object.fromEntries(paths.map((path) => [path,
      createHash("sha256").update(readFileSync(join(project, path))).digest("hex")])),
    ...result
  };
  mkdirSync(join(project, ".generated/checks"), { recursive: true });
  writeFileSync(join(project, ".generated/checks/report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (args[0] === "--write-evidence") {
    mkdirSync(join(project, "docs/evidence/m11"), { recursive: true });
    writeFileSync(join(project, "docs/evidence/m11/RESULTS.md"), renderChecks(report));
  }
  for (const stage of report.stages) console.log(`${stage.name}: ${stage.passed ? "PASS" : "FAIL"}`);
  console.log(`Overall local checks: ${report.passed ? "PASS" : "FAIL"}; .generated/checks/report.json`);
  if (!report.passed) process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Local checks failed.");
    process.exitCode = 1;
  }
}
