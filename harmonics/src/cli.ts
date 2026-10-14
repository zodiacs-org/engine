import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { CliError, MAX_INPUT_BYTES, parseChartRequest } from "./cli-input.js";
import type { ChartRequest } from "./cli-input.js";
import { harmonicChart, harmonicLimit } from "./harmonic-chart.js";
import type { CastHarmonicChartResult } from "./engine.js";
import type { HarmonicChart } from "./types.js";

export const CLI_SCHEMA = "zodiacs-harmonics-cli/v1";

export const CHART_HELP = `Usage: harmonics chart --input FILE|- [options]

Input is UTF-8 JSON containing exactly one of {"points":[...]} or {"birth":{...}}.
FILE is a local path; - reads stdin. No network requests are made.

Options:
  --harmonic N             Positive integer harmonic (default 1)
  --max-harmonic N         Positive integer ceiling (default 180)
  --include-angles        Append available angles to a cast birth chart
  --include-chart-points  Append engine chart points to a cast birth chart
  --help                  Show this help, used alone after chart

Results are JSON on stdout. Errors are JSON on stderr with a failing exit status.
`;

export interface ChartArguments {
  readonly input: string;
  readonly harmonic: number;
  readonly maxHarmonic: number;
  readonly includeAngles: boolean;
  readonly includeChartPoints: boolean;
}

function integer(text: string): number {
  if (!/^[1-9]\d*$/u.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new CliError("invalid-arguments", "Harmonics must be positive safe integers in decimal notation.");
  }
  return Number(text);
}

export function parseChartArguments(args: readonly string[]): ChartArguments | "help" {
  if ((args.length === 1 && args[0] === "--help") ||
    (args.length === 2 && args[0] === "chart" && args[1] === "--help")) return "help";
  if (args[0] !== "chart") {
    throw new CliError("invalid-arguments", "Expected the chart command. Use harmonics --help for usage.");
  }
  let input: string | undefined;
  let harmonic = 1;
  let maxHarmonic = 180;
  let includeAngles = false;
  let includeChartPoints = false;
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]!;
    if (seen.has(option)) throw new CliError("invalid-arguments", "Options must not be repeated.");
    seen.add(option);
    if (option === "--include-angles") includeAngles = true;
    else if (option === "--include-chart-points") includeChartPoints = true;
    else if (["--input", "--harmonic", "--max-harmonic"].includes(option)) {
      const value = args[++index];
      if (value === undefined || value.trim() === "" || value.startsWith("--")) {
        throw new CliError("invalid-arguments", "Every value option requires a nonempty value.");
      }
      if (option === "--input") input = value;
      else if (option === "--harmonic") harmonic = integer(value);
      else maxHarmonic = integer(value);
    } else throw new CliError("invalid-arguments", "Unknown option or positional argument. Use chart --help.");
  }
  if (input === undefined) throw new CliError("invalid-arguments", "--input FILE|- is required.");
  try {
    harmonicLimit(harmonic, { maxHarmonic });
  } catch {
    throw new CliError("invalid-arguments", "harmonic must not exceed maxHarmonic.");
  }
  return { input, harmonic, maxHarmonic, includeAngles, includeChartPoints };
}

export type CliChartResult =
  | { readonly schema: typeof CLI_SCHEMA; readonly command: "chart"; readonly sourceMode: "points";
    readonly harmonicChart: HarmonicChart }
  | ({ readonly schema: typeof CLI_SCHEMA; readonly command: "chart"; readonly sourceMode: "birth" }
    & CastHarmonicChartResult);

export async function executeChart(request: ChartRequest, args: ChartArguments): Promise<CliChartResult> {
  const { harmonic, maxHarmonic, includeAngles, includeChartPoints } = args;
  const header = { schema: CLI_SCHEMA, command: "chart" } as const;
  if (request.mode === "points") {
    if (includeAngles || includeChartPoints) {
      throw new CliError("invalid-arguments", "Angle and chart-point options require birth input.");
    }
    return { ...header, sourceMode: "points", harmonicChart: harmonicChart(request.points, harmonic, { maxHarmonic }) };
  }
  // The supplied-points command does not initialize the casting API or ephemeris.
  const { castHarmonicChart } = await import("./engine.js");
  return {
    ...header, sourceMode: "birth",
    ...castHarmonicChart(request.birth, harmonic, {
      maxHarmonic, includeAngles, includeChartPoints,
      receiptContext: {
        ...(typeof request.birth.utc === "string" ? { sourceInstant: request.birth.utc } : {}),
        provenance: { runtime: { name: "node", version: process.versions.node } }
      }
    })
  };
}

export async function readInput(path: string, stdin: Readable = process.stdin): Promise<Uint8Array> {
  const stream = path === "-" ? stdin : createReadStream(path);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      size += bytes.byteLength;
      if (size > MAX_INPUT_BYTES) throw new CliError("invalid-input", "Input exceeds the byte limit.");
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("input-read", "Could not read the local input file or stdin.");
  }
  return Buffer.concat(chunks, size);
}

/** Writes a complete result only after validation/calculation; never exits a host process. */
export async function runCli(args: readonly string[]): Promise<number> {
  try {
    const parsed = parseChartArguments(args);
    if (parsed === "help") {
      process.stdout.write(CHART_HELP);
      return 0;
    }
    const request = parseChartRequest(await readInput(parsed.input));
    const result = await executeChart(request, parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof CliError ? error : error instanceof RangeError
      ? new CliError("invalid-input", error.message)
      : new CliError("execution-failed", "Chart calculation failed.");
    process.stderr.write(`${JSON.stringify({ error: { code: failure.code, message: failure.message } })}\n`);
    return 1;
  }
}
