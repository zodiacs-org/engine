import { AdapterRefused, frozenCopy, instantMs } from './adapter-contract.js';
import type { ClockWindow, Json, WorkContext } from './adapter-contract.js';
import type { EventsCapability, EventRecord, EventsSource } from './events-adapter.js';

interface NativeContext {
  readonly evaluations: number;
  evaluate<T>(run: () => T): T;
  checkpoint(): void;
}
interface NativeResult { readonly status: 'complete' | 'refused'; readonly reason?: string;
  readonly evaluations: number; readonly events: readonly EventRecord[] }
interface DerivedRuntime {
  EvaluationContext: new (window: ClockWindow, options: { maxEvaluations: number; signal?: AbortSignal }) => NativeContext;
  searchLongitudeCrossings(context: NativeContext, body: 'Moon', longitude: number, options: { stepMs: number },
    provider: { context: NativeContext; sample(body: 'Moon', atMs: number): { longitude: number } }): NativeResult;
}
export interface DerivedSearchAudit {
  readonly label: string;
  readonly targetDegrees: number;
  readonly sourceWindow: ClockWindow;
  readonly source: EventsSource;
  readonly evaluations: number;
  readonly events: readonly EventRecord[];
  readonly coordinate: 'derived-scalar;native-body-label-is-placeholder';
}
export class DerivedSearchRefused extends Error {
  constructor(readonly reason: 'missing-capability' | 'coverage' | 'evaluation-budget' | 'cancelled', readonly detail: Json = null) {
    super(`Derived search refused: ${reason}`);
  }
}
/** Search only through the existing events scanner; readers charge native calls individually. */
export function derivedCrossings(context: WorkContext, capability: EventsCapability, stepMs: number,
  label: string, targetDegrees: number, reader: (atMs: number, charge: <T>(run: () => T) => T) => number): DerivedSearchAudit {
  if (capability.status === 'missing') throw new DerivedSearchRefused('missing-capability');
  const runtime = capability.runtime as unknown as DerivedRuntime;
  if (typeof runtime.searchLongitudeCrossings !== 'function') throw new DerivedSearchRefused('missing-capability', 'longitude-search-export');
  const remaining = context.options.maxEvaluations - context.evaluations;
  context.checkpoint();
  if (remaining < 1) throw new AdapterRefused('evaluation-budget');
  const native = new runtime.EvaluationContext(context.window, { ...context.options, maxEvaluations: remaining });
  const before = context.evaluations;
  const result = runtime.searchLongitudeCrossings(native, 'Moon', targetDegrees, { stepMs }, { context: native,
    sample: (_body, atMs) => ({ longitude: reader(atMs, run => native.evaluate(run)) }) });
  context.checkpoint();
  const evaluations = context.evaluations - before;
  if (!result || result.evaluations !== evaluations || native.evaluations !== evaluations || !Array.isArray(result.events)) {
    throw new TypeError('Invalid derived search accounting.');
  }
  if (result.status === 'refused') {
    if (result.events.length || !['evaluation-budget', 'cancelled'].includes(result.reason ?? '')) throw new TypeError('Invalid derived search refusal.');
    throw new DerivedSearchRefused(result.reason as 'evaluation-budget' | 'cancelled');
  }
  if (result.status !== 'complete') throw new TypeError('Invalid derived search status.');
  for (const event of result.events) {
    const at = event.atMs as number, bracket = event.bracket;
    instantMs(at);
    if (event.kind !== 'longitude-crossing' || event.clock !== context.window.clock || event.longitude !== targetDegrees
      || !['direct', 'retrograde'].includes(event.direction as string) || at <= context.window.startMs || at > context.window.endMs
      || !Array.isArray(bracket) || bracket.length !== 2) throw new TypeError('Invalid derived crossing.');
    const [lo, hi] = bracket as readonly number[];
    instantMs(lo!); instantMs(hi!);
    if (lo! > at || hi! < at || lo! < context.window.startMs || hi! > context.window.endMs) throw new TypeError('Invalid derived bracket.');
  }
  return frozenCopy({ label, targetDegrees, sourceWindow: context.window, source: capability.source,
    evaluations, events: result.events, coordinate: 'derived-scalar;native-body-label-is-placeholder' });
}
