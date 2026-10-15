import type { BirthInput } from "../../src/index.js";
import { draconicChart } from "./results.js";
import type { NodeChoice } from "./engine-adapter.js";

export const INPUT_LIMIT_BYTES = 64 * 1024;

export const HELP = `Usage: draconic chart --input FILE|- [--node true|mean] [--format json]
       draconic --help
       draconic chart --help

Read one UTF-8 JSON object: { "synthetic": true, "birth": { ... } }.
Use invented birth inputs only. The declaration is a caller assertion.
FILE is read locally; - reads standard input. Input is limited to 64 KiB.
Birth fields: utc, latitude, longitude, houseSystem, timeKnown, timeScale,
             deltaT, flags. The engine validates their values.
Node defaults to true north node; mean north node requires --node mean.
JSON output includes the tropical natal receipt and separate draconic
positions and conventions. Existing angles and cusps rotate without recasting.
The engine receipt covers the natal chart only. No interpretation or predictions.
Exit codes: 0 success/help, 2 invalid arguments/input, 1 I/O or internal error.
`;

export class CliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2 = 2) {
    super(message);
    this.name = "CliError";
  }
}

export interface CliIO {
  readInput(path: string): Promise<Uint8Array>;
  stdout(text: string): void;
  stderr(text: string): void;
}

interface ChartArguments {
  input: string;
  node: NodeChoice;
}

function argumentsFor(argv: readonly string[]): ChartArguments | "help" {
  if ((argv.length === 1 && argv[0] === "--help") ||
      (argv.length === 2 && argv[0] === "chart" && argv[1] === "--help")) return "help";
  if (argv[0] !== "chart") throw new CliError('Expected command "chart". Use draconic --help.');
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i]!;
    if (!["--input", "--node", "--format"].includes(key)) {
      throw new CliError("Unsupported argument. Use draconic chart --help.");
    }
    if (values.has(key)) throw new CliError(`${key} must be supplied only once.`);
    const value = argv[i + 1];
    if (value === undefined || value.trim() === "" || value.startsWith("--")) {
      throw new CliError(`${key} requires a value.`);
    }
    values.set(key, value);
  }
  const input = values.get("--input");
  if (input === undefined) throw new CliError("Supply --input FILE or --input - for standard input.");
  const node = values.get("--node") ?? "true";
  if (node !== "true" && node !== "mean") throw new CliError('--node must be "true" or "mean".');
  if (values.has("--format") && values.get("--format") !== "json") {
    throw new CliError('--format must be "json".');
  }
  return { input, node };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function birthFrom(bytes: Uint8Array): BirthInput {
  if (bytes.byteLength > INPUT_LIMIT_BYTES) throw new CliError("Input exceeds the 64 KiB limit.");
  let request: unknown;
  try {
    request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new CliError("Input must be one valid UTF-8 JSON object.");
  }
  if (!record(request) || request.synthetic !== true || !Object.hasOwn(request, "birth") ||
      Object.keys(request).some((key) => key !== "synthetic" && key !== "birth")) {
    throw new CliError('Input must contain only "synthetic": true and a "birth" object. Use invented data only.');
  }
  const birth = request.birth;
  if (!record(birth) || !Object.hasOwn(birth, "utc")) {
    throw new CliError('birth must be an object containing a resolved "utc" instant.');
  }
  const fields = ["utc", "latitude", "longitude", "houseSystem", "timeKnown", "timeScale", "deltaT", "flags"];
  if (Object.keys(birth).some((key) => !fields.includes(key))) {
    throw new CliError("Unsupported birth field. See draconic chart --help for accepted fields.");
  }
  // Values are JSON data, not executable objects. natalChart validates every
  // consumed value; this boundary additionally rejects misspelled/extra keys.
  return birth as unknown as BirthInput;
}

function safeMessage(error: Error): string {
  return error.message.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, 400);
}

/** CLI orchestration only. Importing the pure library never imports this module. */
export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  try {
    const args = argumentsFor(argv);
    if (args === "help") {
      io.stdout(HELP);
      return 0;
    }
    const birth = birthFrom(await io.readInput(args.input));
    const context = typeof birth.utc === "string" ? { sourceInstant: birth.utc } : {};
    const result = draconicChart(birth, { node: args.node }, context);
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof CliError ? error.exitCode : error instanceof RangeError ? 2 : 1;
    const message = error instanceof CliError ? error.message : error instanceof RangeError
      ? `Birth input rejected: ${safeMessage(error)}` : "Unable to complete chart calculation.";
    io.stderr(`draconic: ${message}\n`);
    return code;
  }
}
