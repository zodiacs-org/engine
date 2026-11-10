import { readFile } from "node:fs/promises";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest } from "./inputs.js";
import type { HouseSystem } from "../../src/types.js";
import { searchIngresses } from "./ingresses.js";
import type { IngressSearchResult } from "./ingresses.js";
import { searchLunations } from "./lunations.js";
import type { LunationSearchResult } from "./lunations.js";
import { searchMundaneReport } from "./report.js";
import type { MundaneEvent, MundaneReportResult } from "./report.js";
import { loadEventsEclipseAdapter } from "./events-loader.js";
import type { EventsEclipseSettings } from "./events-bridge.js";

type Command = "ingresses" | "lunations" | "year";
type Result = IngressSearchResult | LunationSearchResult | MundaneReportResult;

export interface CliResponse {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

const commands: readonly string[] = ["ingresses", "lunations", "year"];
const common = ["latitude", "longitude", "name", "year", "from", "to", "house-system", "format"];
const specific: Record<Command, readonly string[]> = {
  ingresses: ["max-samples"],
  lunations: ["max-samples"],
  year: ["ingress-max-samples", "lunation-max-samples", "eclipse-settings"]
};

function help(command?: Command): string {
  return `Usage: mundane ${command ?? "<ingresses|lunations|year>"} --latitude DEG --longitude DEG
  (--year YEAR | --from ISO --to ISO) [options]

Commands:
  ingresses  Cardinal tropical solar ingress charts
  lunations  Geocentric New and Full Moon charts
  year       Chronological ingress and lunation report, for a year or range

Options:
  --name LABEL          Optional place label; coordinates are required
  --house-system NAME   Engine house system (default: whole)
  --format text|json    Text summary or complete library result (default: text)
  --max-samples N       Evaluation budget for ingresses or lunations
  --ingress-max-samples N   Ingress budget for year
  --lunation-max-samples N  Lunation budget for year
  --eclipse-settings PATH  year only: explicit events settings in local JSON
  --help, -h            Show help alone or after a command

Use --option value or --option=value. No positional places or local wall times.
Coordinates are decimal degrees, north/east positive. Date-only means UTC midnight.
Event window: (from, to]. An opening event is excluded, a closing event included.
Factors: traditional conventions, not predictions. Sampled searches are not proven.
Eclipse settings opt in to the built sibling events adapter; minima are not contacts.
Exit status: 0 complete/help; 1 invalid input or operational error; 2 refused search.
`;
}

function decimal(value: string, option: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value) || !Number.isFinite(Number(value))) {
    throw new RangeError(`--${option} requires finite decimal degrees.`);
  }
  return Number(value);
}

function integer(value: string, option: string, positive = false): number {
  if (!/^[+-]?\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || (positive && Number(value) < 1)) {
    throw new RangeError(`--${option} requires ${positive ? "a positive" : "a"} safe integer.`);
  }
  return Number(value);
}

function parse(args: readonly string[]): {
  command: Command; request: MundaneRequest; values: Map<string, string>; format: "json" | "text";
} {
  const first = args[0];
  if (first === undefined || !commands.includes(first)) {
    throw new RangeError("expected ingresses, lunations or year; use --help for usage.");
  }
  const command = first as Command;
  const allowed = new Set([...common, ...specific[command]]);
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index++) {
    const token = args[index]!;
    const match = /^--([a-z][a-z-]*)(?:=(.*))?$/u.exec(token);
    if (!match || !allowed.has(match[1]!)) throw new RangeError(`unexpected argument ${JSON.stringify(token)}.`);
    const key = match[1]!;
    if (values.has(key)) throw new RangeError(`--${key} was supplied more than once.`);
    const value = match[2] ?? args[++index];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new RangeError(`--${key} requires a value.`);
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined) throw new RangeError(`--${key} is required.`);
    return value;
  };
  const format = values.get("format") ?? "text";
  if (format !== "json" && format !== "text") throw new RangeError("--format must be text or json.");
  const year = values.get("year");
  if (year !== undefined && (values.has("from") || values.has("to"))) {
    throw new RangeError("supply either --year or both --from and --to.");
  }
  const request: MundaneRequest = {
    place: {
      latitude: decimal(required("latitude"), "latitude"),
      longitude: decimal(required("longitude"), "longitude"),
      ...(values.has("name") ? { name: values.get("name")! } : {})
    },
    ...(values.has("house-system") ? { houseSystem: values.get("house-system") as HouseSystem } : {}),
    ...(year === undefined ? { from: required("from"), to: required("to") } : { year: integer(year, "year") })
  };
  // Validate coordinates, calendars, names and houses before any file reads or
  // optional module loading. Preserve the original request for library output.
  normalizeRequest(request);
  for (const key of ["max-samples", "ingress-max-samples", "lunation-max-samples"]) {
    if (values.has(key)) integer(values.get(key)!, key, true);
  }
  return { command, request, values, format };
}

function textResult(command: Command, result: Result): string {
  const { request } = result;
  const lines = [
    `Mundane ${command}: ${result.status}`,
    "traditional conventions, not predictions",
    `Place: ${JSON.stringify(request.place)}`,
    `UTC input window (from, to]: (${request.range.from}, ${request.range.to}]`,
    `Requested houses: ${request.houseSystem}`
  ];
  if ("searches" in result) {
    for (const [kind, summary] of Object.entries(result.searches)) lines.push(`Search ${kind}: ${JSON.stringify(summary)}`);
  } else {
    lines.push(`Search: ${JSON.stringify(result.search)}`, `Samples: ${result.samples}`);
  }
  if (result.status === "refused") lines.push(`Refused: ${result.reason}; no partial events returned.`);
  const events: readonly MundaneEvent[] = "events" in result ? result.events :
    "ingresses" in result ? result.ingresses : result.lunations;
  if (result.status === "complete" && events.length === 0) lines.push("No events in this window.");
  for (const event of events) {
    const title = event.kind === "solar-ingress" ? `Sun into ${event.sign}` :
      event.kind === "lunation" ? `${event.phase === "new" ? "New" : "Full"} Moon` :
        `${event.eclipseKind} eclipse: ${event.contactKind}`;
    const chart = event.chart;
    lines.push("", `${event.at}  ${title}`,
      `  Angles (degrees): ${JSON.stringify(chart.angles)}`,
      `  Houses: requested=${chart.houses.requested}; actual=${chart.houses.actual}`,
      `  Cusps (degrees, house order): ${chart.houses.cusps.join(", ")}`,
      `  Flags: ${chart.flags.join(", ") || "none"}`,
      `  Time basis: ${JSON.stringify(chart.timeScale)}`,
      `  Delta T (seconds): ${JSON.stringify(chart.deltaT)}`,
      `  Engine: ${JSON.stringify(chart.provenance.engine)}`,
      `  Angular classical planets: ${event.angularity.angularPlanets.join(", ") || "none"}`);
    for (const body of chart.bodies) {
      lines.push(`  ${body.body}: longitude=${body.lon} deg; latitude=${body.lat} deg; speed=${body.speed} deg/day`);
    }
    for (const factor of event.factors.items) lines.push(`  - ${factor.text}`);
  }
  return lines.join("\n") + "\n";
}

/** Node-only CLI boundary. Importing it performs no IO or search. */
export async function runCli(args: readonly string[]): Promise<CliResponse> {
  try {
    if (args.length === 0 || (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))) {
      return { exitCode: 0, stdout: help(), stderr: "" };
    }
    if (args.length === 2 && commands.includes(args[0]!) && (args[1] === "--help" || args[1] === "-h")) {
      return { exitCode: 0, stdout: help(args[0] as Command), stderr: "" };
    }
    const { command, request, values, format } = parse(args);
    const budget = (key: string) => values.has(key) ? Number(values.get(key)) : undefined;
    let result: Result;
    if (command === "ingresses") {
      const maxSamples = budget("max-samples");
      result = searchIngresses(request, maxSamples === undefined ? {} : { maxSamples });
    } else if (command === "lunations") {
      const maxSamples = budget("max-samples");
      result = searchLunations(request, maxSamples === undefined ? {} : { maxSamples });
    } else {
      const ingressMaxSamples = budget("ingress-max-samples");
      const lunationMaxSamples = budget("lunation-max-samples");
      const path = values.get("eclipse-settings");
      const eclipses = path === undefined ? undefined : await loadEventsEclipseAdapter(
        JSON.parse(await readFile(path, "utf8")) as EventsEclipseSettings
      );
      result = searchMundaneReport(request, {
        ...(ingressMaxSamples === undefined ? {} : { ingressMaxSamples }),
        ...(lunationMaxSamples === undefined ? {} : { lunationMaxSamples }),
        ...(eclipses === undefined ? {} : { eclipses })
      });
    }
    return {
      exitCode: result.status === "complete" ? 0 : 2,
      stdout: format === "json" ? JSON.stringify(result, null, 2) + "\n" : textResult(command, result),
      stderr: ""
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation failed.";
    return { exitCode: 1, stdout: "", stderr: `mundane: ${JSON.stringify(message)}\n` };
  }
}
