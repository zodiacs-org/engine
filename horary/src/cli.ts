import { cast } from "./cast.js";
import { analyze } from "./analyze.js";
import type { HoraryAnalysisOptions } from "./analyze.js";
import { explain } from "./explain.js";
import type { HoraryInput } from "./types.js";

export const CLI_INPUT_LIMIT_BYTES = 1_000_000;
export const CLI_HELP = `Usage: horary <cast|analyze|explain> [--input FILE|-] [--format json|text]
Read a question JSON object from FILE or stdin (default).
analyze/explain also accept {"input": QUESTION, "options": POLICY_INPUT_GROUPS}.
cast/analyze emit JSON. explain defaults to text; --format json emits explanation records.
--help prints this help. All commands run offline and produce observations without a verdict.
`;

export interface HoraryCliIO {
  /** The host reader must bound allocation while reading to CLI_INPUT_LIMIT_BYTES. */
  readonly readInput: (path: string) => Promise<string>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

function argumentsFor(args: readonly string[]) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return null;
  const command = args[0];
  if (command !== "cast" && command !== "analyze" && command !== "explain") throw new RangeError("Expected cast, analyze or explain.");
  if (args.length === 2 && (args[1] === "--help" || args[1] === "-h")) return null;
  let path = "-", format = command === "explain" ? "text" : "json";
  const seen = new Set<string>();
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if ((key !== "--input" && key !== "--format") || seen.has(key) || !value || value.startsWith("--")) {
      throw new RangeError("Unsupported, repeated or incomplete CLI option.");
    }
    seen.add(key);
    if (key === "--input") path = value;
    else {
      if (value !== "json" && value !== "text") throw new RangeError("Output format must be json or text.");
      format = value;
    }
  }
  if (command !== "explain" && format !== "json") throw new RangeError("Text output is available for explain only.");
  return { command, path, format };
}

function request(value: unknown, command: string): { input: HoraryInput; options: HoraryAnalysisOptions } {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "input")) {
    if (command === "cast") throw new RangeError("cast accepts a question object directly.");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => key !== "input" && key !== "options")) throw new RangeError("Unsupported analysis request field.");
    return { input: record.input as HoraryInput,
      options: (Object.hasOwn(record, "options") ? record.options : {}) as HoraryAnalysisOptions };
  }
  return { input: value as HoraryInput, options: {} };
}

/** Testable CLI boundary; the library API itself performs no I/O. */
export async function runCli(args: readonly string[], io: HoraryCliIO): Promise<number> {
  try {
    const parsed = argumentsFor(args);
    if (parsed === null) { io.stdout(CLI_HELP); return 0; }
    const text = await io.readInput(parsed.path);
    if (Buffer.byteLength(text, "utf8") > CLI_INPUT_LIMIT_BYTES) throw new RangeError("CLI input exceeds its byte limit.");
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new RangeError("CLI input must be valid JSON."); }
    const { input, options } = request(value, parsed.command);
    const result = parsed.command === "cast" ? cast(input) : parsed.command === "analyze" ? analyze(input, options) : explain(analyze(input, options));
    const output = parsed.format === "text" ? (result as ReturnType<typeof explain>).text : JSON.stringify(result, null, 2);
    io.stdout(`${output}\n`);
    return 0;
  } catch (error) {
    io.stderr(`${JSON.stringify({ error: { code: "horary-cli-error", message: error instanceof RangeError ? error.message : "Horary command failed." } })}\n`);
    return 1;
  }
}
