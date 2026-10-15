/** Offline astronomical evaluation after explicit source and coefficient loading. */
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { sha256 } from "./horizons-client.ts";
import type { HorizonsIdentity } from "./horizons-parser.ts";
import { decodeCoefficientShard, evaluateCoefficientShard, assertShardContinuity, measureSegmentJoin } from "./coefficient-shard.ts";
import type { CoefficientShard, ShardDescriptor } from "./coefficient-shard.ts";
import { ENGINE_BRIDGE_SETTINGS, resolveMinorBodyTime, reduceIcrfState } from "./engine-bridge.ts";
import type { MinorBodyTimeInput, MinorBodyTimeReceipt } from "./engine-bridge.ts";
import { readEngineSourceIdentity } from "./engine-identity.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";
import { verifyPilotSources } from "./pilot-sources.ts";

export const POSITION_CONVENTIONS = Object.freeze({
  center: "geocentric", frame: "ecliptic-true-of-date", zodiac: "tropical",
  corrections: "Horizons-LT+S;receive-light-time;stellar-aberration;no-gravitational-deflection",
  angles: "degrees", distance: "au", speedClock: "tt-day",
  speed: "analytic-Chebyshev-derivative-plus-frame-derivative",
  retrograde: "longitudeSpeedDegPerDay<0"
} as const);

export interface DatasetReceipt {
  readonly sourceManifestSha256: string;
  readonly generatorSha256: string;
  readonly sourceIdentity: HorizonsIdentity;
  readonly coverage: Readonly<{ startJdTt: number; endJdTt: number; interval: "start-inclusive;end-exclusive" }>;
  /** The loader verifies provenance and seams, not agreement at untested instants. */
  readonly validation: "accuracy-not-certified-by-loader";
  readonly shardDigests: readonly string[];
}
export interface PositionReceipt {
  readonly schema: "minorbodies-position-receipt-v1";
  readonly implementation: "minorbodies-position-v1";
  readonly body: MinorBody | null;
  readonly conventions: typeof POSITION_CONVENTIONS;
  readonly engineBridge: typeof ENGINE_BRIDGE_SETTINGS;
  readonly engineSource: EngineSourceIdentity;
  readonly time: MinorBodyTimeReceipt | null;
  readonly dataset: DatasetReceipt;
  readonly evaluatedShard: Readonly<{ sha256: string; segmentIndex: number }> | null;
}
export interface MinorBodyPosition {
  readonly status: "ok";
  readonly body: MinorBody;
  readonly jdTt: number;
  readonly longitudeDeg: number;
  readonly latitudeDeg: number;
  readonly distanceAu: number;
  readonly longitudeSpeedDegPerDay: number;
  readonly latitudeSpeedDegPerDay: number;
  readonly distanceSpeedAuPerDay: number;
  readonly retrograde: boolean;
  readonly receipt: PositionReceipt;
}
export interface MinorBodyRefusal {
  readonly status: "refused";
  readonly reason: "unknown-body" | "body-unavailable" | "invalid-time" | "outside-coverage" | "undefined-position";
  readonly receipt: PositionReceipt;
}
export type MinorBodyResult = MinorBodyPosition | MinorBodyRefusal;

export interface EphemerisInput {
  readonly sourceManifestText: string;
  readonly sourceManifestSha256: string;
  /** Original response bytes, addressed by the manifest's rawFile labels. */
  readonly rawSources: ReadonlyMap<string, string>;
  readonly shards: readonly Readonly<{ text: string; descriptor: ShardDescriptor }>[];
}

function fail(message: string): never { throw new RangeError(`Invalid minor-body dataset: ${message}`); }
/** M4 admits the frozen pilot recipe only. Source bytes are verified before use. */
function sourceManifest(input: EphemerisInput) {
  const text = input.sourceManifestText;
  if (typeof text !== "string" || Buffer.byteLength(text) >= 2_000_000 ||
      !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256) || sha256(text) !== input.sourceManifestSha256) fail("source manifest digest.");
  try { return verifyPilotSources(text, input.rawSources).sourceManifest; }
  catch { fail("source manifest, original responses or preregistered epoch sets do not agree."); }
}

/** Reads local engine source identity explicitly; makes no network request or file write. */
export async function loadMinorBodyEphemeris(input: EphemerisInput) {
  const source = sourceManifest(input);
  if (!Array.isArray(input.shards) || input.shards.length < 1 || input.shards.length > 64) fail("invalid shard count.");
  const loaded: { shard: CoefficientShard; descriptor: ShardDescriptor }[] = input.shards.map(item => {
    const shard = decodeCoefficientShard(item.text, item.descriptor);
    if (shard.body !== source.identity.body || shard.provenance.source !== "jpl-horizons" ||
        shard.provenance.sourceManifestSha256 !== input.sourceManifestSha256 ||
        shard.provenance.generatorSha256 !== source.generatorSha256 ||
        shard.provenance.generator !== source.generator.name) fail("coefficient provenance differs from source manifest.");
    assertShardContinuity(shard, source.recipe.seamLimits);
    return { shard, descriptor: Object.freeze({ ...item.descriptor }) };
  });
  for (let i = 1; i < loaded.length; i++) {
    const left = loaded[i - 1]!.shard.segments;
    const seam = measureSegmentJoin(left[left.length - 1]!, loaded[i]!.shard.segments[0]!);
    if (seam.positionAu > source.recipe.seamLimits.positionAu || seam.velocityAuPerDay > source.recipe.seamLimits.velocityAuPerDay) fail("discontinuous shard join.");
  }
  const first = loaded[0]!.descriptor;
  const last = loaded[loaded.length - 1]!.descriptor;
  if (first.startJdTt !== source.recipe.startJdTt || last.endJdTt !== source.recipe.endJdTt) fail("coverage differs from the source recipe.");
  const dataset: DatasetReceipt = Object.freeze({
    sourceManifestSha256: input.sourceManifestSha256,
    generatorSha256: source.generatorSha256,
    sourceIdentity: source.identity,
    coverage: Object.freeze({ startJdTt: first.startJdTt, endJdTt: last.endJdTt, interval: "start-inclusive;end-exclusive" }),
    validation: "accuracy-not-certified-by-loader",
    shardDigests: Object.freeze(loaded.map(item => item.descriptor.sha256))
  });
  const engineSource = await readEngineSourceIdentity();

  function calculate(body: MinorBody, time: MinorBodyTimeInput): MinorBodyResult {
    let timeReceipt: MinorBodyTimeReceipt | null = null;
    const receipt = (evaluatedShard: PositionReceipt["evaluatedShard"] = null): PositionReceipt => Object.freeze({
      schema: "minorbodies-position-receipt-v1", implementation: "minorbodies-position-v1",
      body: isMinorBody(body) ? body : null, conventions: POSITION_CONVENTIONS,
      engineBridge: ENGINE_BRIDGE_SETTINGS, engineSource, time: timeReceipt, dataset, evaluatedShard
    });
    const refused = (reason: MinorBodyRefusal["reason"]): MinorBodyRefusal => Object.freeze({ status: "refused", reason, receipt: receipt() });
    if (!isMinorBody(body)) return refused("unknown-body");
    if (body !== source.identity.body) return refused("body-unavailable");
    let jdTt: number;
    try {
      const resolved = resolveMinorBodyTime(time);
      jdTt = resolved.jdTt;
      timeReceipt = resolved.timeReceipt;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refused("invalid-time");
    }
    const item = loaded.find(({ descriptor }) => jdTt >= descriptor.startJdTt && jdTt < descriptor.endJdTt);
    if (!item) return refused("outside-coverage");
    const state = evaluateCoefficientShard(item.shard, jdTt);
    try {
      const reduced = reduceIcrfState(jdTt, { positionAu: state.positionAu, velocityAuPerDay: state.velocityAuPerDay });
      const { positionAu: _position, velocityAuPerDay: _velocity, ...position } = reduced;
      return Object.freeze({ status: "ok", body, jdTt, ...position,
        receipt: receipt(Object.freeze({ sha256: item.descriptor.sha256, segmentIndex: state.segmentIndex })) });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refused("undefined-position");
    }
  }
  return Object.freeze({ dataset, engineSource, calculate });
}

export type MinorBodyEphemeris = Awaited<ReturnType<typeof loadMinorBodyEphemeris>>;
