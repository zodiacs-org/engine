import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebhookStore } from "../src/storage.js";
import { SigningKeyVault } from "../src/secrets.js";

const project = fileURLToPath(new URL("../", import.meta.url));
let buildDirectory: string, stateDirectory: string, executable: string;
const children: ReturnType<typeof spawn>[] = [];
beforeAll(() => {
  mkdirSync(join(project, ".cache"), { recursive: true });
  buildDirectory = mkdtempSync(join(project, ".cache/service-cli-build-"));
  stateDirectory = mkdtempSync(join(project, ".cache/service-cli-state-"));
  execFileSync(process.execPath, [join(project, "node_modules/typescript/bin/tsc"),
    "-p", "tsconfig.service.json", "--outDir", buildDirectory], { cwd: project, timeout: 30_000 });
  executable = join(buildDirectory, "webhook/src/service-cli.js");
}, 35_000);
afterEach(async () => {
  await Promise.all(children.splice(0).map(child => new Promise<void>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once("close", () => resolve()); child.kill("SIGKILL");
  })));
});
afterAll(() => {
  if (buildDirectory) rmSync(buildDirectory, { recursive: true, force: true });
  if (stateDirectory) rmSync(stateDirectory, { recursive: true, force: true });
});
function child(args: string[], environment: NodeJS.ProcessEnv = {}) {
  const processChild = spawn(process.execPath, ["--no-warnings", executable, ...args], {
    cwd: project, env: { PATH: process.env.PATH, ...environment }, stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(processChild);
  let stdout = "", stderr = "";
  let readyResolve!: () => void;
  const ready = new Promise<void>(resolve => { readyResolve = resolve; });
  processChild.stdout!.on("data", data => { stdout += String(data); if (stdout.includes('"status":"ready"')) readyResolve(); });
  processChild.stderr!.on("data", data => { stderr += String(data); });
  const exited = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const timer = setTimeout(() => { processChild.kill("SIGKILL"); reject(new Error("Local CLI did not settle.")); }, 10_000);
    processChild.once("error", error => { clearTimeout(timer); reject(error); });
    processChild.once("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  const started = Promise.race([ready, exited.then(result => { throw new Error(`Service exited before ready: ${result.stderr}`); })]);
  // Short commands intentionally never reach ready.
  void started.catch(() => undefined);
  return { processChild, started, exited };
}
function environment(subdirectory: string) {
  const wrappingKey = randomBytes(32), adminToken = randomBytes(32);
  return { wrappingKey, adminToken, value: {
    WEBHOOK_ADMIN_TOKEN: adminToken.toString("base64url"), WEBHOOK_WRAPPING_KEY: wrappingKey.toString("base64url"),
    // The test's custom outDir places the executable's project root in .cache/.
    WEBHOOK_SETTINGS: JSON.stringify({ stateDirectory: join(stateDirectory.slice(dirname(stateDirectory).length + 1), subdirectory), port: 0, pollIntervalMs: 10 }),
  } };
}

describe("compiled service command", () => {
  it("runs the documented offline example with verified retry and one receiver effect", () => {
    const output = execFileSync(process.execPath, ["--no-warnings",
      join(buildDirectory, "webhook/examples/offline-demo.js")], {
      cwd: project, env: { PATH: process.env.PATH }, timeout: 15_000, encoding: "utf8",
    });
    expect(JSON.parse(output)).toEqual({ status: "delivered", verifiedRequests: 2, receiverEffects: 1 });
    expect(output).toBe('{"status":"delivered","verifiedRequests":2,"receiverEffects":1}\n');
  }, 20_000);
  it("prints help and refuses command/configuration/credential errors without echoing input", async () => {
    expect((await child(["--help"]).exited).code).toBe(0);
    expect(await child(["--secret", "private-marker"]).exited).toMatchObject({ code: 2, stderr: '{"error":{"code":"invalid-command"}}\n' });
    expect(await child([], { WEBHOOK_SETTINGS: '{"host":"0.0.0.0"}' }).exited).toMatchObject({ code: 2, stderr: '{"error":{"code":"invalid-config"}}\n' });
    expect(await child([], { WEBHOOK_ADMIN_TOKEN: "private-marker" }).exited).toMatchObject({ code: 2, stderr: '{"error":{"code":"invalid-credentials"}}\n' });
  });
  it.each(["SIGINT", "SIGTERM"] as const)("starts offline, handles %s and reopens persistent custody", async signal => {
    const env = environment(signal);
    try {
      const running = child([], env.value);
      await running.started;
      running.processChild.kill(signal);
      const result = await running.exited;
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('"status":"ready"');
      expect(result.stdout).toContain('"status":"stopped"');
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain(env.value.WEBHOOK_ADMIN_TOKEN);
      const path = join(stateDirectory, signal);
      const store = new WebhookStore(join(path, "service.sqlite"));
      const vault = new SigningKeyVault(join(path, "signing.sqlite"), env.wrappingKey);
      try { expect(store.listSubscriptions()).toEqual([]); expect(vault.inspect("runtime_key")).toBeUndefined(); }
      finally { vault.close(); store.close(); }
      const restarted = child([], env.value); await restarted.started;
      restarted.processChild.kill(signal); expect((await restarted.exited).code).toBe(0);
      expect(existsSync(join(project, "dist"))).toBe(false);
    } finally { env.adminToken.fill(0); env.wrappingKey.fill(0); }
  });
  it("opens service and vault databases concurrently from independent processes", async () => {
    const env = environment("concurrent");
    try {
      const group = Array.from({ length: 6 }, () => child([], env.value));
      await Promise.all(group.map(item => item.started));
      group.forEach(item => item.processChild.kill("SIGTERM"));
      const results = await Promise.all(group.map(item => item.exited));
      expect(results.every(result => result.code === 0 && result.stderr === "")).toBe(true);
      const store = new WebhookStore(join(stateDirectory, "concurrent/service.sqlite"));
      try { expect(store.listSubscriptions()).toEqual([]); } finally { store.close(); }
    } finally { env.adminToken.fill(0); env.wrappingKey.fill(0); }
  });
});
