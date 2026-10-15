/** Local CLI boundary. Loading and calculations use the existing offline APIs. */
import { createBodyAdapter } from "./body-adapter.ts";
import { readAdapterTime, resolveAdapterTime } from "./adapter-input.ts";
import type { AdapterTimeRequest } from "./adapter-input.ts";
import { isMinorBody, MINOR_BODY_NAMES } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import type { MinorBodyEphemeris } from "./ephemeris.ts";
import { loadFullBody } from "./full.ts";
import { loadChironPilot } from "./pilot.ts";
import { createStationSearcher, STATION_SEARCH_CONVENTIONS } from "./stations.ts";
import type { StationSearchRequest } from "./stations.ts";
import { createRetrogradeWindowSearcher } from "./retrogrades.ts";
import { createIngressSearcher, INGRESS_SEARCH_CONVENTIONS } from "./ingresses.ts";

type Command = "position" | "stations" | "retrogrades" | "ingresses";
type Dataset = "full" | "pilot";
export type CliArguments =
  | { readonly command: "help"; readonly text: string }
  | { readonly command: "position"; readonly dataset: Dataset;
      readonly request: Readonly<{ body: MinorBody; time: AdapterTimeRequest }> }
  | { readonly command: Exclude<Command, "position">; readonly dataset: Dataset;
      readonly request: StationSearchRequest };

export const CLI_HELP = `Minor bodies local CLI

Usage (from minorbodies/, on the recorded Node runtime):
  npm run --silent cli -- position --body NAME --iso ISO [options]
  npm run --silent cli -- position --body NAME --jd JD --scale SCALE [options]
  npm run --silent cli -- COMMAND --body NAME --from-iso ISO --to-iso ISO [options]
  npm run --silent cli -- COMMAND --body NAME --from-jd JD --to-jd JD --scale SCALE [options]

COMMAND: stations | retrogrades | ingresses
NAME: ${MINOR_BODY_NAMES.join(" | ")} (exact spelling)
SCALE: utc | ut1 | tt (required for Julian dates; not allowed with ISO)
ISO uses the engine's UTC input convention. Date-only means midnight UTC;
date-time needs Z or an explicit offset. Local wall times are not accepted.

Options:
  --dataset full|pilot   Default full; pilot admits only Chiron.
  --delta-t SECONDS      Pin TT minus UT1 on the input time(s).
  --step-days DAYS       Events only; TT days, default ${STATION_SEARCH_CONVENTIONS.defaultStepDays}.
  --max-samples COUNT    Events only; positive integer or unlimited.
                        Default ${STATION_SEARCH_CONVENTIONS.defaultMaxSamples}; shared across each search.
  --help                Alone, or immediately after a command.

Numbers use finite decimal or scientific notation. Supply each option once,
as separate option and value arguments. No positional values or mixed clocks.
Output is JSON with the library receipts unchanged. Angles are tropical,
geocentric, true ecliptic/equinox of date in degrees; distances are au;
speeds are per TT day. Corrections: light time and stellar aberration,
without gravitational deflection. Event epochs are jdTt, never UTC labels.

Data must already exist locally: pilot:build prepares the retained pilot;
full:build requires the frozen original full-data cache. Commands never fetch
or generate data. Default event budgets may refuse long intervals. Completion
means a scan finished under its recorded assumptions, not proven completeness.

Exit status: 0 success/help; 1 data/setup/calculation error; 2 invalid arguments;
3 library refusal (JSON on stdout with receipt and no partial events).
Other errors are JSON on stderr; see README.md for data preparation.
`;

const COMMANDS: readonly string[] = ["position", "stations", "retrogrades", "ingresses"];
const COMMON = ["--body", "--dataset", "--delta-t"];
const POSITION = ["--iso", "--jd", "--scale"];
const EVENTS = ["--from-iso", "--to-iso", "--from-jd", "--to-jd", "--scale", "--step-days", "--max-samples"];
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function numberValue(value: string, label: string): number {
  if (!DECIMAL.test(value) || !Number.isFinite(Number(value))) {
    throw new RangeError(`${label} requires a finite decimal number.`);
  }
  return Number(value);
}

/** Parse and validate syntax before reading any coefficient or source file. */
export function parseCliArgs(argv: readonly string[]): CliArguments {
  const command = argv[0];
  if ((argv.length === 1 && command === "--help") ||
      (argv.length === 2 && COMMANDS.includes(command!) && argv[1] === "--help")) {
    return Object.freeze({ command: "help", text: CLI_HELP });
  }
  if (!command || !COMMANDS.includes(command)) {
    throw new RangeError("Expected command position, stations, retrogrades or ingresses. Use --help for syntax.");
  }
  const allowed = [...COMMON, ...(command === "position" ? POSITION : EVENTS)];
  const options = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]!;
    if (!allowed.includes(key)) throw new RangeError("Unknown or inapplicable option. Use --help for syntax.");
    if (options.has(key)) throw new RangeError(`Duplicate option ${key}.`);
    const value = argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new RangeError(`Missing value for ${key}.`);
    }
    options.set(key, value);
  }
  const body = options.get("--body");
  if (!isMinorBody(body)) throw new RangeError(`--body requires one of: ${MINOR_BODY_NAMES.join(", ")}.`);
  const dataset = options.get("--dataset") ?? "full";
  if (dataset !== "full" && dataset !== "pilot") throw new RangeError("--dataset requires full or pilot.");
  if (dataset === "pilot" && body !== "Chiron") throw new RangeError("The pilot dataset supports only Chiron.");
  const pinText = options.get("--delta-t");
  const pin = pinText === undefined ? {} : { deltaT: numberValue(pinText, "--delta-t") };
  const scale = options.get("--scale");

  function time(isoKey: string, jdKey: string): AdapterTimeRequest {
    const iso = options.get(isoKey);
    const jd = options.get(jdKey);
    if ((iso === undefined) === (jd === undefined)) throw new RangeError(`Supply exactly one of ${isoKey} and ${jdKey}.`);
    if (iso !== undefined) {
      if (scale !== undefined) throw new RangeError("ISO input uses UTC; --scale is allowed only with Julian dates.");
      const request = readAdapterTime({ iso, ...pin });
      resolveAdapterTime(request);
      return request;
    }
    if (scale !== "utc" && scale !== "ut1" && scale !== "tt") {
      throw new RangeError("Julian dates require --scale utc, ut1 or tt.");
    }
    const request = readAdapterTime({ jd: numberValue(jd!, jdKey), scale, ...pin });
    resolveAdapterTime(request);
    return request;
  }

  if (command === "position") return Object.freeze({ command, dataset,
    request: Object.freeze({ body, time: time("--iso", "--jd") }) });
  const from = time("--from-iso", "--from-jd");
  const to = time("--to-iso", "--to-jd");
  if (resolveAdapterTime(from).jdTt > resolveAdapterTime(to).jdTt) {
    throw new RangeError("Event searches require from <= to on TT.");
  }
  // A single --scale applies to both Julian endpoints. ISO+JD combinations
  // cannot pass time(), so a command cannot silently mix endpoint clocks.
  const limits = command === "ingresses" ? INGRESS_SEARCH_CONVENTIONS : STATION_SEARCH_CONVENTIONS;
  const stepText = options.get("--step-days");
  const stepDays = stepText === undefined ? undefined : numberValue(stepText, "--step-days");
  if (stepDays !== undefined && (stepDays * 86_400_000 < 1 || stepDays > limits.maxStepDays)) {
    throw new RangeError(`--step-days must be at least one millisecond and at most ${limits.maxStepDays} TT days.`);
  }
  const budgetText = options.get("--max-samples");
  const maxSamples = budgetText === undefined ? undefined
    : budgetText === "unlimited" ? Infinity : numberValue(budgetText, "--max-samples");
  if (maxSamples !== undefined && maxSamples !== Infinity && (!Number.isSafeInteger(maxSamples) || maxSamples < 1)) {
    throw new RangeError("--max-samples requires a positive safe integer or unlimited.");
  }
  return Object.freeze({ command: command as Exclude<Command, "position">, dataset,
    request: Object.freeze({ body, from, to, ...(stepDays === undefined ? {} : { stepDays }),
      ...(maxSamples === undefined ? {} : { maxSamples }) }) });
}

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}
export type CliDatasetLoader = (dataset: Dataset, body: MinorBody) => Promise<MinorBodyEphemeris>;
const loadDataset: CliDatasetLoader = (dataset, body) => dataset === "pilot" ? loadChironPilot() : loadFullBody(body);

/** One JSON result or error, with no writes other than the supplied output streams. */
export async function runCli(argv: readonly string[], io: CliIo, loader: CliDatasetLoader = loadDataset): Promise<number> {
  function fail(code: string, message: string, exitCode: number): number {
    io.stderr(JSON.stringify({ schema: "minorbodies-cli-error-v1", status: "error", code, message }) + "\n");
    return exitCode;
  }
  let args: CliArguments;
  try { args = parseCliArgs(argv); }
  catch (error) {
    return fail("invalid-arguments", error instanceof RangeError ? error.message : "Invalid arguments. Use --help for syntax.", 2);
  }
  if (args.command === "help") {
    io.stdout(args.text);
    return 0;
  }
  let ephemeris: MinorBodyEphemeris;
  try { ephemeris = await loader(args.dataset, args.request.body); }
  catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    const preparation = args.dataset === "pilot" ? "Run npm run pilot:build from minorbodies/."
      : "Restore the frozen original full-data cache and run npm run full:build from minorbodies/.";
    return fail(missing ? "data-missing" : "data-invalid",
      `${args.dataset} data for ${args.request.body} ${missing ? "is missing" : "could not be loaded or verified"}. ${preparation} See README.md; no data was fetched or generated.`, 1);
  }
  let output: string;
  let exitCode: number;
  try {
    const adapter = await createBodyAdapter([ephemeris]);
    const result = args.command === "position" ? adapter.calcWithMinorBodies(args.request)
      : args.command === "stations" ? (await createStationSearcher(adapter)).searchStations(args.request)
      : args.command === "retrogrades" ? (await createRetrogradeWindowSearcher(adapter)).searchRetrogradeWindows(args.request)
      : (await createIngressSearcher(adapter)).searchIngresses(args.request);
    output = JSON.stringify(result) + "\n";
    exitCode = result.status === "refused" ? 3 : 0;
  } catch {
    return fail("calculation-failed", "Calculation or local implementation setup failed. Check the source checkout and installed dependencies.", 1);
  }
  io.stdout(output);
  return exitCode;
}
