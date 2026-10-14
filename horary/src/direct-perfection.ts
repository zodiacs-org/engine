import { bodyLongitude, dignityRulersAt, longitudeSpeed, searchLongitudeCrossingsWith } from "./engine.js";
import type { ClassicalPlanet, ZodiacSign } from "./engine.js";
import { createAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import { evaluateSignificatorAspectsWith } from "./significator-aspects.js";
import type { AspectLongitudeAt, AspectPerfectionCandidate, HorarySignificatorAspects, SignificatorAspect } from "./significator-aspects.js";
import { createDirectPerfectionPolicy, DIRECT_EVENT_METHOD, DIRECT_PERFECTION_SOURCE, validateDirectPerfectionPolicy } from "./direct-policy.js";
import type { HoraryDirectPolicy } from "./direct-policy.js";
import type { HoraryCast, PlanetRoles } from "./types.js";

const DAY = 86_400_000;
export type AspectSpeedAt = (planet: ClassicalPlanet, date: Date) => number;
type Motion = "direct" | "retrograde" | "zero";
interface EventBase {
  readonly planet: PlanetRoles;
  readonly at: string;
  readonly elapsedDays: number;
  readonly evidence: Readonly<{
    beforeAt: string; afterAt: string;
    beforeValue: number; afterValue: number;
  }>;
  readonly explanation: string;
}
export interface SignBoundaryEvent extends EventBase {
  readonly kind: "sign-boundary";
  readonly longitude: number;
  readonly fromSign: ZodiacSign;
  readonly toSign: ZodiacSign;
  readonly transition: "change" | "touch" | "unresolved";
}
export interface StationEvent extends EventBase {
  readonly kind: "station";
  readonly fromMotion: Motion;
  readonly toMotion: Motion;
  readonly transition: "reversal" | "touch" | "unresolved";
}
export type DirectContinuityEvent = SignBoundaryEvent | StationEvent;
export interface DirectAspectAssessment {
  readonly kind: "direct-aspect";
  readonly a: PlanetRoles;
  readonly b: PlanetRoles;
  readonly type: SignificatorAspect["type"];
  readonly status: "disabled" | "exact-now" | "no-current-application" | "contact-not-found" |
    "search-disabled" | "aspect-search-refused" | "event-search-refused" | "direct-contact" | "interrupted" | "requires-review";
  readonly candidate: AspectPerfectionCandidate | null;
  /** Only events concerning these physical planets, up to this contact, in sampled time order. */
  readonly events: readonly Readonly<{ event: DirectContinuityEvent; relation: "before" | "coincident" }>[];
  readonly explanation: string;
}
export interface HoraryDirectPerfection {
  readonly schema: "horary.direct-perfection/v1";
  readonly questionId: string;
  readonly policy: HoraryDirectPolicy;
  readonly source: typeof DIRECT_PERFECTION_SOURCE;
  readonly aspects: HorarySignificatorAspects;
  readonly eventSearch: Readonly<{
    status: "complete" | "refused" | "disabled";
    reason: "sample-budget" | null;
    from: string; to: string; samples: number;
    /** Step / 2^24 rounded up, plus one millisecond for Date truncation. Not an accuracy bound. */
    rootResolutionMs: number;
    clock: "engine-utc-model" | "caller-motion-providers";
    method: typeof DIRECT_EVENT_METHOD;
  }>;
  readonly events: readonly DirectContinuityEvent[];
  readonly direct: readonly DirectAspectAssessment[];
}
class EventBudgetReached {}
const finite = (value: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError("Event provider values must be finite.");
  return value;
};
const canonical = (value: number) => {
  finite(value);
  if (value < 0 || value >= 360) throw new RangeError("Event longitudes must be in [0,360).");
  return value;
};
const motion = (speed: number): Motion => speed > 0 ? "direct" : speed < 0 ? "retrograde" : "zero";
const sign = (longitude: number) => dignityRulersAt(longitude).sign;

function assess(aspect: SignificatorAspect, aspects: HorarySignificatorAspects, policy: HoraryDirectPolicy,
  eventSearch: HoraryDirectPerfection["eventSearch"], events: readonly DirectContinuityEvent[]): DirectAspectAssessment {
  const candidate = aspect.timeToPerfection;
  const contactMs = candidate ? Date.parse(candidate.at) : NaN;
  const relevant = candidate && candidate.kind !== "exact-now" ? events.filter(event =>
    (event.planet.planet === aspect.a.planet || event.planet.planet === aspect.b.planet) &&
    Date.parse(event.at) <= contactMs + 2 * eventSearch.rootResolutionMs).map(event => Object.freeze({ event,
      relation: Math.abs(Date.parse(event.at) - contactMs) <= 2 * eventSearch.rootResolutionMs
        ? "coincident" as const : "before" as const })) : [];
  let status: DirectAspectAssessment["status"];
  let explanation: string;
  if (!policy.directAspect) {
    status = "disabled"; explanation = "Direct aspect assessment is disabled.";
  } else if (candidate?.kind === "exact-now") {
    status = "exact-now"; explanation = "The planets are exactly in contact at the question instant; this is present geometry, not a future application.";
  } else if (!aspect.current.withinOrb || aspect.current.motion !== "applying") {
    status = "no-current-application"; explanation = "This aspect has no current in-orb application to assess.";
  } else if (aspects.search.status !== "complete") {
    status = aspects.search.status === "refused" ? "aspect-search-refused" : "search-disabled";
    explanation = "Future aspect searching did not complete; no continuity conclusion is available.";
  } else if (!candidate) {
    status = "contact-not-found"; explanation = "No contact on the current application's branch was found in the sampled horizon; this establishes no outcome.";
  } else if (eventSearch.status === "refused") {
    status = "event-search-refused"; explanation = "The event budget refused the scan. The contact candidate remains, but no partial event evidence or continuity conclusion is returned.";
  } else if (relevant.some(({ relation, event }) => relation === "coincident" ||
      event.transition === "touch" || event.transition === "unresolved")) {
    status = "requires-review"; explanation = "A boundary touch, unresolved transition or event coincident with the contact requires review; the sampled times do not establish a clear event order.";
  } else if (relevant.length) {
    status = "interrupted"; explanation = "A sign change or motion reversal occurs before the contact under the enabled continuity checks. The later geometric contact is retained, without deciding refrenation or an outcome.";
  } else {
    status = "direct-contact"; explanation = "The current in-orb application reaches a sampled direct contact with no earlier event found under the enabled continuity checks.";
  }
  return Object.freeze({ kind: "direct-aspect", a: aspect.a, b: aspect.b, type: aspect.type, status,
    candidate: policy.directAspect ? candidate : null, events: Object.freeze(policy.directAspect ? relevant : []),
    explanation: `${aspect.a.planet} and ${aspect.b.planet}, ${aspect.type}: ${explanation} ` +
      `Sign-change checking is ${policy.signChanges ? "enabled" : "disabled"}; station checking is ${policy.stations ? "enabled" : "disabled"}. ` +
      "This is partial direct-perfection evidence; reception, strength and competing contacts still need assessment." });
}

function evaluate(longitudeAt: AspectLongitudeAt, speedAt: AspectSpeedAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy, directPolicy: HoraryDirectPolicy,
  clock: HoraryDirectPerfection["eventSearch"]["clock"]): HoraryDirectPerfection {
  if (typeof longitudeAt !== "function" || typeof speedAt !== "function") throw new RangeError("Motion providers must be functions.");
  const policy = validateDirectPerfectionPolicy(directPolicy);
  const rawAspects = evaluateSignificatorAspectsWith(longitudeAt, result, aspectPolicy);
  // The provider API records its own clock; the production wrapper supplies the engine's clock.
  const aspects: HorarySignificatorAspects = clock === "engine-utc-model" ? Object.freeze({ ...rawAspects,
    search: Object.freeze({ ...rawAspects.search, clock: "engine-utc-model" as const }) }) : rawAspects;
  const from = Date.parse(aspects.search.from), to = Date.parse(aspects.search.to);
  const rootResolutionMs = Math.ceil(aspects.policy.stepDays * DAY / 2 ** 24) + 1;
  let status: HoraryDirectPerfection["eventSearch"]["status"] = aspects.search.status === "complete" &&
    (policy.signChanges || policy.stations) ? "complete" : "disabled";
  let samples = 0;
  const pending: DirectContinuityEvent[] = [];
  const read = (provider: AspectLongitudeAt | AspectSpeedAt, planet: ClassicalPlanet, at: number, isLongitude: boolean) => {
    if (samples === policy.maxSamples) throw new EventBudgetReached();
    samples++;
    const value = provider(planet, new Date(at));
    return isLongitude ? canonical(value) : finite(value);
  };
  // No provider is called if even the coarse scans cannot fit. Evidence probes add work after this lower bound.
  const targetsPerPlanet = (policy.signChanges ? 12 : 0) + (policy.stations ? 1 : 0);
  const coarseMinimum = aspects.significators.planets.length * targetsPerPlanet *
    (Math.ceil((to - from) / (aspects.policy.stepDays * DAY)) + 1);
  if (status === "complete" && coarseMinimum > policy.maxSamples) status = "refused";
  if (status === "complete") {
    try {
      for (const planet of aspects.significators.planets) {
        const scan = (provider: AspectLongitudeAt | AspectSpeedAt, target: number, isLongitude: boolean) => {
          const remaining = policy.maxSamples - samples;
          if (!remaining) throw new EventBudgetReached();
          const answer = searchLongitudeCrossingsWith((body: ClassicalPlanet, date: Date) => {
            const value = read(provider, body, date.getTime(), isLongitude);
            // A bounded monotone transform allows the existing circular root solver to find speed zeros.
            // No offset is added here, so the transform itself does not cancel tiny nonzero speeds.
            return isLongitude ? value : Math.atan(value) * 90 / Math.PI;
          }, planet.planet, target, new Date(from), new Date(to),
          { stepDays: aspects.policy.stepDays, maxSamples: remaining });
          if (answer.status === "refused") throw new EventBudgetReached();
          return answer.crossings.filter(row => row.at.getTime() > from);
        };
        const record = (provider: AspectLongitudeAt | AspectSpeedAt, target: number, isLongitude: boolean,
          times: readonly number[]) => {
          for (let i = 0; i < times.length; i++) {
            const at = times[i]!;
            // Avoid crossing a neighbouring root while obtaining side evidence. Never leave the horizon.
            const desiredProbe = Math.max(60_000, 2 * rootResolutionMs);
            const before = Math.max(from, Math.floor(at - Math.min(desiredProbe, (at - (times[i - 1] ?? from)) / 2)));
            const after = Math.min(to, Math.ceil(at + Math.min(desiredProbe, ((times[i + 1] ?? to) - at) / 2)));
            const beforeValue = read(provider, planet.planet, before, isLongitude);
            const afterValue = read(provider, planet.planet, after, isLongitude);
            const resolvedSides = before < at - rootResolutionMs && after > at + rootResolutionMs;
            const base = { planet, at: new Date(at).toISOString(), elapsedDays: (at - from) / DAY,
              evidence: Object.freeze({ beforeAt: new Date(before).toISOString(), afterAt: new Date(after).toISOString(),
                beforeValue, afterValue }) };
            if (isLongitude) {
              const fromSign = sign(beforeValue), toSign = sign(afterValue);
              const transition = !resolvedSides ? "unresolved" : fromSign === toSign ? "touch" : "change";
              pending.push(Object.freeze({ ...base, kind: "sign-boundary", longitude: target, fromSign, toSign, transition,
                explanation: `${planet.planet} reaches the ${target}-degree sign boundary at ${base.at}; side samples show ` +
                  `${fromSign} to ${toSign} (${transition}). Original-sign continuity is a configurable project convention.` }));
            } else {
              const fromMotion = motion(beforeValue), toMotion = motion(afterValue);
              const transition = !resolvedSides || fromMotion === "zero" || toMotion === "zero" ? "unresolved" :
                fromMotion === toMotion ? "touch" : "reversal";
              pending.push(Object.freeze({ ...base, kind: "station", fromMotion, toMotion, transition,
                explanation: `${planet.planet} reaches sampled speed zero at ${base.at}; side speeds are ${beforeValue} and ` +
                  `${afterValue} degrees/day (${transition}). A station alone does not establish refrenation.` }));
            }
          }
        };
        if (policy.signChanges) {
          const initial = read(longitudeAt, planet.planet, from, true);
          // A retrograde planet exactly on a half-open sign boundary leaves that sign immediately.
          // The engine's open-start crossing scan omits this root; preserve it explicitly as unresolved.
          if (initial % 30 === 0) {
            const after = Math.min(to, from + Math.max(60_000, 2 * rootResolutionMs));
            const afterValue = read(longitudeAt, planet.planet, after, true);
            if (sign(initial) !== sign(afterValue)) pending.push(Object.freeze({
              kind: "sign-boundary", planet, at: aspects.search.from, elapsedDays: 0, longitude: initial,
              fromSign: sign(initial), toSign: sign(afterValue), transition: "unresolved",
              evidence: Object.freeze({ beforeAt: aspects.search.from, afterAt: new Date(after).toISOString(), beforeValue: initial, afterValue }),
              explanation: `${planet.planet} starts exactly on a sign boundary and the forward probe is in another sign; departure is at the open search boundary and requires review.`
            }));
          }
          for (let target = 0; target < 360; target += 30) {
            record(longitudeAt, target, true, scan(longitudeAt, target, true).map(row => row.at.getTime()));
          }
        }
        if (policy.stations) {
          const initial = read(speedAt, planet.planet, from, false);
          if (initial === 0) {
            const after = Math.min(to, from + Math.max(60_000, 2 * rootResolutionMs));
            const afterValue = read(speedAt, planet.planet, after, false);
            if (afterValue !== 0) pending.push(Object.freeze({
              kind: "station", planet, at: aspects.search.from, elapsedDays: 0, fromMotion: "zero", toMotion: motion(afterValue),
              transition: "unresolved", evidence: Object.freeze({ beforeAt: aspects.search.from, afterAt: new Date(after).toISOString(),
                beforeValue: initial, afterValue }),
              explanation: `${planet.planet} has speed zero at the question and nonzero speed in the forward probe; the open-start departure requires review.`
            }));
          }
          record(speedAt, 0, false, scan(speedAt, 0, false).map(row => row.at.getTime()));
        }
      }
    } catch (error) {
      if (!(error instanceof EventBudgetReached)) throw error;
      status = "refused";
    }
  }
  const events = Object.freeze(status === "complete" ? pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    a.planet.planet.localeCompare(b.planet.planet) || a.kind.localeCompare(b.kind)) : []);
  const eventSearch = Object.freeze({ status, reason: status === "refused" ? "sample-budget" as const : null,
    from: aspects.search.from, to: aspects.search.to, samples, rootResolutionMs, clock, method: DIRECT_EVENT_METHOD });
  return Object.freeze({ schema: "horary.direct-perfection/v1", questionId: aspects.questionId, policy,
    source: DIRECT_PERFECTION_SOURCE, aspects, eventSearch, events,
    direct: Object.freeze(aspects.aspects.map(aspect => assess(aspect, aspects, policy, eventSearch, events))) });
}

/** Partial direct-perfection evidence on the engine's UTC model clock, without recasting or deciding an outcome. */
export function evaluateDirectPerfection(result: HoraryCast, aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(),
  policy: HoraryDirectPolicy = createDirectPerfectionPolicy()): HoraryDirectPerfection {
  return evaluate(bodyLongitude, longitudeSpeed, result, aspectPolicy, policy, "engine-utc-model");
}
/** Caller providers must describe one consistent motion law; this boundary enables independent derived fixtures. */
export function evaluateDirectPerfectionWith(longitudeAt: AspectLongitudeAt, speedAt: AspectSpeedAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(), policy: HoraryDirectPolicy = createDirectPerfectionPolicy()): HoraryDirectPerfection {
  return evaluate(longitudeAt, speedAt, result, aspectPolicy, policy, "caller-motion-providers");
}
