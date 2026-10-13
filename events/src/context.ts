import type { SearchOptions, SearchResult, SearchWindow } from './types.js';

export function validateInstant(atMs: number): void {
  if (!Number.isSafeInteger(atMs) || Math.abs(atMs) > 8.64e15) {
    throw new RangeError('An instant must be integer epoch milliseconds representable by Date.');
  }
}

/** Validate and snapshot a window before a search performs any work. */
export function validateWindow(window: SearchWindow): Readonly<SearchWindow> {
  if (window === null || typeof window !== 'object' ||
      Object.keys(window).some(key => !['startMs', 'endMs', 'clock'].includes(key))) {
    throw new TypeError('A search window requires only startMs, endMs and clock.');
  }
  validateInstant(window.startMs);
  validateInstant(window.endMs);
  if (window.startMs >= window.endMs) throw new RangeError('A search window must have positive duration.');
  if (!['utc', 'ut1', 'tt'].includes(window.clock)) throw new RangeError('Unknown search clock.');
  return Object.freeze({ startMs: window.startMs, endMs: window.endMs, clock: window.clock });
}

export class SearchInterrupted extends Error {
  constructor(readonly reason: 'evaluation-budget' | 'cancelled') {
    super(`Search refused: ${reason}`);
    this.name = 'SearchInterrupted';
  }
}

/** One context is shared by scanning and root refinement. No cache is implicit. */
export class EvaluationContext {
  readonly window: Readonly<SearchWindow>;
  readonly #limit: number;
  readonly #signal: AbortSignal | undefined;
  #evaluations = 0;

  constructor(window: SearchWindow, options: SearchOptions) {
    this.window = validateWindow(window);
    if (!options || Object.keys(options).some(key => !['maxEvaluations', 'signal'].includes(key)) ||
        !Number.isSafeInteger(options.maxEvaluations) || options.maxEvaluations < 1) {
      throw new RangeError('A positive integer evaluation budget is required.');
    }
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
      throw new TypeError('signal must be an AbortSignal.');
    }
    this.#limit = options.maxEvaluations;
    this.#signal = options.signal;
  }

  get evaluations(): number { return this.#evaluations; }

  checkpoint(): void {
    if (this.#signal?.aborted) throw new SearchInterrupted('cancelled');
  }

  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.#evaluations >= this.#limit) throw new SearchInterrupted('evaluation-budget');
    this.#evaluations++;
    const result = run();
    this.checkpoint();
    return result;
  }

  owns(atMs: number): boolean {
    validateInstant(atMs);
    return atMs > this.window.startMs && atMs <= this.window.endMs;
  }

  /** Catch search control interruptions, never computation errors. */
  search<T>(run: () => readonly T[]): SearchResult<T> {
    try {
      this.checkpoint();
      const events = run();
      this.checkpoint();
      return { status: 'complete', events: [...events], evaluations: this.evaluations };
    } catch (error) {
      if (!(error instanceof SearchInterrupted)) throw error;
      return { status: 'refused', reason: error.reason, events: [], evaluations: this.evaluations };
    }
  }
}
