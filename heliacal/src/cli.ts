import { crescentEvents } from "./crescent-search.js";
import type { CrescentSearchPolicy } from "./crescent-search.js";
import { HELIACAL_APPEARANCES, heliacalEvents } from "./heliacal.js";
import type { HeliacalAppearance } from "./heliacal.js";
import { dateRange, instant, observer, visibilityBody } from "./inputs.js";
import { HORIZON_PHENOMENA, horizonPhenomena } from "./phenomena.js";
import { phase } from "./phase.js";
import { horizonArcusVisionis } from "./visibility.js";
import { serializeCliJson } from "./cli-json.js";

const SCHEMA = "heliacal-cli/1";
const COMMANDS = ["events", "crescent", "phase"] as const;
type Command = (typeof COMMANDS)[number];
type Options = ReadonlyMap<string, string>;

const SITE_OPTIONS = ["latitude", "longitude", "height"];
const RANGE_OPTIONS = ["from", "to", "max-samples"];
const THRESHOLD_OPTIONS = HELIACAL_APPEARANCES.map((name) => `${name}-deg`);

const UNITS = Object.freeze({
  angles: "degrees", distances: "au", observerHeight: "metres",
  crescentWidth: "arcminutes", elapsedTime: "milliseconds", instants: "ISO-8601 UTC",
  illuminatedFraction: "fraction", yallopQ: "dimensionless", odehV: "degrees"
});

const COMMON_HELP = `Site: --latitude DEG --longitude DEG [--height METRES]
Longitude is positive east. Height defaults to zero; no horizon dip is added.
Dates: YYYY-MM-DD (UTC midnight), or a resolved ISO date-time with offset.
Ranges: --from ISO --to ISO, including from and excluding to.
Numbers: finite plain decimals; budgets: positive safe decimal integers.
Options accept --name value or --name=value. Names and values are case-sensitive.
Unknown, repeated, unused, empty and missing options are errors.
Output: one heliacal-cli/1 JSON document with full result and engine receipts.
Exit: 0 complete/ok/help; 1 invalid input or execution error; 2 refused; 3 unresolved.
Predictions describe the selected criterion, not observed sightings.
`;

const HELP: Record<Command, string> = {
  phase: `Usage: heliacal phase --body BODY --at ISO --latitude DEG --longitude DEG [--height METRES]
BODY: Moon, Mercury, Venus, Mars, Jupiter, Saturn.
Returns geocentric and topocentric elongation, signed longitude phase and illumination.
Morning/evening labels describe longitude phase, not visibility.
`,
  events: `Usage: heliacal events --mode MODE --body BODY --from ISO --to ISO --latitude DEG --longitude DEG [options]
BODY: Moon, Mercury, Venus, Mars, Jupiter, Saturn.
MODE heliacal: require --model horizon-arcus-visionis/1 and at least one threshold:
  --first-morning-deg DEG   Heliacal rising (first morning appearance)
  --last-evening-deg DEG    Heliacal setting (last evening appearance)
  --first-evening-deg DEG   First evening appearance
  --last-morning-deg DEG    Last morning appearance
  Mercury/Venus: all appearances; Mars/Jupiter/Saturn: first morning, last evening.
  Moon: first evening, last morning, as geometric arcus extensions only.
  Thresholds are required solar depression at the target's airless centre horizon.
  [--max-geometry-samples N] caps full Sun/body geometry calls.
MODE horizon: geometric acronychal/cosmical horizon order, without a visibility model.
  [--kinds LIST] selects comma-separated names (default all):
  cosmical-rising,cosmical-setting,acronychal-rising,acronychal-setting.
Both modes: [--height METRES] [--max-samples N] for the shared sky sample budget.
Extinction, magnitude limits and configurable altitude screens are not part of
these search models; such options are rejected. Returned conventions name this limit.
`,
  crescent: `Usage: heliacal crescent --from ISO --to ISO --latitude DEG --longitude DEG --model MODEL --last-category CATEGORY --max-elongation-deg DEG [options]
MODEL yallop-1997/1: CATEGORY A, B, C or D.
MODEL odeh-2006/1: CATEGORY A, B or C.
Accepts the model's ordered category prefix through CATEGORY; meanings differ by model.
The elongation ceiling is an explicit search domain, not a calibrated accuracy limit.
[--morning-timing disabled|mirror-evening] defaults to disabled.
mirror-evening adds last morning events using an unvalidated symmetry extension.
[--height METRES] [--max-samples N] [--max-geometry-samples N]
Moon only; fixed crescent fits do not accept extinction or magnitude adjustments.
`
};

function commandOf(value: string | undefined): Command {
  if (!COMMANDS.includes(value as Command)) throw new RangeError("Choose events, crescent or phase. Use --help for usage.");
  return value as Command;
}

function optionsOf(args: readonly string[]): Options {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/.exec(token);
    if (!match) throw new RangeError("Expected a long option of the form --name value or --name=value.");
    const name = match[1]!;
    if (options.has(name)) throw new RangeError(`Repeated option --${name}.`);
    const value = match[2] === undefined ? args[++i] : match[2];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new RangeError(`Missing value for --${name}.`);
    }
    options.set(name, value);
  }
  return options;
}

function allowed(options: Options, names: readonly string[]): void {
  for (const name of options.keys()) {
    if (!names.includes(name)) throw new RangeError(`Unsupported option --${name} for this command and mode.`);
  }
}

function required(options: Options, name: string): string {
  const value = options.get(name);
  if (value === undefined) throw new RangeError(`Missing required option --${name}.`);
  return value;
}

function choice<const T extends string>(value: string, choices: readonly T[], name: string): T {
  if (!choices.includes(value as T)) throw new RangeError(`--${name} must be one of: ${choices.join(", ")}.`);
  return value as T;
}

function decimal(value: string, name: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
    throw new RangeError(`--${name} requires a finite plain decimal.`);
  }
  return Number(value);
}

function budget(options: Options, name: string): number | undefined {
  const value = options.get(name);
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError(`--${name} requires a positive safe decimal integer.`);
  }
  return count;
}

/** Parses without I/O or evaluation; the returned task calls the existing API. */
function prepare(command: Command, options: Options) {
  const mode = command === "events" ? choice(required(options, "mode"), ["heliacal", "horizon"], "mode") : null;
  const names = command === "phase" ? ["body", "at", ...SITE_OPTIONS]
    : command === "crescent" ? [...SITE_OPTIONS, ...RANGE_OPTIONS, "model", "last-category", "max-elongation-deg", "morning-timing", "max-geometry-samples"]
      : ["body", "mode", ...SITE_OPTIONS, ...RANGE_OPTIONS,
        ...(mode === "heliacal" ? ["model", ...THRESHOLD_OPTIONS, "max-geometry-samples"] : ["kinds"])];
  allowed(options, names);
  const site = observer({
    latitude: decimal(required(options, "latitude"), "latitude"),
    longitude: decimal(required(options, "longitude"), "longitude"),
    ...(options.has("height") ? { height: decimal(required(options, "height"), "height") } : {})
  });
  if (command === "phase") {
    const body = visibilityBody(required(options, "body"));
    const at = instant(required(options, "at"));
    return () => phase(body, at, site);
  }
  const range = dateRange(required(options, "from"), required(options, "to"));
  const maxSamples = budget(options, "max-samples");
  const maxGeometrySamples = budget(options, "max-geometry-samples");
  const searchOptions = {
    ...(maxSamples === undefined ? {} : { maxSamples }),
    ...(maxGeometrySamples === undefined ? {} : { maxGeometrySamples })
  };
  if (command === "crescent") {
    const model = choice(required(options, "model"), ["yallop-1997/1", "odeh-2006/1"], "model");
    const category = required(options, "last-category");
    const maxElongationDeg = decimal(required(options, "max-elongation-deg"), "max-elongation-deg");
    if (maxElongationDeg <= 0 || maxElongationDeg > 90) throw new RangeError("--max-elongation-deg must be in (0,90].");
    const morningTiming = choice(options.get("morning-timing") ?? "disabled", ["disabled", "mirror-evening"], "morning-timing");
    const policy: CrescentSearchPolicy = model === "yallop-1997/1"
      ? { model, lastAcceptedCategory: choice(category, ["A", "B", "C", "D"], "last-category"), maxElongationDeg, morningTiming }
      : { model, lastAcceptedCategory: choice(category, ["A", "B", "C"], "last-category"), maxElongationDeg, morningTiming };
    return () => crescentEvents(site, range.from, range.to, policy, searchOptions);
  }
  const body = visibilityBody(required(options, "body"));
  if (mode === "horizon") {
    const kinds = options.has("kinds") ? required(options, "kinds").split(",").map((value) => choice(value, HORIZON_PHENOMENA, "kinds")) : HORIZON_PHENOMENA;
    if (new Set(kinds).size !== kinds.length) throw new RangeError("--kinds must not repeat a phenomenon.");
    return () => horizonPhenomena(body, site, range.from, range.to, { ...searchOptions, kinds });
  }
  const model = choice(required(options, "model"), ["horizon-arcus-visionis/1"], "model");
  const thresholds: Partial<Record<HeliacalAppearance, number>> = {};
  for (const appearance of HELIACAL_APPEARANCES) {
    const name = `${appearance}-deg`;
    if (options.has(name)) thresholds[appearance] = horizonArcusVisionis(0, decimal(required(options, name), name)).requiredSolarDepressionDeg;
  }
  // The library validates body-specific appearances and requires a threshold.
  return () => heliacalEvents(body, site, range.from, range.to, { model, thresholds }, searchOptions);
}

export interface CliResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** No process or filesystem access; launchers own argv, streams and exit status. */
export function runCli(argv: readonly string[]): CliResponse {
  let command: Command | null = null;
  try {
    if (argv.length === 1 && argv[0] === "--help") return {
      exitCode: 0, stdout: `Usage: heliacal <events|crescent|phase> [options]\nUse heliacal COMMAND --help for command options.\n${COMMON_HELP}`, stderr: ""
    };
    command = commandOf(argv[0]);
    if (argv.length === 2 && argv[1] === "--help") return { exitCode: 0, stdout: HELP[command] + COMMON_HELP, stderr: "" };
    const result = prepare(command, optionsOf(argv.slice(1)))();
    return {
      exitCode: result.status === "refused" ? 2 : result.status === "unresolved" ? 3 : 0,
      stdout: serializeCliJson({ schema: SCHEMA, command, units: UNITS, result }), stderr: ""
    };
  } catch (error) {
    return {
      exitCode: 1, stdout: "",
      stderr: serializeCliJson({ schema: SCHEMA, command, error: {
        code: error instanceof RangeError ? "invalid-input" : "execution-error",
        message: error instanceof Error ? error.message : "Calculation failed."
      } })
    };
  }
}
