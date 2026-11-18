import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { timeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import {
  lunarVisibilityOutline, OUTLINE_LIMITS, positionAt, searchAppulses,
  searchConjunctions, searchLocalClosestApproaches, searchLunarContacts, searchLunarOccultations, starPositionAt
} from "../src/index.js";
import type {
  AppulseBody, ConjunctionTarget, LunarContact, Observer, OccultationPlanet, OccultationTarget
} from "../src/index.js";
import { separationDegrees } from "../src/appulse-geometry.js";
import { contactGeometry } from "../src/contact-geometry.js";
import { OCCULTATION_PLANETS, OCCULTATION_RADII } from "../src/occultation-radii.js";
import { assertReferenceChecks } from "./reference-checks.js";
import type { ReferenceCheck } from "./reference-checks.js";

export type ReferencePartition = "development" | "held-out";
type Scale = "utc" | "ut1" | "tt";
type Kind = "right-ascension-conjunction" | "ecliptic-longitude-conjunction" | "appulse" |
  "stellar-contacts" | "planetary-contacts" | "visibility-outline";
export interface EventReference {
  readonly id: string;
  readonly partition: ReferencePartition;
  readonly kind: Kind;
  readonly eventGroup: string;
  readonly criteriaId: string;
  readonly sourceId: string;
  readonly locator: string;
  readonly validationUse: string;
  readonly qualifications: readonly string[];
  readonly pair: readonly [ConjunctionTarget, ConjunctionTarget];
  readonly observer?: Observer;
  readonly window: { readonly from: string; readonly to: string; readonly scale: Scale };
  readonly published: unknown;
  readonly checks: readonly ReferenceCheck[];
}
interface Corpus {
  readonly schema: string;
  readonly partition: ReferencePartition;
  readonly cases: readonly EventReference[];
}
interface Freeze {
  readonly files: Readonly<Record<string, string>>;
  readonly caseIds: Readonly<Record<ReferencePartition, readonly string[]>>;
}
interface OutlineNode {
  readonly side: "north" | "south";
  readonly contactLimit: "inner" | "outer";
  readonly longitudeEastDeg: number;
}
export interface ContactSensitivity {
  readonly contactKind: LunarContact["kind"];
  readonly at: string;
  readonly stencilSecondsEachSide: 1;
  readonly signedClearanceRateArcsecondsPerSecond: number | null;
  readonly secondsPerArcsecond: number | null;
  readonly secondsPerKilometerTransverse: number | null;
  readonly physicalTimingErrorSeconds: null;
  readonly interpretation: "local-first-order-sensitivity;not-a-physical-or-numerical-error-bound";
}
export interface EvaluatedReference {
  readonly actual: Readonly<Record<string, number>>;
  readonly contactSensitivities: readonly ContactSensitivity[];
  readonly candidateRetention: { readonly publishedTimeKeys: readonly string[];
    readonly candidateInterval: { readonly from: string; readonly to: string } } | null;
}

// Keep fixtures outside the bundle: this relative root works from both test/
// and .generated/. No source file or generated prediction is rewritten.
const fixture = (name: string): string => readFileSync(
  new URL(`../test/fixtures/events/${name}`, import.meta.url), "utf8");
export function loadEventReferences(partition: ReferencePartition): readonly EventReference[] {
  const frozen = JSON.parse(fixture("freeze.json")) as Freeze;
  for (const [name, digest] of Object.entries(frozen.files)) {
    assert.equal(createHash("sha256").update(fixture(name)).digest("hex"), digest,
      `${name}: frozen source, partition or acceptance criterion changed`);
  }
  const corpus = JSON.parse(fixture(`${partition}.json`)) as Corpus;
  assert.equal(corpus.schema, "occultations-event-references/1");
  assert.equal(corpus.partition, partition);
  assert.deepEqual(corpus.cases.map((row) => row.id), frozen.caseIds[partition]);
  for (const row of corpus.cases) assert.equal(row.partition, partition);
  return corpus.cases;
}

function inputWindow(reference: EventReference): { from: string; to: string } {
  const encode = (label: string): string => {
    // A Z here only parses the printed calendar label; the source scale is
    // then explicitly converted using the existing engine clock.
    const nominal = Date.parse(label.endsWith("Z") ? label : label + "Z");
    return new Date(timeBasis(nominal, reference.window.scale).utcMs).toISOString();
  };
  return { from: encode(reference.window.from), to: encode(reference.window.to) };
}
function nominalSeconds(at: string, scale: Scale): number {
  if (scale === "utc") return Date.parse(at) / 1000;
  const basis = timeBasis(Date.parse(at), "utc");
  return Date.UTC(2000, 0, 1, 12) / 1000 + (scale === "tt" ? basis.ttDays : basis.ut1Days) * 86_400;
}
function localSample(target: OccultationTarget, observer: Observer, at: string) {
  const moon = positionAt({ body: "Moon", time: at, observer, frame: "equatorial-true-of-date" });
  const planet = (OCCULTATION_PLANETS as readonly string[]).includes(target);
  const background = planet
    ? positionAt({ body: target as OccultationPlanet, time: at, observer, frame: "equatorial-true-of-date" })
    : starPositionAt({ star: target, time: at, observer, frame: "equatorial-true-of-date" });
  assert.equal(moon.status, "ok", "Moon sample refused");
  assert.equal(background.status, "ok", "target sample refused");
  if (moon.status !== "ok" || background.status !== "ok" || moon.dist === null) {
    throw new Error("Local sample unavailable");
  }
  const moonDistanceKm = moon.dist * OCCULTATION_RADII.auKm;
  const targetDistanceKm = "dist" in background && background.dist !== null
    ? background.dist * OCCULTATION_RADII.auKm : null;
  const geometry = contactGeometry({ separationDegrees: separationDegrees({ a: moon, b: background }),
    moonDistanceKm, targetDistanceKm,
    targetRadiusKm: planet ? OCCULTATION_RADII.planetKm[target as OccultationPlanet] : 0 });
  return { geometry, moonDistanceKm };
}

// Fixed before the M12 held-out run. Differencing the entire contact clearance
// includes changing apparent radii as well as relative angular motion.
export function timingSensitivity(rateArcsecondsPerSecond: number, moonRangeKm: number) {
  if (!Number.isFinite(rateArcsecondsPerSecond) || rateArcsecondsPerSecond === 0 ||
    !Number.isFinite(moonRangeKm) || moonRangeKm <= 0) {
    return { signedClearanceRateArcsecondsPerSecond: null, secondsPerArcsecond: null,
      secondsPerKilometerTransverse: null };
  }
  const secondsPerArcsecond = 1 / Math.abs(rateArcsecondsPerSecond);
  const secondsPerKilometerTransverse = secondsPerArcsecond * 180 / Math.PI * 3600 / moonRangeKm;
  if (!Number.isFinite(secondsPerArcsecond) || !Number.isFinite(secondsPerKilometerTransverse)) {
    return { signedClearanceRateArcsecondsPerSecond: null, secondsPerArcsecond: null,
      secondsPerKilometerTransverse: null };
  }
  return { signedClearanceRateArcsecondsPerSecond: rateArcsecondsPerSecond,
    secondsPerArcsecond, secondsPerKilometerTransverse };
}
function contactSensitivity(contact: LunarContact, observer: Observer): ContactSensitivity {
  const ms = Date.parse(contact.at);
  const before = localSample(contact.target, observer, new Date(ms - 1000).toISOString());
  const after = localSample(contact.target, observer, new Date(ms + 1000).toISOString());
  const at = localSample(contact.target, observer, contact.at);
  const key = contact.boundary === "internal" ? "internalClearanceDegrees" : "externalClearanceDegrees";
  const rate = (after.geometry[key] - before.geometry[key]) * 3600 / 2;
  return { contactKind: contact.kind, at: contact.at, stencilSecondsEachSide: 1,
    ...timingSensitivity(rate, at.moonDistanceKm),
    physicalTimingErrorSeconds: null,
    interpretation: "local-first-order-sensitivity;not-a-physical-or-numerical-error-bound" };
}

const kindByPrefix = {
  disappearance: "disappearance", reappearance: "reappearance",
  disappearanceStart: "partial-disappearance-start", disappearanceEnd: "full-disappearance",
  reappearanceStart: "full-reappearance-start", reappearanceEnd: "partial-reappearance-end"
} as const;
const starPrefixes = ["disappearance", "reappearance"] as const;
const planetPrefixes = ["disappearanceStart", "disappearanceEnd", "reappearanceStart", "reappearanceEnd"] as const;

function evaluateContacts(reference: EventReference): EvaluatedReference {
  assert.equal(reference.pair[0], "Moon");
  assert(reference.observer, "contact reference needs an observer");
  const target = reference.pair[1] as OccultationTarget;
  const candidates = searchLunarOccultations({ target, window: inputWindow(reference) });
  if (candidates.status !== "complete") throw new Error(`${reference.id}: candidate search refused: ${candidates.reason}`);
  const timeChecks = reference.checks.filter((check) => check.unit === "nominal-ut1-seconds");
  assert.deepEqual(timeChecks.map((check) => check.key), reference.kind === "stellar-contacts"
    ? ["disappearanceTime", "reappearanceTime"]
    : ["disappearanceStartTime", "disappearanceEndTime", "closestApproachTime", "reappearanceStartTime", "reappearanceEndTime"]);
  const instants = timeChecks.map((check) => timeBasis(check.value * 1000, "ut1").utcMs);
  const containing = candidates.candidates.find((candidate) => candidate.target === target &&
    instants.every((at) => at >= Date.parse(candidate.interval.from) && at <= Date.parse(candidate.interval.to)));
  assert(containing, `${reference.id}: all published times must survive in one candidate without allowance`);
  assert(containing.receipt);
  const result = searchLunarContacts({ target, observer: reference.observer, window: inputWindow(reference) });
  if (result.status !== "complete") throw new Error(`${reference.id}: contact search refused: ${result.reason}`);
  assert(result.receipt);
  const prefixes = reference.kind === "stellar-contacts" ? starPrefixes : planetPrefixes;
  assert.deepEqual(result.contacts.map((contact) => contact.kind), prefixes.map((prefix) => kindByPrefix[prefix]));
  const actual: Record<string, number> = {};
  const contactSensitivities: ContactSensitivity[] = [];
  for (const prefix of prefixes) {
    const contacts: readonly LunarContact[] = result.contacts.filter((contact) => contact.kind === kindByPrefix[prefix]);
    assert.equal(contacts.length, 1, `${prefix}: exactly one contact required`);
    const contact = contacts[0]!;
    assert(contact.receipt && contact.sky.receipt);
    actual[`${prefix}Time`] = nominalSeconds(contact.at, reference.window.scale);
    assert.notEqual(contact.sky.positionAngleDegrees, null, "position angle unavailable");
    actual[`${prefix}PositionAngle`] = contact.sky.positionAngleDegrees!;
    if (reference.kind === "planetary-contacts") {
      assert.notEqual(contact.sky.moon.refractedAltitudeDegrees, null, "refracted altitude unavailable");
      actual[`${prefix}MoonAltitude`] = contact.sky.moon.refractedAltitudeDegrees!;
    }
    contactSensitivities.push(contactSensitivity(contact, reference.observer));
  }
  for (let i = 1; i < prefixes.length; i += 1) {
    assert(actual[`${prefixes[i]}Time`]! > actual[`${prefixes[i - 1]}Time`]!, "contact order");
  }
  if (reference.kind === "planetary-contacts") {
    actual.disappearanceDiskCrossingDuration = actual.disappearanceEndTime! - actual.disappearanceStartTime!;
    actual.reappearanceDiskCrossingDuration = actual.reappearanceEndTime! - actual.reappearanceStartTime!;
    const minimum = searchLocalClosestApproaches({ target, observer: reference.observer, window: inputWindow(reference) });
    if (minimum.status !== "complete") throw new Error(`${reference.id}: local minimum search refused: ${minimum.reason}`);
    assert.equal(minimum.events.length, 1, "exactly one independent local minimum required");
    assert(minimum.receipt && minimum.events[0]!.receipt);
    actual.closestApproachTime = nominalSeconds(minimum.events[0]!.at, reference.window.scale);
    assert(actual.closestApproachTime > actual.disappearanceEndTime! &&
      actual.closestApproachTime < actual.reappearanceStartTime!, "local minimum is between internal contacts");
  }
  return { actual, contactSensitivities, candidateRetention: {
    publishedTimeKeys: timeChecks.map((check) => check.key), candidateInterval: containing.interval } };
}

function evaluateOutline(reference: EventReference): EvaluatedReference {
  const nodes = reference.published as readonly OutlineNode[];
  const target = reference.pair[1] as OccultationPlanet;
  const result = lunarVisibilityOutline({ target, window: inputWindow(reference),
    longitudes: nodes.map((node) => node.longitudeEastDeg) });
  if (result.status !== "complete") throw new Error(`${reference.id}: outline search refused: ${result.reason}`);
  assert(result.receipt);
  assert.equal(result.meridians.length, nodes.length);
  const actual: Record<string, number> = {};
  nodes.forEach((node, index) => {
    const matches = result.meridians.filter((row) => row.longitudeDegrees === node.longitudeEastDeg);
    assert.equal(matches.length, 1, "exact published meridian required");
    const meridian = matches[0]!;
    assert.equal(meridian.status, "resolved", `${reference.id}: node${index}: ${meridian.reason}`);
    assert.equal(meridian.overlap.length, 1);
    assert.equal(meridian.full.length, 1);
    const outer = meridian.overlap[0]!, inner = meridian.full[0]!;
    assert(outer.south.latitudeDegrees < inner.south.latitudeDegrees, "distinct southern disk boundaries");
    assert(inner.north.latitudeDegrees < outer.north.latitudeDegrees, "distinct northern disk boundaries");
    const boundary = (node.contactLimit === "inner" ? inner : outer)[node.side];
    assert.equal(boundary.cause, "limb");
    assert(boundary.local.targetGeometricAltitudeDegrees > 0);
    actual[`node${index}Latitude`] = boundary.latitudeDegrees;
    const clearance = (latitude: number): number => {
      const sample = localSample(target, { latitude, longitude: node.longitudeEastDeg, elevationMeters: 0 }, boundary.at);
      return node.contactLimit === "inner" ? sample.geometry.internalClearanceDegrees : sample.geometry.externalClearanceDegrees;
    };
    const south = clearance(boundary.latitudeBracket.south), north = clearance(boundary.latitudeBracket.north);
    assert(south * north <= 0, "local clearance bracket straddles the limb");
    assert((node.side === "south" ? north : south) <= 0, "covered bracket side");
    assert(boundary.latitudeBracket.north - boundary.latitudeBracket.south <= OUTLINE_LIMITS.localLatitudeBracketDegrees);
    assert(Math.abs(boundary.latitudeDegrees - boundary.planeLatitudeDegrees) <= OUTLINE_LIMITS.localLatitudeGuardDegrees);
    const insideSign = node.side === "south" ? 1 : -1;
    for (const direction of [1, -1]) {
      const nearby = searchLunarContacts({ target,
        observer: { latitude: boundary.latitudeDegrees + direction * insideSign * 0.01,
          longitude: node.longitudeEastDeg, elevationMeters: 0 },
        window: { from: new Date(Date.parse(boundary.at) - 600_000), to: new Date(Date.parse(boundary.at) + 600_000) } });
      assert.equal(nearby.status, "complete", "nearby local contact search refused");
      if (nearby.status !== "complete") throw new Error("Nearby local contact search refused");
      const intervals = node.contactLimit === "inner" ? nearby.fullCoverageIntervals : nearby.overlapIntervals;
      assert.equal(intervals.length > 0, direction === 1, "covered/uncovered local contact distinction");
    }
  });
  return { actual, contactSensitivities: [], candidateRetention: null };
}

/** Evaluate every quantity, with no skip, residual fitting or accepted refusal. */
export function evaluateEventReference(reference: EventReference): EvaluatedReference {
  if (reference.kind === "stellar-contacts" || reference.kind === "planetary-contacts") return evaluateContacts(reference);
  if (reference.kind === "visibility-outline") return evaluateOutline(reference);
  const result = reference.kind === "appulse"
    ? searchAppulses({ first: reference.pair[0] as AppulseBody, second: reference.pair[1] as AppulseBody,
      maximumSeparationDegrees: 10, window: inputWindow(reference) })
    : searchConjunctions({ first: reference.pair[0] as Parameters<typeof searchConjunctions>[0]["first"],
      second: reference.pair[1], window: inputWindow(reference),
      coordinate: reference.kind === "right-ascension-conjunction" ? "right-ascension" : "ecliptic-longitude" });
  if (result.status !== "complete") throw new Error(`${reference.id}: event search refused: ${result.reason}`);
  assert.equal(result.events.length, 1, "exactly one event required");
  assert(result.receipt && result.events[0]!.receipt);
  return { actual: { eventTime: nominalSeconds(result.events[0]!.at, reference.window.scale) },
    contactSensitivities: [], candidateRetention: null };
}

export function absoluteError(check: ReferenceCheck, actual: number): number {
  const delta = actual - check.value;
  return check.difference === "circular-degrees" ? Math.abs(((delta % 360) + 540) % 360 - 180) : Math.abs(delta);
}
export function quantityFor(reference: EventReference, check: ReferenceCheck): string {
  if (check.key.endsWith("PositionAngle")) return "contact-position-angle";
  if (check.key.endsWith("MoonAltitude")) return "contact-refracted-moon-altitude";
  if (check.key.endsWith("DiskCrossingDuration")) return "planet-disk-crossing-duration";
  if (check.key === "closestApproachTime") return "topocentric-local-minimum-time";
  if (reference.kind === "stellar-contacts") return "historical-stellar-contact-time";
  if (reference.kind === "planetary-contacts") return "planet-contact-time";
  if (reference.kind === "visibility-outline") return "outline-latitude-at-exact-longitude";
  if (reference.kind === "appulse") return "coarse-planet-appulse-occurrence";
  return reference.criteriaId === "moon-conjunction-minute" ? "moon-coordinate-conjunction-time" : "coarse-planet-coordinate-conjunction-time";
}

/** JSON report retains every failure; source acceptance thresholds stay frozen. */
export function runEventValidation(partitions: readonly ReferencePartition[]) {
  const references = partitions.flatMap(loadEventReferences);
  assert(new Set(references.map((row) => row.id)).size === references.length, "duplicate selected case");
  const cases = references.map((reference) => {
    let evaluated: EvaluatedReference | null = null;
    let failure: string | null = null;
    try {
      evaluated = evaluateEventReference(reference);
      assertReferenceChecks(reference.checks, evaluated.actual);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const checks = reference.checks.map((check) => {
      const actual = evaluated?.actual[check.key] ?? null;
      const error = actual === null ? null : absoluteError(check, actual);
      return { key: check.key, quantity: quantityFor(reference, check), unit: check.unit,
        expected: check.value, actual, absoluteError: error, maximumAbsoluteError: check.maximumAbsoluteError,
        passed: error !== null && Number.isFinite(error) && error <= check.maximumAbsoluteError };
    });
    return { id: reference.id, partition: reference.partition, kind: reference.kind,
      sourceId: reference.sourceId, locator: reference.locator, window: reference.window,
      validationUse: reference.validationUse, qualifications: reference.qualifications,
      passed: failure === null && checks.every((check) => check.passed), failure, checks,
      contactSensitivities: evaluated?.contactSensitivities ?? [], candidateRetention: evaluated?.candidateRetention ?? null };
  });
  const groups = new Map<string, { partition: ReferencePartition; quantity: string; unit: string;
    checks: number; failed: number; maximumObservedAbsoluteError: number | null; caseIds: string[];
    referenceFrom: string; referenceTo: string }>();
  for (const row of cases) for (const check of row.checks) {
    const key = [row.partition, check.quantity, check.unit].join(":");
    const group = groups.get(key) ?? { partition: row.partition, quantity: check.quantity, unit: check.unit,
      checks: 0, failed: 0, maximumObservedAbsoluteError: null, caseIds: [], referenceFrom: row.window.from, referenceTo: row.window.to };
    group.checks += 1;
    group.failed += Number(!check.passed);
    if (check.absoluteError !== null) group.maximumObservedAbsoluteError = Math.max(group.maximumObservedAbsoluteError ?? 0, check.absoluteError);
    if (!group.caseIds.includes(row.id)) group.caseIds.push(row.id);
    if (row.window.from < group.referenceFrom) group.referenceFrom = row.window.from;
    if (row.window.to > group.referenceTo) group.referenceTo = row.window.to;
    groups.set(key, group);
  }
  return { schema: "occultations-event-validation/1", runtime: process.version,
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS },
    frozenReferenceDigests: (JSON.parse(fixture("freeze.json")) as Freeze).files,
    passed: cases.every((row) => row.passed), caseCount: cases.length,
    checkCount: cases.reduce((sum, row) => sum + row.checks.length, 0),
    failedCaseIds: cases.filter((row) => !row.passed).map((row) => row.id),
    physicalTimingErrorSeconds: null,
    qualifications: ["finite-frozen-corpus;not-a-general-physical-bound", "no-threshold-change-or-residual-fit",
      "all-refused-missing-unresolved-and-out-of-budget-checks-fail", "sensitivity-is-not-independent-accuracy-evidence"],
    groups: [...groups.values()], cases };
}
