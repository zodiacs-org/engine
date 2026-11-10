import { createHash } from 'node:crypto';

export const SAMPLER_VERSION = 'sha256-index-v1';
export const HOUSE_SYSTEMS = Object.freeze(['whole', 'equal', 'placidus', 'koch', 'porphyry', 'regiomontanus', 'campanus', 'alcabitius', 'morinus', 'meridian', 'vehlow', 'equal-mc', 'topocentric']);

function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative safe integer`);
}

// Independent fields use domain-separated counters, with no mutable PRNG state.
export function randomWord(seed, index, field, attempt = 0) {
  if (typeof seed !== 'string' || !seed.length || Buffer.byteLength(seed) > 1024) throw new RangeError('Invalid seed');
  integer(index, 'index'); integer(field, 'field'); integer(attempt, 'attempt');
  return createHash('sha256').update(JSON.stringify([SAMPLER_VERSION, seed, index, field, attempt])).digest().readUInt32BE(0);
}

export function sampleCase(config, index) {
  const { seed, startMs, endMs } = config;
  integer(index, 'index');
  if (![startMs, endMs].every(Number.isSafeInteger) ||
      ![startMs, endMs].every(value => Number.isFinite(new Date(value).getTime())) ||
      endMs <= startMs || !Number.isSafeInteger(endMs - startMs)) throw new RangeError('Invalid half-open millisecond span');
  const unit = field => randomWord(seed, index, field) / 2 ** 32;
  // Uniform discrete milliseconds from a 64-bit draw, using rejection to avoid modulo bias.
  const width = BigInt(endMs - startMs);
  const limit = (1n << 64n) - (1n << 64n) % width;
  let draw;
  for (let attempt = 0; ; attempt++) {
    draw = (BigInt(randomWord(seed, index, 0, attempt)) << 32n) | BigInt(randomWord(seed, index, 1, attempt));
    if (draw < limit) break;
  }
  // Uniform sphere area: longitude uniform, sine of latitude uniform.
  const latitude = Math.asin(2 * unit(2) - 1) * 180 / Math.PI;
  let houseWord;
  const houseLimit = 2 ** 32 - 2 ** 32 % HOUSE_SYSTEMS.length;
  for (let attempt = 0; ; attempt++) {
    houseWord = randomWord(seed, index, 4, attempt);
    if (houseWord < houseLimit) break;
  }
  return Object.freeze({ index, utc: new Date(startMs + Number(draw % width)).toISOString(),
    latitude, longitude: 360 * unit(3) - 180,
    houseSystem: HOUSE_SYSTEMS[houseWord % HOUSE_SYSTEMS.length] });
}

export function* shardIndices(total, shard, shards) {
  integer(total, 'total'); integer(shard, 'shard'); integer(shards, 'shards');
  if (!shards || shard >= shards) throw new RangeError('Invalid shard');
  for (let index = shard; index < total;) {
    yield index;
    if (total - index <= shards) break;
    index += shards;
  }
}
