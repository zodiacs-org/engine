import { createReadStream } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { parseHit } from "./hit.js";
import { parseScan } from "./scan.js";
import { hitFromNatal } from "./natal-hit.js";
import type { NatalHitSelection } from "./natal-hit.js";
import { prepareNatal, NatalPreparationError } from "./natal.js";
import type { DirectionNatalInput } from "./natal.js";
import { parseNatalScan } from "./natal-scan.js";
import { parseCliJson, CliJsonError, CLI_MAX_INPUT_BYTES, CLI_MAX_JSON_DEPTH } from "./cli-json.js";
import type { HitResult } from "./hit.js";
import type { ScanResult } from "./scan.js";
import type { NatalHitResult } from "./natal-hit.js";
import type { NatalScanResult } from "./natal-scan.js";

const HELP = `Usage:
  directions hit --input FILE|-
  directions scan --input FILE|-
  directions --help
  directions hit --help
  directions scan --help

Read one UTF-8 JSON document from FILE, or standard input with --input -.
Use synthetic natal data only. All calculation choices must be explicit.

Coordinate envelope:
  {"source":"coordinates","request":{...}}
  request is the pure hit or scan API input, including geometry.

Natal envelope:
  {"source":"natal","birth":{...},"request":{...}}
  birth requires utc, timeScale, timeKnown:true, latitude, longitude,
  houseSystem; optional deltaT and flags. Select bodies by exact id and
  angles by name. The engine supplies coordinates and geometry.
  hit request is NatalHitSelection; scan request is NatalScanInput.

hit requires convention, significator, promissor, contact, yearUnit.
scan requires convention, selections, motions, yearUnit, ageRange,
maxEvaluations. Coordinate requests also require geometry.
Solar-key requests require explicit solar samples; no sampling is inferred.
See directions/CLI.md for full runnable examples and supported conventions.

Output: one JSON result on stdout, with full geometry and timing metadata.
Exit 0: successful hit or complete scan, including an empty scan.
Exit 2: calculation refused; JSON refusal on stdout, no partial hits.
Exit 1: usage, input, runtime or unexpected error; JSON error on stderr.
Help exits 0 with this text on stdout and reads no input.
Input limit: ${CLI_MAX_INPUT_BYTES} bytes. JSON container depth limit: ${CLI_MAX_JSON_DEPTH}.
Duplicate keys, nonfinite numbers, BOMs and non-JSON syntax are rejected.
`;

class CliError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

type Command = "hit" | "scan";
type Invocation = { help: true } | { help: false; command: Command; input: string };

function invocation(args: readonly string[]): Invocation {
  if ((args.length === 1 && args[0] === "--help")
    || (args.length === 2 && (args[0] === "hit" || args[0] === "scan") && args[1] === "--help")) {
    return { help: true };
  }
  if (args.length !== 3 || (args[0] !== "hit" && args[0] !== "scan")
    || args[1] !== "--input" || !args[2] || args[2].startsWith("--")) {
    throw new CliError("usage", "Use directions hit|scan --input FILE|-; use directions --help for the request format.");
  }
  return { help: false, command: args[0], input: args[2] };
}

async function readInput(path: string): Promise<unknown> {
  const stream: Readable = path === "-" ? process.stdin : createReadStream(path);
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      bytes += buffer.length;
      if (bytes > CLI_MAX_INPUT_BYTES) throw new CliError("input-size", "Input exceeds the documented byte limit.");
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("input-io", "Could not read the requested input.");
  } finally {
    stream.destroy();
  }
  let json: string;
  try {
    // ignoreBOM preserves a BOM in the string, so the JSON decoder rejects it.
    json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new CliError("input-encoding", "Input must be valid UTF-8.");
  }
  return parseCliJson(json);
}

function envelope(input: unknown): { source: "coordinates" | "natal"; request: unknown; birth?: unknown } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new CliError("invalid-request", "Provide a coordinates or natal request envelope.");
  }
  const value = input as Record<string, unknown>;
  const fields = value.source === "coordinates" ? ["source", "request"]
    : value.source === "natal" ? ["source", "birth", "request"] : [];
  if (fields.length === 0 || Object.keys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field))) {
    throw new CliError("invalid-request", "Provide exactly source and request, plus birth for a natal request.");
  }
  return value as ReturnType<typeof envelope>;
}

type CalculationResult = HitResult | ScanResult | NatalHitResult | NatalScanResult | {
  readonly status: "refused"; readonly stage: "natal-preparation"; readonly code: string; readonly message: string;
};

function calculate(command: Command, input: unknown): CalculationResult {
  const value = envelope(input);
  if (value.source === "coordinates") return command === "hit" ? parseHit(value.request) : parseScan(value.request);
  try {
    // These adapters validate unknown data at runtime; casts select their typed
    // entry contracts only. No coordinates are accepted or fabricated here.
    const snapshot = prepareNatal(value.birth as DirectionNatalInput);
    return command === "hit" ? hitFromNatal(snapshot, value.request as NatalHitSelection)
      : parseNatalScan(snapshot, value.request);
  } catch (error) {
    if (!(error instanceof NatalPreparationError)) throw error;
    return { status: "refused", stage: "natal-preparation", code: error.code, message: error.message } as const;
  }
}

async function write(stream: Writable, text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => stream.write(text, error => error ? reject(error) : resolve()));
}

/** Process boundary only. The pure library never imports this module. */
export async function main(args: readonly string[]): Promise<number> {
  try {
    const call = invocation(args);
    if (call.help) { await write(process.stdout, HELP); return 0; }
    const result = calculate(call.command, await readInput(call.input));
    // Serialize the complete result before writing any byte to stdout.
    await write(process.stdout, `${JSON.stringify(result)}\n`);
    return result.status === "refused" ? 2 : 0;
  } catch (error) {
    const known = error instanceof CliError || error instanceof CliJsonError;
    const code = error instanceof CliError ? error.code : error instanceof CliJsonError ? "invalid-json" : "unexpected-error";
    const message = known ? error.message : "The command could not complete because of an unexpected failure.";
    try { await write(process.stderr, `${JSON.stringify({ status: "error", stage: "cli", code, message })}\n`); }
    catch { /* An unavailable error stream must not cause an unhandled rejection. */ }
    return 1;
  }
}
