import { constants } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { CLI_HELP, CliError, parseCliOptions } from "./cli-options.js";
import type { CliOptions } from "./cli-options.js";
import { createControlServer } from "./http-control.js";
import type { ControlServer } from "./http-control.js";
import { MemoryQueue } from "./memory-queue.js";
import { DEFAULT_LIMITS } from "./model.js";
import { QueueError } from "./queue.js";
import type { QueueBackend } from "./queue.js";
import { createResultStream, ResultStreamError } from "./result-stream.js";
import { Scheduler, SchedulerError } from "./scheduler.js";
import { SqliteQueue } from "./sqlite-queue.js";
import { JobValidationError, parseJobJson } from "./validation.js";

const notFound = (): CliError => new CliError("not-found", "The requested job does not exist.", 3);
const interrupted = (): CliError => new CliError("interrupted", "The command was interrupted.");

function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw interrupted(); }

function isInterruption(error: unknown): boolean {
  return (error instanceof CliError && error.code === "interrupted")
    || (error instanceof ResultStreamError && error.code === "aborted")
    || (error instanceof Error && error.name === "AbortError");
}

/** Await actual writes so a pipe failure cannot become successful completion. */
function write(stream: Writable, text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveWrite, reject) => {
    const aborted = (): void => { done(interrupted()); };
    const done = (error?: Error | null): void => {
      signal?.removeEventListener("abort", aborted);
      if (error) reject(error); else resolveWrite();
    };
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    stream.write(text, done);
  });
}

async function readInput(filename: string, signal: AbortSignal): Promise<string> {
  checkAbort(signal);
  // Nonblocking open plus a regular-file check avoids hanging on a named pipe.
  // Streaming stdin is explicit through '-'. A growing file is still byte-bound.
  const file = filename === "-" ? undefined : await open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
  let input: Readable | undefined;
  const abort = (): void => { input?.destroy(interrupted()); };
  try {
    if (file && !(await file.stat()).isFile()) throw new CliError("input-failed", "Input must be a regular file or stdin.");
    checkAbort(signal);
    input = file ? file.createReadStream() : process.stdin;
    signal.addEventListener("abort", abort, { once: true });
    const buffer = Buffer.alloc(DEFAULT_LIMITS.maxInputBytes);
    let length = 0;
    for await (const raw of input) {
      const chunk = raw as Buffer;
      if (chunk.length > buffer.length - length) throw new CliError("limit-exceeded", "The job input exceeds its byte limit.", 2);
      buffer.set(chunk, length);
      length += chunk.length;
    }
    checkAbort(signal);
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)); }
    catch { throw new CliError("invalid-json", "Input must contain valid UTF-8 JSON.", 2); }
  } finally {
    signal.removeEventListener("abort", abort);
    input?.destroy();
    await file?.close();
  }
}

async function openQueue(options: CliOptions): Promise<QueueBackend> {
  if (options.memory) return new MemoryQueue();
  const filename = options.db === undefined
    ? fileURLToPath(new URL("../.runtime/queue.sqlite", import.meta.url)) : resolve(options.db);
  if (options.command === "status" || options.command === "export") {
    // A typo in a read command must not silently create another database.
    try { await stat(filename); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound();
      throw error;
    }
  } else {
    await mkdir(dirname(filename), { recursive: true });
  }
  return new SqliteQueue(filename);
}

async function service(queue: QueueBackend, options: CliOptions, signal: AbortSignal): Promise<void> {
  let control: ControlServer | undefined;
  let scheduler: Scheduler | undefined;
  let failure: unknown;
  let failed = false;
  let wake!: () => void;
  const stopped = new Promise<void>(resolveStop => { wake = resolveStop; });
  signal.addEventListener("abort", wake, { once: true });
  if (signal.aborted) wake();
  try {
    checkAbort(signal);
    let address: { host: string; port: number } | undefined;
    let serverFailed: Promise<CliError> = new Promise(() => {});
    if (options.command === "serve") {
      control = createControlServer(queue);
      const server = control.server;
      serverFailed = new Promise(resolveFailure => {
        // Kept for the full listener lifetime, including shutdown.
        server.on("error", () => resolveFailure(new CliError("listen-failed", "The HTTP listener failed.")));
      });
      const listening = new Promise<void>(resolveListen => { server.once("listening", resolveListen); });
      // An IP literal avoids a pending DNS lookup outliving startup cleanup.
      server.listen({ host: options.host, port: options.port, signal });
      const started = await Promise.race([listening, stopped, serverFailed]);
      if (started instanceof CliError) throw started;
      checkAbort(signal);
      const bound = server.address();
      if (!bound || typeof bound === "string") throw new CliError("listen-failed", "The HTTP listener failed.");
      address = { host: bound.address, port: bound.port };
    }
    checkAbort(signal);
    scheduler = new Scheduler(queue, {
      ...(options.workers !== undefined ? { workers: options.workers } : {}),
      ...(options.leaseMs !== undefined ? { leaseMs: options.leaseMs } : {}),
      ...(options.pollMs !== undefined ? { pollMs: options.pollMs } : {}),
    });
    // Observe a failed first claim immediately, including while readiness writes.
    const running = scheduler.run().then(() => ({ ok: true } as const), error => ({ error }));
    await write(process.stderr, JSON.stringify({ event: "ready", command: options.command, ...address }) + "\n", signal);
    const ended = await Promise.race([running, stopped, serverFailed]);
    if (ended instanceof CliError) throw ended;
    if (ended && "error" in ended) throw ended.error;
  } catch (error) {
    failure = error; failed = true;
  } finally {
    signal.removeEventListener("abort", wake);
    // Each owner is closed even when an earlier cleanup fails.
    for (const close of [() => control?.close(), () => scheduler?.stop()]) {
      try { await close(); } catch (error) {
        if (!failed || isInterruption(failure)) { failure = error; failed = true; }
      }
    }
  }
  if (failed) throw failure;
}

function diagnostic(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof JobValidationError) return new CliError(error.code, error.message, 2);
  if (error instanceof QueueError) return new CliError(error.code, error.message,
    error.code === "invalid-argument" ? 2 : error.code === "idempotency-conflict" ? 4 : 1);
  if (error instanceof ResultStreamError) return error.code === "not-found" ? notFound() : new CliError(error.code, error.message);
  if (error instanceof SchedulerError) return new CliError(error.code, error.message);
  if ((error as NodeJS.ErrnoException | null)?.code === "EPIPE") return new CliError("output-failed", "The output stream closed before completion.");
  return new CliError("operation-failed", "The command operation failed.");
}

async function main(): Promise<number> {
  const controller = new AbortController();
  let receivedSignal: "SIGINT" | "SIGTERM" | undefined;
  let outputError: unknown;
  const interrupt = (signal: "SIGINT" | "SIGTERM"): void => { receivedSignal ??= signal; controller.abort(); };
  const onInt = (): void => interrupt("SIGINT");
  const onTerm = (): void => interrupt("SIGTERM");
  const onOutputError = (error: Error): void => {
    // pipeline forwards source cancellation into stdout; it is not a broken pipe.
    if (receivedSignal && isInterruption(error)) return;
    outputError ??= error; controller.abort();
  };
  // Keep stream error handlers installed until process exit; write callbacks may
  // fail before their matching error event reaches the event loop.
  process.stdout.on("error", onOutputError);
  process.stderr.on("error", onOutputError);
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  let options: CliOptions | undefined;
  let queue: QueueBackend | undefined;
  let failure: unknown;
  let failed = false;
  try {
    options = parseCliOptions(process.argv.slice(2));
    if (options.command === "help") {
      await write(process.stdout, CLI_HELP, controller.signal);
    } else {
      // Reject malformed input before creating or migrating any queue file.
      const job = options.command === "submit" ? parseJobJson(await readInput(options.argument!, controller.signal)) : undefined;
      checkAbort(controller.signal);
      queue = await openQueue(options);
      checkAbort(controller.signal);
      switch (options.command) {
        case "submit":
          await write(process.stdout, JSON.stringify({ job: await queue.submit(job!.spec, options.submit) }) + "\n", controller.signal);
          break;
        case "status": {
          const snapshot = await queue.getJob(options.argument!);
          if (!snapshot) throw notFound();
          await write(process.stdout, JSON.stringify({ job: snapshot }) + "\n", controller.signal);
          break;
        }
        case "export":
          await pipeline(createResultStream(queue, options.argument!, {
            cursor: options.cursor, follow: options.follow, signal: controller.signal,
            ...(options.pollMs !== undefined ? { pollMs: options.pollMs } : {}),
          }), process.stdout, { signal: controller.signal });
          break;
        case "worker": case "serve":
          await service(queue, options, controller.signal);
          break;
      }
    }
  } catch (error) { failure = error; failed = true; }
  finally {
    try { await queue?.close(); } catch (error) {
      if (!failed || isInterruption(failure)) { failure = error; failed = true; }
    }
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  if (outputError !== undefined) { failure = diagnostic(outputError); failed = true; }
  if (receivedSignal && outputError === undefined) {
    const daemon = options?.command === "worker" || options?.command === "serve";
    // A real storage or shutdown failure remains a failure even on a signal.
    if (!failed || isInterruption(failure)) {
      if (daemon) return 0;
      failure = interrupted(); failed = true;
      const error = diagnostic(failure);
      try { await write(process.stderr, JSON.stringify({ error: { code: error.code, message: error.message } }) + "\n"); } catch { /* No writable diagnostics. */ }
      return receivedSignal === "SIGINT" ? 130 : 143;
    }
  }
  if (failed) {
    const error = diagnostic(failure);
    try { await write(process.stderr, JSON.stringify({ error: { code: error.code, message: error.message } }) + "\n"); } catch { /* No writable diagnostics. */ }
    return error.exitCode;
  }
  return 0;
}

process.exitCode = await main();
