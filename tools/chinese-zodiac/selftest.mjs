// Tests for tools/chinese-zodiac. Run: node --test tools/chinese-zodiac/selftest.mjs
// Accuracy expectations come from the committed independent references (JPL
// Horizons and the Hong Kong Observatory) in
// docs/evidence/chinese-zodiac-2026-10-24/, never from this code's output.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANIMALS, BOUNDARY_UNCERTAINTY_SECONDS, BRANCHES, CONVENTION, ChineseZodiacInputError, SIX_CLASHES,
  SIX_HARMONIES, STEMS, TRINES, chineseZodiac, chineseZodiacGroups, chineseZodiacRelation, liChun,
  normalizeAnimal, sexagenaryYear,
} from './index.mjs';
import { callTool, listTools, TOOLS } from './mcp-tools.mjs';
import { handleMessage, PROTOCOL_VERSIONS } from './mcp-server.mjs';
import { measure } from '../../docs/evidence/chinese-zodiac-2026-10-24/measure.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(here(path), 'utf8'));
const EVIDENCE = '../../docs/evidence/chinese-zodiac-2026-10-24/';
const references = readJson(EVIDENCE + 'references.json');
const BAND_MS = BOUNDARY_UNCERTAINTY_SECONDS * 1000;
const iso = (ms) => new Date(ms).toISOString();

// Sexagenary years from the published rule and widely tabulated anchors:
// 1984 opened the current cycle at Jia Zi; 2024 Jia Chen; 2026 Bing Wu.
test('sexagenary year arithmetic', () => {
  const cases = [
    [1984, 'Jia', 'Zi', 'Rat', 'Wood', 'Yang', 1],
    [1985, 'Yi', 'Chou', 'Ox', 'Wood', 'Yin', 2],
    [2024, 'Jia', 'Chen', 'Dragon', 'Wood', 'Yang', 41],
    [2025, 'Yi', 'Si', 'Snake', 'Wood', 'Yin', 42],
    [2026, 'Bing', 'Wu', 'Horse', 'Fire', 'Yang', 43],
    [1900, 'Geng', 'Zi', 'Rat', 'Metal', 'Yang', 37],
    [1899, 'Ji', 'Hai', 'Pig', 'Earth', 'Yin', 36],
    [2043, 'Gui', 'Hai', 'Pig', 'Water', 'Yin', 60],
    [2044, 'Jia', 'Zi', 'Rat', 'Wood', 'Yang', 1],
    [2100, 'Geng', 'Shen', 'Monkey', 'Metal', 'Yang', 57],
  ];
  for (const [year, stem, branch, animal, element, polarity, position] of cases) {
    const sign = sexagenaryYear(year);
    assert.equal(sign.stem.pinyin, stem, `${year} stem`);
    assert.equal(sign.branch.pinyin, branch, `${year} branch`);
    assert.equal(sign.animal, animal);
    assert.equal(sign.element, element);
    assert.equal(sign.polarity, polarity);
    assert.equal(sign.cyclePosition, position);
    assert.equal(sign.label, `${polarity} ${element} ${animal}`);
  }
  for (let year = 1899; year <= 2100; year++) {
    const sign = sexagenaryYear(year);
    assert.deepEqual(sexagenaryYear(year + 60), { ...sign, liChunYear: year + 60 });
    // Stems and branches pair only with the same polarity in the sixty-year cycle.
    assert.equal(STEMS[sign.stem.index].polarity, BRANCHES[sign.branch.index].polarity);
  }
  assert.equal(STEMS.length, 10);
  assert.equal(BRANCHES.length, 12);
});

test('Li Chun of every year 1900 to 2100 lies inside the band around JPL Horizons', () => {
  const rows = references.horizons.liChun;
  assert.equal(rows.length, 201);
  assert.deepEqual([rows[0].year, rows.at(-1).year], [1900, 2100]);
  for (const row of rows) {
    const computed = Date.parse(liChun(row.year).utc);
    // liChun() rounds to the minute; allow that 30 s on top of the band.
    assert.ok(Math.abs(computed - Date.parse(row.ut)) <= BAND_MS - 30_000, `${row.year}: ${iso(computed)} vs ${row.ut}`);
  }
});

test('Li Chun lies inside the band around the Hong Kong Observatory times', () => {
  assert.ok(references.hko.liChun.length >= 10);
  for (const row of references.hko.liChun) {
    const computed = Date.parse(liChun(row.year).utc);
    // HKO publishes the minute: 30 s of rounding, and 30 s for ours.
    assert.ok(Math.abs(computed - Date.parse(row.utc)) <= BAND_MS - 60_000, `${row.year}`);
  }
});

test('the committed measurement matches the code', () => {
  assert.deepEqual(measure(references), readJson(EVIDENCE + 'results.json'));
});

test('documented convention facts hold for the references', () => {
  const dates = new Set(references.horizons.liChun.map((row) => new Date(Date.parse(row.ut) + 8 * 3_600_000).toISOString().slice(5, 10)));
  assert.deepEqual([...dates].sort(), ['02-03', '02-04', '02-05']);
  assert.match(CONVENTION.definition, /February 3, 4 or 5 in China Standard Time/);
});

// Never a wrong answer: around each reference Li Chun, every resolved result
// agrees with the reference side, and results more than the band plus the
// measured model error away are resolved.
test('resolved results agree with the reference boundary for every year', () => {
  const { maxAbsSeconds } = readJson(EVIDENCE + 'results.json').computedVsHorizonsUT;
  const resolvedBeyondMs = BAND_MS + maxAbsSeconds * 1000;
  for (const row of references.horizons.liChun) {
    const boundary = Date.parse(row.ut);
    for (let minutes = -20; minutes <= 20; minutes++) {
      const at = boundary + minutes * 60_000 + (minutes < 0 ? -1000 : 0);
      const result = chineseZodiac({ instant: iso(at) });
      const expected = sexagenaryYear(at < boundary ? row.year - 1 : row.year);
      if (result.status === 'resolved') assert.deepEqual(result.sign, expected, `${row.year} ${minutes} min`);
      else assert.deepEqual(result.candidates, [sexagenaryYear(row.year - 1), sexagenaryYear(row.year)]);
      if (Math.abs(at - boundary) > resolvedBeyondMs) assert.equal(result.status, 'resolved', `${row.year} ${minutes} min`);
    }
  }
});

const animalOf = (input) => {
  const result = chineseZodiac(input);
  return result.status === 'resolved' ? result.sign.label : `depends: ${result.candidates.map((c) => c.label).join(' / ')}`;
};

test('early February edge cases', () => {
  // HKO Li Chun 2026: 2026-02-04 04:02 Hong Kong Time (2026-02-03 20:02 UTC).
  assert.equal(animalOf({ date: '2026-02-04', time: '03:30', utcOffset: '+08:00' }), 'Yin Wood Snake');
  assert.equal(animalOf({ date: '2026-02-04', time: '04:02', utcOffset: '+08:00' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-04', time: '04:30', utcOffset: '+08:00' }), 'Yang Fire Horse');
  assert.equal(animalOf({ instant: '2026-02-03T19:30:00Z' }), 'Yin Wood Snake');
  assert.equal(animalOf({ instant: '2026-02-04T04:30:00+08:00' }), 'Yang Fire Horse');
  // The civil date of Li Chun depends on the offset: February 3 in New York, February 4 in Beijing.
  assert.equal(animalOf({ date: '2026-02-03', utcOffset: '-05:00' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-04', utcOffset: '-05:00' }), 'Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-03', utcOffset: '+08:00' }), 'Yin Wood Snake');
  assert.equal(animalOf({ date: '2026-02-04', utcOffset: '+08:00' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  // A date alone is taken in every offset from -12:00 to +14:00.
  assert.equal(animalOf({ date: '2026-02-02' }), 'Yin Wood Snake');
  assert.equal(animalOf({ date: '2026-02-03' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-04' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-05' }), 'Yang Fire Horse');
  // A clock time without an offset can still resolve when every offset agrees.
  assert.equal(animalOf({ date: '2026-02-04', time: '12:00' }), 'Yang Fire Horse');
  assert.equal(animalOf({ date: '2026-02-04', time: '04:00' }), 'depends: Yin Wood Snake / Yang Fire Horse');
  // HKO Li Chun 2025: 2025-02-03 22:10 Hong Kong Time, a February 3 Li Chun.
  assert.equal(animalOf({ date: '2025-02-03', time: '21:50', utcOffset: '+08:00' }), 'Yang Wood Dragon');
  assert.equal(animalOf({ date: '2025-02-03', time: '22:10', utcOffset: '+08:00' }), 'depends: Yang Wood Dragon / Yin Wood Snake');
  assert.equal(animalOf({ date: '2025-02-03', time: '22:30', utcOffset: '+08:00' }), 'Yin Wood Snake');
  assert.equal(animalOf({ date: '2025-02-04', utcOffset: '+08:00' }), 'Yin Wood Snake');
  // Horizons Li Chun 1912: 1912-02-05 11:53 UTC+8, a February 5 Li Chun.
  assert.equal(animalOf({ date: '1912-02-05', time: '08:00', utcOffset: '+08:00' }), 'Yin Metal Pig');
  assert.equal(animalOf({ date: '1912-02-05', time: '16:00', utcOffset: '+08:00' }), 'Yang Water Rat');
  assert.equal(animalOf({ date: '1912-02-04', utcOffset: '+08:00' }), 'Yin Metal Pig');
  // January and late December are never near the boundary.
  assert.equal(animalOf({ date: '2026-01-20' }), 'Yin Wood Snake');
  assert.equal(animalOf({ date: '2026-12-31' }), 'Yang Fire Horse');
  assert.equal(animalOf({ date: '1900-01-01' }), 'Yin Earth Pig');
  assert.equal(animalOf({ date: '2100-12-31' }), 'Yang Metal Monkey');
  assert.equal(animalOf({ date: '2024-02-29' }), 'Yang Wood Dragon');
});

test('depends results explain what would resolve them', () => {
  assert.match(chineseZodiac({ date: '2026-02-04' }).reason, /Supply the birth time and UTC offset/);
  assert.match(chineseZodiac({ date: '2026-02-04', utcOffset: '+08:00' }).reason, /Supply the birth time/);
  assert.match(chineseZodiac({ date: '2026-02-04', time: '04:00' }).reason, /Supply the UTC offset/);
  assert.match(chineseZodiac({ instant: '2026-02-03T20:00:00Z' }).reason, /within 10 minutes/);
  const resolved = chineseZodiac({ date: '2026-06-01' });
  assert.equal('reason' in resolved, false);
  assert.deepEqual(resolved.candidates, [resolved.sign]);
});

test('input intervals', () => {
  assert.deepEqual(chineseZodiac({ instant: '2026-02-04T04:30:00.25+08:00' }).input,
    { kind: 'instant', from: '2026-02-03T20:30:00.250Z', to: '2026-02-03T20:30:00.250Z' });
  assert.deepEqual(chineseZodiac({ date: '2026-06-01', utcOffset: 'Z' }).input,
    { kind: 'date-offset', from: '2026-06-01T00:00:00Z', to: '2026-06-01T23:59:59.999Z' });
  assert.deepEqual(chineseZodiac({ date: '2026-06-01', time: '12:00' }).input,
    { kind: 'date-time', from: '2026-05-31T22:00:00Z', to: '2026-06-02T00:00:00Z' });
  assert.deepEqual(chineseZodiac({ date: '2026-06-01' }).input,
    { kind: 'date', from: '2026-05-31T10:00:00Z', to: '2026-06-02T11:59:59.999Z' });
});

test('input refusals carry fixed codes', () => {
  const refusals = [
    [{ date: '2023-02-29' }, 'invalid-date'], [{ date: '2026-04-31' }, 'invalid-date'],
    [{ date: '2026-2-4' }, 'invalid-date'], [{ date: '1899-12-31' }, 'out-of-range'],
    [{ date: '2101-01-01' }, 'out-of-range'], [{ date: '2026-02-04', time: '24:00' }, 'invalid-time'],
    [{ date: '2026-02-04', time: '4:00' }, 'invalid-time'], [{ date: '2026-02-04', utcOffset: '+15:00' }, 'invalid-utc-offset'],
    [{ date: '2026-02-04', utcOffset: '+05:60' }, 'invalid-utc-offset'], [{ date: '2026-02-04', utcOffset: '0800' }, 'invalid-utc-offset'],
    [{ instant: '2026-02-04T04:00:00' }, 'invalid-instant'], [{ instant: '2026-02-04T04:00:00Z', date: '2026-02-04' }, 'invalid-input'],
    [{ date: '2026-02-04', zone: 'Asia/Shanghai' }, 'invalid-input'], [{}, 'invalid-input'], [null, 'invalid-input'], [[], 'invalid-input'],
    [{ time: '04:00' }, 'invalid-input'],
  ];
  for (const [input, code] of refusals) {
    assert.throws(() => chineseZodiac(input), (error) => error instanceof ChineseZodiacInputError && error.code === code, JSON.stringify(input));
  }
  assert.throws(() => liChun(1899), { code: 'out-of-range' });
  assert.throws(() => normalizeAnimal('Cat'), { code: 'invalid-animal' });
});

test('groupings agree with their arithmetic definitions', () => {
  const index = (animal) => ANIMALS.indexOf(animal);
  for (const a of ANIMALS) {
    let trinePartners = 0, harmonies = 0, clashes = 0;
    for (const b of ANIMALS) {
      const relation = chineseZodiacRelation(a, b);
      const [i, j] = [index(a), index(b)];
      const trine = i % 4 === j % 4;
      assert.equal(relation.trine !== null, trine, `${a} ${b} trine`);
      assert.equal(relation.sixHarmony, (i + j) % 12 === 1, `${a} ${b} harmony`);
      assert.equal(relation.clash, Math.abs(i - j) === 6, `${a} ${b} clash`);
      assert.equal(relation.relations.includes('same-animal'), a === b);
      assert.equal(relation.branchDistance, Math.min(Math.abs(i - j), 12 - Math.abs(i - j)));
      assert.deepEqual(chineseZodiacRelation(b, a).relations, relation.relations);
      if (trine && a !== b) trinePartners++;
      if (relation.sixHarmony) harmonies++;
      if (relation.clash) clashes++;
      assert.ok(!(relation.sixHarmony && relation.clash));
    }
    assert.deepEqual([trinePartners, harmonies, clashes], [2, 1, 1], a);
  }
  assert.equal(TRINES.flatMap((group) => group.animals).length, 12);
  assert.equal(new Set(SIX_HARMONIES.flat()).size, 12);
  assert.equal(new Set(SIX_CLASHES.flat()).size, 12);
  // Trine elements are the fixed element of each group's middle branch (Zi, You, Wu, Mao).
  for (const group of TRINES) assert.ok(group.animals.some((animal) => BRANCHES[index(animal)].fixedElement === group.element));
});

test('animal names', () => {
  assert.equal(normalizeAnimal(' rat '), 'Rat');
  assert.equal(normalizeAnimal('Sheep'), 'Goat');
  assert.equal(normalizeAnimal('ram'), 'Goat');
  assert.equal(normalizeAnimal('Boar'), 'Pig');
  assert.deepEqual(chineseZodiacRelation('Goat', 'Horse').relations, ['six-harmony']);
  assert.deepEqual(chineseZodiacRelation('Rat', 'Horse').relations, ['clash']);
  assert.deepEqual(chineseZodiacRelation('Tiger', 'Dog').relations, ['trine']);
  assert.deepEqual(chineseZodiacRelation('Dragon', 'Dragon').relations, ['same-animal', 'trine']);
  assert.deepEqual(chineseZodiacRelation('Rat', 'Tiger').relations, []);
});

test('reference table copies are independent of the module data', () => {
  const groups = chineseZodiacGroups();
  groups.branches[0].animal = 'changed';
  groups.trines[0].animals.push('changed');
  assert.equal(chineseZodiacGroups().branches[0].animal, 'Rat');
  assert.equal(chineseZodiacGroups().trines[0].animals.length, 3);
});

// A small JSON Schema checker for the keywords the tool schemas use.
function schemaErrors(schema, value, path = '$') {
  const errors = [];
  const typeOk = (type) => type === 'null' ? value === null : type === 'integer' ? Number.isInteger(value)
    : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : typeof value === type;
  if (schema.anyOf) {
    if (!schema.anyOf.some((option) => schemaErrors(option, value, path).length === 0)) errors.push(`${path}: no anyOf branch matches`);
    return errors;
  }
  if (schema.type && !typeOk(schema.type)) return [`${path}: expected ${schema.type}`];
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: const`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: enum`);
  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: pattern`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
    if (schema.items) value.forEach((item, i) => errors.push(...schemaErrors(schema.items, item, `${path}[${i}]`)));
  } else if (schema.type === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], item, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${key}`);
    }
  }
  return errors;
}

const SAMPLE_CALLS = [
  ['chinese_zodiac_sign', { date: '1990-06-15' }], ['chinese_zodiac_sign', { date: '2026-02-04' }],
  ['chinese_zodiac_sign', { date: '2026-02-04', time: '04:30', utcOffset: '+08:00' }],
  ['chinese_zodiac_sign', { instant: '2026-02-03T20:02:00Z' }], ['chinese_zodiac_relation', { first: 'Rat', second: 'Dragon' }],
  ['chinese_zodiac_relation', { first: 'Horse', second: 'Horse' }], ['chinese_zodiac_reference', {}],
];

test('tool results match their declared output schemas, and inputs their input schemas', () => {
  for (const [name, args] of SAMPLE_CALLS) {
    const tool = TOOLS.find((candidate) => candidate.name === name);
    assert.deepEqual(schemaErrors(tool.inputSchema, args), [], `${name} input`);
    const outcome = callTool(name, args);
    assert.equal(outcome.isError, undefined);
    assert.deepEqual(schemaErrors(tool.outputSchema, outcome.structuredContent), [], `${name} output`);
    assert.deepEqual(JSON.parse(outcome.content[0].text), outcome.structuredContent);
  }
  for (let year = 1900; year <= 2100; year += 7) {
    const outcome = callTool('chinese_zodiac_sign', { date: `${year}-02-04`, time: '12:00', utcOffset: '+08:00' });
    assert.deepEqual(schemaErrors(TOOLS[0].outputSchema, outcome.structuredContent), []);
  }
});

test('tool errors do not echo the input', () => {
  const outcome = callTool('chinese_zodiac_sign', { date: '1987-13-45' });
  assert.equal(outcome.isError, true);
  assert.equal(outcome.content[0].text.includes('1987'), false);
  assert.equal(callTool('chinese_zodiac_relation', { first: 'Rat', second: 'Unicorn' }).isError, true);
  assert.equal(callTool('chinese_zodiac_reference', { anything: 1 }).isError, true);
  assert.equal(callTool('no_such_tool', {}), null);
});

test('JSON-RPC handling', () => {
  const init = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  const future = handleMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
  assert.equal(future.result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.equal(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual(handleMessage({ jsonrpc: '2.0', id: 'p', method: 'ping' }), { jsonrpc: '2.0', id: 'p', result: {} });
  assert.equal(handleMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' }).error.code, -32601);
  assert.equal(handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } }).error.code, -32602);
  assert.equal(handleMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call' }).error.code, -32602);
  assert.equal(handleMessage({ id: 6, method: 'ping' }).error.code, -32600);
  assert.deepEqual(handleMessage({ jsonrpc: '2.0', id: 7, method: 'tools/list' }).result.tools, listTools());
  for (const tool of listTools()) {
    assert.equal('run' in tool, false);
    assert.deepEqual(Object.keys(tool).sort(), ['annotations', 'description', 'inputSchema', 'name', 'outputSchema', 'title']);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.annotations.readOnlyHint, true);
  }
});

test('stdio server round trip', async () => {
  const child = spawn(process.execPath, [here('./mcp-server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) { lines.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); }
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const send = (message) => child.stdin.write((typeof message === 'string' ? message : JSON.stringify(message)) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'chinese_zodiac_sign', arguments: { date: '2026-02-04', time: '04:30', utcOffset: '+08:00' } } });
  send('{not json');
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.deepEqual(lines.map((line) => line.id), [1, 2, 3, null]);
  assert.equal(lines[0].result.serverInfo.name, 'zodiacs-chinese-zodiac');
  assert.deepEqual(lines[1].result.tools.map((tool) => tool.name), ['chinese_zodiac_sign', 'chinese_zodiac_relation', 'chinese_zodiac_reference']);
  assert.equal(lines[2].result.structuredContent.sign.label, 'Yang Fire Horse');
  assert.equal(lines[3].error.code, -32700);
});

// Wording: plain calendar facts only. This vocabulary check is a review aid.
const WORDING = [
  /\b(?:predict\w*|forecast\w*|prophe\w*|destin(?:y|ies|ed)|fated|soul ?mates?|fortune\w*|divination|lucky|unlucky)\b/iu,
  /\b(?:best|worst|perfect|bad|good) match(?:es)?\b/iu,
  /\b(?:crypto\w*|tokens?|blockchain|nft|coin|prices?|profit\w*|invest\w*|trading)\b/iu,
];
const DASHES = /[\u2013\u2014]/u;

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

test('descriptions and results use plain factual wording', () => {
  const init = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  const texts = [
    ...strings(listTools()), ...strings(init.result),
    ...SAMPLE_CALLS.flatMap(([name, args]) => strings(callTool(name, args).structuredContent)),
  ];
  for (const text of texts) {
    for (const rule of WORDING) assert.doesNotMatch(text, rule);
    assert.doesNotMatch(text, DASHES);
  }
});

test('no en or em dashes in the files this tool adds', () => {
  const files = [
    ...readdirSync(here('.')).map((name) => here(`./${name}`)).filter((path) => /\.(?:mjs|mts|md|json)$/u.test(path)),
    here('../../docs/agents/GAP-REVIEW.md'), here('../../docs/agents/CHINESE-ZODIAC.md'), here('../../docs/agents/README.md'),
    here(EVIDENCE + 'README.md'), here(EVIDENCE + 'fetch-references.mjs'), here(EVIDENCE + 'measure.mjs'),
  ];
  for (const path of files) assert.doesNotMatch(readFileSync(path, 'utf8'), DASHES, path);
});

// Every example call in the agent guide is followed by its result. The
// documented result must be contained in the actual one (the guide may leave
// out keys such as "convention"), and arrays must match exactly.
function contained(documented, actual, path = '$') {
  if (Array.isArray(documented)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, documented.length, `${path} length`);
    documented.forEach((item, i) => contained(item, actual[i], `${path}[${i}]`));
  } else if (documented && typeof documented === 'object') {
    assert.ok(actual && typeof actual === 'object', path);
    for (const [key, item] of Object.entries(documented)) {
      assert.ok(key in actual, `${path}.${key} missing`);
      contained(item, actual[key], `${path}.${key}`);
    }
  } else assert.equal(actual, documented, path);
}

test('agent guide examples are real outputs', () => {
  const guide = readFileSync(here('../../docs/agents/CHINESE-ZODIAC.md'), 'utf8');
  const pattern = /<!-- call -->\s*```json\n([\s\S]*?)```\s*<!-- result -->\s*```json\n([\s\S]*?)```/gu;
  const pairs = [...guide.matchAll(pattern)];
  assert.ok(pairs.length >= 6, `found ${pairs.length} examples`);
  for (const [, call, documented] of pairs) {
    const { name, arguments: args } = JSON.parse(call);
    const outcome = callTool(name, args);
    const expected = JSON.parse(documented);
    if (outcome.isError) assert.deepEqual(expected, { isError: true, text: outcome.content[0].text });
    else contained(expected, outcome.structuredContent);
  }
});
