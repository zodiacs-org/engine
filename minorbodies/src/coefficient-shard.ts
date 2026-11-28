/** Offline coefficient storage. Importing this module performs no I/O. */
import { createHash } from "node:crypto";
import { ACCEPTANCE_POLICY } from "./acceptance.ts";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { evaluateChebyshevSegment, validateChebyshevSegment } from "./chebyshev.ts";
import type { ChebyshevSegment } from "./chebyshev.ts";

export const SHARD_SCHEMA = "minorbodies-chebyshev-shard-v1";
export const SHARD_LIMITS = Object.freeze({
  maxSegments: 1024,
  maxBytesExclusive: ACCEPTANCE_POLICY.maxCommittedFileBytesExclusive
});
export const SHARD_CONVENTIONS = Object.freeze({
  timeScale: "tt", center: "500@399", frame: "ICRF", corrections: "LT+S",
  positionUnit: "au", velocityUnit: "au/tt-day",
  series: "sum(c[k]*T[k]);full-c0", interval: "start-inclusive;end-exclusive"
} as const);

export interface ShardProvenance {
  /** Synthetic shards must never be represented as Horizons data. */
  readonly source: "jpl-horizons" | "analytic-test";
  /** Digest of the frozen input manifest, including the full source identity. */
  readonly sourceManifestSha256: string;
  readonly generator: string;
  /** Digest of the generation recipe and implementation identity. */
  readonly generatorSha256: string;
}

export interface CoefficientShard {
  readonly schema: typeof SHARD_SCHEMA;
  readonly body: MinorBody;
  readonly conventions: typeof SHARD_CONVENTIONS;
  readonly provenance: ShardProvenance;
  /** Structural checks and hashes do not establish astronomical accuracy. */
  readonly validation: "unvalidated";
  readonly segments: readonly ChebyshevSegment[];
}

/** Stored outside the shard, e.g. in a future dataset manifest. No self-hash. */
export interface ShardDescriptor {
  readonly sha256: string;
  readonly byteLength: number;
  readonly body: MinorBody;
  readonly startJdTt: number;
  readonly endJdTt: number;
  readonly segmentCount: number;
  readonly sourceManifestSha256: string;
}

export interface SeamDifference {
  readonly jdTt: number;
  /** Euclidean distance between left and right endpoint vectors. */
  readonly positionAu: number;
  readonly velocityAuPerDay: number;
}

const validated = new WeakSet<object>();
function fail(message: string): never { throw new RangeError(`Invalid coefficient shard: ${message}`); }
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} has unexpected fields.`);
  }
  const properties = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(properties).length !== keys.length) fail(`${label} has unexpected fields.`);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const property = properties[key];
    if (!property || !property.enumerable || !Object.hasOwn(property, "value")) {
      fail(`${label} requires ordinary data fields.`);
    }
    snapshot[key] = property.value;
  }
  return snapshot;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("expected lowercase SHA-256.");
  return value;
}
function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function checkBytes(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength >= SHARD_LIMITS.maxBytesExclusive) {
    fail("encoded bytes must be below the file-size limit; split the shard.");
  }
}

/** Copies, validates and deeply freezes caller-owned input. Does not verify provenance truth. */
export function validateCoefficientShard(value: unknown): CoefficientShard {
  if (value !== null && typeof value === "object" && validated.has(value)) return value as CoefficientShard;
  const input = record(value, ["schema", "body", "conventions", "provenance", "validation", "segments"], "shard");
  if (input.schema !== SHARD_SCHEMA || input.validation !== "unvalidated") fail("unsupported schema or validation claim.");
  if (!isMinorBody(input.body)) fail("unknown body.");
  const conventions = record(input.conventions, Object.keys(SHARD_CONVENTIONS), "conventions");
  for (const [key, expected] of Object.entries(SHARD_CONVENTIONS)) {
    if (conventions[key] !== expected) fail("unsupported conventions.");
  }
  const provenance = record(input.provenance,
    ["source", "sourceManifestSha256", "generator", "generatorSha256"], "provenance");
  if (provenance.source !== "jpl-horizons" && provenance.source !== "analytic-test") fail("unsupported source.");
  if (typeof provenance.generator !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,159}$/.test(provenance.generator)) {
    fail("invalid generator identifier.");
  }
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > SHARD_LIMITS.maxSegments) {
    fail("invalid segment count; split the shard.");
  }
  const segments: ChebyshevSegment[] = [];
  const count = input.segments.length;
  for (let index = 0; index < count; index++) {
    const property = Object.getOwnPropertyDescriptor(input.segments, index);
    if (!property || !Object.hasOwn(property, "value")) fail("segments require ordinary array slots.");
    const segment: unknown = property.value;
    record(segment, ["startJdTt", "endJdTt", "coefficientsAu"], "segment");
    const checked = validateChebyshevSegment(segment);
    if (segments.length && segments[segments.length - 1]!.endJdTt !== checked.startJdTt) {
      fail("segments must be ordered and contiguous without overlaps or gaps.");
    }
    segments.push(checked);
  }
  const shard: CoefficientShard = Object.freeze({
    schema: SHARD_SCHEMA, body: input.body, conventions: SHARD_CONVENTIONS,
    provenance: Object.freeze({
      source: provenance.source,
      sourceManifestSha256: digest(provenance.sourceManifestSha256),
      generator: provenance.generator, generatorSha256: digest(provenance.generatorSha256)
    }),
    validation: "unvalidated", segments: Object.freeze(segments)
  });
  checkBytes(Buffer.byteLength(JSON.stringify(shard) + "\n", "utf8"));
  validated.add(shard);
  return shard;
}

function descriptorFor(shard: CoefficientShard, text: string): ShardDescriptor {
  return Object.freeze({
    sha256: hash(text), byteLength: Buffer.byteLength(text, "utf8"), body: shard.body,
    startJdTt: shard.segments[0]!.startJdTt,
    endJdTt: shard.segments[shard.segments.length - 1]!.endJdTt,
    segmentCount: shard.segments.length,
    sourceManifestSha256: shard.provenance.sourceManifestSha256
  });
}

/** Fixed field order, full binary64 JSON numbers and one trailing LF. */
export function encodeCoefficientShard(value: CoefficientShard): Readonly<{ text: string; descriptor: ShardDescriptor }> {
  const shard = validateCoefficientShard(value);
  const text = JSON.stringify(shard) + "\n";
  return Object.freeze({ text, descriptor: descriptorFor(shard, text) });
}

/** Requires an external descriptor. A matching digest detects changed bytes, not authorship. */
export function decodeCoefficientShard(text: string, expected: ShardDescriptor): CoefficientShard {
  const descriptor = record(expected, ["sha256", "byteLength", "body", "startJdTt", "endJdTt",
    "segmentCount", "sourceManifestSha256"], "descriptor");
  digest(descriptor.sha256);
  digest(descriptor.sourceManifestSha256);
  if (typeof text !== "string") fail("expected UTF-8 JSON text.");
  checkBytes(text.length);
  const bytes = Buffer.byteLength(text, "utf8");
  checkBytes(bytes);
  if (bytes !== descriptor.byteLength || hash(text) !== descriptor.sha256) fail("byte length or digest mismatch.");
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { fail("invalid JSON."); }
  const shard = validateCoefficientShard(parsed);
  // This also rejects duplicate keys, extraneous whitespace and noncanonical number spellings.
  if (text !== JSON.stringify(shard) + "\n") fail("noncanonical encoding.");
  const actual = descriptorFor(shard, text);
  for (const key of Object.keys(actual) as (keyof ShardDescriptor)[]) {
    if (descriptor[key] !== actual[key]) fail("descriptor does not match shard metadata.");
  }
  return shard;
}

/** Right segment owns an internal seam; the final endpoint is excluded. No extrapolation. */
export function evaluateCoefficientShard(value: CoefficientShard, jdTt: number) {
  const shard = validateCoefficientShard(value);
  const segments = shard.segments;
  if (typeof jdTt !== "number" || !Number.isFinite(jdTt) ||
      jdTt < segments[0]!.startJdTt || jdTt >= segments[segments.length - 1]!.endJdTt) {
    fail("epoch outside the half-open shard coverage.");
  }
  let lo = 0;
  let hi = segments.length;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (segments[mid]!.startJdTt <= jdTt) lo = mid;
    else hi = mid;
  }
  return Object.freeze({ jdTt, segmentIndex: lo, ...evaluateChebyshevSegment(segments[lo]!, jdTt) });
}

/** Also usable for the join between the last and first segments of neighboring shards. */
export function measureSegmentJoin(left: ChebyshevSegment, right: ChebyshevSegment): SeamDifference {
  left = validateChebyshevSegment(left);
  right = validateChebyshevSegment(right);
  if (left.endJdTt !== right.startJdTt) fail("join requires adjacent segments.");
  const a = evaluateChebyshevSegment(left, left.endJdTt);
  const b = evaluateChebyshevSegment(right, right.startJdTt);
  const positionAu = Math.hypot(...a.positionAu.map((v, i) => v - b.positionAu[i]!));
  const velocityAuPerDay = Math.hypot(...a.velocityAuPerDay.map((v, i) => v - b.velocityAuPerDay[i]!));
  if (!Number.isFinite(positionAu) || !Number.isFinite(velocityAuPerDay)) fail("nonfinite seam difference.");
  return Object.freeze({ jdTt: left.endJdTt, positionAu, velocityAuPerDay });
}

export function measureShardSeams(value: CoefficientShard): readonly SeamDifference[] {
  const shard = validateCoefficientShard(value);
  return Object.freeze(shard.segments.slice(1).map((segment, i) => measureSegmentJoin(shard.segments[i]!, segment)));
}

/** Caller must preregister numerical seam limits; these are not astronomy accuracy bounds. */
export function assertShardContinuity(value: CoefficientShard, limits: Readonly<{
  positionAu: number; velocityAuPerDay: number;
}>): readonly SeamDifference[] {
  const checked = record(limits, ["positionAu", "velocityAuPerDay"], "seam limits");
  for (const limit of Object.values(checked)) {
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0) fail("invalid seam limit.");
  }
  const seams = measureShardSeams(value);
  if (seams.some((seam) => seam.positionAu > (checked.positionAu as number) ||
      seam.velocityAuPerDay > (checked.velocityAuPerDay as number))) {
    fail("position or velocity discontinuity exceeds the supplied limit.");
  }
  return seams;
}
