import { catalog } from "./catalog.js";
import {
  absolute, checkedBodyLabel, compareExact, dateFrom, exactSum, roundedValue,
  skyBodyOf, skyBudgetOf, skyConventionsOf, skyObserverOf, skyOptionsOf
} from "./engine.js";
import type { DateInput, ExactSum, Observer, SkyBody, SkyEventKind, SkyEvents, SkyOptions } from "./engine.js";
import { propagateStarDirection } from "./positions.js";
import type { BodySkyEvents, SkyCallRecord, StarSkyEvents, StarSkySearch } from "./sky.js";
import type { CatalogStar } from "./types.js";

export const PARAN_ANGLE_EVENTS = Object.freeze({
  Ascendant: "rise", Descendant: "set", Midheaven: "upper-transit", "Imum Coeli": "lower-transit"
} as const);
export type ParanAngle = keyof typeof PARAN_ANGLE_EVENTS;

/** An explicit reference instant for an angular phase, not a celestial body. */
export interface ParanAngleInput {
  readonly angle: ParanAngle;
  readonly at: DateInput;
}
export interface ParanAngleAnchor {
  readonly angle: ParanAngle;
  readonly at: string;
}
export interface ParanPairing {
  readonly observer: Observer;
  readonly from: DateInput;
  readonly to: DateInput;
  /** Inclusive time difference in milliseconds; zero requires identical event milliseconds. */
  readonly orbMs: number;
  readonly angles?: readonly ParanAngleInput[];
}
export interface ParanRequest extends ParanPairing {
  /** Omission selects the catalog; an empty array selects no stars. */
  readonly stars?: readonly CatalogStar[];
  /** Explicit selection of native sky bodies; nodes are unsupported. */
  readonly bodies: readonly SkyBody[];
  /** Native budgets apply independently to each call, with no aggregate budget. */
  readonly starOptions?: SkyOptions;
  readonly bodyOptions?: SkyOptions;
}
export interface ParanHit {
  readonly starId: string;
  readonly targetId: SkyBody | ParanAngle;
  readonly targetKind: "body" | "angle";
  readonly kind: "paran";
  readonly starEvent: SkyEventKind;
  readonly targetEvent: SkyEventKind;
  readonly starAt: string;
  readonly targetAt: string;
  /** starAt minus targetAt, rounded only for reporting. */
  readonly offsetMs: number;
  readonly orbMs: number;
  readonly maximumOrbMs: number;
  /** Indices into the result's retained sky calls; an angle has no target sky call. */
  readonly provenance: { readonly starSearch: number; readonly bodySearch: number | null };
}
export const PARAN_CONVENTIONS = Object.freeze({
  body: "all-star-and-body-event-kind-pairs;simultaneous-angular-phases",
  angle: "explicit-reference-instant;matching-star-event-kind;not-ecliptic-point-equality",
  horizon: "each-call-effective-limb-and-refraction;no-silent-horizon-override",
  time: "engine-event-milliseconds;absolute-time-difference;no-sidereal-or-angle-conversion",
  window: "from-inclusive;to-exclusive;both-events-and-angle-anchors-inside;no-orb-padding",
  arithmetic: "engine-exact-binary64;inclusive;no-epsilon;reported-values-rounded-half-even",
  ordering: "exact-orb;starId;targetKind;targetId;star-time;target-time;event-kind;strings-by-utf16",
  budget: "per-sky-call;any-refusal-clears-all-hits;all-selected-calls-retained",
  receiptScope: "retained-fixedstars-sky-call-records;no-native-sky-or-angle-receipt"
} as const);

interface ParanBase {
  readonly observer: Readonly<Required<Observer>>;
  readonly from: string;
  readonly to: string;
  readonly orbMs: number;
  readonly conventions: typeof PARAN_CONVENTIONS;
  /** Sorted by star id and body id, respectively. Native sky output and provenance remain intact. */
  readonly stars: readonly StarSkyEvents[];
  readonly bodies: readonly BodySkyEvents[];
  readonly angles: readonly ParanAngleAnchor[];
}
export type Parans =
  | (ParanBase & { readonly status: "complete"; readonly hits: readonly ParanHit[] })
  | (ParanBase & { readonly status: "refused"; readonly reason: "sample-budget"; readonly hits: readonly [] });

const textOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const eventKinds: readonly SkyEventKind[] = Object.freeze(Object.values(PARAN_ANGLE_EVENTS));

function pairingOf(request: ParanPairing) {
  if (!request || typeof request !== "object") throw new RangeError("A paran request is required.");
  const observer = skyObserverOf(request.observer);
  const fromMs = dateFrom(request.from, "parans.from").getTime();
  const toMs = dateFrom(request.to, "parans.to").getTime();
  if (toMs <= fromMs) throw new RangeError("The paran window must end after it starts.");
  const orb = request.orbMs;
  if (typeof orb !== "number" || !Number.isFinite(orb) || orb < 0) {
    throw new RangeError("orbMs must be explicit finite nonnegative milliseconds.");
  }
  const input: readonly ParanAngleInput[] = request.angles === undefined ? [] : request.angles;
  if (!Array.isArray(input)) throw new RangeError("Paran angle anchors must be an array.");
  const seen = new Set<string>();
  const angles: ParanAngleAnchor[] = Array.from(input, (anchor: ParanAngleInput) => {
    if (!anchor || typeof anchor !== "object" || Array.isArray(anchor) ||
        typeof anchor.angle !== "string" || !Object.hasOwn(PARAN_ANGLE_EVENTS, anchor.angle)) {
      throw new RangeError("Unsupported paran angle.");
    }
    const atMs = dateFrom(anchor.at, "parans.angle.at").getTime();
    if (atMs < fromMs || atMs >= toMs) throw new RangeError("Angle anchors must be inside the paran window.");
    const at = new Date(atMs).toISOString();
    const key = `${anchor.angle}:${at}`;
    if (seen.has(key)) throw new RangeError("Paran angle anchors must be unique by angle and instant.");
    seen.add(key);
    return Object.freeze({ angle: anchor.angle, at });
  });
  angles.sort((a, b) => textOrder(a.angle, b.angle) || Date.parse(a.at) - Date.parse(b.at));
  return { observer, fromMs, toMs, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(),
    orbMs: orb === 0 ? 0 : orb, angles: Object.freeze(angles) };
}

/** Snapshot just the fields used by pairing; native Dates stay caller owned. */
function eventRows(result: StarSkyEvents | SkyEvents, window: ReturnType<typeof pairingOf>, call: SkyCallRecord):
  { kind: SkyEventKind; ms: number; at: string }[] {
  if (!result || (result.status !== "complete" && result.status !== "refused") ||
      !(result.from instanceof Date) || !(result.to instanceof Date) ||
      result.from.getTime() !== window.fromMs || result.to.getTime() !== window.toMs) {
    throw new RangeError("Paran sky results must have the same explicit window and a supported status.");
  }
  const observer = skyObserverOf(result.observer);
  if (observer.latitude !== window.observer.latitude || observer.longitude !== window.observer.longitude ||
      observer.height !== window.observer.height) throw new RangeError("Paran sky observers must agree.");
  if (!Array.isArray(result.events) || (result.status === "refused" &&
      (result.reason !== "sample-budget" || result.events.length !== 0))) {
    throw new RangeError("Refused sky results must contain no partial events.");
  }
  // Native Dates can be mutated after a search. Refuse a detached timeline
  // instead of attaching a hit to a call record for different event times.
  if (!call || call.schema !== "fixedstars-sky-call/1" || call.kind !== "fixedstars-call-record" || call.nativeReceipt !== false ||
      !call.request || !call.request.observer || !call.response || !Array.isArray(call.response.events) ||
      call.request.from !== window.from || call.request.to !== window.to ||
      call.request.observer.latitude !== observer.latitude || call.request.observer.longitude !== observer.longitude ||
      call.request.observer.height !== observer.height || call.response.status !== result.status ||
      call.response.events.length !== result.events.length) {
    throw new RangeError("Paran sky results must agree with their captured call records.");
  }
  const seen = new Set<string>();
  return Array.from(result.events, (event, index) => {
    if (!event || !eventKinds.includes(event.kind) || !(event.at instanceof Date)) {
      throw new RangeError("Invalid paran sky event.");
    }
    const ms = event.at.getTime();
    if (!Number.isFinite(ms) || ms < window.fromMs || ms >= window.toMs) {
      throw new RangeError("Paran sky events must be inside the explicit window.");
    }
    const captured = call.response.events[index];
    if (!captured || captured.kind !== event.kind || captured.at !== event.at.toISOString()) {
      throw new RangeError("Paran event times must agree with their captured call records.");
    }
    const key = `${event.kind}:${ms}`;
    if (seen.has(key)) throw new RangeError("Duplicate paran sky event.");
    seen.add(key);
    return { kind: event.kind, ms, at: event.at.toISOString() };
  });
}

/**
 * Pure pairing of supplied sky-result claims. It performs no searches and does
 * not authenticate provenance. Each result must share the observer and window.
 */
export function pairParanEvents(
  stars: readonly StarSkyEvents[], bodies: readonly BodySkyEvents[], request: ParanPairing
): Parans {
  const input = skyOptionsOf(request, ["observer", "from", "to", "orbMs", "angles"], "pairing");
  const window = pairingOf(input as unknown as ParanPairing);
  if (!Array.isArray(stars) || !Array.isArray(bodies)) throw new RangeError("Paran sky results must be arrays.");
  const starIds = new Set<string>();
  const bodyIds = new Set<string>();
  const starRows = Array.from(stars, (result) => {
    const id = checkedBodyLabel(result?.starId);
    if (starIds.has(id)) throw new RangeError("Paran star ids must be unique.");
    starIds.add(id);
    const subject = result.provenance?.request?.subject;
    if (subject?.kind !== "star" || subject.star.id !== id) throw new RangeError("Paran star call identity must agree.");
    return { id, result, events: eventRows(result, window, result.provenance) };
  }).sort((a, b) => textOrder(a.id, b.id));
  const bodyRows = Array.from(bodies, (result) => {
    const id = skyBodyOf(result?.sky?.body);
    if (bodyIds.has(id)) throw new RangeError("Paran body ids must be unique.");
    bodyIds.add(id);
    const subject = result.provenance?.request?.subject;
    if (subject?.kind !== "body" || subject.body !== id) throw new RangeError("Paran body call identity must agree.");
    return { id, result, events: eventRows(result.sky, window, result.provenance) };
  }).sort((a, b) => textOrder(a.id, b.id));
  const base: ParanBase = { observer: window.observer, from: window.from, to: window.to, orbMs: window.orbMs,
    conventions: PARAN_CONVENTIONS, stars: Object.freeze(starRows.map(({ result }) => result)),
    bodies: Object.freeze(bodyRows.map(({ result }) => result)), angles: window.angles };
  // Even an unrelated selected refusal prevents a misleading partial answer.
  if (starRows.some(({ result }) => result.status === "refused") ||
      bodyRows.some(({ result }) => result.sky.status === "refused")) {
    return Object.freeze({ ...base, status: "refused", reason: "sample-budget", hits: Object.freeze([]) as readonly [] });
  }
  const matched: { hit: ParanHit; exactOrb: ExactSum; starMs: number; targetMs: number }[] = [];
  function include(starId: string, targetId: ParanHit["targetId"], targetKind: ParanHit["targetKind"],
    star: { kind: SkyEventKind; ms: number; at: string }, target: { kind: SkyEventKind; ms: number; at: string },
    starSearch: number, bodySearch: number | null) {
    const offset = exactSum(star.ms, -target.ms);
    const exactOrb = absolute(offset);
    if (compareExact(exactOrb, window.orbMs) > 0) return;
    matched.push({ exactOrb, starMs: star.ms, targetMs: target.ms, hit: Object.freeze({
      starId, targetId, targetKind, kind: "paran", starEvent: star.kind, targetEvent: target.kind,
      starAt: star.at, targetAt: target.at, offsetMs: roundedValue(offset),
      orbMs: roundedValue(exactOrb), maximumOrbMs: window.orbMs,
      provenance: Object.freeze({ starSearch, bodySearch })
    }) });
  }
  for (const [starSearch, star] of starRows.entries()) for (const event of star.events) {
    for (const [bodySearch, body] of bodyRows.entries()) for (const target of body.events) {
      include(star.id, body.id, "body", event, target, starSearch, bodySearch);
    }
    for (const angle of window.angles) {
      const kind = PARAN_ANGLE_EVENTS[angle.angle];
      if (event.kind === kind) include(star.id, angle.angle, "angle", event,
        { kind, at: angle.at, ms: Date.parse(angle.at) }, starSearch, null);
    }
  }
  matched.sort((a, b) => compareExact(a.exactOrb, b.exactOrb) || textOrder(a.hit.starId, b.hit.starId) ||
    textOrder(a.hit.targetKind, b.hit.targetKind) || textOrder(a.hit.targetId, b.hit.targetId) ||
    a.starMs - b.starMs || a.targetMs - b.targetMs || textOrder(a.hit.starEvent, b.hit.starEvent) ||
    textOrder(a.hit.targetEvent, b.hit.targetEvent));
  return Object.freeze({ ...base, status: "complete", hits: Object.freeze(matched.map(({ hit }) => hit)) });
}

/** Synchronous after Node preparation; executes the existing solver for every selected subject once. */
export function searchParans(search: StarSkySearch, request: ParanRequest): Parans {
  const input = skyOptionsOf(request,
    ["observer", "from", "to", "orbMs", "stars", "bodies", "angles", "starOptions", "bodyOptions"], "parans");
  const window = pairingOf(input as unknown as ParanPairing);
  const selected = input.stars === undefined ? catalog : input.stars;
  if (!Array.isArray(selected) || !Array.isArray(input.bodies)) throw new RangeError("Paran stars and bodies must be arrays.");
  const seen = new Set<string>();
  const stars = Array.from(selected, (star: CatalogStar) => {
    if (!star || typeof star !== "object") throw new RangeError("A catalog star is required.");
    const captured = { ...star, properMotion: star.properMotion === null ? null : { ...star.properMotion } };
    const id = checkedBodyLabel(captured.id);
    if (seen.has(id)) throw new RangeError("Paran star ids must be unique.");
    seen.add(id);
    propagateStarDirection(captured, 0);
    return captured;
  });
  const bodyIds = new Set<string>();
  const bodies = Array.from(input.bodies, (body: SkyBody) => {
    const id = skyBodyOf(body);
    if (bodyIds.has(id)) throw new RangeError("Paran body ids must be unique.");
    bodyIds.add(id);
    return id;
  });
  const starOptions = skyOptionsOf(input.starOptions, ["limb", "refraction", "maxSamples"], "starOptions");
  const bodyOptions = skyOptionsOf(input.bodyOptions, ["limb", "refraction", "maxSamples"], "bodyOptions");
  skyBudgetOf(starOptions.maxSamples);
  skyBudgetOf(bodyOptions.maxSamples);
  skyConventionsOf("Pluto", starOptions);
  skyConventionsOf("Sun", bodyOptions);
  for (const body of bodies) skyConventionsOf(body, bodyOptions);
  if (!search || typeof search.starEvents !== "function" || typeof search.bodyEvents !== "function") {
    throw new RangeError("A prepared star sky search is required.");
  }
  // Validate all requests before the first engine call. A body result is
  // reused across stars; individual refusals retain every selected call.
  const starResults = stars.map((star) => search.starEvents(star, window.observer, window.fromMs, window.toMs, starOptions as SkyOptions));
  const bodyResults = bodies.map((body) => search.bodyEvents(body, window.observer, window.fromMs, window.toMs, bodyOptions as SkyOptions));
  return pairParanEvents(starResults, bodyResults, { observer: window.observer, from: window.fromMs, to: window.toMs,
    orbMs: window.orbMs, angles: window.angles });
}
