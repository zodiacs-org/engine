export { MINOR_BODIES, MINOR_BODY_NAMES, isMinorBody, minorBodyDefinition } from "./catalog.ts";
export type { MinorBody, MinorBodyDefinition } from "./catalog.ts";
export { ACCEPTANCE_POLICY } from "./acceptance.ts";
export { CHEBYSHEV_LIMITS, fitChebyshevSegment, evaluateChebyshevSegment, validateChebyshevSegment } from "./chebyshev.ts";
export type { CartesianTriple, ChebyshevSegment, ChebyshevSample, ChebyshevFitInput } from "./chebyshev.ts";
export {
  SHARD_SCHEMA, SHARD_LIMITS, SHARD_CONVENTIONS, validateCoefficientShard,
  encodeCoefficientShard, decodeCoefficientShard, evaluateCoefficientShard,
  measureSegmentJoin, measureShardSeams, assertShardContinuity
} from "./coefficient-shard.ts";
export type { ShardProvenance, CoefficientShard, ShardDescriptor, SeamDifference } from "./coefficient-shard.ts";
