import { spawnSync } from "node:child_process";
import {
  closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import * as library from "../src/index.js";
import type { LunarSearchResult } from "../src/index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const executable = fileURLToPath(new URL("../bin/apsides.mjs", import.meta.url));
const fromJd = 2_451_544.5;
const toJd = 2_451_575.5;
const month = { from: { jd: fromJd, scale: "tt" as const }, to: { jd: toJd, scale: "tt" as const } };
const ttArgs = ["--from-jd-tt", String(fromJd), "--to-jd-tt", String(toJd)];

afterEach(() => vi.restoreAllMocks());

// Copy the actual launcher into its own ignored layout. Synthetic modules
// isolate process I/O and import failures without replacing a shared build.
function withLauncher(moduleSource: string, check: (launcher: string, directory: string) => void) {
  const generated = join(project, ".generated");
  mkdirSync(generated, { recursive: true });
  const directory = mkdtempSync(join(generated, "cli-acceptance-"));
  try {
    mkdirSync(join(directory, "bin"));
    mkdirSync(join(directory, ".generated", "cli"), { recursive: true });
    const launcher = join(directory, "bin", "apsides.mjs");
    copyFileSync(executable, launcher);
    writeFileSync(join(directory, ".generated", "cli", "cli.js"), moduleSource);
    check(launcher, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function launch(launcher: string, output: "stdout" | "stderr" | null = null, descriptor?: number) {
  const result = spawnSync(process.execPath, [launcher], {
    cwd: project, encoding: "utf8", timeout: 60_000, maxBuffer: 1_000_000,
    stdio: ["ignore", output === "stdout" ? descriptor! : "pipe", output === "stderr" ? descriptor! : "pipe"]
  });
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  return result;
}

describe("launcher acceptance with real process streams", () => {
  it.each([
    ["invalid syntax", "export const runCli = ;"],
    ["module initialization failure", "throw new Error('Synthetic initialization detail');"],
    ["absent entry export", "export const unrelated = true;"]
  ])("reports %s as a load error with no successful result", (_name, source) => {
    withLauncher(source, (launcher) => {
      const result = launch(launcher);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr);
      expect(error).toEqual({ status: "error", code: "unexpected-error", message: expect.any(String) });
      expect(error.message).toContain("npm run build");
      expect(result.stderr).toBe(`${JSON.stringify(error)}\n`);
      expect(result.stderr).not.toContain("Synthetic initialization detail");
      expect(result.stderr).not.toContain("SyntaxError");
    });
  });

  it.each(["stdout", "stderr"] as const)("returns failure when %s is a real read-only file descriptor", (output) => {
    const response = {
      stdout: output === "stdout" ? "{\"status\":\"complete\"}\n" : "",
      stderr: output === "stderr" ? "{\"status\":\"error\"}\n" : "",
      exitCode: output === "stdout" ? 0 : 2
    };
    withLauncher(`export function runCli() { return ${JSON.stringify(response)}; }`, (launcher, directory) => {
      const sink = join(directory, "read-only-output.txt");
      const original = "Synthetic descriptor fixture\n";
      writeFileSync(sink, original);
      const descriptor = openSync(sink, "r");
      try {
        const result = launch(launcher, output, descriptor);
        expect(result.status).toBe(1);
        expect(output === "stdout" ? result.stderr : result.stdout).toBe("");
        expect(readFileSync(sink, "utf8")).toBe(original);
      } finally {
        closeSync(descriptor);
      }
    });
  });

  it("allows a large stdout document to drain completely before exiting", () => {
    const payload = `${JSON.stringify({ status: "complete", synthetic: "x".repeat(262_144) })}\n`;
    const source = `export function runCli() {
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ status: 'complete', synthetic: 'x'.repeat(262144) }) + '\\n' };
    }`;
    withLauncher(source, (launcher) => {
      const result = launch(launcher);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(payload);
      expect(JSON.parse(result.stdout).synthetic.length).toBe(262_144);
    });
  });
});

// These are integration and failure-path checks. The real calculations use
// January 2000 TT, an existing development window, not a held-out reference.
describe("CLI result acceptance", () => {
  it("uses all targets for a nonempty window and canonicalizes explicit reverse order", () => {
    const implicit = runCli(["window", ...ttArgs]);
    expect(implicit.exitCode).toBe(0);
    expect(implicit.stderr).toBe("");
    const result = JSON.parse(implicit.stdout);
    expect(result.status).toBe("complete");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.diagnostics.bodies.map(({ body }: { body: string }) => body)).toEqual(library.APSIS_BODIES);
    expect(result.diagnostics.bodies.every(({ status }: { status: string }) => status === "complete")).toBe(true);
    expect(runCli([
      "window", ...ttArgs, "--bodies", [...library.APSIS_BODIES].reverse().join(",")
    ])).toEqual(implicit);
  });

  it("discards already-found lunar events when the combined budget stops the next body", () => {
    const lunar = library.searchLunarApsides(month);
    expect(lunar.status).toBe("complete");
    expect(lunar.events.length).toBeGreaterThan(0);
    const result = runCli([
      "window", ...ttArgs, "--bodies", "Earth,Moon",
      "--max-evaluations", String(lunar.diagnostics.evaluations)
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    const refused = JSON.parse(result.stdout);
    expect(refused).toMatchObject({ status: "refused", failedBody: "Earth", reason: "evaluation-budget", events: [] });
    expect(refused.diagnostics.bodies).toMatchObject([
      { body: "Moon", status: "complete" }, { body: "Earth", status: "not-started" }
    ]);
    expect(result.stdout).toBe(`${JSON.stringify(refused)}\n`);
  });

  it("maps an encoding failure to an unexpected error without partial JSON", () => {
    const circular: { status: string; events: unknown[]; self?: unknown } = { status: "complete", events: [] };
    circular.self = circular;
    vi.spyOn(library, "searchLunarApsides").mockReturnValue(circular as unknown as LunarSearchResult);
    const result = runCli(["lunar", ...ttArgs]);
    expect(result).toMatchObject({ stdout: "", exitCode: 1 });
    expect(JSON.parse(result.stderr)).toEqual({
      status: "error", code: "unexpected-error", message: "The apsides computation failed unexpectedly."
    });
  });
});
