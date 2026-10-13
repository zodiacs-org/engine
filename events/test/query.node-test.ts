import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuery, QuerySyntaxError, QUERY_LIMITS } from '../src/query.js';

test('requested examples retain symbolic natal targets and full final years', () => {
  assert.deepEqual(parseQuery('next Mars square natal Sun'), { mode: 'next',
    event: { kind: 'aspect', body: 'Mars', aspect: 'square', target: { kind: 'natal', body: 'Sun' } }, range: null, clock: null });
  const q = parseQuery('all Venus retrogrades in Leo 1900-2100 clock tt');
  assert.deepEqual(q.event, { kind: 'retrograde', body: 'Venus', sign: 'Leo' });
  assert.equal(q.range!.startMs, Date.UTC(1900, 0, 1));
  assert.equal(q.range!.endMs, Date.UTC(2101, 0, 1));
  assert.equal(q.clock, 'tt');
});
test('event forms, filters, whitespace and case', () => {
  for (const [text, event] of [
    ['next Moon ingresses into Aries', { kind: 'ingress', body: 'Moon', sign: 'Aries' }],
    ['next Moon ingresses', { kind: 'ingress', body: 'Moon', sign: null }],
    ['next Mercury stations direct', { kind: 'station', body: 'Mercury', direction: 'direct' }],
    ['next Mercury stations', { kind: 'station', body: 'Mercury', direction: null }],
    ['next Venus retrogrades', { kind: 'retrograde', body: 'Venus', sign: null }],
    ['next solar eclipses', { kind: 'eclipse', eclipse: 'solar' }],
    ['next lunar eclipses', { kind: 'eclipse', eclipse: 'lunar' }],
    ['next Mars opposition Sun', { kind: 'aspect', body: 'Mars', aspect: 'opposition', target: { kind: 'moving', body: 'Sun' } }],
    ['next void-of-course Moon with Sun , Mars aspects square , trine',
      { kind: 'void-of-course', bodies: ['Sun', 'Mars'], aspects: ['square', 'trine'] }]
  ] as const) assert.deepEqual(parseQuery(text.toUpperCase().replaceAll(' ', '\t')).event, event);
  const q = parseQuery('all Sun ingresses from 2000-02-29 to 2001-01-01 clock ut1');
  assert.equal(q.range!.startMs, Date.UTC(2000, 1, 29));
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.event) && Object.isFrozen(q.range));
});
test('strict syntax rejects unknown, duplicate, inapplicable and trailing terms', () => {
  for (const text of ['', 'next', 'all Mars stations', 'next Earth stations', 'next Mars square Mars',
    'next Mars quincunx Sun', 'next solar eclipse', 'next Mars stations in Leo',
    'next Moon ingresses into Foo', 'next Venus retrogrades in Leo in Leo',
    'next Mars stations clock tai', 'next Mars stations clock tt clock utc',
    'next void-of-course Moon with Moon aspects square',
    'next void-of-course Moon with Sun , Sun aspects square',
    'next void-of-course Moon with Sun aspects square , square',
    'next void-of-course Moon with Sun, Mars aspects square',
    'next Mars square natal Sun;process.exit()', 'next Mars stations\u0000']) {
    assert.throws(() => parseQuery(text), QuerySyntaxError, text);
  }
});
test('calendar validation and chronological ranges do not normalize malformed dates', () => {
  for (const date of ['1900-02-29', '2001-04-31', '2000-13-01', '2000-00-01', '2000-01-00', '00-01-01', '2000-01-01T12:00Z']) {
    assert.throws(() => parseQuery(`all Mars stations from ${date} to 2100-01-01`),
      (e: unknown) => e instanceof QuerySyntaxError && e.code === 'date');
  }
  for (const span of ['2100-1900', '2000-2000', '1900-9999', 'from 2001-01-01 to 2000-01-01']) {
    assert.throws(() => parseQuery(`all Mars stations ${span}`),
      (e: unknown) => e instanceof QuerySyntaxError && e.code === 'range');
  }
  assert.equal(new Date(parseQuery('all Mars stations 0000-0001').range!.startMs).getUTCFullYear(), 0);
});
test('bounded input and positioned typed errors', () => {
  assert.throws(() => parseQuery(null as unknown as string), (e: unknown) => e instanceof QuerySyntaxError && e.code === 'input-type');
  assert.throws(() => parseQuery(' '.repeat(QUERY_LIMITS.codeUnits+1)), (e: unknown) => e instanceof QuerySyntaxError && e.code === 'input-limit');
  assert.throws(() => parseQuery('x '.repeat(QUERY_LIMITS.tokens+1)), (e: unknown) => e instanceof QuerySyntaxError && e.code === 'token-limit');
  assert.throws(() => parseQuery('next Mars stations rubbish'), (e: unknown) =>
    e instanceof QuerySyntaxError && e.offset === 19 && e.expected === 'end of query');
  assert.doesNotThrow(() => parseQuery('next Mars stations'.padEnd(QUERY_LIMITS.codeUnits, ' ')));
});
