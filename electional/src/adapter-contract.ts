import { normalizeIntervals } from './intervals.js';
import type { Interval } from './intervals.js';

export type Clock = 'utc' | 'ut1' | 'tt';
export interface ClockWindow extends Interval { readonly clock: Clock }
export interface WorkOptions {
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
}
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export interface EngineReceipt {
  readonly schema: string;
  readonly request: Json;
  readonly instants: readonly Json[];
  readonly conventions: readonly string[];
  readonly engine: {
    readonly name: string;
    readonly version: string;
    readonly ephemeris: { readonly name: string; readonly version: string };
  };
}

export function instantMs(value: number): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) {
    throw new RangeError('Expected integer milliseconds representable by Date.');
  }
}
export function clockWindow(value: ClockWindow): ClockWindow {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !['startMs', 'endMs', 'clock'].includes(k))) {
    throw new RangeError('Expected startMs, endMs and clock only.');
  }
  normalizeIntervals([value]);
  if (value.startMs >= value.endMs || !['utc', 'ut1', 'tt'].includes(value.clock)) {
    throw new RangeError('Expected a positive duration and explicit clock.');
  }
  return Object.freeze({ startMs: value.startMs, endMs: value.endMs, clock: value.clock });
}
export function workOptions(value: WorkOptions): WorkOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !['maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(value.maxEvaluations) || value.maxEvaluations < 1) {
    throw new RangeError('An explicit positive integer evaluation budget is required.');
  }
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) {
    throw new TypeError('Expected AbortSignal.');
  }
  return Object.freeze({ maxEvaluations: value.maxEvaluations,
    ...(value.signal === undefined ? {} : { signal: value.signal }) });
}
/** Copy and freeze JSON provenance; never freeze the caller's data. */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(item: unknown): void {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}
export class AdapterRefused extends Error {
  constructor(readonly reason: 'evaluation-budget' | 'cancelled' | 'engine-refused',
    readonly detail: Json = null) {
    super(`Adapter refused: ${reason}`);
    this.name = 'AdapterRefused';
  }
}

/** Request accounting, including failed calls. No solver and no implicit cache. */
export class WorkContext {
  readonly window: ClockWindow;
  readonly options: WorkOptions;
  #evaluations = 0;
  #receipts: EngineReceipt[] = [];
  constructor(window: ClockWindow, options: WorkOptions) {
    this.window = clockWindow(window);
    this.options = workOptions(options);
  }
  get evaluations(): number { return this.#evaluations; }
  get receipts(): readonly EngineReceipt[] { return Object.freeze([...this.#receipts]); }
  checkpoint(): void {
    if (this.options.signal?.aborted) throw new AdapterRefused('cancelled');
  }
  evaluate<T>(atMs: number, run: () => T): T {
    instantMs(atMs);
    if (atMs < this.window.startMs || atMs > this.window.endMs) {
      throw new RangeError('Sample outside the declared window.');
    }
    this.checkpoint();
    if (this.#evaluations >= this.options.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.#evaluations++;
    const result = run();
    this.checkpoint();
    return result;
  }
  record(receipt: EngineReceipt): void { this.#receipts.push(frozenCopy(receipt)); }
}
