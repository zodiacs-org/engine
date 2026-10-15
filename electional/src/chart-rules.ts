import { AdapterRefused, WorkContext, clockWindow, frozenCopy, instantMs, workOptions } from './adapter-contract.js';
import type { ClockWindow, EngineReceipt, Json, WorkOptions } from './adapter-contract.js';
import { ChartAdapter } from './chart-adapter.js';
import type { ChartRuntime, NativeHousePartition } from './chart-adapter.js';
import { EngineAdapter } from './engine-adapter.js';
import { derivedCrossings, DerivedSearchRefused } from './derived-search.js';
import type { DerivedSearchAudit } from './derived-search.js';
import type { EventsCapability, Unresolved } from './events-adapter.js';
import { clipIntervals, containsInstant, normalizeIntervals, subtractIntervals } from './intervals.js';
import type { Interval } from './intervals.js';
import type { ElectionalRule, HouseSystem, Location } from './rule-types.js';
import { validateRuleSet } from './rules.js';

export type ChartRule = Extract<ElectionalRule, { kind: 'benefic-house' | 'benefic-angular' | 'applying-aspect' }>;
export interface ChartRuleOptions extends WorkOptions { readonly stepMs: number }
export interface HousePartitionAudit extends Interval {
  readonly requestedSystem: HouseSystem;
  readonly actualSystems: readonly HouseSystem[];
  readonly flags: readonly string[];
  readonly cells: readonly (Interval & { readonly actualSystem: HouseSystem; readonly houses: Readonly<Record<string, number | null>> })[];
  readonly engineVersion: string;
  readonly verification: string;
  readonly receiptScope: 'partition-endpoint-chart-provenance;window-api-has-no-native-receipt';
  readonly internalWork: 'native-fixed-window-budget;sample-count-not-exposed';
}
interface Base {
  readonly rule: ChartRule;
  readonly window: ClockWindow;
  readonly location: Location;
  readonly houseSystem: HouseSystem;
  readonly evaluations: number;
  readonly evaluationScope: 'native-api-requests;window-internal-samples-excluded';
  readonly receipts: readonly EngineReceipt[];
  readonly searches: readonly DerivedSearchAudit[];
  readonly partitions: readonly HousePartitionAudit[];
  readonly aspectPolicy: Json | null;
  readonly explanation: string;
  readonly completeness: 'source-scan-assumptions';
}
export type ChartRuleWindowResult = Base & (
  | { readonly status: 'complete' | 'unresolved'; readonly satisfied: readonly Interval[]; readonly failed: readonly Interval[];
      readonly covered: readonly Interval[]; readonly unresolved: readonly Unresolved[] }
  | { readonly status: 'refused'; readonly reason: 'missing-capability' | 'coverage' | 'unsupported-clock' | 'evaluation-budget' | 'cancelled' | 'engine-refused';
      readonly detail: Json; readonly satisfied: readonly []; readonly failed: readonly []; readonly covered: readonly []; readonly unresolved: readonly [] }
);
const wrap = (x: number): number => ((x % 360) + 360) % 360;
const angles = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 } as const;
const axes = { ascendant: 'asc', midheaven: 'mc', descendant: 'dsc', 'imum-coeli': 'ic' } as const;
const match = (states: readonly boolean[], policy: 'any' | 'all'): boolean => policy === 'any' ? states.some(Boolean) : states.every(Boolean);

/** Declarative selection and set assembly over native chart/window/aspect/event APIs. */
export function evaluateChartRule(input: ChartRule, inputWindow: ClockWindow, location: Location,
  houseSystem: HouseSystem, engine: ChartRuntime, capability: EventsCapability, options: ChartRuleOptions): ChartRuleWindowResult {
  const validated = validateRuleSet({ schemaVersion: 'electional/v1', activity: 'Chart-rule evaluation', location, houseSystem,
    range: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' }, rules: [input] });
  const rule = validated.rules[0]!;
  if (rule.kind !== 'benefic-house' && rule.kind !== 'benefic-angular' && rule.kind !== 'applying-aspect') throw new RangeError('Expected a chart rule.');
  const window = clockWindow(inputWindow);
  if (!options || Object.keys(options).some(k => !['stepMs', 'maxEvaluations', 'signal'].includes(k))
    || !Number.isSafeInteger(options.stepMs) || options.stepMs < 1) throw new RangeError('Expected explicit positive stepMs.');
  const work = workOptions({ maxEvaluations: options.maxEvaluations, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  let context: WorkContext | undefined;
  const searches: DerivedSearchAudit[] = [], partitions: HousePartitionAudit[] = [];
  let aspectPolicy: Json | null = null;
  const explanation = rule.kind === 'benefic-house'
    ? `${rule.options.match} of ${rule.options.bodies.join(', ')} in any selected house: ${rule.options.houses.join(', ')}. Requested ${houseSystem}; polar fallback is ${rule.options.polarFallback}. Membership uses chart cusp longitude, without body latitude.`
    : rule.kind === 'benefic-angular'
      ? `${rule.options.match} of ${rule.options.bodies.join(', ')} within an inclusive ${rule.options.maxOrbDegrees} degree ecliptic longitude orb of any selected angle: ${rule.options.angles.join(', ')}.`
      : `${rule.options.body} in a configured applying aspect to ${rule.options.match} selected targets: ${rule.options.targets.join(', ')}. Orb is inclusive; exact moving contacts are separating and equal relative speeds are stationary. This does not promise perfection before ingress or a future contact.`;
  const base = (): Base => ({ rule, window, location: validated.location, houseSystem: validated.houseSystem,
    evaluations: context?.evaluations ?? 0, evaluationScope: 'native-api-requests;window-internal-samples-excluded',
    receipts: context?.receipts ?? [], searches, partitions, aspectPolicy,
    explanation: `${explanation} This is a traditional selection convention, not a prediction.`, completeness: 'source-scan-assumptions' });
  const refuse = (reason: Extract<ChartRuleWindowResult, { status: 'refused' }>['reason'], detail: Json = null): ChartRuleWindowResult =>
    frozenCopy({ ...base(), status: 'refused', reason, detail, satisfied: [], failed: [], covered: [], unresolved: [] });
  if (work.signal?.aborted) return refuse('cancelled');
  if (rule.kind === 'benefic-house' && window.clock !== 'utc') return refuse('unsupported-clock', 'birthWindow-accepts-utc-only');
  const left = rule.kind === 'benefic-house' ? window.startMs : window.startMs - options.stepMs - 1;
  const right = rule.kind === 'benefic-house' ? window.endMs : window.endMs + options.stepMs;
  if (![left, right].every(Number.isSafeInteger) || left < -8_640_000_000_000_000 || right >= 8_640_000_000_000_000) {
    return refuse('coverage', 'chart-search-padding-unrepresentable');
  }
  if (Math.abs(validated.location.latitude) >= 90 - 1e-6 && rule.kind !== 'applying-aspect') return refuse('coverage', 'angle-degenerate-location');
  context = new WorkContext({ startMs: left, endMs: right, clock: window.clock }, work);
  const ctx = context;
  const chart = new ChartAdapter(ctx, engine, validated.location, validated.houseSystem);
  const position = new EngineAdapter(ctx, engine);
  const satisfied: Interval[] = [], unresolved: Unresolved[] = [];
  const finish = (): ChartRuleWindowResult => {
    ctx.checkpoint();
    const covered = subtractIntervals([window], unresolved);
    const accepted = subtractIntervals(clipIntervals(satisfied, window), unresolved);
    return frozenCopy({ ...base(), status: unresolved.length ? 'unresolved' : 'complete',
      satisfied: accepted, failed: subtractIntervals(covered, accepted), covered, unresolved });
  };
  try {
    if (rule.kind === 'benefic-house') {
      // Native window search has its own fixed internal budget. This context
      // counts API requests, not unreported samples in that synchronous call.
      for (let startMs = window.startMs; startMs < window.endMs;) {
        const endMs = startMs + Math.min(172_800_000, window.endMs - startMs);
        const first = chart.sample(startMs), last = chart.sample(endMs - 1);
        let native: NativeHousePartition;
        try {
          native = ctx.evaluate(startMs, () => engine.birthWindow({ start: new Date(startMs), end: new Date(endMs),
            ...validated.location, houseSystem: validated.houseSystem }));
        } catch (error) {
          if (error instanceof Error && error.name === 'WindowBudgetError') return refuse('engine-refused', 'native-window-budget');
          throw error;
        }
        if (!native || native.schema !== 'zodiacs.birth-window.v1' || native.start.getTime() !== startMs || native.end.getTime() !== endMs
          || native.houseSystem !== houseSystem || native.engineVersion !== first.receipt.engine.version
          || native.engineVersion !== last.receipt.engine.version || !Array.isArray(native.cells) || !Array.isArray(native.flags)
          || native.flags.some(f => !['polar-fallback', 'bound-exceeded', 'node-unresolved'].includes(f))
          || !Array.isArray(native.unresolved) || typeof native.verification !== 'string') throw new TypeError('Invalid native house partition.');
        let cursor = startMs;
        for (const cell of native.cells) {
          const a = cell.start.getTime(), b = cell.end.getTime();
          instantMs(a); instantMs(b);
          if (a !== cursor || b <= a || b > endMs || !cell.features?.houses
            || ![houseSystem, 'whole'].includes(cell.features.houseSystem)
            || (cell.features.houseSystem !== houseSystem && !['placidus', 'koch'].includes(houseSystem))) throw new TypeError('Invalid native house cell.');
          cursor = b;
          const states = rule.options.bodies.map(body => {
            const h = cell.features.houses[body];
            if (h === null) return null;
            if (!Number.isInteger(h) || h! < 1 || h! > 12) throw new TypeError('Invalid native benefic house.');
            return rule.options.houses.includes(h!);
          });
          const fallback = cell.features.houseSystem !== houseSystem;
          if (fallback && !native.flags.includes('polar-fallback')) throw new TypeError('Unflagged house fallback.');
          if (fallback && rule.options.polarFallback === 'reject') unresolved.push({ startMs: a, endMs: b, reason: 'polar-fallback-rejected' });
          else if (states.includes(null)) unresolved.push({ startMs: a, endMs: b, reason: 'benefic-house-unresolved' });
          else if (match(states as boolean[], rule.options.match)) satisfied.push({ startMs: a, endMs: b });
        }
        if (cursor !== endMs) throw new TypeError('Incomplete native house tiling.');
        for (const [sample, cell] of [[first.chart, native.cells[0]!], [last.chart, native.cells.at(-1)!]] as const) {
          if (sample.houses!.system !== cell.features.houseSystem) throw new TypeError('Partition/chart house-system mismatch.');
          for (const body of rule.options.bodies) {
            const row = sample.bodies.find(b => b.body === body);
            if (!row) throw new TypeError('Missing native benefic.');
            const h = cell.features.houses[body];
            if (h !== null && h !== engine.houseOf(row.lon, sample.houses!.cusps)) throw new TypeError('Partition/chart house mismatch.');
          }
        }
        // Native node-only unresolved cells do not invalidate Venus/Jupiter.
        for (const item of native.unresolved) {
          const a = item.start.getTime(), b = item.end.getTime(); instantMs(a); instantMs(b);
          if (a < startMs || b > endMs || a >= b) throw new TypeError('Invalid native unresolved partition.');
        }
        if (native.flags.includes('bound-exceeded')) unresolved.push({ startMs, endMs, reason: 'native-window-bound-exceeded' });
        partitions.push({ startMs, endMs, requestedSystem: houseSystem,
          actualSystems: [...new Set(native.cells.map(c => c.features.houseSystem))], flags: native.flags,
          cells: native.cells.map(c => ({ startMs: c.start.getTime(), endMs: c.end.getTime(), actualSystem: c.features.houseSystem,
            houses: Object.fromEntries(rule.options.bodies.map(body => [body, c.features.houses[body]!])) })),
          engineVersion: native.engineVersion, verification: native.verification,
          receiptScope: 'partition-endpoint-chart-provenance;window-api-has-no-native-receipt',
          internalWork: 'native-fixed-window-budget;sample-count-not-exposed' });
        startMs = endMs;
      }
      return finish();
    }
    if (capability.status === 'missing'
      || typeof (capability.runtime as unknown as { searchLongitudeCrossings?: unknown }).searchLongitudeCrossings !== 'function') {
      return refuse('missing-capability', 'derived-longitude-search');
    }
    const search = (label: string, target: number, read: Parameters<typeof derivedCrossings>[5]) => {
      searches.push(derivedCrossings(ctx, capability, options.stepMs, label, target, read));
    };
    let accept: (atMs: number) => boolean;
    if (rule.kind === 'benefic-angular') {
      const targets = [...new Set([wrap(rule.options.maxOrbDegrees), wrap(-rule.options.maxOrbDegrees)])];
      if (rule.options.maxOrbDegrees < 180) for (const body of rule.options.bodies) for (const axis of rule.options.angles) {
        for (const target of targets) search(`${body}:${axis}:orb`, target, (atMs, charge) => {
          const sample = charge(() => chart.sample(atMs)).chart;
          const row = sample.bodies.find(b => b.body === body);
          if (!row) throw new TypeError('Missing native benefic.');
          return wrap(row.lon - sample.angles![axes[axis]]);
        });
      }
      accept = atMs => {
        const sample = chart.sample(atMs).chart;
        return match(rule.options.bodies.map(body => {
          const row = sample.bodies.find(b => b.body === body);
          if (!row) throw new TypeError('Missing native benefic.');
          return rule.options.angles.some(axis => engine.separation(row.lon, sample.angles![axes[axis]]) <= rule.options.maxOrbDegrees);
        }), rule.options.match);
      };
    } else {
      const policy = engine.createAspectPolicy({ bodies: [rule.options.body, ...rule.options.targets], stationaryRelativeSpeed: 0,
        aspects: rule.options.aspects.map(type => ({ type, orb: rule.options.maxOrbDegrees })) });
      aspectPolicy = frozenCopy(policy) as Json;
      const branches = [...new Set(rule.options.aspects.flatMap(a => [angles[a], wrap(-angles[a])]))].sort((a, b) => a - b);
      // Exact contacts, circle corners, orb edges and closest-aspect handoffs.
      // Including handoffs matters when large allowed orbs overlap.
      const targets = new Set([0, 180]);
      for (let i = 0; i < branches.length; i++) {
        const a = branches[i]!, b = branches[(i + 1) % branches.length]! + (i === branches.length - 1 ? 360 : 0);
        for (const t of [a, a - rule.options.maxOrbDegrees, a + rule.options.maxOrbDegrees, (a + b) / 2]) targets.add(wrap(t));
      }
      for (const targetBody of rule.options.targets) {
        for (const target of targets) search(`${rule.options.body}:${targetBody}:aspect`, target, (atMs, charge) => {
          const a = charge(() => position.position(rule.options.body, atMs));
          const b = charge(() => position.position(targetBody, atMs));
          return wrap(a.longitude - b.longitude);
        });
        search(`${rule.options.body}:${targetBody}:relative-station`, 180, (atMs, charge) => {
          const a = charge(() => position.position(rule.options.body, atMs, true));
          const b = charge(() => position.position(targetBody, atMs, true));
          const difference = a.speedDegreesPerDay! - b.speedDegreesPerDay!;
          if (Math.abs(difference) >= 180) throw new DerivedSearchRefused('coverage', 'relative-speed-coordinate-out-of-range');
          return difference + 180;
        });
      }
      accept = atMs => {
        const rows = [rule.options.body, ...rule.options.targets].map(body => {
          const sample = position.position(body, atMs, true);
          return { body, lon: sample.longitude, speed: sample.speedDegreesPerDay! };
        });
        const analysis = engine.findConfiguredAspects(rows, policy);
        return match(rule.options.targets.map(body => analysis.aspects.some(a => a.applying
          && ((a.a === rule.options.body && a.b === body) || (a.b === rule.options.body && a.a === body)))), rule.options.match);
      };
    }
    const cuts = new Set([window.startMs, window.endMs]);
    for (const audit of searches) for (const event of audit.events) {
      const [lo, hi] = event.bracket as readonly number[];
      if (lo! < hi!) {
        for (const span of clipIntervals([{ startMs: lo!, endMs: hi! + 1 }], window)) {
          unresolved.push({ ...span, reason: 'numerical-root-bracket', label: audit.label });
          cuts.add(span.startMs); cuts.add(span.endMs);
        }
      } else if (lo! >= window.startMs && lo! < window.endMs) {
        cuts.add(lo!); cuts.add(lo! + 1); // Inclusive orb or exact separating singleton.
      }
    }
    const ordered = [...cuts].sort((a, b) => a - b);
    const unknown = normalizeIntervals(unresolved);
    for (let i = 1; i < ordered.length; i++) {
      const startMs = ordered[i - 1]!, endMs = ordered[i]!;
      if (containsInstant(unknown, startMs)) continue;
      const mid = startMs + Math.floor((endMs - startMs - 1) / 2);
      const values = [...new Set([startMs, mid, endMs - 1])].map(at => accept(at));
      if (values.some(v => v !== values[0])) unresolved.push({ startMs, endMs, reason: 'state-samples-disagree' });
      else if (values[0]) satisfied.push({ startMs, endMs });
    }
    return finish();
  } catch (error) {
    if (error instanceof AdapterRefused || error instanceof DerivedSearchRefused) return refuse(error.reason, error.detail);
    throw error;
  }
}
