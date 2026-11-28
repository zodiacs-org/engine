export interface CliArguments {
  readonly help?: true;
  readonly config?: string;
  readonly output?: string;
  readonly select?: readonly string[];
  readonly startUtc?: string;
  readonly endUtc?: string;
  readonly dtstamp?: string;
  readonly tzid?: string;
  readonly utc?: true;
}

export const CLI_HELP = `Usage: node scripts/calendar.mjs --config FILE [options]

Export a versioned synthetic schedule JSON file as iCalendar.
  --config FILE       Required JSON file; - reads stdin
  --output FILE       New file directly inside calendar/generated/; - is stdout
  --select KINDS      Comma-separated configured event kinds to include
  --start UTC         Override startUtc with canonical UTC ISO milliseconds
  --end UTC           Override endUtc with canonical UTC ISO milliseconds
  --dtstamp UTC       Override the required reproducible revision instant
  --tzid IANA         Override timezone ID (requires configured endpoint coverage)
  --utc               Emit UTC instead of the configured timezone
  --help              Show this help

Kinds: ingress,natal-transit,synastry-exact,station,eclipse,void-of-course
No wall clock defaults. Search definitions and work budgets come from JSON.
Existing output files are refused. A successful export must contain events.
`;

const fields = new Map<string, keyof CliArguments>([
  ["--config", "config"], ["--output", "output"], ["--select", "select"],
  ["--start", "startUtc"], ["--end", "endUtc"], ["--dtstamp", "dtstamp"], ["--tzid", "tzid"]
]);
const kinds = new Set(["ingress", "natal-transit", "synastry-exact", "station", "eclipse", "void-of-course"]);

export function parseCliArguments(argv: readonly string[]): CliArguments {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const result: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i]!;
    const field = option === "--utc" ? "utc" : fields.get(option);
    if (field === undefined) throw new RangeError("Unknown option. Use --help for usage.");
    if (field in result) throw new RangeError("An option was supplied more than once.");
    if (field === "utc") { result.utc = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith("--") || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new RangeError("An option requires a nonempty value.");
    }
    if (field === "select") {
      const selected = value.split(",");
      if (selected.some(kind => !kinds.has(kind)) || new Set(selected).size !== selected.length) {
        throw new RangeError("--select requires distinct supported event kinds.");
      }
      result.select = selected;
    } else result[field] = value;
  }
  if (!result.config) throw new RangeError("--config is required. Use --help for usage.");
  if (result.utc && result.tzid) throw new RangeError("--utc and --tzid cannot be combined.");
  return result as CliArguments;
}
