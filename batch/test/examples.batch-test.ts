import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import type { JobSnapshot } from "../src/queue.js";
import { parseJobJson } from "../src/validation.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const executeFile = promisify(execFile);
// The committed examples contain invented people. Serial equality checks the
// wrapper, storage and transport, not independent astronomical accuracy.
const examples = [
  { kind: "charts", totalTasks: 2 },
  { kind: "transit-grid", totalTasks: 2 },
  { kind: "synastry-matrix", totalTasks: 6 },
] as const;
let scratch: string;
let cli: string;

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  scratch = mkdtempSync(join(project, ".generated", "examples-test-"));
  const outdir = join(scratch, "bundle");
  execFileSync(process.execPath, [join(project, "scripts/build.mjs"), "--outdir", outdir], {
    cwd: project, stdio: "pipe", timeout: 15_000,
  });
  cli = join(outdir, "cli.js");
}, 20_000);

afterAll(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

async function command(args: readonly string[]) {
  const result = await executeFile(process.execPath, ["--no-warnings", cli, ...args], {
    cwd: project, encoding: "utf8", timeout: 15_000, maxBuffer: 1_500_000,
  });
  expect(result.stderr).toBe("");
  return result.stdout;
}

describe("committed runnable synthetic examples", () => {
  it.each(examples)("runs $kind through the built CLI and resumes its export", async ({ kind, totalTasks }) => {
    const example = join(project, "examples", `${kind}.json`);
    const job = parseJobJson(readFileSync(example, "utf8"));
    expect(job.spec.kind).toBe(kind);
    expect(job.totalTasks).toBe(totalTasks);
    const people = job.spec.kind === "synastry-matrix" ? job.spec.people : job.spec.births;
    expect(people.every((person) => person.id.startsWith("synthetic-example-"))).toBe(true);
    const expected = [...executeSerial(job)];
    if (kind === "transit-grid") {
      expect(expected.map((row) => row.kind === "transit-grid" && row.at)).toEqual([
        "2024-06-01T00:00:00.000Z", "2024-06-02T00:00:00.000Z",
      ]);
    }
    if (kind === "synastry-matrix") {
      expect(expected.map((row) => row.kind === "synastry-matrix" && [row.aId, row.bId])).toEqual([
        ["synthetic-example-a", "synthetic-example-b"],
        ["synthetic-example-a", "synthetic-example-c"],
        ["synthetic-example-b", "synthetic-example-a"],
        ["synthetic-example-b", "synthetic-example-c"],
        ["synthetic-example-c", "synthetic-example-a"],
        ["synthetic-example-c", "synthetic-example-b"],
      ]);
    }
    const database = join(scratch, `${kind}.sqlite`);
    const submit = ["submit", example, "--db", database, "--idempotency-key", `synthetic-example-${kind}`];
    const submitted = JSON.parse(await command(submit)) as { job: JobSnapshot };
    expect(submitted.job).toMatchObject({ status: "queued", totalTasks, completedTasks: 0 });

    const worker = spawn(process.execPath, ["--no-warnings", cli, "worker", "--db", database], {
      cwd: project, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let diagnostic = "";
    worker.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    worker.stderr.setEncoding("utf8").on("data", (chunk: string) => { diagnostic += chunk; });
    const stopped = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      worker.once("error", reject);
      worker.once("close", (code, signal) => resolve({ code, signal }));
    });
    // Observe failures immediately, even while a separate export command waits.
    void stopped.catch(() => {});
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const exported = await command(["export", submitted.job.id, "--db", database, "--follow"]);
      expect(exported.endsWith("\n")).toBe(true);
      const rows = exported.trimEnd().split("\n").map((line) => JSON.parse(line) as ResultRow);
      expect(rows).toEqual(expected);
      expect(rows.map((row) => row.nextCursor)).toEqual(Array.from({ length: totalTasks }, (_, index) => index + 1));

      const status = JSON.parse(await command(["status", submitted.job.id, "--db", database])) as { job: JobSnapshot };
      expect(status.job).toMatchObject({ status: "completed", completedTasks: totalTasks, nextCursor: totalTasks });
      const replayed = JSON.parse(await command(submit)) as { job: JobSnapshot };
      expect(replayed.job).toEqual(status.job);
      const cursor = rows[0]!.nextCursor;
      const suffix = await command(["export", submitted.job.id, "--db", database, "--cursor", String(cursor)]);
      expect(suffix).toBe(rows.slice(cursor).map((row) => `${JSON.stringify(row)}\n`).join(""));
    } finally {
      worker.kill("SIGTERM");
      shutdownTimer = setTimeout(() => worker.kill("SIGKILL"), 5_000);
      try {
        expect(await stopped).toEqual({ code: 0, signal: null });
        expect(output).toBe("");
        expect(JSON.parse(diagnostic)).toEqual({ event: "ready", command: "worker" });
      } finally { clearTimeout(shutdownTimer); }
    }
  }, 30_000);
});
