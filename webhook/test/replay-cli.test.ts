import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseReplayCommand, ReplayCliError, runReplayCli } from "../src/replay-cli.js";
import { claimed, deliveryFixture, EVENT, NOW, POLICY } from "./delivery-fixture.js";

const project = fileURLToPath(new URL("../", import.meta.url));
let buildDirectory: string;
let executable: string;
let fixture: ReturnType<typeof deliveryFixture>;
beforeAll(() => {
  mkdirSync(join(project, ".cache"), { recursive: true });
  buildDirectory = mkdtempSync(join(project, ".cache/replay-cli-build-"));
  // Exercise the real compiler configuration and standalone Node command, not just its library seam.
  execFileSync(process.execPath, [join(project, "node_modules/typescript/bin/tsc"),
    "-p", "tsconfig.replay.json", "--outDir", buildDirectory], { cwd: project, timeout: 30_000 });
  executable = join(buildDirectory, "webhook/src/replay-cli.js");
}, 35_000);
afterAll(() => { if (buildDirectory) rmSync(buildDirectory, { recursive: true, force: true }); });
beforeEach(() => { fixture = deliveryFixture(); });
afterEach(() => fixture.cleanup());

function seed() {
  fixture.enqueue([EVENT, { ...EVENT, id: "z-other-event", occurrenceKey: "other-occurrence", idempotencyKey: "other-key" }]);
  for (const eventId of [EVENT.id, "z-other-event"]) {
    fixture.store.recordAttempt({ eventId, number: 1, startedAt: NOW + 100, finishedAt: NOW + 101,
      result: { kind: "timeout" } }, { status: "dead-letter", reason: "operator" });
  }
}
function args(requestId = "replay-one") {
  return ["requeue", "--db", fixture.path, "--event", EVENT.id, "--attempt", "1", "--request", requestId];
}
function child(argv: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const processChild = spawn(process.execPath, ["--no-warnings", executable, ...argv],
      { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    processChild.stdout.on("data", data => { stdout += String(data); });
    processChild.stderr.on("data", data => { stderr += String(data); });
    processChild.on("error", reject);
    processChild.on("close", code => resolve({ code, stdout, stderr }));
  });
}

describe("strict replay command selection", () => {
  it("documents commands and defaults requeue to preview", () => {
    expect(parseReplayCommand(["help"])).toEqual({ kind: "help" });
    expect(parseReplayCommand(["--help"])).toEqual({ kind: "help" });
    expect(parseReplayCommand(args())).toMatchObject({ kind: "requeue", apply: false, eventId: EVENT.id, expectedAttemptNumber: 1 });
    expect(parseReplayCommand([...args(), "--dry-run"])).toMatchObject({ apply: false });
    expect(parseReplayCommand([...args(), "--apply"])).toMatchObject({ apply: true });
    expect(parseReplayCommand(["list", "--db", fixture.path, "--after", EVENT.id, "--limit", "1000"]))
      .toMatchObject({ kind: "list", afterId: EVENT.id, limit: 1000 });
    expect(parseReplayCommand(["history", "--db", fixture.path, "--event", EVENT.id, "--after", "request-one"]))
      .toMatchObject({ kind: "history", afterId: "request-one" });
    expect(parseReplayCommand(["list", "--db", "x".repeat(4096)])).toMatchObject({ kind: "list" });
  });

  it("rejects unknown, duplicate, missing and contradictory options without echoing their values", () => {
    for (const argv of [[], ["unknown"], ["list"], ["list", "--db"], ["help", "--db", fixture.path],
      ["list", "--db", fixture.path, "--all"], ["inspect", "--db", fixture.path],
      [...args(), "--event", "other"], [...args(), "--apply", "--dry-run"], [...args(), "--apply", "--apply"],
      [...args(), "--secret", "private-marker"], [...args(), "extra"], ["list", "--db", "bad\0path"],
      ["list", "--db", "x".repeat(4097)], ["list", "--db", fixture.path, "--after", "x".repeat(8193)]]) {
      expect(() => parseReplayCommand(argv)).toThrowError(new ReplayCliError());
      const result = runReplayCli(argv);
      expect(result).toEqual({ exitCode: 2, stdout: "", stderr: '{"error":{"code":"invalid-command"}}\n' });
    }
  });

  it("rejects loose integers and invalid identifiers at the exact selection boundary", () => {
    for (const value of ["0", "-1", "+1", "1.5", "1e2", "0x1", "01", "Infinity", "9007199254740992"]) {
      const invalid = args(); invalid[invalid.indexOf("--attempt") + 1] = value;
      expect(() => parseReplayCommand(invalid)).toThrow(ReplayCliError);
    }
    for (const value of ["0", "1001", "1.1"]) {
      expect(() => parseReplayCommand(["list", "--db", fixture.path, "--limit", value])).toThrow(ReplayCliError);
    }
    for (const value of ["bad id", "../event", "https://receiver.example", "x".repeat(257)]) {
      const invalid = args(); invalid[invalid.indexOf("--request") + 1] = value;
      expect(() => parseReplayCommand(invalid)).toThrow(ReplayCliError);
    }
  });
});

describe("local replay CLI", () => {
  it("lists selected dead letters, inspects fixed metadata and paginates without exposing payload or keys", async () => {
    seed();
    const first = await child(["list", "--db", fixture.path, "--limit", "1"]);
    expect(first.code).toBe(0); expect(first.stderr).toBe("");
    expect(JSON.parse(first.stdout)).toEqual({ items: [fixture.store.getDeadLetter(EVENT.id)], nextAfter: EVENT.id });
    const second = runReplayCli(["list", "--db", fixture.path, "--limit", "1", "--after", EVENT.id]);
    expect(JSON.parse(second.stdout).items).toEqual([fixture.store.getDeadLetter("z-other-event")]);
    const end = runReplayCli(["list", "--db", fixture.path, "--after", "z-other-event"]);
    expect(JSON.parse(end.stdout)).toEqual({ items: [], nextAfter: null });
    const inspected = runReplayCli(["inspect", "--db", fixture.path, "--event", EVENT.id]);
    expect(JSON.parse(inspected.stdout)).toEqual({ delivery: fixture.store.getDeliveryLog(EVENT.id), deadLetter: fixture.store.getDeadLetter(EVENT.id) });
    for (const forbidden of [EVENT.payload, EVENT.idempotencyKey, EVENT.occurrenceKey, fixture.spec.callbackUrl,
      fixture.spec.secretRef, "payloadSha256", "token", fixture.path]) {
      expect(first.stdout + inspected.stdout).not.toContain(forbidden);
    }
    expect(runReplayCli(["inspect", "--db", fixture.path, "--event", "missing"]).exitCode).toBe(3);
    expect(runReplayCli(["history", "--db", fixture.path, "--event", "missing"]).exitCode).toBe(3);
  });

  it("performs default and explicit dry runs without writes, then applies only the exact selected event", async () => {
    seed(); const saved = fixture.store.getEvent(EVENT.id); const before = fixture.store.getDelivery(EVENT.id);
    const bytes = readFileSync(fixture.path);
    for (const argv of [args(), [...args(), "--dry-run"]]) {
      const preview = await child(argv);
      expect(preview.code).toBe(0);
      expect(JSON.parse(preview.stdout)).toMatchObject({ mode: "dry-run", repeated: false, replay: { eventId: EVENT.id, attemptNumber: 1 } });
      expect(fixture.store.getDelivery(EVENT.id)).toEqual(before);
      expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
      expect(readFileSync(fixture.path)).toEqual(bytes);
    }
    const applied = await child([...args(), "--apply"]);
    expect(applied.code).toBe(0); expect(applied.stderr).toBe("");
    expect(JSON.parse(applied.stdout)).toMatchObject({ mode: "applied", repeated: false });
    expect(fixture.store.getDelivery(EVENT.id)).toMatchObject({ status: "pending", attemptCount: 1 });
    expect(fixture.store.getDelivery("z-other-event")?.status).toBe("dead-letter");
    expect(fixture.store.getEvent(EVENT.id)).toEqual(saved);
    expect(fixture.store.listAttempts(EVENT.id)).toHaveLength(1);
    const inspected = runReplayCli(["inspect", "--db", fixture.path, "--event", EVENT.id]);
    expect(JSON.parse(inspected.stdout)).toMatchObject({ deadLetter: null, delivery: { status: "pending" } });
  });

  it("deduplicates concurrent actual CLI requests and retains a request audit after later failure", async () => {
    seed();
    const applied = await Promise.all([child([...args(), "--apply"]), child([...args(), "--apply"])]);
    expect(applied.map(result => result.code)).toEqual([0, 0]);
    expect(applied.map(result => JSON.parse(result.stdout).repeated).sort()).toEqual([false, true]);
    expect(fixture.store.listReplays(EVENT.id)).toHaveLength(1);
    const saved = fixture.store.listReplays(EVENT.id)[0]!;
    const claim = claimed(fixture.store.claimDelivery(saved.requeuedAt, { ...POLICY, maxAttempts: 1 }));
    fixture.store.finishDelivery(EVENT.id, claim.lease.token, { kind: "timeout" }, saved.requeuedAt);
    const repeated = await child([...args(), "--apply"]);
    expect(JSON.parse(repeated.stdout)).toEqual({ mode: "applied", repeated: true, replay: saved });
    expect(fixture.store.getDelivery(EVENT.id)?.status).toBe("dead-letter");
    const stale = await child([...args("new-request"), "--apply"]);
    expect(stale).toEqual({ code: 4, stdout: "", stderr: '{"error":{"code":"replay-conflict"}}\n' });
    const history = await child(["history", "--db", fixture.path, "--event", EVENT.id, "--limit", "1"]);
    expect(JSON.parse(history.stdout)).toEqual({ items: [saved], nextAfter: saved.requestId });
    expect(JSON.parse(runReplayCli(["history", "--db", fixture.path, "--event", EVENT.id, "--after", saved.requestId]).stdout))
      .toEqual({ items: [], nextAfter: null });
  });

  it("redacts arbitrary failures, refuses missing or non-regular databases and never creates a typo path", async () => {
    const directory = dirname(fixture.path);
    const missing = join(directory, "private-marker.sqlite");
    const corrupt = join(directory, "corrupt.sqlite"); writeFileSync(corrupt, "private-content");
    const symlink = join(directory, "linked.sqlite"); symlinkSync(fixture.path, symlink);
    for (const database of [missing, corrupt, directory, symlink]) {
      const result = await child(["list", "--db", database]);
      expect(result).toEqual({ code: 1, stdout: "", stderr: '{"error":{"code":"service-unavailable"}}\n' });
    }
    expect(existsSync(missing)).toBe(false);
    const result = runReplayCli(args(), () => { throw new Error("private-marker"); });
    expect(result.stderr).not.toContain("private-marker");
    expect((await child(["--help"])).code).toBe(0);
    expect((await child(["requeue", "--db", missing])).code).toBe(2);
  });
});
