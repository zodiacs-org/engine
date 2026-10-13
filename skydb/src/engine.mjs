import { readFile } from 'node:fs/promises';
import { requireNode22, verifyEngineArchive, ENGINE_IDENTITY } from './identity.mjs';
import { createConfig } from './config.mjs';

// Explicit local paths prevent fallback to the checkout's self-referencing package.
export async function loadEngine() {
  requireNode22();
  await verifyEngineArchive();
  const packageUrl = new URL('../node_modules/@zodiacs/engine/package.json', import.meta.url);
  const metadata = JSON.parse(await readFile(packageUrl, 'utf8'));
  const ephemeris = JSON.parse(await readFile(new URL('../node_modules/astronomy-engine/package.json', import.meta.url), 'utf8'));
  if (metadata.name !== ENGINE_IDENTITY.name || metadata.version !== ENGINE_IDENTITY.version ||
      metadata.dependencies['astronomy-engine'] !== ENGINE_IDENTITY.ephemeris || ephemeris.version !== ENGINE_IDENTITY.ephemeris) {
    throw new Error('Installed engine identity mismatch; rerun skydb setup');
  }
  const engine = await import(new URL('../node_modules/@zodiacs/engine/dist/index.js', import.meta.url));
  return Object.freeze({
    identity: ENGINE_IDENTITY,
    sample(atMs, options = {}) {
      const config = createConfig(options);
      if (!Number.isSafeInteger(atMs) || atMs < config.startMs || atMs >= config.endMs) {
        throw new RangeError('Sample must be an integer millisecond inside the configured half-open range');
      }
      const rows = engine.positions(new Date(atMs));
      return config.bodies.map(body => {
        const row = rows.find(value => value.body === body);
        if (!row || ![row.lon, row.lat, row.speed].every(Number.isFinite)) throw new Error('Invalid engine position');
        return { body, lon: row.lon, lat: row.lat, speed: row.speed };
      });
    }
  });
}
