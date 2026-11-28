export const COVERAGE = Object.freeze({
  startMs: Date.parse('1800-01-01T00:00:00Z'),
  endMs: Date.parse('2200-01-01T00:00:00Z')
});
export const BODIES = Object.freeze([
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'
]);
const DEFAULTS = Object.freeze({ ...COVERAGE, stepMs: 3_600_000, tileMs: 86_400_000, timeScale: 'utc' });

export function createConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Configuration must be an object');
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULTS, key) && key !== 'bodies') throw new RangeError('Unknown configuration field');
  }
  const config = { ...DEFAULTS, ...input };
  for (const key of ['startMs', 'endMs', 'stepMs', 'tileMs']) {
    if (!Number.isSafeInteger(config[key])) throw new RangeError(`${key} must be an integer in milliseconds`);
  }
  if (config.startMs < COVERAGE.startMs || config.endMs > COVERAGE.endMs || config.startMs >= config.endMs) {
    throw new RangeError('Configuration range must be nonempty and inside skydb coverage');
  }
  if (config.stepMs <= 0 || config.tileMs <= 0 || config.tileMs % config.stepMs !== 0) {
    throw new RangeError('Tile duration must be a positive multiple of the positive sample step');
  }
  if (config.timeScale !== 'utc') throw new RangeError('Only the engine UTC input time basis is supported');
  const bodies = input.bodies ?? BODIES;
  if (!Array.isArray(bodies) || bodies.length === 0 || new Set(bodies).size !== bodies.length ||
      Array.from(bodies).some(body => !BODIES.includes(body))) throw new RangeError('Bodies must be unique supported planet names');
  if (Object.hasOwn(input, 'bodies') && input.bodies === null) throw new RangeError('Bodies must be an array');
  return Object.freeze({ ...config, bodies: Object.freeze([...bodies]) });
}
