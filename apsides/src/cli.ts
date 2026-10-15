import {
  APSIS_BODIES, PLANETARY_BODIES,
  searchLunarApsides, searchPlanetaryApsides, searchApsidesWindow
} from "./index.js";
import type { ApsisBody, CalcTime, PlanetaryBody } from "./index.js";

type Command = "lunar" | "planetary" | "window";

/** Stream contents and process status, without performing I/O or exiting. */
export interface CliResponse {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: 0 | 1 | 2 | 3;
}

const COMMANDS: readonly string[] = ["lunar", "planetary", "window"];
const COMMON_OPTIONS = ["from", "to", "from-jd-tt", "to-jd-tt", "max-evaluations"];
const COMMAND_OPTIONS: Record<Command, readonly string[]> = {
  lunar: ["syzygy-orb-degrees"],
  planetary: ["body"],
  window: ["bodies", "syzygy-orb-degrees"]
};
const isHelp = (value: string | undefined) => value === "--help" || value === "-h";

function help(command?: Command): string {
  const commands = command === undefined ? ["lunar", "planetary", "window"] as const : [command];
  const usage = commands.map((name) =>
    `  apsides ${name}${name === "planetary" ? " --body NAME" : ""} --from ISO --to ISO [options]`
  );
  return [
    "Find geometric orbital distance extrema with @zodiacs/engine.",
    "", "Usage:", ...usage, "", "Endpoints:",
    "  --from ISO              Start, excluded; date or date-time with UTC offset.",
    "  --to ISO                End, included; date or date-time with UTC offset.",
    "  --from-jd-tt JD          TT Julian date instead of --from.",
    "  --to-jd-tt JD            TT Julian date instead of --to.",
    "  Choose exactly one form for each endpoint; mixed forms are allowed.",
    "  Date-only ISO inputs mean UTC midnight on the engine's time basis.",
    "", "Options:",
    "  --max-evaluations N      Positive safe integer; one engine-call budget.",
    ...(command !== "planetary" ? [
      "  --syzygy-orb-degrees D   Optional lunar phase association, 0 <= D < 90.",
      "                          Requires Moon; no default orb or date ranking."
    ] : []),
    ...(command !== "lunar" ? [
      `  ${command === "window" ? "Planets:" : "--body NAME             Planetary target:"} ${PLANETARY_BODIES.join(", ")}.`
    ] : []),
    ...(command === undefined || command === "window" ? [
      "  --bodies LIST           Window only: comma-separated unique body names.",
      `                          Default: ${APSIS_BODIES.join(",")}.`
    ] : []),
    "  --help, -h              Show help alone, or immediately after a command.",
    "", "Names are case-sensitive. Use --option value or --option=value once each.",
    "Numbers use plain decimal notation, without whitespace or exponents.",
    "", "Results:",
    "  JSON on stdout retains TT instants, km distances, km/s speeds and receipts.",
    "  Lunar distance is geocentric; planetary distance is heliocentric.",
    "  Mars through Pluto use the disclosed system-barycenter convention.",
    "  Completion is sampled, not proven; Pluto's distance validation still fails.",
    "  No reference downloads occur during a search.",
    "", "Exit statuses:",
    "  0  Complete result (including no events), or help.",
    "  1  Unexpected runtime, load or output error.",
    "  2  Invalid arguments; JSON error on stderr and no stdout.",
    "  3  Refused search; full JSON refusal on stdout with an empty event list.",
    ""
  ].join("\n");
}

function readFlags(command: Command, args: readonly string[]): Map<string, string> {
  const allowed = new Set([...COMMON_OPTIONS, ...COMMAND_OPTIONS[command]]);
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    const match = /^--([a-z][a-z-]*)(?:=(.*))?$/u.exec(token);
    if (!match || !allowed.has(match[1]!)) {
      throw new RangeError("Unknown or command-inapplicable option. Use apsides --help.");
    }
    const name = match[1]!;
    if (flags.has(name)) throw new RangeError(`--${name} must be supplied only once.`);
    const value = match[2] ?? args[++index];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new RangeError(`--${name} requires a value.`);
    }
    flags.set(name, value);
  }
  return flags;
}

function decimal(value: string, name: string): number {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value) || !Number.isFinite(Number(value))) {
    throw new RangeError(`--${name} requires a finite plain decimal number.`);
  }
  return Number(value);
}

function endpoint(flags: ReadonlyMap<string, string>, name: "from" | "to"): CalcTime {
  const iso = flags.get(name);
  const jd = flags.get(`${name}-jd-tt`);
  if ((iso === undefined) === (jd === undefined)) {
    throw new RangeError(`Supply exactly one of --${name} and --${name}-jd-tt.`);
  }
  // Leave ISO parsing and time-basis resolution to the engine. Constructing a
  // Date here would normalize invalid calendar dates before it can reject them.
  if (iso !== undefined) return iso;
  return { jd: decimal(jd!, `${name}-jd-tt`), scale: "tt" };
}

function budget(flags: ReadonlyMap<string, string>): { maxEvaluations?: number } {
  const value = flags.get("max-evaluations");
  if (value === undefined) return {};
  if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new RangeError("--max-evaluations requires a positive safe integer in decimal notation.");
  }
  return { maxEvaluations: Number(value) };
}

function syzygy(flags: ReadonlyMap<string, string>): { syzygyOrbDegrees?: number } {
  const value = flags.get("syzygy-orb-degrees");
  if (value === undefined) return {};
  const orb = decimal(value, "syzygy-orb-degrees");
  if (orb < 0 || orb >= 90) throw new RangeError("--syzygy-orb-degrees must be at least 0 and less than 90.");
  return { syzygyOrbDegrees: orb };
}

function bodies(flags: ReadonlyMap<string, string>): { bodies?: readonly ApsisBody[] } {
  const value = flags.get("bodies");
  if (value === undefined) return {};
  const selected = value.split(",");
  if (new Set(selected).size !== selected.length ||
    selected.some((name) => !(APSIS_BODIES as readonly string[]).includes(name))) {
    throw new RangeError("--bodies requires comma-separated unique supported names, without spaces.");
  }
  return { bodies: selected as ApsisBody[] };
}

/** Thin command adapter. Searches stay in the pure library and retain its refusals. */
export function runCli(args: readonly string[]): CliResponse {
  try {
    if (args.length === 1 && isHelp(args[0])) {
      return { stdout: help(), stderr: "", exitCode: 0 };
    }
    if (!COMMANDS.includes(args[0] ?? "")) {
      throw new RangeError("Expected lunar, planetary or window. Use apsides --help.");
    }
    const command = args[0] as Command;
    if (args.length === 2 && isHelp(args[1])) {
      return { stdout: help(command), stderr: "", exitCode: 0 };
    }
    const flags = readFlags(command, args.slice(1));
    const options = { from: endpoint(flags, "from"), to: endpoint(flags, "to"), ...budget(flags) };
    let result;
    if (command === "planetary") {
      const body = flags.get("body");
      if (!(PLANETARY_BODIES as readonly unknown[]).includes(body)) {
        throw new RangeError("--body requires Mercury through Pluto, including Earth, with exact case.");
      }
      result = searchPlanetaryApsides(body as PlanetaryBody, options);
    } else if (command === "lunar") {
      result = searchLunarApsides({ ...options, ...syzygy(flags) });
    } else {
      result = searchApsidesWindow({ ...options, ...bodies(flags), ...syzygy(flags) });
    }
    // Serialize before exposing any stdout so a failed computation or encoding
    // cannot leave a successful-looking prefix or partial event list.
    return { stdout: `${JSON.stringify(result)}\n`, stderr: "", exitCode: result.status === "complete" ? 0 : 3 };
  } catch (error) {
    const invalid = error instanceof RangeError;
    return {
      stdout: "",
      stderr: `${JSON.stringify({
        status: "error", code: invalid ? "invalid-arguments" : "unexpected-error",
        message: invalid ? error.message : "The apsides computation failed unexpectedly."
      })}\n`,
      exitCode: invalid ? 2 : 1
    };
  }
}
