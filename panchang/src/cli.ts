import { nextCivilDate, validateCivilDate, validateObserver, validateTimeZone } from "./civil.js";
import type { CivilDayInput } from "./civil.js";
import { panchangDay } from "./day.js";
import type { PanchangDayOptions, PanchangDayResult } from "./day.js";
import { PANCHANG_AYANAMSAS } from "./engine.js";
import type { PanchangAyanamsa } from "./engine.js";
import { validateMonthConvention } from "./months.js";
import { civilDatesInRange, panchangRange, preparePanchangRange } from "./range.js";
import type { PanchangRangeInput, PanchangRangeOptions, PanchangRangeResult } from "./range.js";
import { prepareSunriseDay } from "./sunrise.js";
import { renderText } from "./cli-text.js";

export const CLI_HELP = `Usage:
  panchang day --date YYYY-MM-DD [options]
  panchang range --from YYYY-MM-DD --to YYYY-MM-DD [options]

Required options:
  --latitude DEGREES         WGS84 latitude, north positive
  --longitude DEGREES        WGS84 longitude, east positive
  --time-zone IANA           Explicit timezone, such as Asia/Kolkata
  --month-convention NAME    amanta or purnimanta

Optional:
  --height METRES            WGS84 height (default: 0)
  --ayanamsa NAME            Engine definition (default: lahiri)
  --format text|json         Output format (default: text)
  --sunrise-max-samples N    Per-day sky evaluation budget
  --transition-max-samples N Per-day limb snapshot budget
  --month-max-samples N      Per-day month snapshot budget
  --max-samples N            Total range budget (range only)
  --help                    Show this help, alone or after a command

Range endpoints are included civil dates. All budgets are positive finite
safe integers. Day options retain the library defaults when omitted.
Instants are ISO UTC labels on the engine time basis. Sunrise uses the
upper solar limb, standard refraction and a level horizon without dip.
Computed boundaries have millisecond resolution, not millisecond physical
accuracy. JSON preserves the full library result and receipts. Text shows
facts, full intervals and a provenance ledger. No network access is used.
Exit statuses: 0 success/help, 1 unexpected error, 2 invalid input,
3 calculation refused (diagnostics on stdout, no partial day/range).
Ayanamsas: ${PANCHANG_AYANAMSAS.join(", ")}
`;

export type CliFormat = "json" | "text";
export type CliRequest = { readonly command: "help" } | (
  { readonly format: CliFormat } & (
    { readonly command: "day"; readonly input: CivilDayInput; readonly options: PanchangDayOptions } |
    { readonly command: "range"; readonly input: PanchangRangeInput; readonly options: PanchangRangeOptions }
  )
);

const common = ["latitude", "longitude", "height", "time-zone", "month-convention", "ayanamsa", "format",
  "sunrise-max-samples", "transition-max-samples", "month-max-samples"];

function decimal(text: string, name: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(text) || !Number.isFinite(Number(text))) {
    throw new RangeError(`${name} requires finite plain decimal notation.`);
  }
  return Number(text);
}

function budget(text: string): number {
  if (!/^[1-9]\d*$/u.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new RangeError("Budgets require positive finite safe integers.");
  }
  return Number(text);
}

/** Parse and validate the whole request before loading histories or calculating. */
export function parseCliArgs(args: readonly string[]): CliRequest {
  if (args.length === 1 && args[0] === "--help") return { command: "help" };
  const command = args[0];
  if (command !== "day" && command !== "range") throw new RangeError("Expected day or range; use --help for usage.");
  if (args.length === 2 && args[1] === "--help") return { command: "help" };
  const allowed = new Set([...common, ...(command === "day" ? ["date"] : ["from", "to", "max-samples"])]);
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const option = args[i]!;
    const key = option.slice(2);
    if (!option.startsWith("--") || !allowed.has(key)) throw new RangeError("Unknown option or unexpected positional argument.");
    if (values.has(key)) throw new RangeError(`Duplicate --${key}.`);
    const value = args[i + 1];
    if (!value || value.startsWith("--") || value.trim() !== value || /[\p{Cc}\p{Cs}]/u.test(value)) {
      throw new RangeError(`Missing or invalid value for --${key}.`);
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined) throw new RangeError(`Missing --${key}.`);
    return value;
  };
  const format = values.get("format") ?? "text";
  if (format !== "json" && format !== "text") throw new RangeError("--format must be text or json.");
  const observer = validateObserver({ latitude: decimal(required("latitude"), "latitude"),
    longitude: decimal(required("longitude"), "longitude"),
    ...(values.has("height") ? { height: decimal(values.get("height")!, "height") } : {}) });
  const timeZone = validateTimeZone(required("time-zone"));
  const monthConvention = validateMonthConvention(required("month-convention"));
  const ayanamsa = values.get("ayanamsa") ?? "lahiri";
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) throw new RangeError("Unknown engine ayanamsa; use --help for names.");
  const options: PanchangRangeOptions = { monthConvention, ayanamsa: ayanamsa as PanchangAyanamsa,
    ...(values.has("sunrise-max-samples") ? { sunriseMaxSamples: budget(values.get("sunrise-max-samples")!) } : {}),
    ...(values.has("transition-max-samples") ? { transitionMaxSamples: budget(values.get("transition-max-samples")!) } : {}),
    ...(values.has("month-max-samples") ? { monthMaxSamples: budget(values.get("month-max-samples")!) } : {}),
    ...(values.has("max-samples") ? { maxSamples: budget(values.get("max-samples")!) } : {}) };
  if (command === "day") {
    const date = required("date");
    validateCivilDate(date);
    nextCivilDate(nextCivilDate(date));
    return { command, format, input: { date, timeZone, observer }, options };
  }
  const from = required("from");
  const to = required("to");
  civilDatesInRange(from, to);
  return { command, format, input: { from, to, timeZone, observer }, options };
}

export type CliResult = PanchangDayResult | PanchangRangeResult;
export interface CliWriter { write(text: string): unknown }

/** CLI I/O boundary; the library entry point never imports this module. */
export async function runCli(args: readonly string[], stdout: CliWriter, stderr: CliWriter): Promise<number> {
  // Honor an explicit JSON selection for parse errors too. An invalid format
  // selection has no machine-output contract and uses the default text error.
  let format: CliFormat = args.some((arg, i) => arg === "--format" && args[i + 1] === "json") ? "json" : "text";
  let result: CliResult;
  try {
    const request = parseCliArgs(args);
    if (request.command === "help") { stdout.write(CLI_HELP); return 0; }
    format = request.format;
    if (request.command === "day") {
      await prepareSunriseDay(request.input);
      result = panchangDay(request.input, request.options);
    } else {
      await preparePanchangRange(request.input);
      result = panchangRange(request.input, request.options);
    }
    // Render fully before writing, so an error never emits a partial result.
    const output = format === "json" ? JSON.stringify(result) + "\n" : renderText(result);
    stdout.write(output);
  } catch (error) {
    const invalid = error instanceof RangeError;
    const message = invalid ? error.message : "Unexpected calculation or runtime error.";
    stderr.write(format === "json" ? JSON.stringify({ status: "error", reason: invalid ? "invalid-input" : "internal-error", message }) + "\n"
      : `Error: ${message}\n`);
    return invalid ? 2 : 1;
  }
  return result.status === "ok" ? 0 : 3;
}
