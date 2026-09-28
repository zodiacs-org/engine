// This bridge calls public built exports only. Python supplies all expectations.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const api = await import(pathToFileURL(process.argv[2]).href);
const input = JSON.parse(readFileSync(0, 'utf8'));
const capture = fn => { try { return {value: fn()}; } catch (error) { return {error: String(error)}; } };
const rotations = input.rotations.map(c => capture(() => ({
  equatorial: api.eclipticToEquatorial(c.lon, c.lat, c.eps),
  declination: api.declinationOf(c.lon, c.lat, c.eps),
  row: api.declinationsForBodies([{body: 'Synthetic', lon: c.lon, lat: c.lat}], c.eps).rows[0]
})));
const aspects = input.aspects.map(c => capture(() => api.findConfiguredAspects(c.positions, api.createAspectPolicy(c.policy))));
const declinations = input.declinations.map(c => capture(() => ({
  rows: api.declinationsForBodies(c.bodies, c.eps, c.policy).rows,
  aspects: api.findDeclinationAspects(c.bodies, c.eps, c.policy)
})));
process.stdout.write(JSON.stringify({engineVersion: api.ENGINE_VERSION,
  namedAngles: api.CONFIGURED_ASPECT_ANGLES, raPoleTolerance: api.RA_POLE_TOLERANCE,
  rotations, aspects, declinations}));
