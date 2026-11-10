import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { starCatalogue } from "./catalogue.js";
import { JsonSerializationError, JSON_LIMITS, serializeJson } from "./json.js";
import { searchWindow } from "./window.js";
import type { WindowRequest } from "./window.js";

export const CLI_LIMITS = Object.freeze({ inputBytes: 65_536, outputBytes: JSON_LIMITS.maxBytes });

export interface CliReply {
  readonly exitCode: 0 | 1 | 2;
  /** Exactly one bounded JSON value and a terminating newline. */
  readonly stdout: string;
}

type Command = "help" | "catalogue" | "window";
type InputFailure = "input-too-large" | "invalid-utf8" | "input-read-failed";
class InputError extends Error {
  constructor(readonly code: InputFailure) { super(code); }
}

function receipt(command: Command | null) {
  return {
    schema: "zodiacs.occultations.cli-receipt.v1", implementation: "offline-json-cli/1", version: 1,
    command, limits: { ...CLI_LIMITS, outputDepth: JSON_LIMITS.maxDepth, outputNodes: JSON_LIMITS.maxNodes },
    serialization: "stable-UTF16-key-order;compact-UTF8;negative-zero-as-zero",
    execution: "offline;stdin-only;no-file-or-network-input"
  } as const;
}

function reply(value: unknown, exitCode: CliReply["exitCode"], command: Command | null,
  window: { readonly from: string; readonly to: string } | null = null): CliReply {
  try { return { exitCode, stdout: serializeJson(value, { maxBytes: CLI_LIMITS.outputBytes - 1 }) + "\n" }; }
  catch (error) {
    const bounded = error instanceof JsonSerializationError &&
      ["byte-limit", "depth-limit", "node-limit"].includes(error.code);
    return {
      exitCode: bounded ? 2 : 1,
      stdout: serializeJson({
        status: bounded ? "refused" : "error", reason: bounded ? "output-budget" : "output-invalid",
        results: [], window, receipt: receipt(command)
      }) + "\n"
    };
  }
}

function invalid(code: string, command: Command | null): CliReply {
  return reply({ status: "error", error: { code }, receipt: receipt(command) }, 1, command);
}

async function readInput(input: AsyncIterable<Uint8Array | string>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for await (const chunk of input) {
      const size = typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
      bytes += size;
      if (bytes > CLI_LIMITS.inputBytes) throw new InputError("input-too-large");
      if (size > 0) chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("input-read-failed");
  }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, bytes)); }
  catch { throw new InputError("invalid-utf8"); }
}

/** No process mutation on import. The generated launcher owns stdin and stdout. */
export async function runCli(args: readonly string[], input: AsyncIterable<Uint8Array | string>): Promise<CliReply> {
  const arg = args[0];
  const command: Command | null = args.length === 0 ? "help" : args.length === 1 &&
    ["help", "--help", "-h"].includes(arg!) ? "help" : args.length === 1 &&
    (arg === "window" || arg === "catalogue") ? arg : null;
  if (!command) return invalid("invalid-arguments", null);
  if (command === "help") return reply({ status: "ok", commands: {
    window: "Read one window request JSON object from stdin and describe sky events.",
    catalogue: "List the bundled SAO stars and their source receipt.",
    help: "Show these commands. No command also shows help."
  }, usage: "node occultations/.generated/cli.mjs <window|catalogue|help>",
  exitCodes: { complete: 0, invalidInput: 1, refused: 2 },
  receipt: receipt(command) }, 0, command);
  if (command === "catalogue") {
    try { return reply({ status: "ok", result: starCatalogue(), receipt: receipt(command) }, 0, command); }
    catch { return invalid("calculation-failed", command); }
  }
  let text: string;
  try { text = await readInput(input); }
  catch (error) { return invalid(error instanceof InputError ? error.code : "input-read-failed", command); }
  let request: unknown;
  try { request = JSON.parse(text) as unknown; }
  catch { return invalid("invalid-json", command); }
  try {
    const result = searchWindow(request as WindowRequest);
    return reply({ status: result.status, result, receipt: receipt(command) }, result.status === "complete" ? 0 : 2,
      command, result.receipt.request.window);
  } catch (error) {
    return invalid(error instanceof RangeError ? "invalid-request" : "calculation-failed", command);
  }
}
