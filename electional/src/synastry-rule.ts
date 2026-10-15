import { AdapterRefused, WorkContext, clockWindow, frozenCopy, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json, WorkOptions } from './adapter-contract.js';
import { ChartAdapter } from './chart-adapter.js';
import { EngineAdapter } from './engine-adapter.js';
import { derivedCrossings, DerivedSearchRefused } from './derived-search.js';
import type { DerivedSearchAudit } from './derived-search.js';
import type { EventsCapability, Unresolved } from './events-adapter.js';
import { clipIntervals, containsInstant, normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import type { ElectionalRule, HouseSystem, MajorAspect, Planet, SyntheticNatal } from './rule-types.js';
import { resolvedInstantMs, validateRuleSet } from './rules.js';
import type { InterAspectDefinition, SynastryRuntime } from './synastry-adapter.js';

export type SynastryRule = Extract<ElectionalRule, { kind: 'synastry-aspect' }>;
export interface SynastryRuleOptions extends WorkOptions { readonly stepMs: number }
export interface SynastryPairPolicy {
  readonly movingBody: Planet;
  readonly natalBody: Planet;
  readonly aspects: readonly { readonly type: MajorAspect; readonly angle: number; readonly effectiveOrbDegrees: number }[];
}
export interface SynastryPolicy {
  readonly api: 'findInterAspects';
  readonly arithmetic: 'native-historical-floating-point';
  readonly orb: 'inclusive-minimum-of-native-orb-and-rule-cap';
  readonly motion: 'not-filtered;natal-longitudes-fixed';
  readonly match: 'any-pair' | 'all-pairs';
  readonly nativeDefinitions: readonly InterAspectDefinition[];
  readonly pairs: readonly SynastryPairPolicy[];
}
export interface SyntheticNatalAudit {
  readonly input: SyntheticNatal;
  readonly atMs: number;
  readonly clock: 'utc';
  readonly actualHouseSystem: HouseSystem;
  readonly flags: readonly string[];
  readonly selectedBodies: readonly { readonly body: Planet; readonly lon: number }[];
  readonly receipt: EngineReceipt;
  readonly receiptScope: 'native-natal-chart;fixed-ecliptic-longitudes-of-natal-date';
}
interface Base {
  readonly rule: SynastryRule;
  readonly window: ClockWindow;
  readonly natal: SyntheticNatalAudit | null;
  readonly policy: SynastryPolicy;
  readonly searches: readonly DerivedSearchAudit[];
  readonly evaluations: number;
  readonly evaluationScope: 'native-api-requests;one-natal-chart-plus-moving-calc-calls';
  readonly receipts: readonly EngineReceipt[];
  readonly explanation: string;
  readonly completeness: 'source-scan-assumptions';
}
export type SynastryRuleWindowResult = Base & (
  | { readonly status: 'complete' | 'unresolved'; readonly satisfied: readonly Interval[]; readonly failed: readonly Interval[];
      readonly covered: readonly Interval[]; readonly unresolved: readonly Unresolved[] }
  | { readonly status: 'refused'; readonly reason: 'missing-capability' | 'coverage' | 'evaluation-budget' | 'cancelled' | 'engine-refused';
      readonly detail: Json; readonly satisfied: readonly []; readonly failed: readonly []; readonly covered: readonly []; readonly unresolved: readonly [] }
);
const wrap = (x: number): number => ((x % 360) + 360) % 360;
const angles = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 } as const;

function policyFor(rule: SynastryRule, runtime: SynastryRuntime): SynastryPolicy {
  const definitions = runtime.INTER_ASPECT_DEFINITIONS;
  // Threshold searches depend on this native helper's nonoverlapping major orbs.
  // Refuse incompatible metadata rather than silently inventing another policy.
  if (!Array.isArray(definitions) || definitions.length !== 5
    || new Set(definitions.map(d => d.type)).size !== 5
    || definitions.some((d: InterAspectDefinition) => !Object.hasOwn(angles, d.type) || angles[d.type] !== d.angle
      || ![d.orb, d.luminaryOrb].every(n => Number.isFinite(n) && n >= 0 && n < 15))) {
    throw new TypeError('Incompatible native inter-aspect definitions.');
  }
  return frozenCopy({ api: 'findInterAspects', arithmetic: 'native-historical-floating-point',
    orb: 'inclusive-minimum-of-native-orb-and-rule-cap', motion: 'not-filtered;natal-longitudes-fixed',
    match: rule.options.match === 'any' ? 'any-pair' : 'all-pairs', nativeDefinitions: definitions,
    pairs: rule.options.movingBodies.flatMap(movingBody => rule.options.natalBodies.map(natalBody => ({ movingBody, natalBody,
      aspects: definitions.filter(d => rule.options.aspects.includes(d.type)).map(d => ({ type: d.type, angle: d.angle,
        effectiveOrbDegrees: Math.min(rule.options.maxOrbDegrees,
          [movingBody, natalBody].some(b => b === 'Sun' || b === 'Moon') ? d.luminaryOrb : d.orb) })) }))) });
}

/** Select native inter-chart aspects and delegate their fixed-target boundaries. */
export function evaluateSynastryRule(input: SynastryRule, inputWindow: ClockWindow, natalInput: SyntheticNatal,
  runtime: SynastryRuntime, capability: EventsCapability, options: SynastryRuleOptions): SynastryRuleWindowResult {
  const validated = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Synthetic synastry evaluation',
    location: { latitude: 0, longitude: 0 }, houseSystem: 'whole', natal: natalInput,
    range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' }, rules: [input] });
  const rule = validated.rules[0]!;
  if (rule.kind !== 'synastry-aspect') throw new RangeError('Expected a synastry rule.');
  const inputNatal = validated.natal!;
  const window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['stepMs', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Expected explicit positive stepMs.');
  const work = workOptions({ maxEvaluations: options.maxEvaluations, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  const policy = policyFor(rule, runtime);
  const searches: DerivedSearchAudit[] = [];
  let natal: SyntheticNatalAudit | null = null;
  let natalContext: WorkContext | undefined, context: WorkContext | undefined;
  const base = (): Base => ({ rule, window, natal, policy, searches,
    evaluations: (natalContext?.evaluations ?? 0) + (context?.evaluations ?? 0),
    evaluationScope: 'native-api-requests;one-natal-chart-plus-moving-calc-calls',
    receipts: [...(natalContext?.receipts ?? []), ...(context?.receipts ?? [])], completeness: 'source-scan-assumptions',
    explanation: `${rule.options.match} of every moving/natal pair (${rule.options.movingBodies.join(', ')} to ${rule.options.natalBodies.join(', ')}) must have any selected native inter-chart aspect: ${rule.options.aspects.join(', ')}. The inclusive ${rule.options.maxOrbDegrees} degree cap can narrow native orbs, never widen them. Natal longitudes stay fixed in their own date's tropical frame; applying motion is not required. This is a traditional selection convention, not a prediction.` });
  const refuse = (reason: Extract<SynastryRuleWindowResult, { status: 'refused' }>['reason'], detail: Json = null): SynastryRuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (capability.status === 'missing' || typeof (capability.runtime as unknown as { searchLongitudeCrossings?: unknown }).searchLongitudeCrossings !== 'function') {
    return refuse('missing-capability', 'derived-longitude-search');
  }
  const left = window.startMs - options.stepMs - 1, right = window.endMs + options.stepMs;
  if (![left, right].every(Number.isSafeInteger) || left < -8_640_000_000_000_000 || right >= 8_640_000_000_000_000) {
    return refuse('coverage', 'synastry-search-padding-unrepresentable');
  }
  if (Math.abs(inputNatal.location.latitude) >= 90 - 1e-6) return refuse('coverage', 'natal-angle-degenerate-location');
  try {
    const atMs = resolvedInstantMs(inputNatal.instant);
    natalContext = new WorkContext({ startMs: atMs, endMs: atMs + 1, clock: 'utc' }, work);
    const sample = new ChartAdapter(natalContext, runtime, inputNatal.location, inputNatal.houseSystem).sample(atMs);
    const selectedBodies = rule.options.natalBodies.map(body => {
      const rows = sample.chart.bodies.filter(b => b.body === body);
      if (rows.length !== 1) throw new TypeError('Missing or duplicate native natal body.');
      return { body, lon: rows[0]!.lon };
    });
    natal = frozenCopy({ input: inputNatal, atMs, clock: 'utc', actualHouseSystem: sample.chart.houses!.system,
      flags: sample.chart.flags, selectedBodies, receipt: sample.receipt,
      receiptScope: 'native-natal-chart;fixed-ecliptic-longitudes-of-natal-date' });
    const remaining = work.maxEvaluations - natalContext.evaluations;
    if (remaining < 1) return refuse('evaluation-budget');
    context = new WorkContext({ startMs: left, endMs: right, clock: window.clock }, { ...work, maxEvaluations: remaining });
    const ctx = context, engine = new EngineAdapter(ctx, runtime);
    for (const pair of policy.pairs) {
      const fixed = selectedBodies.find(b => b.body === pair.natalBody)!.lon;
      const targets = new Set(pair.aspects.flatMap(a => [wrap(a.angle - a.effectiveOrbDegrees), wrap(a.angle + a.effectiveOrbDegrees),
        wrap(-a.angle - a.effectiveOrbDegrees), wrap(-a.angle + a.effectiveOrbDegrees)]));
      for (const target of targets) searches.push(derivedCrossings(ctx, capability, options.stepMs,
        `${pair.movingBody}:natal-${pair.natalBody}:orb`, target, (at, charge) =>
          wrap(charge(() => engine.position(pair.movingBody, at)).longitude - fixed)));
    }
    // Longitude crossing scans suppress touches. Native speed-zero cuts let
    // classification retain a sampled tangent or singleton exact contact.
    for (const body of rule.options.movingBodies) searches.push(derivedCrossings(ctx, capability, options.stepMs,
      `${body}:moving-station`, 180, (at, charge) => {
        const speed = charge(() => engine.position(body, at, true)).speedDegreesPerDay!;
        if (Math.abs(speed) >= 180) throw new DerivedSearchRefused('coverage', 'moving-speed-coordinate-out-of-range');
        return speed + 180;
      }));
    const accept = (at: number): boolean => {
      const moving = rule.options.movingBodies.map(body => ({ body, lon: engine.position(body, at).longitude }));
      const aspects = runtime.findInterAspects(moving, selectedBodies);
      if (!Array.isArray(aspects) || aspects.some(a => !moving.some(b => b.body === a.a && b.lon === a.aLon)
        || !selectedBodies.some(b => b.body === a.b && b.lon === a.bLon) || !Object.hasOwn(angles, a.type)
        || !Number.isFinite(a.orb) || a.orb < 0)) throw new TypeError('Invalid native inter-aspect result.');
      const states = policy.pairs.map(pair => aspects.some(a => a.a === pair.movingBody && a.b === pair.natalBody
        && pair.aspects.some(d => d.type === a.type && a.orb <= d.effectiveOrbDegrees)));
      return rule.options.match === 'any' ? states.some(Boolean) : states.every(Boolean);
    };
    const cuts = new Set([window.startMs, window.endMs]), unresolved: Unresolved[] = [], satisfied: Interval[] = [];
    for (const audit of searches) for (const event of audit.events) {
      const [lo, hi] = event.bracket as readonly number[];
      if (lo! < hi!) {
        for (const span of clipIntervals([{ startMs: lo!, endMs: hi! + 1 }], window)) {
          unresolved.push({ ...span, reason: 'numerical-root-bracket', label: audit.label });
          cuts.add(span.startMs); cuts.add(span.endMs);
        }
      } else if (lo! >= window.startMs && lo! < window.endMs) {
        cuts.add(lo!); cuts.add(lo! + 1);
      }
    }
    const ordered = [...cuts].sort((a, b) => a - b), unknown = normalizeIntervals(unresolved);
    for (let i = 1; i < ordered.length; i++) {
      const startMs = ordered[i - 1]!, endMs = ordered[i]!;
      if (containsInstant(unknown, startMs)) continue;
      const mid = startMs + Math.floor((endMs - startMs - 1) / 2);
      const values = [...new Set([startMs, mid, endMs - 1])].map(accept);
      if (values.some(v => v !== values[0])) unresolved.push({ startMs, endMs, reason: 'state-samples-disagree' });
      else if (values[0]) satisfied.push({ startMs, endMs });
    }
    ctx.checkpoint();
    const covered = subtractIntervals([window], unresolved), accepted = subtractIntervals(clipIntervals(satisfied, window), unresolved);
    return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete', satisfied: accepted,
      failed: subtractIntervals(covered, accepted), covered, unresolved });
  } catch (error) {
    if (error instanceof AdapterRefused || error instanceof DerivedSearchRefused) return refuse(error.reason, error.detail);
    throw error;
  }
}
