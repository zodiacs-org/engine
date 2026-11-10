import assert from 'node:assert/strict';
import { join } from 'node:path';
import { environment, withWorkspace, hour, maximum } from './common.mjs';
import { createConfig, BODIES, COVERAGE } from '../src/config.mjs';
import { TIME_BOUNDARIES, planPositionTiles } from '../src/generate.mjs';
import { generateDatabase, verifyStoredTile } from '../src/store.mjs';
import { openDatabase } from '../src/query.mjs';
import { loadEngine } from '../src/engine.mjs';
import { signedAngle } from '../src/events.mjs';

if (process.argv.length !== 2) throw new Error('Agreement script takes no arguments');
const runtime = environment();
const engine = await loadEngine();
const starts = [1800, 1900, 2001, 2100, 2199].map(year => Date.parse(`${year}-01-01T00:00:00Z`));
starts.push(...TIME_BOUNDARIES.map(at => at - hour), COVERAGE.endMs - 2 * hour);
const report = await withWorkspace(async root => {
  const windows = [];
  for (const [index, startMs] of starts.entries()) {
    const config = createConfig({ startMs, endMs: startMs + 2 * hour, stepMs: hour, tileMs: 2 * hour });
    const directory = join(root, String(index));
    await generateDatabase(directory, config);
    const database = await openDatabase(directory, { cacheTiles: 1 });
    const errors = Object.fromEntries(BODIES.map(body => [body, {}]));
    let exactSamples = 0, interpolatedInstants = 0;
    for (const descriptor of planPositionTiles(config)) {
      const tile = (await verifyStoredTile(directory, descriptor)).positions;
      for (const sample of tile.samples) {
        // Smooth end support can be outside query coverage, but remains a direct engine sample.
        assert.deepEqual(sample.rows, engine.sample(sample.atMs, { bodies: config.bodies }));
        exactSamples++;
      }
      for (let i = 1; i < tile.samples.length; i++) {
        const left = tile.samples[i - 1].atMs, right = tile.samples[i].atMs;
        for (const fraction of [0.25, 0.5, 0.75]) {
          const atMs = left + Math.floor((right - left) * fraction);
          if (atMs <= left || atMs >= right) continue;
          const rows = (await database.positions(atMs)).rows;
          const direct = engine.sample(atMs, { bodies: config.bodies });
          interpolatedInstants++;
          rows.forEach((row, bodyIndex) => {
            const reference = direct[bodyIndex], result = errors[row.body];
            for (const field of ['lon', 'lat', 'speed']) {
              const error = Math.abs(field === 'lon' ? signedAngle(row[field] - reference[field]) : row[field] - reference[field]);
              result[field] = maximum(result[field], error, atMs);
            }
          });
        }
      }
    }
    windows.push({ config, exactSamples, interpolatedInstants, errors });
  }
  return windows;
});
console.log(JSON.stringify({ version: 1, measurement: 'Direct engine consumer agreement; no independent accuracy or full-span bound',
  runtime, units: { lon: 'degrees, shortest circular difference', lat: 'degrees', speed: 'degrees/day' },
  sampling: 'quarter, half and three-quarter points of each stored support interval', windows: report }, null, 2));
