export type Element = 'Wood' | 'Fire' | 'Earth' | 'Metal' | 'Water';
export type Polarity = 'Yang' | 'Yin';
export type Animal =
 | 'Rat' | 'Ox' | 'Tiger' | 'Rabbit' | 'Dragon' | 'Snake'
 | 'Horse' | 'Goat' | 'Monkey' | 'Rooster' | 'Dog' | 'Pig';
export interface Stem {
 readonly index: number; readonly pinyin: string; readonly hanzi: string;
 readonly element: Element; readonly polarity: Polarity;
}
export interface Branch {
 readonly index: number; readonly pinyin: string; readonly hanzi: string;
 readonly animal: Animal; readonly animalHanzi: string;
 readonly fixedElement: Element; readonly polarity: Polarity;
}
export interface Trine { readonly name: string; readonly element: Element; readonly animals: readonly Animal[] }
export interface SexagenaryYear {
 liChunYear: number;
 animal: Animal;
 element: Element;
 polarity: Polarity;
 label: string;
 stem: {pinyin: string; hanzi: string; index: number};
 branch: {pinyin: string; hanzi: string; index: number; animalHanzi: string; fixedElement: Element};
 name: string;
 hanzi: string;
 cyclePosition: number;
}
export interface Convention {
 readonly yearBoundary: 'li-chun';
 readonly definition: string;
 readonly otherConvention: string;
 readonly sun: string;
 readonly boundaryUncertaintySeconds: number;
 readonly cycle: string;
}
export interface LiChun { gregorianYear: number; utc: string; chinaStandardTime: string; uncertaintySeconds: number }
export type InputKind = 'instant' | 'date-time-offset' | 'date-time' | 'date-offset' | 'date';
export type ChineseZodiacInput =
 | {instant: string; date?: never; time?: never; utcOffset?: never}
 | {date: string; time?: string; utcOffset?: string; instant?: never};
interface ResultBase {
 schema: 'zodiacs.chinese-zodiac.v1';
 input: {kind: InputKind; from: string; to: string};
 liChun: LiChun;
 convention: Convention;
}
export type ChineseZodiacResult =
 | (ResultBase & {status: 'resolved'; sign: SexagenaryYear; candidates: [SexagenaryYear]})
 | (ResultBase & {status: 'depends'; reason: string; sign: null; candidates: [SexagenaryYear, SexagenaryYear]});
export type Relation = 'same-animal' | 'trine' | 'six-harmony' | 'clash';
export interface AnimalRef { animal: Animal; branch: string; hanzi: string; index: number }
export interface ChineseZodiacRelation {
 schema: 'zodiacs.chinese-zodiac.v1';
 first: AnimalRef;
 second: AnimalRef;
 branchDistance: number;
 relations: Relation[];
 trine: {name: string; element: Element; animals: Animal[]} | null;
 sixHarmony: boolean;
 clash: boolean;
 note: string;
}
export interface ChineseZodiacGroups {
 schema: 'zodiacs.chinese-zodiac.v1';
 stems: Stem[];
 branches: Branch[];
 trines: {name: string; element: Element; animals: Animal[]}[];
 sixHarmonies: [Animal, Animal][];
 sixClashes: [Animal, Animal][];
 convention: Convention;
 note: string;
}
export type InputErrorCode =
 | 'invalid-input' | 'invalid-date' | 'invalid-time' | 'invalid-utc-offset'
 | 'invalid-instant' | 'invalid-animal' | 'invalid-year' | 'out-of-range';
export class ChineseZodiacInputError extends TypeError {
 readonly code: InputErrorCode;
 constructor(code: InputErrorCode, message: string);
}
export const SCHEMA: 'zodiacs.chinese-zodiac.v1';
export const SUPPORTED_RANGE: {readonly from: '1900-01-01'; readonly to: '2100-12-31'};
export const BOUNDARY_UNCERTAINTY_SECONDS: number;
export const STEMS: readonly Stem[];
export const BRANCHES: readonly Branch[];
export const ANIMALS: readonly Animal[];
export const TRINES: readonly Trine[];
export const SIX_HARMONIES: readonly (readonly [Animal, Animal])[];
export const SIX_CLASHES: readonly (readonly [Animal, Animal])[];
export const GROUPINGS_NOTE: string;
export const CONVENTION: Convention;
export function normalizeAnimal(name: string): Animal;
export function sexagenaryYear(year: number): SexagenaryYear;
export function liChun(year: number): LiChun;
export function chineseZodiac(input: ChineseZodiacInput): ChineseZodiacResult;
export function chineseZodiacRelation(first: string, second: string): ChineseZodiacRelation;
export function chineseZodiacGroups(): ChineseZodiacGroups;
