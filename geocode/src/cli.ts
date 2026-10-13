import { parseArgs } from "node:util";
import { loadAtlasTimeProvider } from "./atlas-time.js";
import { assertCivilDate, assertCivilTime } from "./civil-time.js";
import { createGeocoder } from "./geocoder.js";
import type { GeocodeRequest, GeocodeResult } from "./geocoder.js";
import { loadPlaceIndex } from "./load-index.js";
import { createPlaceLookup } from "./lookup.js";
import type { LookupOptions } from "./lookup.js";
import type { AtlasTimeProvider } from "./time.js";

const HELP = `Usage:
  geocode lookup <query> --index PATH [--country TEXT] [--region TEXT] [--limit N] [--json]
  geocode tz <query> --index PATH --date YYYY-MM-DD [--time HH:MM] [--country TEXT] [--region TEXT] [--limit N] [--json]
  geocode tz --place-id ID --index PATH --date YYYY-MM-DD [--time HH:MM] [--json]
  geocode [lookup|tz] --help

Quote multiword queries. Options accept --name value or --name=value.
Use -- before a query that starts with a hyphen. Each option may appear once.
--index is required: a local build directory, manifest.json, or complete dataset JSON.
No default sample, downloads, network requests or automatic place selection on ambiguity.
--country and --region use exact source codes or labels; --limit is 1 through 100 (default 10).
Results are JSON on stdout; --json is optional. Errors are JSON on stderr.
Dates are Gregorian civil dates; times are local HH:MM. Omit --time for a date-only answer,
which has no UTC instant or offset and does not consult a time provider.
Atlas rules take precedence for covered places and dates. Other readings use the engine's IANA resolver.
Gap/fold results retain the provider's policy and provenance; review them before choosing an instant.
Exit 0 does not establish historical certainty: retain atlas citations and uncertainty.

Exit statuses:
  0  Unique lookup, date-only result, or time status ok; help
  1  Index loading or time-provider failure
  2  Invalid command or input
  3  No matching place or unknown place ID
  4  Ambiguous place, repeated time (fold), or skipped time (gap)
  5  Timezone unavailable or atlas clock unavailable
`;

type Command = { readonly kind: "help" }
  | { readonly kind: "lookup"; readonly index: string; readonly query: string; readonly filters: LookupOptions }
  | { readonly kind: "tz"; readonly index: string; readonly request: GeocodeRequest };

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

class InputError extends Error {}

function parseCommand(args: readonly string[]): Command {
  if (!args.length || (args.length === 1 && ["--help", "-h"].includes(args[0]!))) {
    return { kind: "help" };
  }
  const [kind, ...words] = args;
  if (kind !== "lookup" && kind !== "tz") throw new InputError("Expected lookup or tz. Run geocode --help.");
  let parsed;
  try {
    parsed = parseArgs({
      args: words, strict: true, allowPositionals: true, tokens: true,
      options: {
        help: { type: "boolean", short: "h" }, json: { type: "boolean" },
        index: { type: "string" }, country: { type: "string" }, region: { type: "string" }, limit: { type: "string" },
        ...(kind === "tz" ? { date: { type: "string" as const }, time: { type: "string" as const }, "place-id": { type: "string" as const } } : {})
      }
    });
  } catch {
    // Node's parseArgs messages can echo the submitted option or value.
    throw new InputError("Invalid command options or missing value. Run geocode --help.");
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new InputError("Each option may be supplied only once.");
    seen.add(token.name);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    if (words.length !== 1) throw new InputError("Use --help on its own after the command.");
    return { kind: "help" };
  }
  const index = values.index;
  if (typeof index !== "string" || !index.trim() || /[\p{Cc}\p{Cs}]/u.test(index)
      || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(index) || index.startsWith("file:")) {
    throw new InputError("Supply --index with a local directory or JSON file path.");
  }
  const filters: { country?: string; region?: string; limit?: number } = {};
  if (values.country !== undefined) filters.country = values.country;
  if (values.region !== undefined) filters.region = values.region;
  if (values.limit !== undefined) {
    if (!/^(?:[1-9][0-9]?|100)$/u.test(values.limit)) {
      throw new InputError("--limit must be a decimal integer from 1 through 100.");
    }
    filters.limit = Number(values.limit);
  }
  // parseArgs validates these conditional tz-only options as strings.
  const placeId = values["place-id"] as string | undefined;
  if (placeId !== undefined) {
    if (positionals.length || Object.keys(filters).length) {
      throw new InputError("--place-id cannot be combined with a query or lookup filters.");
    }
  } else if (positionals.length !== 1) {
    throw new InputError("Supply one query; quote multiword queries.");
  }
  if (kind === "lookup") return { kind, index, query: positionals[0]!, filters };
  const date = values.date as string | undefined;
  const time = values.time as string | undefined;
  try {
    if (time === undefined) assertCivilDate(date as string);
    else assertCivilTime(date as string, time);
  } catch {
    throw new InputError("Supply --date as a Gregorian YYYY-MM-DD and optional --time as HH:MM.");
  }
  const civil = { date: date as string, ...(time === undefined ? {} : { time }) };
  const request: GeocodeRequest = placeId === undefined
    ? { ...civil, query: positionals[0]!, filters } : { ...civil, placeId };
  return { kind, index, request };
}

function timeExit(result: GeocodeResult): number {
  switch (result.status) {
    case "no-match": case "unknown-place": return 3;
    case "ambiguous-place": return 4;
    case "date-only": return 0;
    case "time-result":
      switch (result.time.status) {
        case "ok": return 0;
        case "ambiguous": case "nonexistent": return 4;
        case "unavailable": case "no-such-clock": return 5;
      }
  }
}

function failure(io: CliIO, status: number, code: string, message: string): number {
  io.stderr(`${JSON.stringify({ error: { code, message } })}\n`);
  return status;
}

/** Node-only command boundary. Importing it neither runs a command nor opens files. */
export async function runCli(args: readonly string[], io: CliIO): Promise<number> {
  let command: Command;
  try {
    command = parseCommand(args);
  } catch (error) {
    return failure(io, 2, "invalid-input", error instanceof InputError ? error.message : "Invalid command input.");
  }
  if (command.kind === "help") {
    io.stdout(HELP);
    return 0;
  }
  let dataset;
  try {
    dataset = await loadPlaceIndex(command.index);
  } catch {
    return failure(io, 1, "index-error", "Cannot load the local place index. Check its files and rebuild if needed.");
  }
  if (command.kind === "lookup") {
    try {
      const places = createPlaceLookup(dataset);
      const result = places.lookup(command.query, command.filters);
      io.stdout(`${JSON.stringify({ ...result, provenance: places.provenance })}\n`);
      return result.status === "unique" ? 0 : result.status === "no-match" ? 3 : 4;
    } catch {
      return failure(io, 2, "invalid-input", "Invalid lookup query or filters. Run geocode --help.");
    }
  }
  // Help, lookup, unresolved places and date-only requests need no atlas data.
  let loadedAtlas: AtlasTimeProvider | undefined;
  const geocoder = createGeocoder(dataset, {
    resolve(...params) {
      loadedAtlas ??= loadAtlasTimeProvider();
      return loadedAtlas.resolve(...params);
    }
  });
  // Validate selectors separately so a provider RangeError remains a provider
  // failure rather than being mislabeled as bad user input.
  try {
    if (command.request.placeId !== undefined) geocoder.getById(command.request.placeId);
    else geocoder.lookup(command.request.query, command.request.filters);
  } catch {
    return failure(io, 2, "invalid-input", "Invalid place selector or lookup filters. Run geocode --help.");
  }
  try {
    const result = await geocoder.resolve(command.request);
    io.stdout(`${JSON.stringify(result)}\n`);
    return timeExit(result);
  } catch {
    return failure(io, 1, "resolution-error", "The time provider failed; no fallback answer was substituted.");
  }
}
