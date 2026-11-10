import { createReadStream } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { TextDecoder } from "node:util";
import { NatalEnvelopeError } from "@zodiacs/engine/receipt";
import { AngularBudgetError } from "./angles.js";
import { GreatCircleBudgetError } from "./great-circle.js";
import { GridBudgetError } from "./grid.js";
import { CliInputError, executeJsonRequest, MAX_CLI_INPUT_BYTES } from "./cli-request.js";
import type { CliCommand } from "./cli-request.js";

export const CLI_ERROR_SCHEMA = "zodiacs.relocation-cli-error.v1";
export const CLI_HELP = `Usage: relocation <chart|lines|grid> [--input FILE|-] [--pretty]
       relocation [chart|lines|grid] --help

Reads one UTF-8 JSON request from stdin (default) or a local file.
chart: {source, destination: {latitude, longitude}}
lines: {source, mode: "angular"|"path"|"local-space", options}
grid:  {source, mode: "charts"|"crossings", options}
source: resolved engine birth input or engine natal envelope.
Options match the library and require explicit steps and work budgets.
Success and library refusals go to stdout; errors are JSON on stderr.
Exit codes: 0 returned result/help, 1 error, 2 library refusal.
An ok result can contain unresolved crossings or undefined directions.
See relocation/README.md for request fields, receipts and synthetic examples.
`;

interface CliArguments {
  readonly command: CliCommand;
  readonly input: string;
  readonly pretty: boolean;
}

export function parseArguments(args: readonly string[]): CliArguments | "help" {
  if (args.length === 1 && args[0] === "--help") return "help";
  const command = args[0];
  if (command !== "chart" && command !== "lines" && command !== "grid") {
    throw new CliInputError("invalid-arguments", "Command must be chart, lines or grid; use --help for usage.");
  }
  if (args.length === 2 && args[1] === "--help") return "help";
  let input = "-";
  let pretty = false;
  let inputSeen = false;
  for (let index = 1; index < args.length; index++) {
    if (args[index] === "--input" && !inputSeen) {
      const value = args[++index];
      if (!value || (value !== "-" && value.startsWith("--"))) {
        throw new CliInputError("invalid-arguments", "--input requires a local path or - for stdin.");
      }
      inputSeen = true;
      input = value;
    } else if (args[index] === "--pretty" && !pretty) {
      pretty = true;
    } else {
      throw new CliInputError("invalid-arguments", "Unsupported or repeated CLI option; use --help for usage.");
    }
  }
  return { command, input, pretty };
}

/** Bound raw bytes before UTF-8 decoding or parsing; invalid UTF-8 is refused. */
export async function readRequest(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const data = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk as Uint8Array);
      bytes += data.byteLength;
      if (bytes > MAX_CLI_INPUT_BYTES) throw new CliInputError("input-limit", "Input exceeds the CLI byte limit.");
      chunks.push(data);
    }
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    throw new CliInputError("input-io", "Could not read the local JSON input.");
  }
  try {
    // Keep BOM visible so the JSON grammar, rather than a decoder convention,
    // decides whether the input is valid.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, bytes));
  } catch {
    throw new CliInputError("invalid-json", "Input must be valid UTF-8 JSON.");
  }
}

/** Refuse silent NaN/Infinity-to-null conversion in results. */
export function encodeResult(result: unknown, pretty: boolean): string {
  const encoded = JSON.stringify(result, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new CliInputError("serialization", "A result contains an unrepresentable JSON number.");
    }
    return value;
  }, pretty ? 2 : undefined);
  if (encoded === undefined) throw new CliInputError("serialization", "No JSON result was returned.");
  return encoded + "\n";
}

function errorRecord(error: unknown) {
  const base = { schema: CLI_ERROR_SCHEMA, status: "error" };
  if (error instanceof CliInputError) return { ...base, code: error.code, message: error.message };
  if (error instanceof GridBudgetError || error instanceof GreatCircleBudgetError || error instanceof AngularBudgetError) {
    const unit = error instanceof AngularBudgetError ? "evaluations" : "samples";
    const required = error instanceof AngularBudgetError ? error.requiredEvaluations : error.requiredSamples;
    const maximum = error instanceof AngularBudgetError ? error.maxEvaluations : error.maxSamples;
    return { ...base, code: "budget", message: "The request exceeds its work budget.",
      budget: { unit, required: Number.isFinite(required) ? required : null,
        requiredRepresentable: Number.isFinite(required), maximum } };
  }
  if (error instanceof NatalEnvelopeError) {
    return { ...base, code: "invalid-source", message: "The engine rejected the source chart or natal envelope." };
  }
  if (error instanceof RangeError) {
    return { ...base, code: "invalid-request", message: "The engine or relocation library rejected the request values." };
  }
  return { ...base, code: "internal", message: "The relocation command failed." };
}

async function writeText(stream: Writable, text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const failed = () => reject(new CliInputError("output-io", "Could not write CLI output."));
    stream.once("error", failed);
    stream.write(text, (error) => {
      if (error) {
        // Node emits error after the write callback; retain its listener.
        failed();
      } else {
        stream.removeListener("error", failed);
        resolve();
      }
    });
  });
}

export interface CliIo {
  readonly stdin: Readable & { readonly isTTY?: boolean };
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/** No process exit or import-time IO; the launcher supplies process streams. */
export async function main(args: readonly string[], io: CliIo = process): Promise<number> {
  try {
    const parsed = parseArguments(args);
    if (parsed === "help") {
      await writeText(io.stdout, CLI_HELP);
      return 0;
    }
    if (parsed.input === "-" && io.stdin.isTTY) {
      throw new CliInputError("invalid-arguments", "Provide JSON on stdin or select --input FILE.");
    }
    const stream = parsed.input === "-" ? io.stdin : createReadStream(parsed.input, { highWaterMark: 16_384 });
    const text = await readRequest(stream);
    const result = executeJsonRequest(parsed.command, text);
    const output = encodeResult(result, parsed.pretty);
    await writeText(io.stdout, output);
    return "status" in result && result.status === "refused" ? 2 : 0;
  } catch (error) {
    try { await writeText(io.stderr, encodeResult(errorRecord(error), false)); }
    catch { /* A closed diagnostic pipe cannot receive another diagnostic. */ }
    return 1;
  }
}
