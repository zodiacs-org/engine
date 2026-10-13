import { createConfig, COVERAGE } from './config.mjs';
import { loadEngine } from './engine.mjs';
import { ENGINE_IDENTITY } from './identity.mjs';
import { encodePositionTile, TILE_CONVENTIONS, TILE_LIMITS } from './tile.mjs';

// Pinned to the carried engine, not a forecast of future leap seconds.
// Public-domain IERS leap list MJD changes in the engine's time-scale-data.
const leapMjds = [41317,41499,41683,42048,42413,42778,43144,43509,43874,44239,
  44786,45151,45516,46247,47161,47892,48257,48804,49169,49534,50083,50630,
  51179,53736,54832,56109,57204,57754];
export const TIME_BOUNDARIES = Object.freeze([
  Date.parse('1940-12-31T18:00:00Z'),
  ...leapMjds.map(mjd => (mjd - 40587) * 86_400_000),
  // The engine includes the UT1 table's final timestamp; fallback starts +1 ms.
  Date.parse('2027-10-02T00:00:00Z') + 1
]);

function checkedConfig(input) {
  const config = createConfig(input);
  // Reserve the maximum codec metadata budget and both endpoint records.
  const records = Math.ceil(Math.min(config.tileMs, config.endMs - config.startMs) / config.stepMs) + 2;
  if (8 + TILE_LIMITS.metadataBytes + records * (8 + 24 * config.bodies.length) > TILE_LIMITS.rawBytes) {
    throw new RangeError('Sampling exceeds tile capacity; reduce tileMs or increase stepMs');
  }
  return config;
}

/** Lazy descriptors anchored to the requested start, split at every clock jump. */
export function* planPositionTiles(input = {}) {
  const config = checkedConfig(input);
  let index = 0;
  for (let base = config.startMs; base < config.endMs; base += config.tileMs) {
    const stop = Math.min(base + config.tileMs, config.endMs);
    let startMs = base;
    for (const endMs of [...TIME_BOUNDARIES.filter(at => at > base && at < stop), stop]) {
      const lastSampleMs = TIME_BOUNDARIES.includes(endMs) || endMs === COVERAGE.endMs ? endMs - 1 : endMs;
      yield Object.freeze({ index: index++, startMs, endMs, lastSampleMs });
      startMs = endMs;
    }
  }
}

/** One encoded tile in memory at a time. Persistence and resume are separate. */
export async function* generatePositionTiles(input = {}) {
  const config = checkedConfig(input);
  const engine = await loadEngine();
  for (const descriptor of planPositionTiles(config)) {
    const samples = [];
    const append = atMs => samples.push({ atMs, rows: engine.sample(atMs, { bodies: config.bodies }) });
    for (let atMs = descriptor.startMs; atMs < descriptor.lastSampleMs; atMs += config.stepMs) append(atMs);
    append(descriptor.lastSampleMs);
    const metadata = { startMs: descriptor.startMs, endMs: descriptor.endMs,
      bodies: config.bodies, engineSha256: ENGINE_IDENTITY.sha256, timeScale: config.timeScale,
      conventions: TILE_CONVENTIONS };
    yield { ...descriptor, bytes: encodePositionTile({ metadata, samples }) };
  }
}
