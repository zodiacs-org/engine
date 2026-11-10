import { EVENT_BODIES } from './engine.js';
import type { EventBody } from './engine.js';
import { SIGNS } from './longitude.js';
import type { Sign } from './longitude.js';
import type { Clock } from './types.js';

export const QUERY_LIMITS = Object.freeze({ codeUnits: 4096, tokens: 128 });
export const QUERY_ASPECTS = Object.freeze({ conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 });
export type QueryAspect = keyof typeof QUERY_ASPECTS;
export type QueryEvent =
  | { readonly kind: 'aspect'; readonly body: EventBody; readonly aspect: QueryAspect;
      readonly target: { readonly kind: 'moving' | 'natal'; readonly body: EventBody } }
  | { readonly kind: 'ingress'; readonly body: EventBody; readonly sign: Sign | null }
  | { readonly kind: 'station'; readonly body: EventBody; readonly direction: 'direct' | 'retrograde' | null }
  | { readonly kind: 'retrograde'; readonly body: EventBody; readonly sign: Sign | null }
  | { readonly kind: 'eclipse'; readonly eclipse: 'solar' | 'lunar' }
  | { readonly kind: 'void-of-course'; readonly bodies: readonly EventBody[]; readonly aspects: readonly QueryAspect[] };
export interface EventQuery {
  readonly mode: 'next' | 'all';
  readonly event: QueryEvent;
  /** Null means the executor must supply an explicit bounded horizon. */
  readonly range: { readonly startMs: number; readonly endMs: number } | null;
  readonly clock: Clock | null;
}
export class QuerySyntaxError extends SyntaxError {
  constructor(readonly code: 'input-type' | 'input-limit' | 'token-limit' | 'syntax' | 'date' | 'range',
    readonly offset: number, readonly expected: string) {
    super(`Query ${code} at ${offset}: expected ${expected}.`);
    this.name = 'QuerySyntaxError';
  }
}
/** Flat, bounded grammar. Parsing never samples the engine or resolves natal data. */
export function parseQuery(input: string): EventQuery {
  const fail = (code: QuerySyntaxError['code'], offset: number, expected: string): never => {
    throw new QuerySyntaxError(code, offset, expected);
  };
  if (typeof input !== 'string') fail('input-type', 0, 'a string');
  if (input.length > QUERY_LIMITS.codeUnits) fail('input-limit', QUERY_LIMITS.codeUnits, 'a shorter query');
  const tokens = [...input.matchAll(/[^ \t\r\n]+/g)].map(m => ({ value: m[0], offset: m.index }));
  if (tokens.length > QUERY_LIMITS.tokens) fail('token-limit', tokens[QUERY_LIMITS.tokens]!.offset, 'fewer tokens');
  let cursor = 0;
  const peek = () => tokens[cursor]?.value.toLowerCase();
  const offset = () => tokens[cursor]?.offset ?? input.length;
  const take = () => { const value = tokens[cursor++]?.value; return value ?? fail('syntax', input.length, 'a token'); };
  const expect = (word: string) => { if (peek() !== word) fail('syntax', offset(), word); take(); };
  const choice = <T extends string>(values: readonly T[], label: string): T => {
    const value = values.find(v => v.toLowerCase() === peek());
    if (value === undefined) return fail('syntax', offset(), label);
    take(); return value;
  };
  const body = () => choice(EVENT_BODIES, 'a supported body');
  const aspect = () => choice(Object.keys(QUERY_ASPECTS) as QueryAspect[], 'a named aspect');
  const sign = () => choice(SIGNS, 'a zodiac sign');
  const list = <T extends string>(read: () => T): readonly T[] => {
    const result = [read()];
    while (peek() === ',') { take(); const at = offset(), item = read();
      if (result.includes(item)) fail('syntax', at, 'a unique list item'); result.push(item); }
    return Object.freeze(result);
  };
  const mode = choice(['next', 'all'] as const, 'next or all');
  let event: QueryEvent;
  if (peek() === 'solar' || peek() === 'lunar') {
    const eclipse = choice(['solar', 'lunar'] as const, 'solar or lunar');
    expect('eclipses'); event = { kind: 'eclipse', eclipse };
  } else if (peek() === 'void-of-course') {
    take(); expect('moon'); expect('with');
    const bodies = list(body);
    if (bodies.includes('Moon')) fail('syntax', offset(), 'non-Moon policy bodies');
    expect('aspects'); event = { kind: 'void-of-course', bodies, aspects: list(aspect) };
  } else {
    const moving = body();
    if (peek() === 'ingresses') {
      take(); let selected: Sign | null = null;
      if (peek() === 'into') { take(); selected = sign(); }
      event = { kind: 'ingress', body: moving, sign: selected };
    } else if (peek() === 'stations') {
      take(); let direction: 'direct' | 'retrograde' | null = null;
      if (peek() === 'direct' || peek() === 'retrograde') direction = choice(['direct', 'retrograde'] as const, 'direction');
      event = { kind: 'station', body: moving, direction };
    } else if (peek() === 'retrogrades') {
      take(); let selected: Sign | null = null;
      if (peek() === 'in') { take(); selected = sign(); }
      event = { kind: 'retrograde', body: moving, sign: selected };
    } else {
      const selected = aspect();
      const kind = peek() === 'natal' ? (take(), 'natal' as const) : 'moving' as const;
      const target = body();
      if (kind === 'moving' && target === moving) fail('syntax', tokens[cursor-1]!.offset, 'a different moving target');
      event = { kind: 'aspect', body: moving, aspect: selected, target: Object.freeze({ kind, body: target }) };
    }
  }
  const date = (): number => {
    const at = offset(), value = take();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('date', at, 'YYYY-MM-DD');
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return fail('date', at, 'a valid Gregorian date');
    return ms;
  };
  let range: EventQuery['range'] = null;
  if (peek() === 'from') {
    take(); const startMs = date(); expect('to'); const endMs = date();
    if (startMs >= endMs) fail('range', offset(), 'end after start');
    range = Object.freeze({ startMs, endMs });
  } else if (peek() && /^\d{4}-\d{4}$/.test(peek()!)) {
    const at = offset(), [first, last] = take().split('-').map(Number);
    if (first! >= last! || last! > 9998) fail('range', at, 'increasing years ending before 9999');
    // Year shorthand covers the named final year in full.
    range = Object.freeze({ startMs: Date.parse(`${String(first).padStart(4, '0')}-01-01T00:00:00Z`),
      endMs: Date.parse(`${String(last!+1).padStart(4, '0')}-01-01T00:00:00Z`) });
  }
  if (mode === 'all' && range === null) fail('syntax', offset(), 'an explicit range for all');
  let clock: Clock | null = null;
  if (peek() === 'clock') { take(); clock = choice(['utc', 'ut1', 'tt'] as const, 'utc, ut1 or tt'); }
  if (cursor !== tokens.length) fail('syntax', offset(), 'end of query');
  return Object.freeze({ mode, event: Object.freeze(event), range, clock });
}
