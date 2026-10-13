import { createWriteStream } from "node:fs";
import { link, lstat, mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import type { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { configureFeed } from "./cli-config.js";
import type { CliArguments } from "./cli-options.js";
import { ScheduleStreamError, streamCalendar, streamSchedule } from "./stream.js";

export const MAX_CONFIG_BYTES = 1_048_576;
export const MAX_FILE_BYTES = 1_999_999;
const generated = fileURLToPath(new URL("../generated/", import.meta.url));

interface CliIo {
  readonly stdin?: Readable;
  readonly stdout?: Writable;
  readonly stderr?: Writable;
  readonly signal?: AbortSignal;
}

async function readConfiguration(filename: string, stdin: Readable, signal?: AbortSignal): Promise<unknown> {
  let input: Readable;
  if (filename === "-") input = stdin;
  else {
    try {
      const file = await open(filename, "r");
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error("Invalid input file.");
        input = file.createReadStream();
      } catch (error) { await file.close(); throw error; }
    } catch { throw new Error("Cannot read configuration: use a regular file within the input size limit."); }
  }
  const cancel = () => input.destroy(new Error("Configuration read cancelled."));
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      bytes += buffer.length;
      if (bytes > MAX_CONFIG_BYTES) throw new Error("Configuration exceeds the input size limit.");
      chunks.push(buffer);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new Error("Configuration must be valid UTF-8 JSON."); }
  } finally { signal?.removeEventListener("abort", cancel); input.destroy(); }
}

/** Restrict all filesystem mutations to the private generated directory. */
function outputTarget(filename: string): string {
  const target = path.resolve(filename);
  if (path.dirname(target) !== path.resolve(generated) || !path.basename(target).endsWith(".ics")) {
    throw new RangeError("--output must name a new .ics file directly inside calendar/generated/.");
  }
  return target;
}

async function missing(target: string): Promise<boolean> {
  try { await lstat(target); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
}

/** CLI transport around the existing schedule and wire-format streams. */
export async function runCli(args: CliArguments, io: CliIo = {}): Promise<number> {
  const stdin = io.stdin ?? process.stdin, stdout = io.stdout ?? process.stdout, stderr = io.stderr ?? process.stderr;
  let staging: string | undefined;
  try {
    const target = args.output !== undefined && args.output !== "-" ? outputTarget(args.output) : undefined;
    const value = await readConfiguration(args.config!, stdin, io.signal);
    const { request, options } = configureFeed(value, args);
    io.signal?.throwIfAborted();
    const chunks = streamCalendar(streamSchedule({ ...request,
      ...(io.signal === undefined ? {} : { signal: io.signal }) }), { ...options,
      ...(io.signal === undefined ? {} : { signal: io.signal }) });
    const source = Readable.from(chunks, { objectMode: false, highWaterMark: 1 });
    const pipeOptions = io.signal === undefined ? {} : { signal: io.signal };
    if (target === undefined) await pipeline(source, stdout, { ...pipeOptions, end: false });
    else {
      await mkdir(generated, { recursive: true });
      const stat = await lstat(generated);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RangeError("Output directory must be a real directory.");
      if (!await missing(target)) throw new RangeError("Output already exists; choose a new filename.");
      staging = await mkdtemp(path.join(generated, `.feed-${path.basename(target)}-`));
      const temporary = path.join(staging, "feed.ics");
      let bytes = 0;
      const limit = new Transform({ transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        if (bytes > MAX_FILE_BYTES) done(new RangeError("File output exceeds the size limit; no file was published."));
        else done(null, chunk);
      } });
      await pipeline(source, limit, createWriteStream(temporary, { flags: "wx", mode: 0o600 }), pipeOptions);
      io.signal?.throwIfAborted();
      // Exclusive, atomic publication on the same filesystem. Never replace a file.
      await link(temporary, target);
    }
    return 0;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "EPIPE") { stderr.write("calendar: Output pipe closed before the feed completed.\n"); return 141; }
    if (io.signal?.aborted) { stderr.write("calendar: Export cancelled.\n"); return 130; }
    if (error instanceof ScheduleStreamError) {
      stderr.write(`calendar: Search refused (${error.reason}); ${error.emitted} events emitted; ` +
        `${error.evaluations} evaluations; window ${error.window.startUtc} to ${error.window.endUtc}` +
        (error.selectionIndex === undefined ? ".\n" : `; selection ${error.selectionIndex}.\n`));
      return 2;
    }
    if (error instanceof RangeError && error.message === "A calendar requires at least one event.") {
      stderr.write("calendar: No events in the selected range; no complete calendar was produced.\n"); return 2;
    }
    const message = code ? "Filesystem or output failure." : error instanceof Error ? error.message : "Unexpected failure.";
    stderr.write(`calendar: ${message}\n`);
    return 1;
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true });
  }
}
