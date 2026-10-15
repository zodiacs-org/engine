import type { CalcRefusal } from "../../src/calc.js";
import { mansionAt } from "./at.js";
import type { MansionAtResult } from "./at.js";
import { INGRESS_SEARCH_LIMITS } from "./ingresses.js";
import { mansionRange } from "./range.js";
import type { MansionRangeResult } from "./range.js";
import { getBoundaryTable } from "./tables.js";
import type { BoundaryTableId, MansionDefinition } from "./tables.js";
import { MANSION_AYANAMSAS } from "./zodiac.js";
import type { MansionAyanamsa, MansionZodiac } from "./zodiac.js";

const HELP = `Usage:
  mansions at <instant> --table <id> [options]
  mansions range <from> <to> --table <id> [options]

Options:
  --table <id>           Required versioned table: equal28-aries-v1
  --zodiac <name>        tropical (default) or sidereal
  --ayanamsa <name>      Required with sidereal; rejected with tropical
  --format <name>        text (default) or json
  --max-samples <count>  Range only; shared engine evaluation budget
  --help, -h            Show help

Ayanamsas: ${MANSION_AYANAMSAS.join(", ")}

Instants use strict ISO dates (UTC midnight) or date-times with Z or an
explicit offset. Range occupancy is [from,to); ingresses are searched in
(from,to]. Clipped edges do not establish full mansion durations. Reported
ingresses mark the engine's first changed millisecond, not physical accuracy.
All results retain engine receipts. JSON preserves the library result.
Exit status: 0 success/help, 2 invalid arguments, 3 calculation refused,
1 unexpected calculation or startup failure. No partial range is printed.
`;

export interface CliOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: 0 | 1 | 2 | 3;
}

class ArgumentError extends Error {}

function parse(argv: readonly string[]) {
  const args = [...argv];
  const command = args.shift();
  if (command === undefined) return { help: true } as const;
  if (!["at", "range", "--help", "-h"].includes(command)) {
    throw new ArgumentError("Expected at or range. Use --help for usage.");
  }
  if (command === "--help" || command === "-h") {
    if (args.length) throw new ArgumentError("Global help takes no additional arguments.");
    return { help: true } as const;
  }
  const options = new Map<string, string>();
  const positional: string[] = [];
  const allowed = ["--table", "--zodiac", "--ayanamsa", "--format", "--help", "-h"];
  if (command === "range") allowed.push("--max-samples");
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    if (!token.startsWith("--") && token !== "-h") {
      positional.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const key = equals < 0 ? token : token.slice(0, equals);
    if (!allowed.includes(key)) throw new ArgumentError("Unknown or inapplicable option. Use --help for usage.");
    const canonical = key === "-h" ? "--help" : key;
    if (options.has(canonical)) throw new ArgumentError("Options must not be repeated.");
    if (canonical === "--help") {
      if (equals >= 0) throw new ArgumentError("Help does not take a value.");
      options.set(canonical, "true");
      continue;
    }
    const value = equals < 0 ? args[++i] : token.slice(equals + 1);
    if (value === undefined || value.trim() !== value || value === "" || value.startsWith("--") || value === "-h") {
      throw new ArgumentError("Every option requires a nonempty value.");
    }
    options.set(key, value);
  }
  if (options.has("--help")) return { help: true } as const;
  if (positional.length !== (command === "at" ? 1 : 2)) {
    throw new ArgumentError(command === "at" ? "at requires one instant." : "range requires from and to instants.");
  }
  const table = options.get("--table");
  if (table === undefined) throw new ArgumentError("--table is required; select a versioned boundary table.");
  getBoundaryTable(table as BoundaryTableId);
  const format = options.get("--format") ?? "text";
  if (format !== "text" && format !== "json") throw new ArgumentError("--format must be text or json.");
  const selection = options.get("--zodiac") ?? "tropical";
  const ayanamsa = options.get("--ayanamsa");
  let zodiac: MansionZodiac;
  if (selection === "tropical") {
    if (ayanamsa !== undefined) throw new ArgumentError("--ayanamsa requires --zodiac sidereal.");
    zodiac = "tropical";
  } else if (selection === "sidereal") {
    if (!MANSION_AYANAMSAS.includes(ayanamsa as MansionAyanamsa)) {
      throw new ArgumentError("--zodiac sidereal requires a supported --ayanamsa name. See --help.");
    }
    zodiac = { sidereal: ayanamsa as MansionAyanamsa };
  } else throw new ArgumentError("--zodiac must be tropical or sidereal.");
  const budget = options.get("--max-samples");
  let maxSamples: number | undefined;
  if (budget !== undefined) {
    if (!/^[1-9][0-9]*$/.test(budget) || !Number.isSafeInteger(Number(budget))
      || Number(budget) > INGRESS_SEARCH_LIMITS.maxSamples) {
      throw new ArgumentError(`--max-samples must be a decimal integer from 1 to ${INGRESS_SEARCH_LIMITS.maxSamples}.`);
    }
    maxSamples = Number(budget);
  }
  return { help: false, command, positional, table: table as BoundaryTableId, zodiac, format, maxSamples } as const;
}

const named = (mansion: MansionDefinition) => `${mansion.index} | ${mansion.arabicName} | ${mansion.latinLabel}`;
const zodiacLabel = (zodiac: MansionZodiac) => zodiac === "tropical" ? zodiac : `sidereal (${zodiac.sidereal})`;

function positionText(position: MansionAtResult, label: string): string[] {
  return [
    `${label} at: ${position.at}`,
    `${label} mansion: ${named(position.mansion)}`,
    `${label} Moon longitude (degrees): ${position.longitude}`,
    `${label} tropical Moon longitude (degrees): ${position.tropicalLongitude}`,
    `${label} ayanamsa: ${JSON.stringify(position.ayanamsa)}`,
    `${label} bounds: ${JSON.stringify(position.bounds)}`,
    `${label} engine receipt: ${JSON.stringify(position.receipt)}`,
    `${label} tropical bounds: ${JSON.stringify(position.tropicalBounds)}`,
    `${label} tropical engine receipt: ${JSON.stringify(position.tropicalReceipt)}`
  ];
}

function textResult(result: MansionAtResult | MansionRangeResult | CalcRefusal): string {
  if (result.status === "refused") return `Refused: ${JSON.stringify(result)}\n`;
  const lines = [`Table: ${result.table.id}`, `Zodiac: ${zodiacLabel(result.zodiac)}`];
  if ("at" in result) lines.push(...positionText(result, "Position"));
  else {
    lines.push(`Range: [${result.from}, ${result.to})`, `Resolution: ${result.resolution}`,
      `Engine evaluations: ${result.samples}; budget: ${result.maxSamples}; scan step (days): ${result.stepDays}`,
      `Endpoint engine receipts: ${JSON.stringify(result.receipts)}`,
      `Tropical endpoint engine receipts: ${JSON.stringify(result.tropicalReceipts)}`);
    if (!result.intervals.length) lines.push("Intervals: none (empty range)");
    for (const interval of result.intervals) {
      lines.push("", `Interval: [${interval.start}, ${interval.end})`, `Mansion: ${named(interval.mansion)}`,
        `Start clipped: ${interval.startClipped}; end clipped: ${interval.endClipped}`,
        ...positionText(interval.startPosition, "Start position"),
        ...positionText(interval.endPosition, "End position"),
        `Entry ingress: ${JSON.stringify(interval.entry)}`, `Exit ingress: ${JSON.stringify(interval.exit)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** CLI boundary without process I/O. The library entry never imports this file. */
export function runCli(argv: readonly string[]): CliOutput {
  try {
    const request = parse(argv);
    if (request.help) return { stdout: HELP, stderr: "", exitCode: 0 };
    const { table, zodiac } = request;
    const result = request.command === "at"
      ? mansionAt({ time: request.positional[0]!, table, zodiac })
      : mansionRange({ from: request.positional[0]!, to: request.positional[1]!, table, zodiac,
        ...(request.maxSamples === undefined ? {} : { maxSamples: request.maxSamples }) });
    return {
      stdout: request.format === "json" ? `${JSON.stringify(result)}\n` : textResult(result),
      stderr: "", exitCode: result.status === "ok" ? 0 : 3
    };
  } catch (error) {
    if (error instanceof ArgumentError || error instanceof RangeError) {
      return { stdout: "", stderr: `mansions: ${error.message}\n`, exitCode: 2 };
    }
    return { stdout: "", stderr: "mansions: calculation failed.\n", exitCode: 1 };
  }
}
