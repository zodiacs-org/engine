// Chinese zodiac data for a birth date: the sexagenary year (heavenly stem
// and earthly branch), its animal, element and yin/yang, with the year
// starting at Li Chun, and the traditional branch groupings (trines, six
// harmonies, six clashes). This module computes calendar facts and lists a
// traditional classification. It does not interpret them.
import { liChunUtcMs } from './li-chun.mjs';

export const SCHEMA = 'zodiacs.chinese-zodiac.v1';

/** Supported civil dates, inclusive. Li Chun was checked against JPL Horizons for every year of this span. */
export const SUPPORTED_RANGE = Object.freeze({ from: '1900-01-01', to: '2100-12-31' });

/**
 * Half-width of the band around the computed Li Chun instant inside which the
 * year is reported as "depends". The measured largest difference from JPL
 * Horizons over 1900 to 2100 is 292.0 s in UT (see the evidence README); the
 * band is about twice that.
 */
export const BOUNDARY_UNCERTAINTY_SECONDS = 600;

const freezeAll = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

/** The ten heavenly stems in cycle order. Each stem fixes the year's element and yin/yang. */
export const STEMS = freezeAll([
  { index: 0, pinyin: 'Jia', hanzi: '甲', element: 'Wood', polarity: 'Yang' },
  { index: 1, pinyin: 'Yi', hanzi: '乙', element: 'Wood', polarity: 'Yin' },
  { index: 2, pinyin: 'Bing', hanzi: '丙', element: 'Fire', polarity: 'Yang' },
  { index: 3, pinyin: 'Ding', hanzi: '丁', element: 'Fire', polarity: 'Yin' },
  { index: 4, pinyin: 'Wu', hanzi: '戊', element: 'Earth', polarity: 'Yang' },
  { index: 5, pinyin: 'Ji', hanzi: '己', element: 'Earth', polarity: 'Yin' },
  { index: 6, pinyin: 'Geng', hanzi: '庚', element: 'Metal', polarity: 'Yang' },
  { index: 7, pinyin: 'Xin', hanzi: '辛', element: 'Metal', polarity: 'Yin' },
  { index: 8, pinyin: 'Ren', hanzi: '壬', element: 'Water', polarity: 'Yang' },
  { index: 9, pinyin: 'Gui', hanzi: '癸', element: 'Water', polarity: 'Yin' },
]);

/** The twelve earthly branches in cycle order, with their animals and fixed elements. */
export const BRANCHES = freezeAll([
  { index: 0, pinyin: 'Zi', hanzi: '子', animal: 'Rat', animalHanzi: '鼠', fixedElement: 'Water', polarity: 'Yang' },
  { index: 1, pinyin: 'Chou', hanzi: '丑', animal: 'Ox', animalHanzi: '牛', fixedElement: 'Earth', polarity: 'Yin' },
  { index: 2, pinyin: 'Yin', hanzi: '寅', animal: 'Tiger', animalHanzi: '虎', fixedElement: 'Wood', polarity: 'Yang' },
  { index: 3, pinyin: 'Mao', hanzi: '卯', animal: 'Rabbit', animalHanzi: '兔', fixedElement: 'Wood', polarity: 'Yin' },
  { index: 4, pinyin: 'Chen', hanzi: '辰', animal: 'Dragon', animalHanzi: '龙', fixedElement: 'Earth', polarity: 'Yang' },
  { index: 5, pinyin: 'Si', hanzi: '巳', animal: 'Snake', animalHanzi: '蛇', fixedElement: 'Fire', polarity: 'Yin' },
  { index: 6, pinyin: 'Wu', hanzi: '午', animal: 'Horse', animalHanzi: '马', fixedElement: 'Fire', polarity: 'Yang' },
  { index: 7, pinyin: 'Wei', hanzi: '未', animal: 'Goat', animalHanzi: '羊', fixedElement: 'Earth', polarity: 'Yin' },
  { index: 8, pinyin: 'Shen', hanzi: '申', animal: 'Monkey', animalHanzi: '猴', fixedElement: 'Metal', polarity: 'Yang' },
  { index: 9, pinyin: 'You', hanzi: '酉', animal: 'Rooster', animalHanzi: '鸡', fixedElement: 'Metal', polarity: 'Yin' },
  { index: 10, pinyin: 'Xu', hanzi: '戌', animal: 'Dog', animalHanzi: '狗', fixedElement: 'Earth', polarity: 'Yang' },
  { index: 11, pinyin: 'Hai', hanzi: '亥', animal: 'Pig', animalHanzi: '猪', fixedElement: 'Water', polarity: 'Yin' },
]);

export const ANIMALS = Object.freeze(BRANCHES.map((branch) => branch.animal));

const ALIASES = new Map([
  ['sheep', 'Goat'], ['ram', 'Goat'], ['boar', 'Pig'], ['chicken', 'Rooster'],
  ['cock', 'Rooster'], ['mouse', 'Rat'], ['cow', 'Ox'], ['buffalo', 'Ox'], ['hare', 'Rabbit'],
]);

/** San He (三合): the four groups of three branches four places apart. */
export const TRINES = freezeAll([
  { name: 'Water trine', element: 'Water', animals: Object.freeze(['Rat', 'Dragon', 'Monkey']) },
  { name: 'Metal trine', element: 'Metal', animals: Object.freeze(['Ox', 'Snake', 'Rooster']) },
  { name: 'Fire trine', element: 'Fire', animals: Object.freeze(['Tiger', 'Horse', 'Dog']) },
  { name: 'Wood trine', element: 'Wood', animals: Object.freeze(['Rabbit', 'Goat', 'Pig']) },
]);

/** Liu He (六合): the six pairs whose branch indices sum to 1 modulo 12. */
export const SIX_HARMONIES = freezeAll([
  Object.freeze(['Rat', 'Ox']), Object.freeze(['Tiger', 'Pig']), Object.freeze(['Rabbit', 'Dog']),
  Object.freeze(['Dragon', 'Rooster']), Object.freeze(['Snake', 'Monkey']), Object.freeze(['Horse', 'Goat']),
]);

/** Liu Chong (六冲): the six pairs of opposite branches, six places apart. */
export const SIX_CLASHES = freezeAll([
  Object.freeze(['Rat', 'Horse']), Object.freeze(['Ox', 'Goat']), Object.freeze(['Tiger', 'Monkey']),
  Object.freeze(['Rabbit', 'Rooster']), Object.freeze(['Dragon', 'Dog']), Object.freeze(['Snake', 'Pig']),
]);

export const GROUPINGS_NOTE = 'Traditional groupings of the twelve earthly branches. They are a classical classification of the branches, not a measurement, score or assessment of any person or relationship, and they describe no future events.';

export const CONVENTION = Object.freeze({
  yearBoundary: 'li-chun',
  definition: 'The zodiac year begins at Li Chun (立春, start of spring), the instant the Sun\'s apparent geocentric ecliptic longitude of date reaches 315 degrees. From 1900 to 2100 it falls on February 3, 4 or 5 in China Standard Time (UTC+8). Dates before Li Chun belong to the previous year\'s animal.',
  otherConvention: 'Many popular calendars change the animal at the Lunar New Year (Spring Festival) instead, a date that moves between late January and February. This tool does not use that boundary; the two agree except for dates between the two boundaries.',
  sun: 'Meeus, Astronomical Formulae for Calculators (1988), chapter 18, with perturbations and the apparent-place correction; UT from Delta T of Espenak and Meeus (2006).',
  boundaryUncertaintySeconds: BOUNDARY_UNCERTAINTY_SECONDS,
  cycle: 'Sexagenary year of the Li Chun year Y: stem (Y - 4) mod 10, branch (Y - 4) mod 12, cycle position ((Y - 4) mod 60) + 1, where Jia Zi (甲子) is position 1.',
});

export class ChineseZodiacInputError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'ChineseZodiacInputError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ChineseZodiacInputError(code, message); };
const pad = (value, width = 2) => String(value).padStart(width, '0');
const mod = (a, n) => ((a % n) + n) % n;

/** Normalize an animal name (case-insensitive, with common aliases such as Sheep and Boar) to its canonical English name. */
export function normalizeAnimal(name) {
  if (typeof name !== 'string') fail('invalid-animal', 'Animal must be a string such as "Rat" or "Goat"');
  const key = name.trim().toLowerCase();
  const canonical = ANIMALS.find((animal) => animal.toLowerCase() === key) ?? ALIASES.get(key);
  if (!canonical) fail('invalid-animal', `Unknown animal; use one of ${ANIMALS.join(', ')}`);
  return canonical;
}

const branchOf = (animal) => BRANCHES[ANIMALS.indexOf(normalizeAnimal(animal))];

/** The sexagenary year that begins at Li Chun of Gregorian year Y. */
export function sexagenaryYear(year) {
  if (!Number.isInteger(year)) fail('invalid-year', 'Year must be an integer');
  const stem = STEMS[mod(year - 4, 10)];
  const branch = BRANCHES[mod(year - 4, 12)];
  return {
    liChunYear: year,
    animal: branch.animal,
    element: stem.element,
    polarity: stem.polarity,
    label: `${stem.polarity} ${stem.element} ${branch.animal}`,
    stem: { pinyin: stem.pinyin, hanzi: stem.hanzi, index: stem.index },
    branch: { pinyin: branch.pinyin, hanzi: branch.hanzi, index: branch.index, animalHanzi: branch.animalHanzi, fixedElement: branch.fixedElement },
    name: `${stem.pinyin} ${branch.pinyin}`,
    hanzi: stem.hanzi + branch.hanzi,
    cyclePosition: mod(year - 4, 60) + 1,
  };
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET = /^(?:Z|([+-])(\d{2}):(\d{2}))$/;
const INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})$/;

function parseDate(text) {
  const match = typeof text === 'string' ? DATE.exec(text) : null;
  if (!match) fail('invalid-date', 'Date must be a Gregorian date written YYYY-MM-DD');
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(2000, month - 1, day));
  if (month < 1 || month > 12 || day < 1 || probe.getUTCMonth() !== month - 1 || (month === 2 && day === 29 && !isLeap(year))) {
    fail('invalid-date', 'Date does not exist in the Gregorian calendar');
  }
  if (text < SUPPORTED_RANGE.from || text > SUPPORTED_RANGE.to) {
    fail('out-of-range', `Supported dates are ${SUPPORTED_RANGE.from} to ${SUPPORTED_RANGE.to}`);
  }
  return { year, month, day };
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function parseTime(text) {
  const match = typeof text === 'string' ? TIME.exec(text) : null;
  if (!match) fail('invalid-time', 'Time must be a 24-hour clock reading written HH:MM or HH:MM:SS');
  const [hour, minute, second = 0] = match.slice(1).map((part) => (part === undefined ? undefined : Number(part)));
  if (hour > 23 || minute > 59 || second > 59) fail('invalid-time', 'Time is outside 00:00:00 to 23:59:59');
  return (hour * 3600 + minute * 60 + second) * 1000;
}

function parseOffset(text) {
  const match = typeof text === 'string' ? OFFSET.exec(text) : null;
  if (!match) fail('invalid-utc-offset', 'UTC offset must be Z or written +HH:MM or -HH:MM');
  if (text === 'Z') return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (Number(match[3]) > 59) fail('invalid-utc-offset', 'UTC offset minutes must be below 60');
  const signed = match[1] === '-' ? -minutes : minutes;
  if (signed < -12 * 60 || signed > 14 * 60) fail('invalid-utc-offset', 'UTC offset must be within -12:00 and +14:00');
  return signed * 60_000;
}

const EARLIEST_OFFSET_MS = 14 * 3_600_000; // UTC+14:00, the furthest ahead of UTC
const LATEST_OFFSET_MS = -12 * 3_600_000; // UTC-12:00, the furthest behind

/** Turn the input into a closed UTC interval [from, to] and the civil year that names its Li Chun. */
function resolveInterval(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('invalid-input', 'Input must be an object');
  const allowed = new Set(['date', 'time', 'utcOffset', 'instant']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail('invalid-input', `Unknown field "${key}"`);
  const { date, time, utcOffset, instant } = input;
  if (instant !== undefined) {
    if (date !== undefined || time !== undefined || utcOffset !== undefined) {
      fail('invalid-input', 'Give either instant, or date with optional time and utcOffset, not both');
    }
    const match = typeof instant === 'string' ? INSTANT.exec(instant) : null;
    if (!match) fail('invalid-instant', 'Instant must be ISO 8601 with Z or an offset, for example 2026-02-04T04:00:00+08:00');
    const civil = parseDate(match[1]);
    const clock = parseTime(match[2].slice(0, 8));
    const millis = match[2].length > 8 ? Number(match[2].slice(9).padEnd(3, '0')) : 0;
    const offset = parseOffset(match[3]);
    const at = Date.UTC(civil.year, civil.month - 1, civil.day) + clock + millis - offset;
    return { kind: 'instant', year: civil.year, from: at, to: at };
  }
  if (date === undefined) fail('invalid-input', 'Give a date (YYYY-MM-DD) or an instant');
  const civil = parseDate(date);
  const midnight = Date.UTC(civil.year, civil.month - 1, civil.day);
  if (time !== undefined) {
    const local = midnight + parseTime(time);
    if (utcOffset !== undefined) {
      const at = local - parseOffset(utcOffset);
      return { kind: 'date-time-offset', year: civil.year, from: at, to: at };
    }
    return { kind: 'date-time', year: civil.year, from: local - EARLIEST_OFFSET_MS, to: local - LATEST_OFFSET_MS };
  }
  if (utcOffset !== undefined) {
    const start = midnight - parseOffset(utcOffset);
    return { kind: 'date-offset', year: civil.year, from: start, to: start + 86_400_000 - 1 };
  }
  return { kind: 'date', year: civil.year, from: midnight - EARLIEST_OFFSET_MS, to: midnight + 86_400_000 - 1 - LATEST_OFFSET_MS };
}

const DEPENDS_REASON = Object.freeze({
  date: 'Li Chun falls on this date in some time zones. Supply the birth time and UTC offset.',
  'date-offset': 'Li Chun falls on this local date. Supply the birth time.',
  'date-time': 'Without a UTC offset this clock time could be on either side of Li Chun. Supply the UTC offset.',
});

const MINUTE = 60_000;
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const isoMinute = (ms) => iso(Math.round(ms / MINUTE) * MINUTE);

function chinaStandardTime(ms) {
  const shifted = new Date(Math.round(ms / MINUTE) * MINUTE + 8 * 3_600_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}+08:00`;
}

/** Li Chun of a Gregorian year as computed by this module, to the minute, with its uncertainty band. */
export function liChun(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) fail('out-of-range', 'Li Chun is available for 1900 to 2100');
  const at = liChunUtcMs(year);
  return {
    gregorianYear: year,
    utc: isoMinute(at),
    chinaStandardTime: chinaStandardTime(at),
    uncertaintySeconds: BOUNDARY_UNCERTAINTY_SECONDS,
  };
}

/**
 * The Chinese zodiac year for a birth date or instant.
 *
 * Input: { instant } as ISO 8601 with Z or an offset, or { date, time?, utcOffset? }.
 * Without a utcOffset the civil date or clock time is taken in every offset
 * from -12:00 to +14:00. The result is "resolved" when the whole interval lies
 * on one side of Li Chun by more than BOUNDARY_UNCERTAINTY_SECONDS, and
 * "depends" otherwise, with both candidate years.
 */
export function chineseZodiac(input) {
  const interval = resolveInterval(input);
  const boundary = liChunUtcMs(interval.year);
  const band = BOUNDARY_UNCERTAINTY_SECONDS * 1000;
  const before = sexagenaryYear(interval.year - 1);
  const after = sexagenaryYear(interval.year);
  const base = {
    schema: SCHEMA,
    input: { kind: interval.kind, from: iso(interval.from), to: iso(interval.to) },
    liChun: liChun(interval.year),
    convention: CONVENTION,
  };
  if (interval.to < boundary - band) return { ...base, status: 'resolved', sign: before, candidates: [before] };
  if (interval.from >= boundary + band) return { ...base, status: 'resolved', sign: after, candidates: [after] };
  const straddles = interval.from < boundary && interval.to >= boundary;
  return {
    ...base,
    status: 'depends',
    reason: straddles ? DEPENDS_REASON[interval.kind] : `The input is within ${BOUNDARY_UNCERTAINTY_SECONDS / 60} minutes of the computed Li Chun instant, inside its uncertainty band. A published almanac time for Li Chun of ${interval.year} can settle it.`,
    sign: null,
    candidates: [before, after],
  };
}

function pairIn(list, a, b) {
  return list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** The traditional groupings two animals share: same animal, trine, six harmony or clash. */
export function chineseZodiacRelation(first, second) {
  const a = branchOf(first), b = branchOf(second);
  const trine = TRINES.find((group) => group.animals.includes(a.animal) && group.animals.includes(b.animal)) ?? null;
  const relations = [];
  if (a.animal === b.animal) relations.push('same-animal');
  if (trine) relations.push('trine');
  if (pairIn(SIX_HARMONIES, a.animal, b.animal)) relations.push('six-harmony');
  if (pairIn(SIX_CLASHES, a.animal, b.animal)) relations.push('clash');
  return {
    schema: SCHEMA,
    first: { animal: a.animal, branch: a.pinyin, hanzi: a.hanzi, index: a.index },
    second: { animal: b.animal, branch: b.pinyin, hanzi: b.hanzi, index: b.index },
    branchDistance: Math.min(mod(a.index - b.index, 12), mod(b.index - a.index, 12)),
    relations,
    trine: trine ? { name: trine.name, element: trine.element, animals: [...trine.animals] } : null,
    sixHarmony: pairIn(SIX_HARMONIES, a.animal, b.animal),
    clash: pairIn(SIX_CLASHES, a.animal, b.animal),
    note: GROUPINGS_NOTE,
  };
}

/** The full reference table: stems, branches, trines, six harmonies and six clashes. */
export function chineseZodiacGroups() {
  const copy = (rows) => rows.map((row) => ({ ...row }));
  return {
    schema: SCHEMA,
    stems: copy(STEMS),
    branches: copy(BRANCHES),
    trines: TRINES.map((group) => ({ name: group.name, element: group.element, animals: [...group.animals] })),
    sixHarmonies: SIX_HARMONIES.map((pair) => [...pair]),
    sixClashes: SIX_CLASHES.map((pair) => [...pair]),
    convention: CONVENTION,
    note: GROUPINGS_NOTE,
  };
}
