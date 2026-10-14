import { describe, expect, it } from 'vitest';
import { createPresetRuleSet, listPresetPacks, PRESET_NAMES } from '../src/presets.js';
import { parseRuleSet, validateRuleSet } from '../src/rules.js';
import type { PresetContext, PresetName } from '../src/presets.js';

const context: PresetContext = { location: { latitude: 0, longitude: 0 }, houseSystem: 'whole', utcOffsetMinutes: 330,
  range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' } };
describe('authored traditional preset conventions, no astronomical reference', () => {
  it.each(PRESET_NAMES)('generates a complete immutable %s rule document using the shared validator', name => {
    const source = { ...structuredClone(context), location: { ...context.location } }, result = createPresetRuleSet(name, source);
    expect(validateRuleSet(result)).toEqual(result);
    expect(parseRuleSet(JSON.stringify(result), 'json')).toEqual(result);
    expect(result.activity).toContain('not predictions');
    expect(result.location).toEqual(context.location); expect(result.range).toEqual(context.range);
    expect(result.rules.find(r => r.kind === 'planetary-hour')?.options).toHaveProperty('utcOffsetMinutes', 330);
    expect(result.rules.filter(r => r.mode === 'prefer').every(r => r.weight === 1)).toBe(true);
    expect(result.rules.find(r => r.kind === 'avoid-stations')?.options).toHaveProperty('withinDays', 1);
    expect(result.rules.find(r => r.kind === 'moon-not-void')?.options).toEqual({ bodies: 'traditional' });
    expect(result).not.toHaveProperty('natal');
    expect(Object.isFrozen(result.rules[0]?.options)).toBe(true);
    expect(Object.isFrozen(source.location)).toBe(false); source.location.latitude = 40;
    expect(result.location.latitude).toBe(0);
  });
  it('makes launch choices explicit, including phase categories and house membership rather than angular orbs', () => {
    const rules = createPresetRuleSet('launch', context).rules;
    expect(rules.find(r => r.kind === 'direct-motion')?.options).toEqual({ bodies: ['Mercury', 'Venus'] });
    expect(rules.find(r => r.kind === 'moon-phase')?.options).toEqual({ phases: ['Waxing Crescent', 'First Quarter', 'Waxing Gibbous'] });
    expect(rules.find(r => r.kind === 'benefic-house')?.options).toEqual({ bodies: ['Venus', 'Jupiter'], houses: [1, 4, 7, 10], match: 'any', polarFallback: 'reject' });
    expect(rules.find(r => r.kind === 'planetary-hour')?.options).toEqual({ rulers: ['Sun', 'Jupiter'], utcOffsetMinutes: 330 });
  });
  it('makes agreement choices and applying orb explicit', () => {
    const rules = createPresetRuleSet('contract-signing', context).rules;
    expect(rules.find(r => r.kind === 'direct-motion')?.options).toEqual({ bodies: ['Mercury'] });
    expect(rules.find(r => r.kind === 'moon-sign')?.options).toEqual({ signs: ['taurus', 'libra'] });
    expect(rules.find(r => r.kind === 'applying-aspect')?.options).toEqual({ body: 'Moon', targets: ['Mercury'], aspects: ['sextile', 'trine'], maxOrbDegrees: 3, match: 'any' });
    expect(rules.find(r => r.kind === 'planetary-hour')?.options).toEqual({ rulers: ['Mercury'], utcOffsetMinutes: 330 });
  });
  it('makes travel choices explicit', () => {
    const rules = createPresetRuleSet('travel', context).rules;
    expect(rules.find(r => r.kind === 'direct-motion')?.options).toEqual({ bodies: ['Mercury'] });
    expect(rules.find(r => r.kind === 'moon-sign')?.options).toEqual({ signs: ['gemini', 'sagittarius'] });
    expect(rules.find(r => r.kind === 'benefic-house')?.options).toEqual({ bodies: ['Jupiter'], houses: [9], match: 'all', polarFallback: 'reject' });
    expect(rules.find(r => r.kind === 'planetary-hour')?.options).toEqual({ rulers: ['Mercury', 'Jupiter'], utcOffsetMinutes: 330 });
  });
  it('returns a frozen catalog with no mutable pack references', () => {
    expect(listPresetPacks().map(p => p.name)).toEqual(PRESET_NAMES);
    expect(listPresetPacks().every(p => p.version === 'electional-presets/v1' && p.interpretation === 'traditional-conventions;not-predictions' && Object.isFrozen(p))).toBe(true);
    expect(Object.isFrozen(listPresetPacks())).toBe(true);
    expect(Object.isFrozen(PRESET_NAMES)).toBe(true);
  });
  it.each(['unknown', '', 'Launch'])('rejects unknown preset %s without choosing a fallback', name => {
    expect(() => createPresetRuleSet(name as PresetName, context)).toThrow(RangeError);
  });
  it.each([
    { ...context, location: { latitude: 91, longitude: 0 } },
    { ...context, houseSystem: 'invalid' }, { ...context, utcOffsetMinutes: undefined },
    { ...context, utcOffsetMinutes: Infinity }, { ...context, utcOffsetMinutes: 1081 },
    { ...context, range: { ...context.range, end: context.range.start } },
    { ...context, extra: 'no' }, null,
  ])('rejects invalid preset context through explicit/schema checks', invalid => {
    expect(() => createPresetRuleSet('launch', invalid as unknown as PresetContext)).toThrow();
  });
});
