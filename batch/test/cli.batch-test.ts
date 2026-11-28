import { execFileSync, spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseCliOptions } from "../src/cli-options.js";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import { DEFAULT_LIMITS } from "../src/model.js";
import type { JobSpec, Person } from "../src/model.js";
import type { JobSnapshot } from "../src/queue.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";

const project = fileURLToPath(new URL("../", import.meta.url));
// Invented inputs only. Serial parity checks transport and execution, not accuracy.
const people: readonly Person[] = [
  { id: "synthetic-cli-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
  { id: "synthetic-cli-b", birth: { utc: "1997-08-09T10:11:12Z", latitude: 15, longitude: -27 } },
  { id: "synthetic-cli-c", birth: { utc: "1903-04-05T06:07:08Z", latitude: -18, longitude: 39 } },
];
const charts: JobSpec = { version: 1, kind: "charts", births: people };
const workloads: readonly JobSpec[] = [
  charts,
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 2),
    start: "2010-02-03T00:00:00Z", end: "2010-02-05T00:00:00Z", stepMs: 86_400_000,
  },
  { version: 1, kind: "synastry-matrix", people },
];

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface Ready {
  event: "ready";
  command: "worker" | "serve";
  host?: string;
  port?: number;
}

let suite: string;
let entry: string;
let scratch: string;
let filename: string;
let children: CliChild[];
let handles: SqliteQueue[];

class CliChild {
  readonly process: ChildProcessWithoutNullStreams;
  readonly exited: Promise<Exit>;
  stdout = "";
  stderr = "";
  closed = false;

  constructor(args: readonly string[], input?: string | Buffer | null, nodeArgs: readonly string[] = []) {
    this.process = spawn(process.execPath, ["--no-warnings", ...nodeArgs, entry, ...args], {
      cwd: scratch, stdio: ["pipe", "pipe", "pipe"],
    });
    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => { this.stdout += chunk; });
    this.process.stderr.on("data", (chunk: string) => { this.stderr += chunk; });
    // Early validation can close stdin while an oversized request is still sent.
    this.process.stdin.on("error", () => {});
    this.exited = new Promise((resolve, reject) => {
      this.process.once("error", reject);
      this.process.once("close", (code, signal) => {
        this.closed = true;
        resolve({ code, signal, stdout: this.stdout, stderr: this.stderr });
      });
    });
    if (input !== null) this.process.stdin.end(input);
  }

  async finish(): Promise<Exit> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`CLI timed out: ${this.stderr}`)), 10_000);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async ready(): Promise<Ready> {
    await until(() => {
      if (this.closed) throw new Error(`CLI closed before readiness: ${this.stderr}`);
      return this.stderr.includes("\n");
    });
    const ready = JSON.parse(this.stderr.split("\n")[0]!) as Ready;
    expect(ready.event).toBe("ready");
    expect(this.stdout).toBe("");
    return ready;
  }

  async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<Exit> {
    expect(this.process.kill(signal)).toBe(true);
    return this.finish();
  }

  async cleanup(): Promise<void> {
    if (!this.closed) this.process.kill("SIGKILL");
    await this.exited;
  }
}

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  suite = mkdtempSync(join(project, ".generated", "cli-tests-"));
  const outdir = join(suite, "bundle");
  execFileSync(process.execPath, [join(project, "scripts/build.mjs"), "--outdir", outdir], {
    cwd: project, stdio: "pipe",
  });
  entry = join(outdir, "cli.js");
}, 15_000);

beforeEach(() => {
  scratch = mkdtempSync(join(suite, "case-"));
  filename = join(scratch, "queue.sqlite");
  children = [];
  handles = [];
});

afterEach(async () => {
  await Promise.all(children.map((child) => child.cleanup()));
  for (const handle of handles) await handle.close();
  rmSync(scratch, { force: true, recursive: true });
});

afterAll(() => { if (suite) rmSync(suite, { force: true, recursive: true }); });

function child(args: readonly string[], input?: string | Buffer | null, nodeArgs: readonly string[] = []): CliChild {
  const instance = new CliChild(args, input, nodeArgs);
  children.push(instance);
  return instance;
}

function run(args: readonly string[], input?: string | Buffer): Promise<Exit> {
  return child(args, input).finish();
}

function snapshot(output: Exit): JobSnapshot {
  expect(output.code).toBe(0);
  expect(output.signal).toBeNull();
  expect(output.stderr).toBe("");
  expect(output.stdout.endsWith("\n")).toBe(true);
  expect(output.stdout.trim().split("\n")).toHaveLength(1);
  const parsed = JSON.parse(output.stdout) as { job: JobSnapshot };
  expect(Object.keys(parsed)).toEqual(["job"]);
  return parsed.job;
}

function error(output: Exit, exitCode: number, code?: string): void {
  expect(output.code).toBe(exitCode);
  expect(output.signal).toBeNull();
  expect(output.stdout).toBe("");
  expect(output.stderr.endsWith("\n")).toBe(true);
  expect(output.stderr.trim().split("\n")).toHaveLength(1);
  const parsed = JSON.parse(output.stderr) as { error: { code: string; message: string } };
  expect(Object.keys(parsed)).toEqual(["error"]);
  expect(Object.keys(parsed.error).sort()).toEqual(["code", "message"]);
  expect(parsed.error.code).toEqual(code ?? expect.any(String));
  expect(parsed.error.message).toEqual(expect.any(String));
  expect(parsed.error.message.length).toBeGreaterThan(0);
  expect(output.stderr).not.toContain(scratch);
  expect(output.stderr).not.toContain("synthetic-sensitive-marker");
  expect(output.stderr).not.toContain(" at ");
}

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for CLI state.");
    await delay(5);
  }
}

function open(): SqliteQueue {
  const queue = new SqliteQueue(filename);
  handles.push(queue);
  return queue;
}

function worker(leaseMs = 3_000): CliChild {
  return child(["worker", "--db", filename, "--workers", "2", "--lease-ms", String(leaseMs), "--poll-ms", "5"]);
}

function ndjson(rows: readonly ResultRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

describe("batch CLI subprocess interface", () => {
  it("defaults service binding to loopback with an explicit memory opt-in", () => {
    expect(parseCliOptions(["serve"])).toMatchObject({ host: "127.0.0.1", port: 3000, memory: false });
    expect(parseCliOptions(["serve", "--memory"])).toMatchObject({ memory: true });
  });

  it.each([["--help"], ["help"], ["submit", "--help"], ["serve", "--help"]])
    ("prints help on stdout for %j", async (...args) => {
      const output = await run(args);
      expect(output.code).toBe(0);
      expect(output.signal).toBeNull();
      expect(output.stderr).toBe("");
      expect(output.stdout).toMatch(/submit/);
      expect(output.stdout).toMatch(/worker/);
      expect(output.stdout).toMatch(/export/);
    });

  it.each(workloads)("submits and follows $kind through a real SQLite worker", async (spec) => {
    writeFileSync(join(scratch, "synthetic.json"), JSON.stringify(spec));
    // Both input files and explicit database paths resolve from the caller's cwd.
    const job = snapshot(await run(["submit", "synthetic.json", "--db", "queue.sqlite"]));
    expect(job).toMatchObject({ kind: spec.kind, status: "queued", nextCursor: 0 });
    expect(snapshot(await run(["status", job.id, "--db", filename]))).toEqual(job);
    expect(await run(["export", job.id, "--db", filename])).toMatchObject({ code: 0, stdout: "", stderr: "" });

    const following = child(["export", job.id, "--db", filename, "--follow", "--poll-ms", "5"]);
    const running = worker();
    expect(await running.ready()).toMatchObject({ command: "worker" });
    const output = await following.finish();
    const rows = [...executeSerial(validateJob(spec))];
    expect(output).toMatchObject({ code: 0, signal: null, stdout: ndjson(rows), stderr: "" });
    expect(snapshot(await run(["status", job.id, "--db", filename]))).toMatchObject({
      status: "completed", nextCursor: rows.length, completedTasks: rows.length, lease: null,
    });
    expect(await run(["export", job.id, "--db", filename, "--cursor", "1"])).toMatchObject({
      code: 0, stdout: ndjson(rows.slice(1)), stderr: "",
    });
    expect(await run(["export", job.id, "--db", filename, "--cursor", String(rows.length)])).toMatchObject({
      code: 0, stdout: "", stderr: "",
    });
    error(await run(["export", job.id, "--db", filename, "--cursor", String(rows.length + 1)]), 2);
    const stopped = await running.stop();
    expect(stopped).toMatchObject({ code: 0, signal: null, stdout: "" });
    expect(stopped.stderr.trim().split("\n")).toHaveLength(1);
  }, 20_000);

  it("reads stdin, replays a canonical idempotency key and reports payload or policy conflicts", async () => {
    const args = ["submit", "-", "--db", filename, "--idempotency-key", "synthetic-cli-key", "--max-attempts", "2", "--retry-delay-ms", "9"];
    const initial = snapshot(await run(args, JSON.stringify(charts)));
    expect(initial.retry).toEqual({ maxAttempts: 2, delayMs: 9 });
    expect(snapshot(await run(args, JSON.stringify(validateJob(charts).spec)))).toEqual(initial);
    error(await run(args, JSON.stringify({ ...charts, births: people.slice(0, 1) })), 4, "idempotency-conflict");
    error(await run([...args.slice(0, -1), "10"], JSON.stringify(charts)), 4, "idempotency-conflict");
    expect(snapshot(await run(["status", initial.id, "--db", filename]))).toEqual(initial);
  });

  it.each(["status", "export"])("returns not-found for %s without printing a result", async (command) => {
    error(await run([command, "synthetic-missing", "--db", filename]), 3, "not-found");
    expect(existsSync(filename)).toBe(false);
    await open().close();
    error(await run([command, "synthetic-missing", "--db", filename]), 3, "not-found");
  });

  const malformedArgs: readonly string[][] = [
    [], ["synthetic-sensitive-marker"], ["submit"], ["status"], ["export"],
    ["worker", "unexpected"], ["status", "synthetic-id", "extra"],
    ["status", "synthetic-id", "--workers", "1"], ["worker", "--follow"],
    ["serve", "--unknown", "synthetic-sensitive-marker"], ["worker", "--workers"],
    ["worker", "--workers", "1", "--workers", "2"], ["serve", "--memory", "--memory"],
    ["serve", "--memory", "--db", "queue.sqlite"], ["worker", "--memory"],
    ["submit", "-", "--db", ":memory:"], ["status", "synthetic-id", "--db", ""],
    ["worker", "--workers", "0"], ["worker", "--workers", "65"],
    ["worker", "--workers", "1.5"], ["worker", "--workers", "1e1"],
    ["worker", "--workers", "0x2"], ["worker", "--workers", "+1"],
    ["worker", "--workers", " 1"], ["worker", "--lease-ms", "1"],
    ["worker", "--poll-ms", "0"], ["worker", "--poll-ms", "2147483648"],
    ["serve", "--port", "65536"], ["serve", "--port", "-1"],
    ["export", "synthetic-id", "--cursor", "-1"],
    ["export", "synthetic-id", "--cursor", "9007199254740992"],
    ["submit", "-", "--max-attempts", "101"], ["submit", "-", "--max-attempts", "0"],
    ["submit", "-", "--retry-delay-ms", "86400001"],
    ["submit", "-", "--idempotency-key", "synthetic-sensitive-marker\n"],
    ["serve", "--host", "localhost"], ["serve", "--host", "synthetic-sensitive-marker"],
    ["serve", "--host", "999.1.2.3"], ["serve", "--port=0"], ["worker", "--workers", "01"],
    ["worker", "--workers", "1\n"], ["worker", "--workers=1"],
    ["status", "synthetic-id", "--db", "queue.sqlite", "--db", "other.sqlite"],
  ];
  it.each(malformedArgs.map((args) => ({ args })))("rejects malformed arguments $args", async ({ args }) => {
    error(await run(args), 2);
  });

  it.each(["stdin", "file"])("bounds and decodes %s before parsing, with fixed errors", async (source) => {
    const submit = async (input: string | Buffer): Promise<Exit> => {
      if (source === "stdin") return run(["submit", "-", "--db", filename], input);
      writeFileSync(join(scratch, "synthetic-input.json"), input);
      return run(["submit", "synthetic-input.json", "--db", filename]);
    };
    const text = JSON.stringify(charts);
    const bounded = text + " ".repeat(DEFAULT_LIMITS.maxInputBytes - Buffer.byteLength(text));
    expect(snapshot(await submit(bounded))).toMatchObject({ kind: "charts", status: "queued" });
    error(await submit(`${bounded} `), 2);
    error(await submit(Buffer.concat([
      Buffer.from('{"synthetic-sensitive-marker":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}'),
    ])), 2);
    const invalid = await submit('{"synthetic-sensitive-marker":');
    error(invalid, 2);
    expect((await submit('{"other-invented-input":')).stderr).toBe(invalid.stderr);
    error(await submit(JSON.stringify({ ...charts, births: [{ ...people[0], id: "synthetic-sensitive-marker\n" }] })), 2);
    error(await submit(JSON.stringify({ ...charts, version: 2 })), 2);
  }, 15_000);

  it("reports missing input files and unreadable databases without echoing their paths", async () => {
    error(await run(["submit", join(scratch, "synthetic-sensitive-marker.json"), "--db", filename]), 1);
    error(await run(["submit", scratch, "--db", filename]), 1);
    error(await run(["status", "synthetic-missing", "--db", scratch]), 1);
  });

  it("keeps the default SQLite path beside the build instead of the caller's cwd", async () => {
    const job = snapshot(await run(["submit", "-"], JSON.stringify(charts)));
    expect(existsSync(join(suite, ".runtime", "queue.sqlite"))).toBe(true);
    expect(existsSync(join(scratch, ".runtime"))).toBe(false);
    expect(snapshot(await run(["status", job.id]))).toEqual(job);
    const running = child(["worker", "--workers", "1", "--poll-ms", "5"]);
    await running.ready();
    expect(await run(["export", job.id, "--follow", "--poll-ms", "5"])).toMatchObject({
      code: 0, stdout: ndjson([...executeSerial(validateJob(charts))]), stderr: "",
    });
    expect(await running.stop()).toMatchObject({ code: 0, signal: null, stdout: "" });
  }, 15_000);

  it("rejects an invalid submission before creating a database", async () => {
    error(await run(["submit", "-", "--db", filename], '{"synthetic-sensitive-marker":null}'), 2);
    expect(existsSync(filename)).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("interrupts a pending followed export with %s without changing its job", async (signal) => {
    const job = snapshot(await run(["submit", "-", "--db", filename], JSON.stringify(charts)));
    // The last submit connection closed; a new shared-memory file shows the
    // exporter opened SQLite after installing its signal handlers.
    expect(existsSync(`${filename}-shm`)).toBe(false);
    const following = child(["export", job.id, "--db", filename, "--follow", "--poll-ms", "5"]);
    await until(() => existsSync(`${filename}-shm`));
    error(await following.stop(signal), signal === "SIGINT" ? 130 : 143, "interrupted");
    expect(snapshot(await run(["status", job.id, "--db", filename]))).toEqual(job);
  });

  it("stops an unfinished stdin submission on SIGTERM without persisting a job", async () => {
    // A test-only observer reports when async iteration is waiting for stdin.
    // It changes no input or handlers and avoids timing signals against startup.
    const observer = `
      const check = () => {
        if (process.stdin.listenerCount('readable') > 0 && process.listenerCount('SIGTERM') > 0) {
          process.stderr.write('input-ready\\n');
        } else setTimeout(check, 5).unref();
      };
      setTimeout(check, 5).unref();
    `;
    const submitting = child(["submit", "-", "--db", filename], null,
      ["--import", `data:text/javascript,${encodeURIComponent(observer)}`]);
    submitting.process.stdin.write('{"version":1,');
    await until(() => {
      if (submitting.closed) throw new Error("CLI exited before awaiting stdin.");
      return submitting.stderr === "input-ready\n";
    });
    const stopped = await submitting.stop();
    error({ ...stopped, stderr: stopped.stderr.slice("input-ready\n".length) }, 143, "interrupted");
    expect(existsSync(filename)).toBe(false);
  });

  it("fails cleanly when the export consumer closes stdout", async () => {
    const queue = open();
    const validated = validateJob(charts);
    const job = await queue.submit(charts);
    const claimed = (await queue.claim({ owner: "synthetic-cli-pipe", leaseMs: 10_000 }))!;
    await queue.commit(claimed.lease, [...executeSerial(validated)]);
    const exporting = child(["export", job.id, "--db", filename]);
    exporting.process.stdout.destroy();
    error(await exporting.finish(), 1, "output-failed");
    expect(await queue.getJob(job.id)).toMatchObject({ status: "completed", completedTasks: people.length });
  });

  it("closes a failed HTTP listener without claiming queued work", async () => {
    const job = snapshot(await run(["submit", "-", "--db", filename], JSON.stringify(charts)));
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    try {
      const port = (occupied.address() as AddressInfo).port;
      error(await run(["serve", "--db", filename, "--host", "127.0.0.1", "--port", String(port)]), 1, "listen-failed");
      expect(existsSync(`${filename}-shm`)).toBe(false);
      expect(snapshot(await run(["status", job.id, "--db", filename]))).toEqual(job);
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close((err) => err ? reject(err) : resolve()));
    }
  });

  it("starts a memory service with real HTTP control, workers and a clean SIGINT shutdown", async () => {
    const service = child(["serve", "--memory", "--host", "127.0.0.1", "--port", "0", "--workers", "2", "--poll-ms", "5"]);
    const ready = await service.ready();
    expect(ready).toMatchObject({ command: "serve", host: "127.0.0.1", port: expect.any(Number) });
    const base = `http://${ready.host}:${ready.port}/v1/jobs`;
    const submitted = await fetch(base, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: charts }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(submitted.status).toBe(202);
    const { job } = await submitted.json() as { job: JobSnapshot };
    const response = await fetch(`${base}/${job.id}/results?follow=true`, { signal: AbortSignal.timeout(10_000) });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(ndjson([...executeSerial(validateJob(charts))]));
    expect(await (await fetch(`${base}/${job.id}`, { signal: AbortSignal.timeout(10_000) })).json())
      .toMatchObject({ job: { status: "completed", completedTasks: people.length } });
    const stopped = await service.stop("SIGINT");
    expect(stopped).toMatchObject({ code: 0, signal: null, stdout: "" });
    expect(stopped.stderr.trim().split("\n")).toHaveLength(1);
  }, 15_000);

  it("shares SQLite submissions, status and results between the CLI and HTTP service", async () => {
    const submitted = snapshot(await run(["submit", "-", "--db", filename], JSON.stringify(charts)));
    const service = child(["serve", "--db", filename, "--host", "127.0.0.1", "--port", "0", "--poll-ms", "5"]);
    const ready = await service.ready();
    const base = `http://${ready.host}:${ready.port}/v1/jobs`;
    const result = await fetch(`${base}/${submitted.id}/results?follow=true`, { signal: AbortSignal.timeout(10_000) });
    expect(await result.text()).toBe(ndjson([...executeSerial(validateJob(charts))]));
    const second = workloads[2]!;
    const response = await fetch(base, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ job: second }), signal: AbortSignal.timeout(10_000),
    });
    expect(response.status).toBe(202);
    const { job } = await response.json() as { job: JobSnapshot };
    expect(await run(["export", job.id, "--db", filename, "--follow", "--poll-ms", "5"])).toMatchObject({
      code: 0, stdout: ndjson([...executeSerial(validateJob(second))]), stderr: "",
    });
    expect(await service.stop()).toMatchObject({ code: 0, signal: null, stdout: "" });
    expect(snapshot(await run(["status", job.id, "--db", filename]))).toMatchObject({ status: "completed" });
  }, 15_000);

  it.each(["SIGTERM", "SIGKILL"] as const)("resumes the committed SQLite prefix after an active worker receives %s", async (signal) => {
    const spec: JobSpec = {
      version: 1, kind: "charts", births: Array.from({ length: 96 }, (_, index) => ({
        id: `synthetic-cli-restart-${index}`,
        birth: { utc: new Date(Date.UTC(2001, 1, 3, 4, 5, index)).toISOString() },
      })),
    };
    const job = snapshot(await run(["submit", "-", "--db", filename], JSON.stringify(spec)));
    const queue = open();
    const first = worker(1_000);
    await first.ready();
    await until(async () => {
      const state = (await queue.getJob(job.id))!;
      return state.status === "running" && state.nextCursor > 0 && state.nextCursor < state.totalTasks;
    });
    const stopped = await first.stop(signal);
    expect(stopped).toMatchObject(signal === "SIGKILL"
      ? { code: null, signal: "SIGKILL", stdout: "" }
      : { code: 0, signal: null, stdout: "" });
    expect(stopped.stderr.trim().split("\n")).toHaveLength(1);
    const before = (await queue.getJob(job.id))!;
    expect(before).toMatchObject({ status: signal === "SIGKILL" ? "running" : "queued", failureCount: 0 });
    expect(before.nextCursor).toBeGreaterThan(0);
    expect(before.nextCursor).toBeLessThan(before.totalTasks);
    const prefix = await run(["export", job.id, "--db", filename]);
    expect(prefix).toMatchObject({ code: 0, stderr: "" });
    const prefixRows = prefix.stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as ResultRow);
    expect(prefixRows.map((row) => row.index)).toEqual(Array.from({ length: before.nextCursor }, (_, index) => index));

    const resumed = worker(1_000);
    await resumed.ready();
    const tail = await run(["export", job.id, "--db", filename, "--cursor", String(before.nextCursor), "--follow", "--poll-ms", "5"]);
    expect(tail).toMatchObject({ code: 0, stderr: "" });
    expect(prefix.stdout + tail.stdout).toBe(ndjson([...executeSerial(validateJob(spec))]));
    expect(snapshot(await run(["status", job.id, "--db", filename]))).toMatchObject({
      status: "completed", nextCursor: spec.births.length, claimCount: 2,
      failureCount: signal === "SIGKILL" ? 1 : 0, lease: null,
    });
    expect(await resumed.stop()).toMatchObject({ code: 0, signal: null, stdout: "" });
  }, 20_000);
});
