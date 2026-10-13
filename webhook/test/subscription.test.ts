import { describe, expect, it } from 'vitest';
import {
  parseSubscription,
  SubscriptionValidationError,
  SUBSCRIPTION_LIMITS,
} from '../src/subscription.js';

function input(filter: unknown = { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: 90 }) {
  return {
    callbackUrl: 'https://callbacks.example/events',
    secretRef: 'callback_key',
    filter,
    window: { start: '2000-01-01T00:00:00Z', end: '2000-02-01T00:00:00Z' },
  };
}

function invalid(value: unknown): SubscriptionValidationError {
  let failure: unknown;
  try {
    parseSubscription(value);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(SubscriptionValidationError);
  const error = failure as SubscriptionValidationError;
  expect(error.name).toBe('SubscriptionValidationError');
  expect(error.code).toBe('invalid-subscription');
  expect(typeof error.field).toBe('string');
  expect(error.field.length).toBeGreaterThan(0);
  return error;
}

describe('subscription specification', () => {
  it('normalizes the callback and time labels and enables new subscriptions', () => {
    expect(parseSubscription({
      ...input(),
      callbackUrl: 'https://CALLBACKS.example:443/events?topic=ingress',
      window: { start: '2000-01-01T00:00:00.1Z', end: '2000-01-01T00:00:00.12Z' },
    })).toEqual({
      ...input(),
      callbackUrl: 'https://callbacks.example/events?topic=ingress',
      window: { start: '2000-01-01T00:00:00.100Z', end: '2000-01-01T00:00:00.120Z' },
      enabled: true,
    });
    expect(parseSubscription({ ...input(), enabled: false }).enabled).toBe(false);
  });

  it.each([
    [{ kind: 'aspect-exact', bodies: ['Moon', 'Pluto'], angle: 0 },
      { kind: 'aspect-exact', bodies: ['Moon', 'Pluto'], angle: 0 }],
    [{ kind: 'aspect-exact', bodies: ['Venus', 'Jupiter'], angle: 72.5 },
      { kind: 'aspect-exact', bodies: ['Venus', 'Jupiter'], angle: 72.5 }],
    [{ kind: 'aspect-exact', bodies: ['Mercury', 'Neptune'], angle: 180 },
      { kind: 'aspect-exact', bodies: ['Mercury', 'Neptune'], angle: 180 }],
    [{ kind: 'ingress', body: 'Sun', sign: 'aries' },
      { kind: 'ingress', body: 'Sun', sign: 'aries', direction: 'any' }],
    [{ kind: 'ingress', body: 'Saturn', sign: 'pisces', direction: 'retrograde' },
      { kind: 'ingress', body: 'Saturn', sign: 'pisces', direction: 'retrograde' }],
    [{ kind: 'station', body: 'Mercury' },
      { kind: 'station', body: 'Mercury', direction: 'any' }],
    [{ kind: 'station', body: 'Pluto', direction: 'direct' },
      { kind: 'station', body: 'Pluto', direction: 'direct' }],
    [{ kind: 'eclipse', type: 'solar' }, { kind: 'eclipse', type: 'solar' }],
    [{ kind: 'eclipse', type: 'lunar' }, { kind: 'eclipse', type: 'lunar' }],
    [{ kind: 'eclipse', type: 'any' }, { kind: 'eclipse', type: 'any' }],
    [{ kind: 'custom', expression: ' \tnext Mars square Sun\r\n' },
      { kind: 'custom', expression: ' \tnext Mars square Sun\r\n' }],
  ])('accepts and snapshots the supported filter %#', (filter, expected) => {
    expect(parseSubscription(input(filter)).filter).toEqual(expected);
  });

  it('accepts every supported body and lower-case sign', () => {
    const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const signs = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
    for (const body of bodies) {
      expect(parseSubscription(input({ kind: 'ingress', body, sign: 'aries', direction: 'direct' })).filter)
        .toEqual({ kind: 'ingress', body, sign: 'aries', direction: 'direct' });
    }
    for (const sign of signs) {
      expect(parseSubscription(input({ kind: 'ingress', body: 'Moon', sign })).filter)
        .toEqual({ kind: 'ingress', body: 'Moon', sign, direction: 'any' });
    }
    for (const body of bodies.slice(2)) {
      expect(parseSubscription(input({ kind: 'station', body, direction: 'retrograde' })).filter)
        .toEqual({ kind: 'station', body, direction: 'retrograde' });
    }
  });

  it.each([null, undefined, [], 'subscription', 1, true, new Date(0)])('rejects non-record input %#', value => {
    invalid(value);
  });

  it('requires every nonoptional top-level field and a boolean enabled value', () => {
    for (const field of ['callbackUrl', 'secretRef', 'filter', 'window']) {
      const value: Record<string, unknown> = { ...input() };
      delete value[field];
      invalid(value);
    }
    for (const enabled of [null, undefined, 'true', 1, {}, []]) {
      invalid({ ...input(), enabled });
    }
  });
});

describe('callback URL validation', () => {
  it.each([
    'http://callbacks.example/events',
    'ftp://callbacks.example/events',
    '//callbacks.example/events',
    '/events',
    'https://',
    'https://@callbacks.example/events',
    'https://user@callbacks.example/events',
    'https://user:placeholder@callbacks.example/events',
    'https://callbacks.example:0/events',
    'https://callbacks.example/events#',
    'https://callbacks.example/events#fragment',
    ' https://callbacks.example/events',
    'https://callbacks.example/events ',
    'https://callbacks.example/a b',
    'https://callbacks.example/\tpath',
    'https://callbacks.example/\npath',
    'https://callbacks.example/\rpath',
    'https://callbacks.example/\u0000path',
    'https://callbacks.example/\u007fpath',
    'https://callbacks.example/\\path',
    'https://callbacks.example/\u00a0path',
  ])('rejects invalid callback spelling %#', callbackUrl => {
    invalid({ ...input(), callbackUrl });
  });

  it('permits URL queries and syntactically valid literal IP hosts without a network request', () => {
    for (const callbackUrl of [
      'https://callbacks.example/events?topic=moon',
      'https://192.0.2.1/events',
      'https://[2001:db8::1]/events',
    ]) {
      expect(parseSubscription({ ...input(), callbackUrl }).callbackUrl).toBe(callbackUrl);
    }
  });

  it('bounds both input and normalized URL sizes in UTF-8 bytes', () => {
    expect(SUBSCRIPTION_LIMITS.callbackUrlBytes).toBe(2048);
    const base = 'https://callbacks.example/';
    const room = SUBSCRIPTION_LIMITS.callbackUrlBytes - Buffer.byteLength(base);
    const ascii = base + 'x'.repeat(room);
    expect(parseSubscription({ ...input(), callbackUrl: ascii }).callbackUrl).toBe(ascii);
    invalid({ ...input(), callbackUrl: ascii + 'x' });
    const unicode = base + 'é'.repeat(Math.floor(room / 2)) + 'x'.repeat(room % 2);
    expect(Buffer.byteLength(unicode)).toBe(SUBSCRIPTION_LIMITS.callbackUrlBytes);
    expect(Buffer.byteLength(new URL(unicode).href)).toBeGreaterThan(SUBSCRIPTION_LIMITS.callbackUrlBytes);
    invalid({ ...input(), callbackUrl: unicode });
    invalid({ ...input(), callbackUrl: unicode + 'é' });
    const normalizedBoundary = base + 'é'.repeat(Math.floor(room / 6)) + 'x'.repeat(room % 6);
    expect(Buffer.byteLength(new URL(normalizedBoundary).href)).toBe(SUBSCRIPTION_LIMITS.callbackUrlBytes);
    expect(parseSubscription({ ...input(), callbackUrl: normalizedBoundary }).callbackUrl)
      .toBe(new URL(normalizedBoundary).href);
    const reduced = base + 'a/../'.repeat(SUBSCRIPTION_LIMITS.callbackUrlBytes);
    expect(new URL(reduced).href).toBe(base);
    invalid({ ...input(), callbackUrl: reduced });
  });

  it.each([null, undefined, 1, {}, [], new URL('https://callbacks.example/events')])('rejects nonstring callback URLs %#', callbackUrl => {
    invalid({ ...input(), callbackUrl });
  });
});

describe('runtime signing-key references', () => {
  it('accepts opaque ASCII references at their declared limit', () => {
    expect(SUBSCRIPTION_LIMITS.secretRefBytes).toBe(128);
    for (const secretRef of ['A', 'callback_2-Key', 'a'.repeat(SUBSCRIPTION_LIMITS.secretRefBytes)]) {
      expect(parseSubscription({ ...input(), secretRef }).secretRef).toBe(secretRef);
    }
  });

  it.each(['', '1key', '_key', '-key', 'key ref', 'key/ref', 'key.ref', 'key\n', 'clé', 'a'.repeat(129), null, 42])(
    'rejects unsupported reference syntax %#', secretRef => { invalid({ ...input(), secretRef }); },
  );
});

describe('schedule windows', () => {
  it('preserves valid early years and leap dates without Date year coercion', () => {
    for (const [start, end] of [
      ['0000-02-29T00:00:00Z', '0000-03-01T00:00:00Z'],
      ['0099-02-28T23:59:59.999Z', '0099-03-01T00:00:00Z'],
      ['2000-02-29T00:00:00Z', '2000-03-01T00:00:00Z'],
      ['2004-02-29T00:00:00Z', '2004-03-01T00:00:00Z'],
    ] as const) {
      expect(parseSubscription({ ...input(), window: { start, end } }).window).toEqual({
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      });
    }
  });

  it.each([
    ['1', '100'],
    ['12', '120'],
    ['123', '123'],
  ])('normalizes fractional seconds .%s to .%s', (fraction, milliseconds) => {
    const parsed = parseSubscription({
      ...input(),
      window: { start: `2000-01-01T00:00:00.${fraction}Z`, end: '2000-01-01T00:00:01Z' },
    });
    expect(parsed.window.start).toBe(`2000-01-01T00:00:00.${milliseconds}Z`);
  });

  it.each([
    '1900-02-29T00:00:00Z',
    '2001-02-29T00:00:00Z',
    '0099-02-29T00:00:00Z',
    '2000-02-30T00:00:00Z',
    '2000-04-31T00:00:00Z',
    '2000-00-01T00:00:00Z',
    '2000-13-01T00:00:00Z',
    '2000-01-00T00:00:00Z',
    '2000-01-32T00:00:00Z',
    '2000-01-01T24:00:00Z',
    '2000-01-01T00:60:00Z',
    '2000-01-01T00:00:60Z',
    '2000-01-01',
    '2000-01-01T00:00Z',
    '2000-01-01T00:00:00',
    '2000-01-01T00:00:00+00:00',
    '2000-01-01T00:00:00-00:00',
    '2000-01-01t00:00:00z',
    '2000-01-01T00:00:00.0000Z',
    '2000-01-01T00:00:00.Z',
    '+002000-01-01T00:00:00Z',
    '2000-01-01T00:00:00Z ',
  ])('rejects invalid or noncanonical calendar syntax %#', start => {
    invalid({ ...input(), window: { start, end: '9999-12-31T23:59:59Z' } });
    invalid({ ...input(), window: { start: '0001-01-01T00:00:00Z', end: start } });
  });

  it('requires a positive window duration and string endpoints', () => {
    invalid({ ...input(), window: { start: '2000-01-01T00:00:00Z', end: '2000-01-01T00:00:00.000Z' } });
    invalid({ ...input(), window: { start: '2000-02-01T00:00:00Z', end: '2000-01-01T00:00:00Z' } });
    for (const value of [null, [], {}, { start: '2000-01-01T00:00:00Z' },
      { start: new Date(0), end: '2000-01-01T00:00:00Z' },
      { start: 0, end: 1 }]) {
      invalid({ ...input(), window: value });
    }
  });
});

describe('filter validation', () => {
  it('normalizes a negative-zero aspect angle to positive zero', () => {
    const parsed = parseSubscription(input({ kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: -0 }));
    if (parsed.filter.kind !== 'aspect-exact') throw new Error('Expected an aspect filter');
    expect(parsed.filter.angle).toBe(0);
    expect(Object.is(parsed.filter.angle, -0)).toBe(false);
  });

  it.each([
    null, [], {}, 'ingress',
    { kind: 'unknown' },
    { kind: 'aspect-exact', bodies: ['Mars', 'Mars'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['Mars'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun', 'Moon'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['mars', 'Sun'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['Chiron', 'Sun'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['Node', 'Sun'], angle: 90 },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: -1 },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: 180.1 },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: Infinity },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: NaN },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: '90' },
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'] },
    { kind: 'aspect-exact', bodies: null, angle: 90 },
    { kind: 'ingress', body: 'Sun', sign: 'Aries' },
    { kind: 'ingress', body: 'Sun', sign: 'ophiuchus' },
    { kind: 'ingress', body: 'Sun' },
    { kind: 'ingress', body: 'sun', sign: 'aries' },
    { kind: 'ingress', body: 'Sun', sign: 'aries', direction: 'both' },
    { kind: 'ingress', body: 'Sun', sign: 'aries', direction: null },
    { kind: 'station', body: 'Sun' },
    { kind: 'station', body: 'Moon' },
    { kind: 'station', body: 'Node' },
    { kind: 'station', body: 'Mercury', direction: 'both' },
    { kind: 'station', body: 'Mercury', direction: undefined },
    { kind: 'eclipse', type: 'total' },
    { kind: 'eclipse', type: 'Solar' },
    { kind: 'eclipse' },
    { kind: 'custom', expression: '' },
    { kind: 'custom', expression: ' \t\r\n' },
    { kind: 'custom', expression: null },
    { kind: 'custom', expression: 1 },
  ])('rejects malformed or unsupported filters %#', filter => { invalid(input(filter)); });

  it('requires exact keys for each filter shape', () => {
    for (const filter of [
      { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: 90 },
      { kind: 'ingress', body: 'Sun', sign: 'aries' },
      { kind: 'station', body: 'Mercury' },
      { kind: 'eclipse', type: 'any' },
      { kind: 'custom', expression: 'next Mars square Sun' },
    ]) {
      invalid(input({ ...filter, unexpected: true }));
    }
  });

  it.each([
    { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: 90, expression: 'next Mars square Sun' },
    { kind: 'ingress', body: 'Sun', sign: 'aries', bodies: ['Mars', 'Sun'] },
    { kind: 'station', body: 'Mercury', angle: 90 },
    { kind: 'eclipse', type: 'any', body: 'Moon' },
    { kind: 'custom', expression: 'next Mars square Sun', type: 'any' },
  ])('rejects keys belonging to another filter variant %#', filter => { invalid(input(filter)); });

  it('bounds custom expressions by UTF-8 bytes and preserves their text', () => {
    expect(SUBSCRIPTION_LIMITS.expressionBytes).toBe(4096);
    const expression = 'é'.repeat(SUBSCRIPTION_LIMITS.expressionBytes / 2);
    expect(Buffer.byteLength(expression)).toBe(SUBSCRIPTION_LIMITS.expressionBytes);
    expect(parseSubscription(input({ kind: 'custom', expression })).filter).toEqual({ kind: 'custom', expression });
    invalid(input({ kind: 'custom', expression: expression + 'é' }));
    const plain = 'x'.repeat(SUBSCRIPTION_LIMITS.expressionBytes);
    expect(parseSubscription(input({ kind: 'custom', expression: plain })).filter)
      .toEqual({ kind: 'custom', expression: plain });
    invalid(input({ kind: 'custom', expression: plain + 'x' }));
  });

  it('rejects expression control characters except tab and line endings', () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      if ([9, 10, 13].includes(code)) continue;
      invalid(input({ kind: 'custom', expression: `next${String.fromCharCode(code)}Mars` }));
    }
  });
});

describe('untrusted record boundaries', () => {
  it('rejects unknown keys, including prototype-related own properties', () => {
    invalid({ ...input(), secret: 'placeholder-not-key-material' });
    invalid({ ...input(), window: { ...input().window, timezone: 'UTC' } });
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const extra = JSON.parse(`{"${key}":"untrusted-input-marker"}`) as Record<string, unknown>;
      invalid({ ...input(), ...extra });
      invalid(input({ kind: 'eclipse', type: 'any', ...extra }));
      invalid({ ...input(), window: { ...input().window, ...extra } });
    }
  });

  it('accepts null-prototype JSON-like records and rejects inherited records', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, input());
    value.filter = Object.assign(Object.create(null) as Record<string, unknown>, { kind: 'eclipse', type: 'any' });
    value.window = Object.assign(Object.create(null) as Record<string, unknown>, input().window);
    expect(parseSubscription(value).filter).toEqual({ kind: 'eclipse', type: 'any' });
    invalid(Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, input()));
  });

  it('rejects accessor slots without calling their getters', () => {
    let calls = 0;
    const getter = () => { calls++; throw new Error('untrusted-input-marker'); };
    const top = { ...input() };
    Object.defineProperty(top, 'callbackUrl', { get: getter, enumerable: true });
    invalid(top);
    const filter = { kind: 'eclipse', type: 'any' };
    Object.defineProperty(filter, 'type', { get: getter, enumerable: true });
    invalid(input(filter));
    const window = { ...input().window };
    Object.defineProperty(window, 'start', { get: getter, enumerable: true });
    invalid({ ...input(), window });
    const bodies = ['Mars', 'Sun'];
    Object.defineProperty(bodies, '0', { get: getter, enumerable: true });
    invalid(input({ kind: 'aspect-exact', bodies, angle: 90 }));
    expect(calls).toBe(0);
  });

  it('rejects symbols and hidden properties on records', () => {
    const symbol = { ...input(), [Symbol('hidden')]: true };
    invalid(symbol);
    const hidden = { ...input() };
    Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false });
    invalid(hidden);
    const nested = { kind: 'eclipse', type: 'any', [Symbol('hidden')]: true };
    invalid(input(nested));
  });

  it('rejects nonenumerable properties even when their names are allowed', () => {
    const hiddenCallback = { ...input() };
    Object.defineProperty(hiddenCallback, 'callbackUrl', { value: hiddenCallback.callbackUrl, enumerable: false });
    invalid(hiddenCallback);
    const hiddenType = { kind: 'eclipse', type: 'any' };
    Object.defineProperty(hiddenType, 'type', { value: 'any', enumerable: false });
    invalid(input(hiddenType));
    const hiddenStart = { ...input().window };
    Object.defineProperty(hiddenStart, 'start', { value: hiddenStart.start, enumerable: false });
    invalid({ ...input(), window: hiddenStart });
    const hiddenBody = ['Mars', 'Sun'];
    Object.defineProperty(hiddenBody, '0', { value: 'Mars', enumerable: false });
    invalid(input({ kind: 'aspect-exact', bodies: hiddenBody, angle: 90 }));
  });

  it.each(['\ud800', '\udfff', '\ud800x', '\udfff\ud800'])(
    'rejects malformed UTF-16 before URL or expression serialization %#', text => {
      invalid({ ...input(), callbackUrl: `https://callbacks.example/${text}` });
      invalid(input({ kind: 'custom', expression: `next ${text} event` }));
    },
  );

  it('preserves valid surrogate pairs in custom expressions and normalizes them in URLs', () => {
    const expression = 'next \ud83c\udf19 event';
    const callbackUrl = 'https://callbacks.example/\ud83c\udf19';
    const parsed = parseSubscription({ ...input({ kind: 'custom', expression }), callbackUrl });
    expect(parsed.filter).toEqual({ kind: 'custom', expression });
    expect(parsed.callbackUrl).toBe('https://callbacks.example/%F0%9F%8C%99');
  });

  it('rejects sparse body tuples and array properties beyond ordinary slots', () => {
    const sparse = new Array<string>(2);
    sparse[1] = 'Sun';
    invalid(input({ kind: 'aspect-exact', bodies: sparse, angle: 90 }));
    const extras = Object.assign(['Mars', 'Sun'], { extra: true });
    invalid(input({ kind: 'aspect-exact', bodies: extras, angle: 90 }));
    const symbols = Object.assign(['Mars', 'Sun'], { [Symbol('extra')]: true });
    invalid(input({ kind: 'aspect-exact', bodies: symbols, angle: 90 }));
  });

  it('returns detached deeply frozen data without freezing or modifying input', () => {
    const original = input();
    const before = structuredClone(original);
    const parsed = parseSubscription(original);
    expect(original).toEqual(before);
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(original.window)).toBe(false);
    expect(Object.isFrozen(original.filter)).toBe(false);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.window)).toBe(true);
    expect(Object.isFrozen(parsed.filter)).toBe(true);
    expect(parsed.window).not.toBe(original.window);
    expect(parsed.filter).not.toBe(original.filter);
    expect(parsed.filter.kind).toBe('aspect-exact');
    if (parsed.filter.kind !== 'aspect-exact') throw new Error('Expected an aspect filter');
    const originalFilter = original.filter as { bodies: string[]; angle: number };
    expect(Object.isFrozen(originalFilter.bodies)).toBe(false);
    expect(Object.isFrozen(parsed.filter.bodies)).toBe(true);
    expect(parsed.filter.bodies).not.toBe(originalFilter.bodies);
    originalFilter.bodies[0] = 'Moon';
    originalFilter.angle = 0;
    original.window.start = '2001-01-01T00:00:00Z';
    expect(parsed.filter.bodies).toEqual(['Mars', 'Sun']);
    expect(parsed.filter.angle).toBe(90);
    expect(parsed.window.start).toBe('2000-01-01T00:00:00.000Z');
  });

  it('never echoes supplied values or attacker-controlled keys in diagnostics', () => {
    const marker = 'untrusted-input-marker';
    const failures = [
      invalid({ ...input(), callbackUrl: `http://${marker}.example/` }),
      invalid({ ...input(), secretRef: `${marker}/invalid` }),
      invalid(input({ kind: marker })),
      invalid({ ...input(), window: { start: marker, end: marker } }),
      invalid({ ...input(), [marker]: true }),
    ];
    for (const error of failures) {
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toContain(marker);
      expect(error.field).not.toContain(marker);
      expect(JSON.stringify(error)).not.toContain(marker);
      expect(String(error)).not.toContain(marker);
    }
    expect(invalid({ ...input(), callbackUrl: 'invalid' }).message).toBe(failures[0]!.message);
  });
});
