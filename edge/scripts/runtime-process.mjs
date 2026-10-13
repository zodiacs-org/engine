import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { edgeRoot } from "./build-support.mjs";

export function runtimeEnvironment() {
  // Do not inherit credentials, preload hooks, proxies or runtime flags.
  return {
    PATH: process.env.PATH ?? "",
    LANG: "C.UTF-8", TZ: "UTC", NO_COLOR: "1",
    DENO_DIR: resolve(edgeRoot, ".cache/deno"),
    DENO_NO_UPDATE_CHECK: "1",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: resolve(edgeRoot, ".cache/bun-transpiler")
  };
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function runRuntimeProcess(executable, args, {
  input = "", timeoutMs = 30_000, outputLimit = 1_999_999, signal
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0
    || !Number.isSafeInteger(outputLimit) || outputLimit <= 0 || outputLimit >= 2_000_000) {
    throw new TypeError("Invalid runtime process limits.");
  }
  if (signal?.aborted) throw failure("interrupted", "Runtime process interrupted.");
  const env = runtimeEnvironment();
  await mkdir(env.DENO_DIR, { recursive: true });
  await mkdir(env.BUN_RUNTIME_TRANSPILER_CACHE_PATH, { recursive: true });
  return new Promise((fulfill, reject) => {
    // npm runtime commands can be wrappers. On POSIX terminate the entire
    // process group, including descendants that keep the output pipes open.
    const detached = process.platform !== "win32";
    const child = spawn(executable, args, {
      cwd: edgeRoot, env, stdio: ["pipe", "pipe", "pipe"], detached
    });
    const stdout = [], stderr = [];
    let byteCount = 0, problem, killTimer;
    const terminate = (name) => {
      if (!child.pid) return;
      try {
        if (detached) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== "ESRCH") problem ??= failure("process-error", error.message);
      }
    };
    const fail = (error) => {
      problem ??= error;
      if (!killTimer) {
        terminate("SIGTERM");
        killTimer = setTimeout(() => terminate("SIGKILL"), 250);
      }
    };
    const timer = setTimeout(() => fail(failure("timeout", `Runtime process exceeded ${timeoutMs} ms.`)), timeoutMs);
    const onAbort = () => fail(failure("interrupted", "Runtime process interrupted."));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const collect = (chunks, chunk) => {
      byteCount += chunk.byteLength;
      if (byteCount > outputLimit) fail(failure("output-limit", "Runtime process exceeded its output byte limit."));
      else chunks.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.once("error", (error) => {
      problem ??= failure(error.code === "ENOENT" ? "missing-runtime" : "process-error", error.message);
    });
    child.stdin.on("error", (error) => {
      // Early exit is diagnosed through its exit status or invalid output.
      if (error.code !== "EPIPE") fail(failure("process-error", `Runtime input failed: ${error.message}`));
    });
    child.once("close", (code, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      if (problem) return reject(problem);
      let output;
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
        output = { stdout: decoder.decode(Buffer.concat(stdout)), stderr: decoder.decode(Buffer.concat(stderr)) };
      } catch {
        return reject(failure("process-error", "Runtime emitted invalid UTF-8."));
      }
      if (code !== 0) return reject(failure("process-error",
        `Runtime process exited with ${code ?? exitSignal}. ${output.stderr.slice(0, 2000)}`));
      fulfill(output);
    });
    child.stdin.end(input);
  });
}
