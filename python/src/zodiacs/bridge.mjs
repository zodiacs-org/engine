import { readFileSync } from 'node:fs';
import * as engine from './engine/dist/index.js';

const operations = Object.freeze({
  positions: engine.positions,
  natal_chart: engine.natalChart,
  moon_phase: engine.moonPhase,
  transits: engine.transits,
  synastry: engine.synastry,
  chart_points: engine.chartPoints,
  chart_declinations: engine.chartDeclinations,
  progressed_bodies: engine.progressedBodies,
  progressed_instant: engine.progressedInstant,
});

try {
  const { operation, args } = JSON.parse(readFileSync(0, 'utf8'));
  if (!Object.hasOwn(operations, operation) || !Array.isArray(args)) {
    throw new TypeError('Unknown operation or invalid arguments');
  }
  process.stdout.write(JSON.stringify({ result: operations[operation](...args) }));
} catch {
  // Do not echo potentially private chart inputs into logs or exceptions.
  process.stdout.write(JSON.stringify({ error: 'Engine rejected the calculation inputs' }));
  process.exitCode = 1;
}
