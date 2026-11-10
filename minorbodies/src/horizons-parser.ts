import { minorBodyDefinition } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { assertHorizonsRequest } from "./horizons-request.ts";
import type { HorizonsRequest } from "./horizons-request.ts";

export class HorizonsParseError extends Error {
  constructor(message: string) {
    super(`Invalid Horizons response: ${message}`);
    this.name = "HorizonsParseError";
  }
}

export type CartesianTriple = readonly [number, number, number];
export interface HorizonsRow {
  readonly jdTt: number;
  readonly positionAu: CartesianTriple;
  /** Source state velocity, not assumed to differentiate the corrected position. */
  readonly velocityAuPerDay: CartesianTriple;
}
export interface HorizonsIdentity {
  readonly body: MinorBody;
  readonly targetNumber: number;
  readonly targetName: string;
  readonly targetSource: string;
  readonly orbitSolutionDate: string;
  readonly orbitEpochJdTdb: number;
  readonly initialPositionAu: CartesianTriple;
  readonly initialVelocityAuPerDay: CartesianTriple;
  readonly centerName: "Earth (399)";
  readonly centerSource: string;
  readonly smallPerturbersSource: string;
  readonly eopFile: string;
}
export interface HorizonsResponse {
  readonly signature: Readonly<{ source: "NASA/JPL Horizons API"; version: "1.2" }>;
  readonly identity: HorizonsIdentity;
  readonly rows: readonly HorizonsRow[];
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const MAX_RESPONSE_BYTES_EXCLUSIVE = 2_000_000;

function fail(message: string): never { throw new HorizonsParseError(message); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function numeric(value: string | undefined, label: string): number {
  if (value === undefined || !NUMBER.test(value.trim())) fail(`${label} is not a decimal number.`);
  const result = Number(value.trim());
  if (!Number.isFinite(result)) fail(`${label} is not finite.`);
  return result;
}
function triple(values: readonly string[], label: string): CartesianTriple {
  if (values.length !== 3) fail(`${label} does not have three components.`);
  return Object.freeze([
    numeric(values[0], label), numeric(values[1], label), numeric(values[2], label)
  ] as const);
}
function uniqueLine(lines: readonly string[], label: string): string {
  const matches = lines.filter((line) => line.startsWith(label));
  if (matches.length !== 1) fail(`expected one ${label} metadata line.`);
  return matches[0]!;
}
function metadata(lines: readonly string[], label: string): string {
  const line = uniqueLine(lines, label);
  const colon = line.indexOf(":", label.length);
  if (colon < 0 || line.slice(label.length, colon).trim() !== "") fail(`malformed ${label} metadata.`);
  return line.slice(colon + 1).trim();
}
function match(value: string, pattern: RegExp, label: string): RegExpExecArray {
  const result = pattern.exec(value);
  if (!result) fail(`unexpected ${label}.`);
  return result;
}
function expectMetadata(lines: readonly string[], label: string, value: string): void {
  if (metadata(lines, label) !== value) fail(`unexpected ${label}.`);
}

/** Parse only the observed, reviewed Horizons format and reject changed conventions. */
export function parseHorizonsResponse(raw: string, request: HorizonsRequest): HorizonsResponse {
  assertHorizonsRequest(request);
  if (typeof raw !== "string" || raw.length >= MAX_RESPONSE_BYTES_EXCLUSIVE ||
      new TextEncoder().encode(raw).byteLength >= MAX_RESPONSE_BYTES_EXCLUSIVE) fail("response is too large.");
  let envelope: unknown;
  try { envelope = JSON.parse(raw) as unknown; } catch { fail("invalid JSON."); }
  if (!record(envelope) || Object.hasOwn(envelope, "error")) fail("API error or invalid envelope.");
  const signature = envelope.signature;
  // 1.2 is the version in the original committed samples. A documented API version
  // is not sufficient to approve an unobserved response format.
  if (!record(signature) || signature.source !== "NASA/JPL Horizons API" || signature.version !== "1.2") {
    fail("unreviewed API signature.");
  }
  if (typeof envelope.result !== "string" || envelope.result.includes("\r")) fail("missing or malformed result text.");
  const lines = envelope.result.split("\n");
  const starts = lines.flatMap((line, index) => line === "$$SOE" ? [index] : []);
  const ends = lines.flatMap((line, index) => line === "$$EOE" ? [index] : []);
  if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]!) fail("expected unique ordered table markers.");
  if (lines.filter((line) => line.includes("$$SOE") || line.includes("$$EOE")).length !== 2) {
    fail("malformed or duplicate table markers.");
  }
  const header = lines.slice(0, starts[0]);
  const definition = minorBodyDefinition(request.body);
  const target = match(metadata(header, "Target body name"), /^(.+?)\s+\{source: ([A-Za-z0-9_.#+-]+)\}$/, "target identity");
  const targetName = target[1]!;
  const selected = match(targetName, /^(\d+) ([A-Za-z]+)(?: \([^()]+\))?$/, "target designation");
  if (Number(selected[1]) !== definition.number || selected[2] !== definition.name) fail("wrong target body.");
  const targetSource = target[2]!;
  if (!/^JPL#\d+$/.test(targetSource)) fail("unreviewed target solution source.");
  const rec = match(uniqueLine(header, "Rec #:"),
    /^Rec #:\s+(\d+)\s+(?:\(\+COV\)\s+)?Soln\.date:\s+(\d{4}-[A-Za-z]{3}-\d{2}_\d{2}:\d{2}:\d{2})\s+# obs:\s+\d+\s+\([^)]+\)\s*$/,
    "orbit record");
  if (Number(rec[1]) !== definition.number) fail("orbit record and requested target disagree.");
  const orbitReference = match(uniqueLine(header, "1: soln ref.="), /^1: soln ref\.= (JPL#\d+), OCC=\d+(?:\s+radar\(\d+ delay, \d+ Dop(?:\.\))?)?\s*$/, "orbit reference");
  if (orbitReference[1] !== targetSource) fail("orbit solution identifiers disagree.");
  const center = match(metadata(header, "Center body name"), /^Earth \(399\)\s+\{source: ([A-Za-z0-9_.#+-]+)\}$/, "Earth center");
  expectMetadata(header, "Center-site name", "BODY CENTER");
  match(metadata(header, "Center geodetic"), /^0\.0, 0\.0, 0\.0\s+\{E-lon\(deg\),Lat\(deg\),Alt\(km\)\}$/, "geocentric site");
  match(metadata(header, "Center cylindric"), /^0\.0, 0\.0, 0\.0\s+\{E-lon\(deg\),Dxy\(km\),Dz\(km\)\}$/, "geocentric site");
  const perturbers = match(metadata(header, "Small perturbers"), /^Yes\s+\{source: ([A-Za-z0-9_.#+-]+)\}$/, "small-body perturber solution");
  expectMetadata(header, "Output units", "AU-D");
  expectMetadata(header, "Output type", "LT+S CORRECTED cartesian states");
  expectMetadata(header, "Output format", "2 (position and velocity)");
  expectMetadata(header, "Reference frame", "ICRF");
  expectMetadata(header, "Step-size", "DISCRETE TIME-LIST");
  for (const label of ["Start time", "Stop  time"]) {
    match(metadata(header, label), /^(?:A\.D\.|B\.C\.) [0-9]+-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2}\.\d{4} TT$/, "TT time metadata");
  }
  const eopFile = metadata(header, "EOP file");
  if (!/^eop\.[A-Za-z0-9.]+$/.test(eopFile)) fail("unexpected EOP source.");
  const columns = header.filter((line) => /^\s*JD[A-Za-z]+\s*,/.test(line));
  if (columns.length !== 1 || columns[0]!.split(",").map((part) => part.trim()).join("|") !==
      "JDTT|Calendar Date (TT )|X|Y|Z|VX|VY|VZ|") fail("unexpected TT vector table columns.");

  const initialHeading = header.findIndex((line) => line === "Initial IAU76/J2000 heliocentric ecliptic osculating elements (au, days, deg.):");
  if (initialHeading < 0 || header.filter((line) => line.startsWith("Initial IAU76/")).length !== 1) fail("missing initial orbit state.");
  const initial = header.slice(initialHeading);
  const epoch = match(uniqueLine(initial, "  EPOCH="), /^  EPOCH=\s+(\S+)\s+! .+ \(TDB\)\s+Residual RMS=\s+\S+\s*$/, "initial TDB epoch");
  const position = match(uniqueLine(initial, "   X="), /^   X=\s*(\S+)\s+Y=\s*(\S+)\s+Z=\s*(\S+)\s*$/, "initial ICRF position");
  const velocity = match(uniqueLine(initial, "  VX="), /^  VX=\s*(\S+)\s+VY=\s*(\S+)\s+VZ=\s*(\S+)\s*$/, "initial ICRF velocity");
  if (initial.filter((line) => line.trim() === "Equivalent ICRF heliocentric cartesian coordinates (au, au/d):").length !== 1) {
    fail("missing initial ICRF state convention.");
  }
  const identity: HorizonsIdentity = Object.freeze({
    body: request.body,
    targetNumber: definition.number,
    targetName,
    targetSource,
    orbitSolutionDate: rec[2]!,
    orbitEpochJdTdb: numeric(epoch[1], "orbit epoch"),
    initialPositionAu: triple(position.slice(1), "initial position"),
    initialVelocityAuPerDay: triple(velocity.slice(1), "initial velocity"),
    centerName: "Earth (399)",
    centerSource: center[1]!,
    smallPerturbersSource: perturbers[1]!,
    eopFile
  });
  const data = lines.slice(starts[0]! + 1, ends[0]);
  if (data.length !== request.epochs.length) fail("row count does not match requested epochs.");
  const rows = data.map((line, index): HorizonsRow => {
    const fields = line.split(",").map((part) => part.trim());
    if (fields.length !== 9 || fields[8] !== "") fail("unexpected table column count.");
    if (!/^\d+\.\d{9}$/.test(fields[0]!)) fail("unexpected Julian date precision.");
    const jdTt = numeric(fields[0], "TT Julian date");
    if (jdTt !== Number(request.epochs[index]!.toFixed(9))) fail("returned epoch does not match requested TT epoch.");
    match(fields[1]!, /^(?:A\.D\.|B\.C\.) [0-9]+-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2}\.\d{4}$/, "calendar date column");
    return Object.freeze({
      jdTt,
      positionAu: triple(fields.slice(2, 5), "position"),
      velocityAuPerDay: triple(fields.slice(5, 8), "velocity")
    });
  });
  return Object.freeze({
    signature: Object.freeze({ source: "NASA/JPL Horizons API", version: "1.2" }),
    identity,
    rows: Object.freeze(rows)
  });
}

/** A dataset cannot silently combine different orbit or perturbing solutions. */
export function assertSameHorizonsSolution(left: HorizonsResponse, right: HorizonsResponse): void {
  if (JSON.stringify(left.signature) !== JSON.stringify(right.signature) ||
      JSON.stringify(left.identity) !== JSON.stringify(right.identity)) {
    throw new HorizonsParseError("mixed Horizons solution identities.");
  }
}
