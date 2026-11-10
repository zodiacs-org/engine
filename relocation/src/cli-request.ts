import type { BirthInput } from "@zodiacs/engine";
import { NatalEnvelopeError, parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS } from "./angles.js";
import type { AngularBody, AngularLine } from "./angles.js";
import { relocateChart, sourceEnvelope } from "./chart.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { geographicBounds } from "./geography.js";
import { sampleGrid } from "./grid.js";
import type { GridOptions } from "./grid.js";
import { gridCrossings } from "./grid-crossings.js";
import type { GridCrossingOptions } from "./grid-crossings.js";
import { horizonLines, planHorizonLines } from "./horizon-lines.js";
import type { HorizonKind, HorizonLinesResult } from "./horizon-lines.js";
import { localSpaceLines } from "./local-space-lines.js";
import type { LocalSpaceLineOptions } from "./local-space-lines.js";
import { meridianLines, planMeridianLines } from "./meridian-lines.js";
import type { MeridianKind, MeridianLinesResult } from "./meridian-lines.js";
import { pathCrossings } from "./path-crossings.js";
import type { PathCrossingOptions } from "./path-crossings.js";

export type CliCommand = "chart" | "lines" | "grid";
export const MAX_CLI_INPUT_BYTES = 131_072;
export const MAX_CLI_JSON_DEPTH = 32;
export const RELOCATION_LINES_SCHEMA = "zodiacs.relocation-lines.v1";
export type CliErrorCode = "invalid-arguments" | "invalid-json" | "invalid-request"
  | "input-limit" | "input-io" | "output-io" | "serialization";

export class CliInputError extends Error {
  constructor(readonly code: CliErrorCode, message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

function invalid(message: string): never {
  throw new CliInputError("invalid-request", message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function fields(value: unknown, required: readonly string[], optional: readonly string[], label: string) {
  const obj = record(value, label);
  if (required.some((key) => !Object.hasOwn(obj, key))
    || Object.keys(obj).some((key) => !required.includes(key) && !optional.includes(key))) {
    invalid(`${label} has missing or unsupported fields.`);
  }
  return obj;
}

function finite(obj: Record<string, unknown>, keys: readonly string[], label: string) {
  for (const key of keys) {
    if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
      invalid(`${label}.${key} must be a finite JSON number.`);
    }
  }
}

function point(value: unknown, label: string): GeographicPoint {
  const obj = fields(value, ["latitude", "longitude"], [], label);
  finite(obj, ["latitude", "longitude"], label);
  return obj as unknown as GeographicPoint;
}

// JSON.parse validates grammar. This independent token scan rejects duplicate
// object keys (including escaped spellings) and bounds depth before decoding.
function checkJsonStructure(text: string): void {
  const stack: { keys: Set<string> | null; keyNext: boolean }[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      while (++index < text.length && text[index] !== '"') {
        if (text[index] === "\\") index++;
      }
      if (index >= text.length) throw new CliInputError("invalid-json", "Input must be one valid JSON request.");
      const current = stack.at(-1);
      if (current?.keys && current.keyNext) {
        let key: string;
        try { key = JSON.parse(text.slice(start, index + 1)) as string; }
        catch { throw new CliInputError("invalid-json", "Input must be one valid JSON request."); }
        if (current.keys.has(key)) invalid("JSON object keys must be unique.");
        current.keys.add(key);
        current.keyNext = false;
      }
    } else if (char === "{" || char === "[") {
      stack.push({ keys: char === "{" ? new Set() : null, keyNext: char === "{" });
      if (stack.length > MAX_CLI_JSON_DEPTH) {
        throw new CliInputError("input-limit", "JSON nesting exceeds the CLI depth limit.");
      }
    } else if (char === "}" || char === "]") {
      stack.pop();
    } else if (char === ",") {
      const current = stack.at(-1);
      if (current?.keys) current.keyNext = true;
    }
  }
}

function source(value: unknown): RelocationSource {
  const obj = record(value, "source");
  if (["schema", "receipt", "result", "requiredFeatures"].some((key) => Object.hasOwn(obj, key))) {
    const parsed = parseNatalEnvelope(JSON.stringify(obj));
    if (!parsed.ok) throw new NatalEnvelopeError(parsed.code);
    return parsed.envelope;
  }
  fields(obj, ["utc"], ["latitude", "longitude", "timeScale", "houseSystem", "timeKnown", "deltaT", "flags"], "source");
  if (typeof obj.utc !== "string" && (typeof obj.utc !== "number" || !Number.isFinite(obj.utc))) {
    invalid("source.utc must be a resolved ISO string or finite epoch-millisecond number.");
  }
  // The engine validates date syntax, settings, flag semantics and coordinates.
  // This JSON boundary rejects extra fields so local-time input cannot be ignored.
  return obj as unknown as BirthInput;
}

function optionRecord(value: unknown, required: readonly string[], optional: readonly string[]) {
  const obj = fields(value, required, optional, "options");
  finite(obj, required.filter((key) => !["bounds", "from", "to", "origin"].includes(key)), "options");
  if (Object.hasOwn(obj, "bounds")) {
    const bounds = fields(obj.bounds, ["south", "north", "west", "east"], [], "options.bounds");
    finite(bounds, ["south", "north", "west", "east"], "options.bounds");
    geographicBounds(bounds as unknown as Parameters<typeof geographicBounds>[0]);
  }
  for (const key of ["from", "to", "origin"]) {
    if (Object.hasOwn(obj, key)) point(obj[key], `options.${key}`);
  }
  return obj;
}

interface AngularLinesOptions {
  readonly bounds: Parameters<typeof geographicBounds>[0];
  readonly latitudeStep: number;
  readonly bodies?: readonly AngularBody[];
  readonly lines?: readonly AngularLine[];
  readonly maxEvaluations: number;
}

type FamilyResult = MeridianLinesResult | HorizonLinesResult;
export type AngularLinesResult = {
  readonly schema: typeof RELOCATION_LINES_SCHEMA;
  readonly maxEvaluations: number;
  readonly requiredEvaluations: number;
} & ({ readonly status: "ok"; readonly results: readonly FamilyResult[] }
  | { readonly status: "refused"; readonly reason: "unknown-time" | "engine-refusal";
    readonly results: readonly Extract<FamilyResult, { status: "refused" }>[] });

function angularLines(natalSource: RelocationSource, options: AngularLinesOptions): AngularLinesResult {
  const bodies = checkedBodies(options.bodies);
  const selection = options.lines === undefined ? ["ASC", "DSC", "MC", "IC"] : options.lines;
  if (!Array.isArray(selection) || selection.length < 1 || selection.length > 4
    || new Set(selection).size !== selection.length
    || selection.some((kind) => !["ASC", "DSC", "MC", "IC"].includes(kind))) {
    invalid("options.lines must select unique ASC, DSC, MC or IC names.");
  }
  if (!Number.isSafeInteger(options.maxEvaluations) || options.maxEvaluations < 1
    || options.maxEvaluations > MAX_ANGLE_EVALUATIONS) invalid("options.maxEvaluations is outside the angular budget limit.");
  const meridians = selection.filter((kind): kind is MeridianKind => kind === "MC" || kind === "IC");
  const horizons = selection.filter((kind): kind is HorizonKind => kind === "ASC" || kind === "DSC");
  const common = { bounds: options.bounds, latitudeStep: options.latitudeStep, bodies,
    maxEvaluations: options.maxEvaluations };
  const meridianOptions = { ...common, lines: meridians };
  const horizonOptions = { ...common, lines: horizons };
  const meridianPlan = meridians.length ? planMeridianLines(meridianOptions) : null;
  const horizonPlan = horizons.length ? planHorizonLines(horizonOptions) : null;
  const requiredEvaluations = (meridianPlan?.requiredEvaluations ?? 0) + (horizonPlan?.requiredEvaluations ?? 0);
  if (requiredEvaluations > options.maxEvaluations) {
    throw new AngularBudgetError(requiredEvaluations, options.maxEvaluations);
  }
  // Capture a raw birth only once, after the combined budget preflight.
  const natal = sourceEnvelope(natalSource);
  const base = { schema: RELOCATION_LINES_SCHEMA, maxEvaluations: options.maxEvaluations, requiredEvaluations } as const;
  const results: FamilyResult[] = [];
  if (meridianPlan) {
    const result = meridianLines(natal, { ...meridianOptions, maxEvaluations: meridianPlan.requiredEvaluations });
    if (result.status === "refused") return { ...base, status: "refused", reason: result.reason, results: [result] };
    results.push(result);
  }
  if (horizonPlan) {
    const result = horizonLines(natal, { ...horizonOptions, maxEvaluations: horizonPlan.requiredEvaluations });
    if (result.status === "refused") return { ...base, status: "refused", reason: result.reason, results: [result] };
    results.push(result);
  }
  return { ...base, status: "ok", results };
}

const selections = ["bodies", "lines"];
const refinement = ["maxEvaluations", "maxRefinements", "coordinateTolerance", "residualTolerance"];

/** Parse bounded JSON and call the pure APIs. No file, network or process operations. */
export function executeJsonRequest(command: CliCommand, text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_CLI_INPUT_BYTES) {
    throw new CliInputError("input-limit", "Input exceeds the CLI byte limit.");
  }
  checkJsonStructure(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new CliInputError("invalid-json", "Input must be one valid JSON request."); }
  const request = fields(parsed, command === "chart" ? ["source", "destination"] : ["source", "mode", "options"], [], "request");
  const natalSource = source(request.source);
  if (command === "chart") return relocateChart(natalSource, point(request.destination, "destination"));
  if (command === "lines") {
    if (request.mode === "angular") {
      const options = optionRecord(request.options, ["bounds", "latitudeStep", "maxEvaluations"], selections);
      return angularLines(natalSource, options as unknown as AngularLinesOptions);
    }
    if (request.mode === "path") {
      const options = optionRecord(request.options, ["from", "to", "stepDegrees", ...refinement], selections);
      return pathCrossings(natalSource, options as unknown as PathCrossingOptions);
    }
    if (request.mode === "local-space") {
      const options = optionRecord(request.options, ["origin", "lengthDegrees", "stepDegrees", "maxEvaluations"], ["bodies", "directions"]);
      return localSpaceLines(natalSource, options as unknown as LocalSpaceLineOptions);
    }
    invalid("lines mode must be angular, path or local-space.");
  }
  if (command === "grid") {
    if (request.mode === "charts") {
      const options = optionRecord(request.options, ["bounds", "latitudeStep", "longitudeStep", "maxSamples"], []);
      return sampleGrid(natalSource, options as unknown as GridOptions);
    }
    if (request.mode === "crossings") {
      const options = optionRecord(request.options, ["bounds", "latitudeStep", "longitudeStep", ...refinement], selections);
      return gridCrossings(natalSource, options as unknown as GridCrossingOptions);
    }
    invalid("grid mode must be charts or crossings.");
  }
  throw new CliInputError("invalid-arguments", "Command must be chart, lines or grid.");
}
