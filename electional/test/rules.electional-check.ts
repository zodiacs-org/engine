import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseRuleSet, resolvedInstantMs, RULE_LIMITS, RuleValidationError, ruleSchema, validateRuleSet } from '../src/index.js';
import fixture from './fixtures/rules.json';
import { ASPECTS, HOUSE_SYSTEMS, PHASES, PLANETS, SIGNS } from '../src/rule-schema.js';

const fresh = () => structuredClone(fixture.request);
const valid = () => {
  const input = fresh();
  input.rules = input.rules.slice(0, 1);
  Reflect.deleteProperty(input, 'natal');
  return input;
};
const reject = (input: unknown) => expect(() => validateRuleSet(input)).toThrow(RuleValidationError);
const load = (text: string, format: 'json' | 'yaml') => expect(() => parseRuleSet(text, format)).toThrow(RuleValidationError);

describe('configuration golden fixture', () => {
  it('accepts all rule families equally through object, JSON and YAML boundaries', () => {
    const expected = validateRuleSet(fresh());
    expect(parseRuleSet(JSON.stringify(fresh()), 'json')).toEqual(expected);
    expect(parseRuleSet(stringify(fresh()), 'yaml')).toEqual(expected);
    expect({ startMs: resolvedInstantMs(expected.range.start), endMs: resolvedInstantMs(expected.range.end) }).toEqual(fixture.expectedDomain);
    expect(fixture.arbiter).toContain('Hand-derived');
    expect(fixture.expectedDomain.startMs).toBe((30 * 365 + 7) * 86_400_000);
  });

  it('snapshots and deeply freezes validated data without freezing the caller', () => {
    const input = fresh();
    const result = validateRuleSet(input);
    input.location.latitude = 11;
    input.rules[0]!.id = 'changed';
    expect(result.location.latitude).toBe(10);
    expect(result.rules[0]!.id).toBe('not-void');
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.natal?.location)).toBe(true);
    expect(Object.isFrozen(result.rules[0]?.options)).toBe(true);
    expect(Object.isFrozen(result.rules)).toBe(true);
    expect(validateRuleSet(result)).toEqual(result);
    expect(Object.isFrozen(ruleSchema)).toBe(true);
  });

  it('keeps the vocabulary aligned with engine declarations read without execution', () => {
    const types = readFileSync(new URL('../../src/types.ts', import.meta.url), 'utf8');
    const signs = readFileSync(new URL('../../src/signs.ts', import.meta.url), 'utf8');
    for (const label of [...PLANETS, ...HOUSE_SYSTEMS, ...PHASES, ...ASPECTS]) expect(types).toContain(`"${label}"`);
    for (const sign of SIGNS) expect(signs).toContain(`"${sign}"`);
    expect(JSON.parse(JSON.stringify(ruleSchema)).$schema).toBe('http://json-schema.org/draft-07/schema#');
  });
});

describe('resolved Gregorian instants, independent of the ephemeris', () => {
  it.each([
    ['1970-01-01T00:00:00Z', 0],
    ['1969-12-31T00:00:00Z', -86_400_000],
    ['1970-01-01T01:00:00+01:00', 0],
    ['1969-12-31T19:00:00-05:00', 0],
    ['1970-01-01T00:00:00.1Z', 100],
    ['1970-01-01T00:00:00.01Z', 10],
    ['1970-01-01T00:00:00.001+00:00', 1],
    ['2000-02-29T00:00:00Z', (30 * 365 + 7 + 31 + 28) * 86_400_000],
  ])('%s resolves to the hand-derived millisecond label', (instant, ms) => {
    expect(resolvedInstantMs(instant)).toBe(ms);
  });

  it('handles Gregorian leap centuries and years below 100 without a 1900 shift', () => {
    expect(resolvedInstantMs('0000-03-01T00:00:00Z') - resolvedInstantMs('0000-02-28T00:00:00Z')).toBe(2 * 86_400_000);
    expect(resolvedInstantMs('0099-01-02T00:00:00Z') - resolvedInstantMs('0099-01-01T00:00:00Z')).toBe(86_400_000);
    expect(resolvedInstantMs('1900-03-01T00:00:00Z') - resolvedInstantMs('1900-02-28T00:00:00Z')).toBe(86_400_000);
  });

  it.each([
    '1900-02-29T00:00:00Z', '2001-02-29T00:00:00Z', '2000-04-31T00:00:00Z',
    '2000-00-01T00:00:00Z', '2000-13-01T00:00:00Z', '2000-01-00T00:00:00Z',
    '2000-01-01T24:00:00Z', '2000-01-01T23:60:00Z', '2000-01-01T23:59:60Z',
    '2000-01-01T00:00:00+24:00', '2000-01-01T00:00:00+00:60',
    '2000-01-01T00:00:00-00:00', '2000-01-01T00:00:00.0001Z',
    '2000-01-01T00:00:00', '2000-01-01', '2000-01-01T00:00Z',
    '2000-01-01t00:00:00z', '+002000-01-01T00:00:00Z', '01/02/2000',
  ])('rejects invalid, unresolved or unsupported instant %s', (instant) => {
    expect(() => resolvedInstantMs(instant)).toThrow(RuleValidationError);
    const input = valid();
    input.range.start = instant;
    reject(input);
  });

  it('compares instants across offsets, and rejects empty and reversed ranges', () => {
    const input = valid();
    input.range.start = '2000-01-01T01:00:00+01:00';
    input.range.end = '1999-12-31T19:00:00-05:00';
    reject(input);
    input.range.end = '1999-12-31T18:59:59-05:00';
    reject(input);
    input.range.end = '1999-12-31T19:00:00.001-05:00';
    expect(validateRuleSet(input).range.end).toBe(input.range.end);
  });
});

describe('strict schema and cross-field validation', () => {
  it.each(['schemaVersion', 'activity', 'location', 'range', 'houseSystem', 'rules'])('requires %s', (key) => {
    const input = valid(); Reflect.deleteProperty(input, key); reject(input);
  });

  it('rejects unknown properties at every nested boundary', () => {
    const input = fresh();
    for (const target of [input, input.range, input.location, input.natal, input.natal.location, ...input.rules, ...input.rules.map((r) => r.options)]) {
      Object.assign(target, { unexpected: true }); reject(input); Reflect.deleteProperty(target, 'unexpected');
    }
  });

  it.each([
    ['latitude', -90], ['latitude', 90], ['longitude', -180], ['longitude', 180],
  ])('accepts coordinate boundary %s %s without promising solver coverage', (key, value) => {
    const input = valid(); Object.assign(input.location, { [key]: value }); expect(() => validateRuleSet(input)).not.toThrow();
  });

  it.each([null, '10', NaN, Infinity, -Infinity, 90.01, -90.01])('rejects invalid latitude %s without coercion', (value) => {
    const input = valid(); Object.assign(input.location, { latitude: value }); reject(input);
  });

  it('rejects unsupported versions, clocks, house systems, labels and rules', () => {
    for (const edit of [
      { schemaVersion: 'electional/v2' }, { schemaVersion: 1 }, { activity: '' }, { activity: ' leading' },
      { activity: 'line\nbreak' }, { houseSystem: 'Placidus' }, { rules: [] },
    ]) reject({ ...valid(), ...edit });
    const input = valid(); Object.assign(input.range, { clock: 'tt' }); reject(input);
    input.range.clock = 'utc'; Object.assign(input.rules[0]!, { kind: 'unknown' }); reject(input);
  });

  it('requires explicit valid mode and weights only for preferences', () => {
    for (const weight of [0, -1, '2', null, NaN, Infinity, RULE_LIMITS.weight + 1]) {
      const input = valid(); Object.assign(input.rules[0]!, { mode: 'prefer', weight }); reject(input);
    }
    const input = valid(); Object.assign(input.rules[0]!, { mode: 'prefer' }); reject(input);
    Object.assign(input.rules[0]!, { weight: RULE_LIMITS.weight }); expect(() => validateRuleSet(input)).not.toThrow();
    Object.assign(input.rules[0]!, { mode: 'require' }); reject(input);
    Reflect.deleteProperty(input.rules[0]!, 'weight'); Reflect.deleteProperty(input.rules[0]!, 'mode'); reject(input);
  });

  it('rejects missing or empty options for each rule family', () => {
    for (let i = 0; i < fresh().rules.length; i++) {
      const input = fresh(); Object.assign(input.rules[i]!, { options: {} }); reject(input);
      for (const key of Object.keys(fresh().rules[i]!.options)) {
        const missing = fresh(); Reflect.deleteProperty(missing.rules[i]!.options, key); reject(missing);
      }
      for (const [key, value] of Object.entries(fresh().rules[i]!.options)) {
        if (Array.isArray(value)) {
          const empty = fresh(); Object.assign(empty.rules[i]!.options, { [key]: [] }); reject(empty);
          const duplicate = fresh(); Object.assign(duplicate.rules[i]!.options, { [key]: [value[0], value[0]] }); reject(duplicate);
        }
      }
    }
  });

  it.each([
    [0, { bodies: 'classical' }], [1, { bodies: ['Mars'] }], [1, { bodies: ['Mercury', 'Mercury'] }],
    [2, { signs: ['Taurus'] }], [3, { phases: ['waxing'] }], [4, { rulers: ['Uranus'] }],
    [4, { utcOffsetMinutes: 1080.01 }], [5, { houses: [0] }], [5, { houses: [13] }],
    [5, { houses: [1.5] }], [5, { houses: [1, 1] }], [5, { polarFallback: 'ignore' }],
    [6, { maxOrbDegrees: -1 }], [6, { maxOrbDegrees: 180.01 }], [6, { match: 'most' }],
    [7, { targets: ['Moon'] }], [7, { aspects: ['quincunx'] }], [8, { withinDays: -1 }],
    [8, { withinDays: 3660.01 }], [8, { kinds: ['total'] }], [9, { bodies: ['Sun'] }],
    [10, { natalBodies: ['North Node'] }],
  ])('rejects invalid option in family %s: %j', (index, edit) => {
    const input = fresh(); Object.assign(input.rules[index]!.options, edit); reject(input);
  });

  it('checks rule ids and the rule count budget', () => {
    const input = valid();
    input.rules.push(structuredClone(input.rules[0]!)); reject(input);
    input.rules = Array.from({ length: RULE_LIMITS.rules }, (_, i) => ({ ...input.rules[0]!, id: `rule-${i}` }));
    expect(validateRuleSet(input).rules).toHaveLength(RULE_LIMITS.rules);
    input.rules.push({ ...input.rules[0]!, id: 'one-too-many' }); reject(input);
    for (const id of ['', 'Upper', 'white space', 'a'.repeat(65)]) {
      const candidate = valid(); candidate.rules[0]!.id = id; reject(candidate);
    }
  });

  it('requires one explicitly synthetic natal input exactly when synastry is selected', () => {
    for (const edit of [{ synthetic: false }, { synthetic: 'true' }, { clock: 'ut1' }, { instant: '1990-06-15' }]) {
      const input = fresh(); Object.assign(input.natal, edit); reject(input);
    }
    const missing = fresh(); Reflect.deleteProperty(missing, 'natal'); reject(missing);
    const unused = valid(); Object.assign(unused, { natal: fresh().natal }); reject(unused);
    const multiple = fresh(); Object.assign(multiple, { natal: [multiple.natal] }); reject(multiple);
    const absentFlag = fresh(); Reflect.deleteProperty(absentFlag.natal, 'synthetic'); reject(absentFlag);
    const noLocation = fresh(); Reflect.deleteProperty(noLocation.natal.location, 'longitude'); reject(noLocation);
  });
});

describe('bounded data-only loaders', () => {
  it.each([
    '', 'null', '{}', '[]', '{ invalid', '{"schemaVersion":"electional/v1", "schemaVersion":"electional/v1"}',
  ])('rejects incomplete, malformed or duplicate-key JSON %s', (text) => load(text, 'json'));

  it('rejects duplicate keys even when equal in a complete JSON request', () => {
    const text = JSON.stringify(valid()).replace('"schemaVersion":"electional/v1"', '"schemaVersion":"electional/v1","schemaVersion":"electional/v1"');
    load(text, 'json');
  });

  it.each([
    'activity: one\nactivity: two', 'a: &a [*a]', 'a: !custom value', 'a: !!str value',
    '%YAML 1.1\n---\na: yes', '---\na: b\n---\nc: d', 'a: {<<: {b: c}}',
  ])('rejects unsupported YAML features %s', (text) => load(text, 'yaml'));

  it('accepts a readable YAML document with unquoted resolved dates and a comment', () => {
    const text = `# Invented activity and place
schemaVersion: electional/v1
activity: Synthetic exercise
location: { latitude: 10, longitude: 20 }
range:
  start: 2000-01-01T00:00:00Z
  end: 2000-01-02T00:00:00Z
  clock: utc
houseSystem: whole
rules:
  - id: direct
    kind: direct-motion
    mode: require
    options: { bodies: [Mercury, Venus] }
`;
    expect(parseRuleSet(text, 'yaml').rules[0]!.kind).toBe('direct-motion');
    load(text, 'json');
  });

  it('rejects non-JSON values, sparse data, cycles and accessors without invoking getters', () => {
    for (const value of [undefined, NaN, Infinity, 1n, new Date(0), new Map(), () => {}, Symbol(), new Array(1)]) reject(value);
    const input = valid(); let invoked = false;
    Object.defineProperty(input, 'activity', { get() { invoked = true; return 'secret'; }, enumerable: true });
    reject(input); expect(invoked).toBe(false);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; reject(cyclic);
    const symbol = valid(); Object.assign(symbol, { [Symbol()]: true }); reject(symbol);
    const array = valid(); Object.assign(array.rules, { extra: true }); reject(array);
    const polluted = JSON.parse(JSON.stringify(valid()).replace('"activity":', '"__proto__":{"polluted":true},"activity":'));
    reject(polluted); expect(Reflect.get({}, 'polluted')).toBeUndefined();
  });

  it('enforces text bytes, object bytes, depth and node budgets', () => {
    load(' '.repeat(RULE_LIMITS.documentBytes + 1), 'json');
    load('é'.repeat(RULE_LIMITS.documentBytes / 2 + 1), 'yaml');
    reject({ activity: 'x'.repeat(RULE_LIMITS.documentBytes + 1) });
    let deep: unknown = 0;
    for (let i = 0; i <= RULE_LIMITS.depth; i++) deep = [deep];
    reject(deep); load(JSON.stringify(deep), 'json');
    reject(Array.from({ length: RULE_LIMITS.nodes + 1 }, () => 0));
    load(`[${Array(RULE_LIMITS.nodes + 1).fill(0).join(',')}]`, 'yaml');
  });

  it('uses stable redacted immutable errors and explicit formats', () => {
    let error: unknown;
    try { parseRuleSet('secret-token: !not-a-tag secret-token', 'yaml'); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(RuleValidationError);
    expect(String(error)).not.toContain('secret-token');
    expect(JSON.stringify(error)).not.toContain('secret-token');
    expect(Object.isFrozen((error as RuleValidationError).issues)).toBe(true);
    expect(Object.isFrozen((error as RuleValidationError).issues[0])).toBe(true);
    // Runtime callers can supply unsupported values despite TypeScript unions.
    expect(() => parseRuleSet('{}', 'toml' as 'json')).toThrow(RuleValidationError);
    expect(() => parseRuleSet(null as unknown as string, 'json')).toThrow(RuleValidationError);
  });
});
