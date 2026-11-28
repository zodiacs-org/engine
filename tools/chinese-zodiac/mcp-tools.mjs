// MCP tool definitions for the Chinese zodiac data: names, descriptions, JSON
// Schemas for input and output, and handlers that return MCP tool results.
// The stdio server in mcp-server.mjs serves them; another MCP server can
// register the same definitions.
import {
  ANIMALS, BOUNDARY_UNCERTAINTY_SECONDS, ChineseZodiacInputError, SUPPORTED_RANGE,
  chineseZodiac, chineseZodiacGroups, chineseZodiacRelation,
} from './index.mjs';

const annotations = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description) => ({ type: 'integer', description });
const ELEMENT = { type: 'string', enum: ['Wood', 'Fire', 'Earth', 'Metal', 'Water'] };
const POLARITY = { type: 'string', enum: ['Yang', 'Yin'] };
const ANIMAL = { type: 'string', enum: [...ANIMALS] };
const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

const signSchema = closed({
  liChunYear: int('Gregorian year whose Li Chun starts this zodiac year.'),
  animal: { ...ANIMAL, description: 'Animal of the earthly branch.' },
  element: { ...ELEMENT, description: 'Element of the heavenly stem: the year\'s element.' },
  polarity: { ...POLARITY, description: 'Yin or yang of the stem (the branch always has the same polarity).' },
  label: str('Polarity, element and animal, for example "Yang Fire Horse".'),
  stem: closed({ pinyin: str('Stem in pinyin.'), hanzi: str('Stem in Chinese characters.'), index: int('Stem index 0 to 9, Jia = 0.') }),
  branch: closed({
    pinyin: str('Branch in pinyin.'), hanzi: str('Branch in Chinese characters.'), index: int('Branch index 0 to 11, Zi (Rat) = 0.'),
    animalHanzi: str('Animal in simplified Chinese characters.'), fixedElement: { ...ELEMENT, description: 'Fixed element of the branch, which differs from the year\'s element in most years.' },
  }),
  name: str('Stem and branch in pinyin, for example "Bing Wu".'),
  hanzi: str('Stem and branch in Chinese characters, for example "丙午".'),
  cyclePosition: int('Position 1 to 60 in the sexagenary cycle, Jia Zi = 1.'),
});

const conventionSchema = {
  type: 'object',
  description: 'The year-boundary convention and how Li Chun is computed.',
  properties: {
    yearBoundary: { type: 'string', enum: ['li-chun'] }, definition: str('Definition of the year boundary.'),
    otherConvention: str('The Lunar New Year convention, which this tool does not use.'), sun: str('Solar model used for Li Chun.'),
    boundaryUncertaintySeconds: int('Half-width of the band around Li Chun reported as "depends".'), cycle: str('Stem and branch arithmetic.'),
  },
};

const liChunSchema = closed({
  gregorianYear: int('Gregorian year of this Li Chun.'),
  utc: str('Computed Li Chun instant in UTC, to the minute.'),
  chinaStandardTime: str('The same instant in China Standard Time (UTC+8), to the minute.'),
  uncertaintySeconds: int('Uncertainty band of the computed instant, seconds.'),
});

const signOutput = {
  type: 'object',
  properties: {
    schema: { type: 'string', const: 'zodiacs.chinese-zodiac.v1' },
    status: { type: 'string', enum: ['resolved', 'depends'], description: '"resolved": one zodiac year. "depends": the input could be on either side of Li Chun; both candidates are listed.' },
    sign: { anyOf: [signSchema, { type: 'null' }], description: 'The zodiac year when status is "resolved", otherwise null.' },
    candidates: { type: 'array', items: signSchema, minItems: 1, maxItems: 2, description: 'One year when resolved; the year before and the year after Li Chun when it depends.' },
    reason: str('Why the result depends and what input would resolve it. Present only when status is "depends".'),
    liChun: liChunSchema,
    input: closed({
      kind: { type: 'string', enum: ['instant', 'date-time-offset', 'date-time', 'date-offset', 'date'] },
      from: str('Start of the UTC interval the input can denote.'), to: str('End of that interval (equal to from for an exact instant).'),
    }),
    convention: conventionSchema,
  },
  required: ['schema', 'status', 'sign', 'candidates', 'liChun', 'input', 'convention'],
  additionalProperties: false,
};

const animalRef = closed({ animal: ANIMAL, branch: str('Branch in pinyin.'), hanzi: str('Branch in Chinese characters.'), index: int('Branch index 0 to 11.') });
const trineSchema = closed({ name: str('Trine name.'), element: ELEMENT, animals: { type: 'array', items: ANIMAL, minItems: 3, maxItems: 3 } });
const pairSchema = { type: 'array', items: ANIMAL, minItems: 2, maxItems: 2 };

const relationOutput = closed({
  schema: { type: 'string', const: 'zodiacs.chinese-zodiac.v1' },
  first: animalRef, second: animalRef,
  branchDistance: int('Places between the two branches around the cycle of twelve, 0 to 6.'),
  relations: { type: 'array', items: { type: 'string', enum: ['same-animal', 'trine', 'six-harmony', 'clash'] }, description: 'Every traditional grouping the two animals share; empty when they share none.' },
  trine: { anyOf: [trineSchema, { type: 'null' }], description: 'The San He (三合) trine both animals belong to, or null.' },
  sixHarmony: { type: 'boolean', description: 'True when the two form one of the six Liu He (六合) pairs.' },
  clash: { type: 'boolean', description: 'True when the two form one of the six Liu Chong (六冲) opposite pairs.' },
  note: str('What the groupings are and are not.'),
});

const stemRow = closed({ index: int('Stem index.'), pinyin: str('Pinyin.'), hanzi: str('Characters.'), element: ELEMENT, polarity: POLARITY });
const branchRow = closed({ index: int('Branch index.'), pinyin: str('Pinyin.'), hanzi: str('Characters.'), animal: ANIMAL, animalHanzi: str('Animal in characters.'), fixedElement: ELEMENT, polarity: POLARITY });
const referenceOutput = closed({
  schema: { type: 'string', const: 'zodiacs.chinese-zodiac.v1' },
  stems: { type: 'array', items: stemRow, minItems: 10, maxItems: 10 },
  branches: { type: 'array', items: branchRow, minItems: 12, maxItems: 12 },
  trines: { type: 'array', items: trineSchema, minItems: 4, maxItems: 4 },
  sixHarmonies: { type: 'array', items: pairSchema, minItems: 6, maxItems: 6 },
  sixClashes: { type: 'array', items: pairSchema, minItems: 6, maxItems: 6 },
  convention: conventionSchema,
  note: str('What the groupings are and are not.'),
});

const minutes = BOUNDARY_UNCERTAINTY_SECONDS / 60;

export const TOOLS = Object.freeze([
  {
    name: 'chinese_zodiac_sign',
    title: 'Chinese zodiac year for a birth date',
    description: `Chinese zodiac year for a birth date or instant: animal, element, yin or yang, heavenly stem and earthly branch, and position in the 60-year cycle. The year starts at Li Chun (立春), when the Sun reaches apparent ecliptic longitude 315 degrees on February 3, 4 or 5, not at the Lunar New Year. Give "instant" (ISO 8601 with Z or an offset), or "date" with optional "time" and "utcOffset". Returns status "resolved" with one year, or "depends" with both candidate years when the input could fall on either side of Li Chun: a date without a time on Li Chun day, a clock time without a UTC offset near it, or a time within ${minutes} minutes of the computed Li Chun instant. Dates from ${SUPPORTED_RANGE.from} to ${SUPPORTED_RANGE.to}. Calendar facts only, with no interpretation.`,
    inputSchema: {
      type: 'object',
      properties: {
        date: str('Local birth date in the Gregorian calendar, YYYY-MM-DD. Use with optional time and utcOffset. Omit when giving instant.', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        time: str('Local 24-hour clock time, HH:MM or HH:MM:SS. Optional; leave it out when the birth time is unknown rather than guessing.', { pattern: '^\\d{2}:\\d{2}(:\\d{2})?$' }),
        utcOffset: str('UTC offset of the local clock at that date and place, for example "+08:00" or "-05:00". Optional; leave it out when unknown rather than assuming the present-day offset of a zone.', { pattern: '^(Z|[+-]\\d{2}:\\d{2})$' }),
        instant: str('Alternative to date: an exact instant in ISO 8601 with Z or an offset, for example "1990-02-04T09:30:00+08:00".'),
      },
      additionalProperties: false,
    },
    outputSchema: signOutput,
    annotations,
    run: (args) => chineseZodiac(args ?? {}),
  },
  {
    name: 'chinese_zodiac_relation',
    title: 'Traditional groupings shared by two animals',
    description: 'Which traditional earthly-branch groupings two Chinese zodiac animals share: the same animal, a trine (San He 三合, three animals four places apart), one of the six harmonies (Liu He 六合) or one of the six clashes (Liu Chong 六冲, opposite animals). Returns the classification only. It is not a compatibility score and makes no statement about any relationship. Use chinese_zodiac_sign first to find each animal from a birth date.',
    inputSchema: closed({
      first: { ...ANIMAL, description: 'First animal. Goat is also called Sheep or Ram; Pig is also called Boar.' },
      second: { ...ANIMAL, description: 'Second animal.' },
    }),
    outputSchema: relationOutput,
    annotations,
    run: (args) => {
      if (args === null || typeof args !== 'object') throw new ChineseZodiacInputError('invalid-input', 'Give first and second animals');
      for (const key of Object.keys(args)) if (key !== 'first' && key !== 'second') throw new ChineseZodiacInputError('invalid-input', `Unknown field "${key}"`);
      return chineseZodiacRelation(args.first, args.second);
    },
  },
  {
    name: 'chinese_zodiac_reference',
    title: 'Chinese zodiac reference table',
    description: 'The ten heavenly stems, the twelve earthly branches with their animals and fixed elements, the four trines, the six harmonies, the six clashes and the year-boundary convention used by chinese_zodiac_sign. Takes no arguments.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: referenceOutput,
    annotations,
    run: (args) => {
      if (args && typeof args === 'object' && Object.keys(args).length > 0) throw new ChineseZodiacInputError('invalid-input', 'This tool takes no arguments');
      return chineseZodiacGroups();
    },
  },
].map((tool) => Object.freeze(tool)));

/** The tool list as MCP tools/list returns it. */
export function listTools() {
  return TOOLS.map(({ run, ...definition }) => definition);
}

/**
 * Run a tool and return an MCP CallToolResult. Input errors are tool errors
 * (isError: true) with a fixed code and message that do not echo the input.
 * Returns null for an unknown tool name.
 */
export function callTool(name, args) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return null;
  try {
    const structuredContent = tool.run(args);
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  } catch (error) {
    if (!(error instanceof ChineseZodiacInputError)) throw error;
    return { content: [{ type: 'text', text: `${error.code}: ${error.message}` }], isError: true };
  }
}
