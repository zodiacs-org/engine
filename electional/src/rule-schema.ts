/** Configuration vocabulary, aligned with the engine's public tropical APIs. */
export const RULE_SCHEMA_VERSION = 'electional/v1' as const;
export const PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
export const STATION_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
export const TRADITIONAL_PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;
export const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;
export const PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'] as const;
export const ASPECTS = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const;
export const HOUSE_SYSTEMS = ['whole', 'placidus', 'porphyry', 'equal', 'equal-mc', 'vehlow', 'koch', 'regiomontanus', 'campanus', 'topocentric', 'alcabitius', 'morinus', 'meridian'] as const;

export const RULE_LIMITS = Object.freeze({
  documentBytes: 65_536,
  depth: 16,
  nodes: 8_192,
  rules: 128,
  weight: 1_000_000,
});

type Schema = Record<string, unknown>;
const enumString = (values: readonly string[]): Schema => ({ type: 'string', enum: values });
const number = (minimum: number, maximum: number): Schema => ({ type: 'number', minimum, maximum });
const selected = (values: readonly string[]): Schema => ({
  type: 'array', minItems: 1, maxItems: values.length, uniqueItems: true, items: enumString(values),
});
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: 'object', additionalProperties: false, properties, required,
});
const instant: Schema = {
  type: 'string', maxLength: 29,
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$',
  format: 'resolved-instant',
};
const location = object({ latitude: number(-90, 90), longitude: number(-180, 180) });
const match = enumString(['any', 'all']);
const benefics = selected(['Venus', 'Jupiter']);
const houses: Schema = {
  type: 'array', minItems: 1, maxItems: 12, uniqueItems: true,
  items: { type: 'integer', minimum: 1, maximum: 12 },
};
const orb = number(0, 180);
const margin = number(0, 3660);
const polarFallback = enumString(['reject', 'allow']);

const options = {
  'moon-not-void': object({ bodies: enumString(['traditional', 'modern']) }),
  'direct-motion': object({ bodies: selected(['Mercury', 'Venus']) }),
  'moon-sign': object({ signs: selected(SIGNS) }),
  'moon-phase': object({ phases: selected(PHASES) }),
  'planetary-hour': object({ rulers: selected(TRADITIONAL_PLANETS), utcOffsetMinutes: number(-1080, 1080) }),
  'benefic-house': object({ bodies: benefics, houses, match, polarFallback }),
  'benefic-angular': object({ bodies: benefics, angles: selected(['ascendant', 'midheaven', 'descendant', 'imum-coeli']), maxOrbDegrees: orb, match }),
  'applying-aspect': object({ body: enumString(PLANETS), targets: selected(PLANETS), aspects: selected(ASPECTS), maxOrbDegrees: orb, match }),
  'avoid-eclipses': object({ kinds: selected(['solar', 'lunar']), withinDays: margin }),
  'avoid-stations': object({ bodies: selected(STATION_BODIES), withinDays: margin }),
  'synastry-aspect': object({ movingBodies: selected(PLANETS), natalBodies: selected(PLANETS), aspects: selected(ASPECTS), maxOrbDegrees: orb, match }),
};

function freezeSchema<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeSchema(child);
    Object.freeze(value);
  }
  return value;
}

/** Draft-07 JSON Schema. Runtime validation adds clock and cross-field checks. */
export const ruleSchema = freezeSchema({
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Electional rule set',
  ...object({
    schemaVersion: { const: RULE_SCHEMA_VERSION },
    activity: { type: 'string', minLength: 1, maxLength: 120, pattern: '^[^\\u0000-\\u001f\\u007f]+$' },
    location,
    range: object({ start: instant, end: instant, clock: { const: 'utc' } }),
    houseSystem: enumString(HOUSE_SYSTEMS),
    natal: object({ synthetic: { const: true }, instant, clock: { const: 'utc' }, location, houseSystem: enumString(HOUSE_SYSTEMS) }),
    rules: {
      type: 'array', minItems: 1, maxItems: RULE_LIMITS.rules,
      items: {
        oneOf: Object.entries(options).map(([kind, fields]) => ({
          ...object({
            id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9-]*$' },
            kind: { const: kind },
            mode: enumString(['require', 'prefer']),
            weight: { type: 'number', exclusiveMinimum: 0, maximum: RULE_LIMITS.weight },
            options: fields,
          }, ['id', 'kind', 'mode', 'options']),
          allOf: [{
            if: { properties: { mode: { const: 'prefer' } }, required: ['mode'] },
            then: { properties: { weight: {} }, required: ['weight'] },
            else: { not: { properties: { weight: {} }, required: ['weight'] } },
          }],
        })),
      },
    },
  }, ['schemaVersion', 'activity', 'location', 'range', 'houseSystem', 'rules']),
} as const);
