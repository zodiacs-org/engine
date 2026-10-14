import { frozenCopy } from './adapter-contract.js';
import { validateRuleSet } from './rules.js';
import type { ElectionalRule, HouseSystem, Location, RuleSet } from './rule-types.js';

export const PRESET_NAMES = Object.freeze(['launch', 'contract-signing', 'travel'] as const);
export type PresetName = typeof PRESET_NAMES[number];
export interface PresetContext {
  readonly location: Location;
  readonly range: RuleSet['range'];
  readonly houseSystem: HouseSystem;
  /** Fixed solar-day ownership offset, not an IANA timezone. */
  readonly utcOffsetMinutes: number;
}
export interface PresetPack {
  readonly name: PresetName;
  readonly version: 'electional-presets/v1';
  readonly interpretation: 'traditional-conventions;not-predictions';
  readonly description: string;
}
const packs: readonly PresetPack[] = frozenCopy([
  { name: 'launch', version: 'electional-presets/v1', interpretation: 'traditional-conventions;not-predictions',
    description: 'An authored launch example: direct Mercury and Venus, a non-void Moon, and optional waxing, solar/Jupiter hours and angular-house benefics.' },
  { name: 'contract-signing', version: 'electional-presets/v1', interpretation: 'traditional-conventions;not-predictions',
    description: 'An authored agreement example: direct Mercury and a non-void Moon, with optional Mercury hours, Taurus/Libra Moon and applying Moon aspects to Mercury.' },
  { name: 'travel', version: 'electional-presets/v1', interpretation: 'traditional-conventions;not-predictions',
    description: 'An authored travel example: direct Mercury and a non-void Moon, with optional Mercury/Jupiter hours, Gemini/Sagittarius Moon and Jupiter in the ninth house.' },
]);
export function listPresetPacks(): readonly PresetPack[] { return packs; }

/** Generate a full, editable configuration; no activity-driven implicit rules. */
export function createPresetRuleSet(name: PresetName, context: PresetContext): RuleSet {
  if (!PRESET_NAMES.includes(name) || !context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).some(key => !['location', 'range', 'houseSystem', 'utcOffsetMinutes'].includes(key))) {
    throw new RangeError('Expected a known preset and explicit preset context.');
  }
  const common: ElectionalRule[] = [
    { id: 'moon-not-void', kind: 'moon-not-void', mode: 'require', options: { bodies: 'traditional' } },
    { id: 'direct-motion', kind: 'direct-motion', mode: 'require', options: { bodies: name === 'launch' ? ['Mercury', 'Venus'] : ['Mercury'] } },
    { id: 'station-margin', kind: 'avoid-stations', mode: 'require', options: { bodies: name === 'launch' ? ['Mercury', 'Venus'] : ['Mercury'], withinDays: 1 } },
    { id: 'activity-hour', kind: 'planetary-hour', mode: 'prefer', weight: 1,
      options: { rulers: name === 'launch' ? ['Sun', 'Jupiter'] : name === 'travel' ? ['Mercury', 'Jupiter'] : ['Mercury'], utcOffsetMinutes: context.utcOffsetMinutes } },
  ];
  const choices: ElectionalRule[] = name === 'launch' ? [
    { id: 'waxing-moon', kind: 'moon-phase', mode: 'prefer', weight: 1, options: { phases: ['Waxing Crescent', 'First Quarter', 'Waxing Gibbous'] } },
    { id: 'angular-house-benefic', kind: 'benefic-house', mode: 'prefer', weight: 1,
      options: { bodies: ['Venus', 'Jupiter'], houses: [1, 4, 7, 10], match: 'any', polarFallback: 'reject' } },
  ] : name === 'contract-signing' ? [
    { id: 'agreement-moon-sign', kind: 'moon-sign', mode: 'prefer', weight: 1, options: { signs: ['taurus', 'libra'] } },
    { id: 'moon-applying-mercury', kind: 'applying-aspect', mode: 'prefer', weight: 1,
      options: { body: 'Moon', targets: ['Mercury'], aspects: ['sextile', 'trine'], maxOrbDegrees: 3, match: 'any' } },
  ] : [
    { id: 'travel-moon-sign', kind: 'moon-sign', mode: 'prefer', weight: 1, options: { signs: ['gemini', 'sagittarius'] } },
    { id: 'jupiter-ninth-house', kind: 'benefic-house', mode: 'prefer', weight: 1,
      options: { bodies: ['Jupiter'], houses: [9], match: 'all', polarFallback: 'reject' } },
  ];
  return validateRuleSet({ schemaVersion: 'electional/v1', activity: `Traditional ${name} conventions (not predictions)`,
    location: context.location, range: context.range, houseSystem: context.houseSystem, rules: [...common, ...choices] });
}
