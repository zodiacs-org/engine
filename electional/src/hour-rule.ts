import { AdapterRefused, WorkContext, clockWindow, frozenCopy, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json, WorkOptions } from './adapter-contract.js';
import type { Unresolved } from './events-adapter.js';
import { clipIntervals, normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import type { ElectionalRule, Location } from './rule-types.js';
import { validateRuleSet } from './rules.js';
import { SOLAR_DAY_LOOKBACK_DAYS, SkyAdapter } from './sky-adapter.js';
import type { PlanetaryDayAudit, SkyRuntime } from './sky-adapter.js';

export type HourRule = Extract<ElectionalRule, { kind: 'planetary-hour' }>;
export interface HourRuleOptions extends WorkOptions { readonly maxSamples: number }
interface HourResultBase {
  readonly rule: HourRule;
  readonly window: ClockWindow;
  readonly location: Location;
  readonly evaluations: number;
  readonly samples: number;
  readonly receipts: readonly EngineReceipt[];
  readonly days: readonly PlanetaryDayAudit[];
  readonly explanation: string;
  readonly completeness: 'source-scan-assumptions';
}
export type HourRuleWindowResult = HourResultBase & (
  | { readonly status: 'complete' | 'unresolved'; readonly satisfied: readonly Interval[];
      readonly failed: readonly Interval[]; readonly covered: readonly Interval[]; readonly unresolved: readonly Unresolved[] }
  | { readonly status: 'refused'; readonly reason: 'unsupported-clock' | 'coverage' | 'sky-sample-budget'
        | 'evaluation-budget' | 'cancelled' | 'engine-refused'; readonly detail: Json;
      readonly satisfied: readonly []; readonly failed: readonly []; readonly covered: readonly []; readonly unresolved: readonly [] }
);

/** Select existing engine hour durations; no rise/set solver or hour subdivision here. */
export function evaluateHourRule(input: HourRule, inputWindow: ClockWindow, location: Location,
  engine: SkyRuntime, options: HourRuleOptions): HourRuleWindowResult {
  const validated = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Planetary-hour evaluation',
    location, houseSystem: 'whole', range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' },
    rules: [input] });
  const rule = validated.rules[0]!;
  if (rule.kind !== 'planetary-hour') throw new RangeError('Expected a planetary-hour rule.');
  const window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['maxSamples', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.maxSamples) || options.maxSamples < 1) throw new RangeError('Expected explicit positive maxSamples.');
  const work = workOptions({ maxEvaluations: options.maxEvaluations,
    ...(options.signal === undefined ? {} : { signal: options.signal }) });
  let context: WorkContext | undefined, sky: SkyAdapter | undefined;
  const base = (): HourResultBase => ({ rule, window, location: validated.location,
    evaluations: context?.evaluations ?? 0, samples: sky?.samples ?? 0,
    receipts: context?.receipts ?? [], days: sky?.days ?? [], completeness: 'source-scan-assumptions',
    explanation: `Any selected planetary-hour ruler: ${rule.options.rulers.join(', ')}. Solar days begin at sunrise; weekday dates use a fixed offset of ${rule.options.utcOffsetMinutes} minutes east of UTC. Hours follow the engine's Chaldean order with upper solar limb and standard refraction. This is a traditional selection convention, not a prediction.` });
  const refuse = (reason: Extract<HourRuleWindowResult, { status: 'refused' }>['reason'], detail: Json = null): HourRuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (window.clock !== 'utc') return refuse('unsupported-clock', 'planetaryHours-accepts-utc-only');
  const DAY = 86_400_000, HOUR = 3_600_000;
  const offsetMs = rule.options.utcOffsetMinutes * 60_000;
  // Include every earlier date whose native three-day scan can supply a
  // sunrise-owned hour at the requested start, even across a date with no rise.
  const first = Math.floor((window.startMs + offsetMs) / DAY) * DAY - SOLAR_DAY_LOOKBACK_DAYS * DAY;
  const last = Math.floor((window.endMs - 1 + offsetMs) / DAY) * DAY;
  const from = first - offsetMs - HOUR, to = last - offsetMs + 3 * DAY + HOUR;
  if (![first, last, from, to].every(Number.isSafeInteger)
    || from < -8_640_000_000_000_000 || to > 8_640_000_000_000_000
    || new Date(first).getUTCFullYear() < 0 || new Date(last).getUTCFullYear() > 9999) {
    return refuse('coverage', 'solar-day-padding-unrepresentable');
  }
  // The schema allows fractional offset minutes; native scan coordinates must
  // still be integer milliseconds for this workbench's interval contract.
  if (!Number.isSafeInteger(offsetMs)) return refuse('coverage', 'solar-offset-submillisecond');
  context = new WorkContext({ startMs: from, endMs: to, clock: 'utc' }, work);
  sky = new SkyAdapter(context, engine, options.maxSamples);
  const hours: PlanetaryDayAudit['hours'][number][] = [];
  try {
    for (let midnight = first; midnight <= last; midnight += DAY) {
      const date = new Date(midnight).toISOString().slice(0, 10);
      const day = sky.day(validated.location, date, rule.options.utcOffsetMinutes, midnight - offsetMs);
      if (!day || day.status === 'refused') return refuse('sky-sample-budget');
      hours.push(...day.hours);
    }
    context.checkpoint();
  } catch (error) {
    if (error instanceof AdapterRefused) return refuse(error.reason, error.detail);
    throw error;
  }
  hours.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < hours.length; i++) {
    if (hours[i]!.startMs < hours[i - 1]!.endMs) throw new TypeError('Overlapping source planetary days.');
  }
  const covered = clipIntervals(normalizeIntervals(hours), window);
  const satisfied = clipIntervals(normalizeIntervals(hours.filter(hour => rule.options.rulers.includes(hour.ruler))), window);
  const unresolved = subtractIntervals([window], covered).map(span => ({ ...span, reason: 'no-complete-solar-day' }));
  return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete',
    satisfied, failed: subtractIntervals(covered, satisfied), covered, unresolved });
}
