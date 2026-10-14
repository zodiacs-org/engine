import { catalog, findStar } from "./catalog.js";
import { findStarContacts } from "./contacts.js";
import type { ContactOrbs } from "./contacts.js";
import { dateFrom, skyBodyOf, skyBudgetOf, skyConventionsOf, skyObserverOf } from "./engine.js";
import type { BirthInput, SkyOptions } from "./engine.js";
import { natalStarHits } from "./natal.js";
import { PARAN_ANGLE_EVENTS, searchParans } from "./parans.js";
import type { ParanAngleInput, ParanRequest } from "./parans.js";
import type { StarSkySearch } from "./sky.js";
import type { CatalogStar } from "./types.js";

type Command = "list" | "hits" | "parans";
type Options = Map<string, string[]>;
export interface CliReply {
  readonly exitCode: 0 | 1 | 2 | 3;
  readonly stdout: string;
  readonly stderr: string;
}
export interface CliDependencies {
  /** Node preparation is injected; this module never imports the Node loader. */
  prepareSky(): Promise<StarSkySearch>;
}

const SCHEMA = "fixedstars-cli/1";
const COMMON = ["star"];
const ALLOWED = {
  list: COMMON,
  hits: [...COMMON, "utc", "latitude", "longitude", "house-system", "time-known", "time-scale", "delta-t",
    "conjunction-deg", "parallel-deg"],
  parans: [...COMMON, "from", "to", "latitude", "longitude", "height", "orb-ms", "body", "bodies", "angle",
    "star-refraction", "body-refraction", "body-limb", "star-max-samples", "body-max-samples"]
} satisfies Record<Command, string[]>;
const REPEATABLE = new Set(["star", "body", "angle"]);

const USAGE = `fixedstars list [--star ID_OR_NAME ...]
fixedstars hits --utc INSTANT --conjunction-deg DEGREES_OR_none --parallel-deg DEGREES_OR_none [options]
fixedstars parans --from INSTANT --to INSTANT --latitude DEG --longitude DEG --orb-ms MS
  (--body BODY ... | --bodies none) [options]

All commands emit JSON. Use --help alone or COMMAND --help for usage.
Stars default to the catalog; repeat --star to select ids, names or aliases.
hits options: --latitude DEG --longitude DEG (together), --house-system SYSTEM,
  --time-known true|false, --time-scale utc|ut1|tt, --delta-t SECONDS.
parans options: --height METRES, --angle 'ANGLE@INSTANT' (repeatable),
  --star-refraction none|standard, --body-refraction none|standard,
  --body-limb centre|upper|lower, --star-max-samples INTEGER|unlimited,
  --body-max-samples INTEGER|unlimited. Budgets apply per subject call.
Angles: Ascendant, Descendant, Midheaven, Imum Coeli. Supply explicit anchors.
Instants use the engine's resolved ISO syntax; date-only means UTC midnight.
Numbers use finite plain decimal syntax; orbs are inclusive and nonnegative.
Use --option VALUE or --option=VALUE; other positional arguments are refused.
Exit codes: 0 complete/help (including no hits), 1 runtime/preparation failure,
  2 invalid request, 3 whole-result sample-budget refusal.
Historical lore is attributed belief; stellar positions omit the corrections
listed in the library conventions and have no measured physical accuracy bound.
`;

function one(options: Options, key: string): string | undefined { return options.get(key)?.[0]; }
function required(options: Options, key: string): string {
  const value = one(options, key);
  if (value === undefined) throw new RangeError(`--${key} is required.`);
  return value;
}
function decimal(value: string, key: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value) || !Number.isFinite(Number(value))) {
    throw new RangeError(`--${key} requires a finite plain decimal number.`);
  }
  return Number(value);
}
function choice<T extends string>(value: string, key: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new RangeError(`--${key} must be ${choices.join(" or ")}.`);
  return value as T;
}

function optionsOf(argv: readonly string[], command: Command): Options {
  const options: Options = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const equal = token.indexOf("=");
    const key = token.slice(2, equal < 0 ? undefined : equal);
    if (!token.startsWith("--") || !ALLOWED[command].includes(key)) {
      throw new RangeError(`Unsupported ${command} option or argument: ${token}.`);
    }
    if (options.has(key) && !REPEATABLE.has(key)) throw new RangeError(`--${key} may be given only once.`);
    const value = equal < 0 ? argv[++i] : token.slice(equal + 1);
    if (value === undefined || value.trim() === "" || value.startsWith("--")) {
      throw new RangeError(`--${key} requires a value.`);
    }
    options.set(key, [...(options.get(key) ?? []), value]);
  }
  return options;
}

function selectedStars(options: Options): readonly CatalogStar[] {
  const queries = options.get("star");
  if (queries === undefined) return catalog;
  const seen = new Set<string>();
  return queries.map((query) => {
    const star = findStar(query);
    if (!star) throw new RangeError(`Unknown catalog star: ${query}.`);
    if (seen.has(star.id)) throw new RangeError(`Repeated catalog star: ${star.id}.`);
    seen.add(star.id);
    return star;
  });
}

function birthOf(options: Options): BirthInput {
  const birth: BirthInput = { utc: dateFrom(required(options, "utc"), "--utc") };
  for (const key of ["latitude", "longitude"] as const) {
    const value = one(options, key);
    if (value !== undefined) birth[key] = decimal(value, key);
  }
  const house = one(options, "house-system");
  if (house !== undefined) birth.houseSystem = choice(house, "house-system", ["whole", "placidus", "porphyry",
    "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"]);
  const known = one(options, "time-known");
  if (known !== undefined) birth.timeKnown = choice(known, "time-known", ["true", "false"]) === "true";
  const scale = one(options, "time-scale");
  if (scale !== undefined) birth.timeScale = choice(scale, "time-scale", ["utc", "ut1", "tt"]);
  const deltaT = one(options, "delta-t");
  if (deltaT !== undefined) birth.deltaT = decimal(deltaT, "delta-t");
  // The engine validates the paired coordinates, their ranges and the pin.
  return birth;
}
function orbsOf(options: Options): ContactOrbs {
  const orb = (key: string) => {
    const value = required(options, key);
    return value === "none" ? null : decimal(value, key);
  };
  return findStarContacts([], [], {
    conjunctionDeg: orb("conjunction-deg"), parallelDeg: orb("parallel-deg")
  }).orbs;
}

function skyOptions(options: Options, subject: "star" | "body"): SkyOptions {
  const policy: { refraction?: "none" | "standard"; limb?: "centre" | "upper" | "lower"; maxSamples?: number } = {};
  const refraction = one(options, `${subject}-refraction`);
  if (refraction !== undefined) policy.refraction = choice(refraction, `${subject}-refraction`, ["none", "standard"]);
  const limb = subject === "body" ? one(options, "body-limb") : undefined;
  if (limb !== undefined) policy.limb = choice(limb, "body-limb", ["centre", "upper", "lower"]);
  const budget = one(options, `${subject}-max-samples`);
  if (budget !== undefined) {
    if (budget !== "unlimited" && (!/^\d+$/u.test(budget) || !Number.isSafeInteger(Number(budget)))) {
      throw new RangeError(`--${subject}-max-samples requires a positive safe integer or unlimited.`);
    }
    policy.maxSamples = skyBudgetOf(budget === "unlimited" ? Infinity : Number(budget));
  }
  return policy;
}

function paranRequest(options: Options, stars: readonly CatalogStar[]): ParanRequest {
  const observer = skyObserverOf({ latitude: decimal(required(options, "latitude"), "latitude"),
    longitude: decimal(required(options, "longitude"), "longitude"),
    ...(one(options, "height") === undefined ? {} : { height: decimal(required(options, "height"), "height") }) });
  const from = dateFrom(required(options, "from"), "--from");
  const to = dateFrom(required(options, "to"), "--to");
  if (to.getTime() <= from.getTime()) throw new RangeError("--to must be after --from.");
  const orbMs = decimal(required(options, "orb-ms"), "orb-ms");
  if (orbMs < 0) throw new RangeError("--orb-ms must be nonnegative milliseconds.");
  const emptyBodies = one(options, "bodies");
  if (emptyBodies !== undefined) {
    choice(emptyBodies, "bodies", ["none"]);
    if (options.has("body")) throw new RangeError("Use either --body or --bodies none.");
  } else if (!options.has("body")) throw new RangeError("Select --body or explicit --bodies none.");
  const bodies = (options.get("body") ?? []).map(skyBodyOf);
  if (new Set(bodies).size !== bodies.length) throw new RangeError("--body selections must be unique.");
  const seen = new Set<string>();
  const angles: ParanAngleInput[] = (options.get("angle") ?? []).map((value) => {
    const atSign = value.indexOf("@");
    if (atSign < 0) throw new RangeError("--angle requires ANGLE@INSTANT.");
    const angle = choice(value.slice(0, atSign), "angle", Object.keys(PARAN_ANGLE_EVENTS) as (keyof typeof PARAN_ANGLE_EVENTS)[]);
    const at = dateFrom(value.slice(atSign + 1), "--angle instant");
    if (at < from || at >= to) throw new RangeError("--angle anchors must be inside [from,to).");
    const key = `${angle}@${at.toISOString()}`;
    if (seen.has(key)) throw new RangeError("--angle anchors must be unique by angle and instant.");
    seen.add(key);
    return { angle, at };
  });
  const starOptions = skyOptions(options, "star"), bodyOptions = skyOptions(options, "body");
  skyConventionsOf("Pluto", { ...starOptions });
  skyConventionsOf("Sun", { ...bodyOptions });
  for (const body of bodies) skyConventionsOf(body, { ...bodyOptions });
  return { observer, from, to, orbMs, stars, bodies, angles, starOptions, bodyOptions };
}

function json(value: unknown): string { return `${JSON.stringify(value)}\n`; }
export function cliError(error: unknown, command: Command | null = null): CliReply {
  const input = error instanceof RangeError;
  return { exitCode: input ? 2 : 1, stdout: "", stderr: json({ schema: SCHEMA, command, status: "error",
    error: { code: input ? "invalid-input" : "runtime", message: error instanceof Error ? error.message : "CLI runtime failure." } }) };
}

/** No process globals or file output. The executable owns streams and exit status. */
export async function runCli(argv: readonly string[], dependencies: CliDependencies): Promise<CliReply> {
  let command: Command | null = null;
  try {
    if (argv.length === 1 && argv[0] === "--help") return { exitCode: 0, stdout: USAGE, stderr: "" };
    command = choice<Command>(argv[0] ?? "", "command", ["list", "hits", "parans"]);
    if (argv.length === 2 && argv[1] === "--help") return { exitCode: 0, stdout: USAGE, stderr: "" };
    const options = optionsOf(argv.slice(1), command);
    const stars = selectedStars(options);
    if (command === "list") return { exitCode: 0, stderr: "", stdout: json({ schema: SCHEMA, command, status: "complete", stars }) };
    if (command === "hits") {
      const policy = orbsOf(options);
      const result = natalStarHits(birthOf(options), policy, stars);
      return { exitCode: 0, stderr: "", stdout: json({ schema: SCHEMA, command, status: "complete", result }) };
    }
    const request = paranRequest(options, stars);
    // Preparation failures are runtime failures even if the loader throws RangeError.
    let sky: StarSkySearch;
    try { sky = await dependencies.prepareSky(); }
    catch (error) { return cliError(new Error(error instanceof Error ? error.message : "Sky preparation failed."), command); }
    const result = searchParans(sky, request);
    return { exitCode: result.status === "refused" ? 3 : 0, stderr: "",
      stdout: json({ schema: SCHEMA, command, status: result.status, result }) };
  } catch (error) { return cliError(error, command); }
}
