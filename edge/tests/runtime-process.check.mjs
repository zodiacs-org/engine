import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { edgeRoot, requireNode22 } from "../scripts/build-support.mjs";
import { runRuntimeProcess } from "../scripts/runtime-process.mjs";

requireNode22();

const runNode = (source, options) => runRuntimeProcess(process.execPath,
  ["--input-type=module", "--eval", source], options);

function failsWith(code) {
  return (error) => {
    assert.equal(error.code, code, error.message);
    assert.equal(typeof error.message, "string");
    assert(error.message.length > 0);
    return true;
  };
}

test("runtime process collects complete stdout, stderr and stdin", async () => {
  const result = await runNode(`
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) input += chunk;
    process.stdout.write("prefix:");
    process.stdout.write(input);
    process.stderr.write("diagnostic");
  `, { input: "synthetic input\n", outputLimit: 128 });
  assert.deepEqual(result, { stdout: "prefix:synthetic input\n", stderr: "diagnostic" });
});

test("runtime process accepts UTF-8 split across pipe writes", async () => {
  const result = await runNode(`
    const bytes = Buffer.from("A\\u20ac\\ud83d\\udd2dZ");
    for (const byte of bytes) {
      process.stdout.write(Buffer.from([byte]));
      await new Promise((done) => setTimeout(done, 5));
    }
    process.stderr.write("\\u03b4");
  `);
  assert.deepEqual(result, { stdout: "A€🔭Z", stderr: "δ" });
});

for (const stream of ["stdout", "stderr"]) {
  test(`runtime process rejects malformed UTF-8 from ${stream}`, async () => {
    await assert.rejects(runNode(`process.${stream}.write(Buffer.from([0xc3, 0x28]));`),
      failsWith("process-error"));
  });
}

test("runtime process reports a missing executable instead of skipping it", async () => {
  await assert.rejects(runRuntimeProcess(
    resolve(edgeRoot, ".generated", "absent-runtime-for-process-check"), []),
  failsWith("missing-runtime"));
});

test("runtime process rejects nonzero exit even after complete protocol output", async () => {
  await assert.rejects(runNode(`
    process.stdout.write('["edge-exact/1",["null"]]\\n');
    process.stderr.write("synthetic process failure");
    process.exitCode = 17;
  `), failsWith("process-error"));
});

test("runtime process rejects termination by signal", { skip: process.platform === "win32" }, async () => {
  await assert.rejects(runNode(`process.kill(process.pid, "SIGTERM");`), failsWith("process-error"));
});

test("runtime process times out a child that never exits", { timeout: 10_000 }, async () => {
  await assert.rejects(runNode("setInterval(() => {}, 1000);", { timeoutMs: 200 }),
    failsWith("timeout"));
});

test("runtime timeout kills descendants that ignore SIGTERM and retain pipes", {
  skip: process.platform === "win32", timeout: 12_000
}, async (t) => {
  await mkdir(resolve(edgeRoot, ".generated"), { recursive: true });
  const directory = await mkdtemp(resolve(edgeRoot, ".generated/process-group-check-"));
  const marker = resolve(directory, "ready.json");
  let rootPid;
  t.after(async () => {
    // Recover the process-group leader even if an assertion failed. The
    // descendant also exits on its own if the test process is interrupted.
    if (rootPid === undefined) {
      try { rootPid = JSON.parse(await readFile(marker, "utf8")).rootPid; } catch {}
    }
    if (rootPid !== undefined) {
      try { process.kill(-rootPid, "SIGKILL"); } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const descendant = `
    process.on("SIGTERM", () => {});
    process.send("ready");
    setTimeout(() => process.exit(0), 8000);
  `;
  const source = `
    import { spawn } from "node:child_process";
    import { writeFileSync } from "node:fs";
    const child = spawn(process.execPath,
      ["--input-type=module", "--eval", ${JSON.stringify(descendant)}],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    child.once("message", () => writeFileSync(${JSON.stringify(marker)},
      JSON.stringify({ rootPid: process.pid, ready: true })));
    setInterval(() => {}, 1000);
  `;
  const start = performance.now();
  await assert.rejects(runNode(source, { timeoutMs: 1000 }), failsWith("timeout"));
  const elapsed = performance.now() - start;
  const ready = JSON.parse(await readFile(marker, "utf8"));
  rootPid = ready.rootPid;
  assert.equal(ready.ready, true, "The descendant must install its signal handler before timeout");
  assert(elapsed < 6000, "The descendant retained pipes until its fallback exit instead of being killed");
});

for (const stream of ["stdout", "stderr"]) {
  test(`runtime process bounds ${stream} floods`, { timeout: 10_000 }, async () => {
    await assert.rejects(runNode(`
      setInterval(() => process.${stream}.write(Buffer.alloc(65536, 120)), 1);
    `, { outputLimit: 1024 }), failsWith("output-limit"));
  });
}

test("runtime process applies one byte budget to stdout and stderr together", async () => {
  const source = 'process.stdout.write("12345"); process.stderr.write("67890");';
  assert.deepEqual(await runNode(source, { outputLimit: 10 }), { stdout: "12345", stderr: "67890" });
  await assert.rejects(runNode(source, { outputLimit: 9 }), failsWith("output-limit"));
});

test("runtime process limits UTF-8 bytes rather than JavaScript characters", async () => {
  assert.deepEqual(await runNode('process.stdout.write("\\u20ac");', { outputLimit: 3 }),
    { stdout: "€", stderr: "" });
  await assert.rejects(runNode('process.stdout.write("\\u20ac");', { outputLimit: 2 }),
    failsWith("output-limit"));
});

test("runtime process rejects an already aborted run", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runNode("process.stdout.write('unexpected');", { signal: controller.signal }),
    failsWith("interrupted"));
});

test("runtime process stops an active child on abort", { timeout: 10_000 }, async () => {
  const controller = new AbortController();
  const aborted = runNode("setInterval(() => {}, 1000);", { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    await assert.rejects(aborted, failsWith("interrupted"));
  } finally {
    clearTimeout(timer);
  }
});
