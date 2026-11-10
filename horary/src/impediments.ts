import { ASPECTS, bodyLongitude, exactSign, exactSum, longitudeSpeed, roundedValue, searchLongitudeCrossingsWith } from "./engine.js";
import type { AspectType, ClassicalPlanet } from "./engine.js";
import { observeAspect } from "./aspect-observation.js";
import type { AspectRow } from "./aspect-observation.js";
import { createAspectSearchPolicy, validateAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import { createDirectPerfectionPolicy } from "./direct-policy.js";
import { evaluateDirectPerfectionWith } from "./direct-perfection.js";
import type { AspectSpeedAt, HoraryDirectPerfection, StationEvent } from "./direct-perfection.js";
import { createImpedimentPolicy, IMPEDIMENT_SOURCES, validateImpedimentPolicy } from "./impediment-policy.js";
import type { HoraryImpedimentPolicy, ImpedimentRule } from "./impediment-policy.js";
import { selectSignificators } from "./significators.js";
import type { AspectContact, AspectLongitudeAt, SignificatorAspect } from "./significator-aspects.js";
import { TRANSLATION_WEIGHT_ORDER } from "./translation-policy.js";
import type { HoraryCast, PlanetRoles } from "./types.js";

const DAY = 86_400_000;
export const IMPEDIMENT_METHOD = Object.freeze({
  contacts: "engine-searchLongitudeCrossingsWith;principal-minus-third;enabled-directed-aspects",
  stations: "reuse-evaluateDirectPerfectionWith;stations-enabled;sign-changes-disabled",
  applicant: "lighter-house-ruler-in-traditional-sphere-order",
  verification: "sampled;not-proven-complete",
  limitations: Object.freeze([
    "Only current nonexact in-orb applications between distinct house rulers are assessed.",
    "Third contacts need not be in orb at the question; their current motion and orb are retained.",
    "Frustration requires a current in-orb application from the heavier recipient to the third planet.",
    "Swiftness is an optional instantaneous absolute-speed proxy; weight is traditional sphere order.",
    "Refranation uses a direct-to-retrograde applicant reversal, a recipient direct at the question and side probes, and post-station separation on the original branch.",
    "A station-associated loss of application does not establish causality, permanent nonperfection or an outcome.",
    "Contact rules require a future principal contact to establish relative order; a missing contact is bounded evidence only.",
    "Sign changes, continuous application, reception exceptions, strength and other perfection modes are not adjudicated.",
    "Contact and station scans inherit the engine's smooth-motion assumptions, root merging and clock limitations.",
    "Times within twice the step-derived root resolution require review; that resolution is not an astronomical error bound.",
    "Aspect relative evaluations, station provider calls, and third-contact/probe provider calls have separate atomic budgets.",
    "Supplied chart geometry is not authenticated against the motion providers."
  ])
} as const);
export interface InterventionContact extends AspectContact {
  readonly principal: ClassicalPlanet;
  readonly third: ClassicalPlanet;
  readonly type: AspectType;
  readonly current: SignificatorAspect["current"];
}
export interface ContactIntervention {
  readonly kind: "third-contact";
  readonly contact: InterventionContact;
  readonly relation: "before" | "coincident";
}
export interface StationIntervention {
  readonly kind: "station";
  readonly event: StationEvent;
  readonly relation: "before-contact" | "coincident-contact" | "after-contact" | "contact-not-found";
  readonly before: SignificatorAspect["current"];
  readonly after: SignificatorAspect["current"];
  readonly status: "candidate" | "not-triggered" | "requires-review";
  readonly explanation: string;
}
export interface ImpedimentObservation {
  readonly rule: ImpedimentRule;
  readonly source: (typeof IMPEDIMENT_SOURCES)[ImpedimentRule];
  readonly status: "disabled" | "candidate" | "not-triggered" | "requires-review" |
    "search-disabled" | "search-refused" | "event-search-refused" | "contact-not-found";
  readonly evidence: readonly (ContactIntervention | StationIntervention)[];
  readonly explanation: string;
}
export interface ImpedimentAssessment {
  readonly aspect: SignificatorAspect;
  readonly applicant: PlanetRoles;
  readonly recipient: PlanetRoles;
  readonly swifterApplicant: boolean;
  readonly observations: readonly ImpedimentObservation[];
  readonly explanation: string;
}
export interface HoraryImpediments {
  readonly schema: "horary.impediments/v1";
  readonly questionId: string;
  readonly policy: HoraryImpedimentPolicy;
  readonly aspectPolicy: HoraryAspectPolicy;
  readonly method: typeof IMPEDIMENT_METHOD;
  readonly motion: HoraryDirectPerfection;
  readonly assessment: "disabled" | "shared-principals" | "no-current-application" | "applications-found";
  readonly search: Readonly<{
    status: "complete" | "refused" | "disabled" | "not-needed";
    reason: "sample-budget" | null;
    from: string; to: string; samples: number; rootResolutionMs: number;
    clock: "engine-utc-model" | "caller-motion-providers";
  }>;
  readonly contacts: readonly InterventionContact[];
  readonly applications: readonly ImpedimentAssessment[];
  readonly explanation: string;
}
class ImpedimentBudgetReached {}
function canonical(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) throw new RangeError("Impediment longitudes must be finite degrees in [0,360).");
  return value;
}
function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError("Impediment speeds must be finite degrees/day.");
  return value;
}
function evaluate(longitudeAt: AspectLongitudeAt, speedAt: AspectSpeedAt, result: HoraryCast,
  inputAspectPolicy: HoraryAspectPolicy, inputPolicy: HoraryImpedimentPolicy,
  clock: HoraryImpediments["search"]["clock"]): HoraryImpediments {
  if (typeof longitudeAt !== "function" || typeof speedAt !== "function") throw new RangeError("Impediment motion providers must be functions.");
  const policy = validateImpedimentPolicy(inputPolicy), aspectPolicy = validateAspectSearchPolicy(inputAspectPolicy);
  const significators = selectSignificators(result);
  const querent = significators.planets.find(row => row.roles.includes("querent"))!;
  const quesited = significators.planets.find(row => row.roles.includes("quesited"))!;
  const principals = [querent, quesited];
  const enabled = policy.prohibition || policy.frustration || policy.refranation;
  const shared = querent.planet === quesited.planet;
  const scanPolicy = enabled && !shared ? aspectPolicy : createAspectSearchPolicy({ ...aspectPolicyInput(aspectPolicy), search: false });
  const rawMotion = evaluateDirectPerfectionWith(longitudeAt, speedAt, result, scanPolicy,
    createDirectPerfectionPolicy({ directAspect: false, signChanges: false, stations: enabled && !shared && policy.refranation,
      maxSamples: policy.stationMaxSamples }));
  const motion: HoraryDirectPerfection = clock === "engine-utc-model" ? Object.freeze({ ...rawMotion,
    aspects: Object.freeze({ ...rawMotion.aspects, search: Object.freeze({ ...rawMotion.aspects.search, clock: "engine-utc-model" as const }) }),
    eventSearch: Object.freeze({ ...rawMotion.eventSearch, clock }) }) : rawMotion;
  const from = Date.parse(motion.aspects.search.from), to = Date.parse(motion.aspects.search.to);
  const rootResolutionMs = motion.eventSearch.rootResolutionMs, coincidentMs = 2 * rootResolutionMs;
  const patterns = shared ? [] : motion.aspects.aspects.filter(row =>
    principals.every(principal => row.a.planet === principal.planet || row.b.planet === principal.planet) &&
    row.current.withinOrb && !row.current.exact && row.current.motion === "applying");
  const assessment: HoraryImpediments["assessment"] = !enabled ? "disabled" : shared ? "shared-principals" :
    patterns.length ? "applications-found" : "no-current-application";
  const thirds = policy.thirdPlanets.filter(planet => !principals.some(row => row.planet === planet));
  const rows = new Map<ClassicalPlanet, AspectRow>();
  if (patterns.length && (policy.prohibition || policy.frustration)) {
    for (const planet of new Set([...principals.map(row => row.planet), ...thirds])) {
      const matching = result.chart.bodies.filter(row => row?.body === planet);
      if (matching.length !== 1) throw new RangeError(`Impediments require exactly one ${planet} row.`);
      const row = matching[0]!;
      rows.set(planet, { body: planet, lon: canonical(row.lon), speed: finite(row.speed) });
    }
  }
  let status: HoraryImpediments["search"]["status"] = !enabled || !aspectPolicy.search ? "disabled" :
    motion.aspects.search.status === "refused" ? "not-needed" : patterns.length ? "complete" : "not-needed";
  let samples = 0;
  const readLongitude = (planet: ClassicalPlanet, ms: number) => {
    if (samples === policy.maxSamples) throw new ImpedimentBudgetReached();
    samples++; return canonical(longitudeAt(planet, new Date(ms)));
  };
  const readSpeed = (planet: ClassicalPlanet, ms: number) => {
    if (samples === policy.maxSamples) throw new ImpedimentBudgetReached();
    samples++; return finite(speedAt(planet, new Date(ms)));
  };
  const pending: InterventionContact[] = [];
  const stationEvidence = new Map<SignificatorAspect, StationIntervention[]>();
  const definitions = policy.prohibition || policy.frustration ? ASPECTS.filter(row => aspectPolicy.aspects.includes(row.type)) : [];
  const targetCount = definitions.reduce((sum, row) => sum + (row.angle === 0 || row.angle === 180 ? 1 : 2), 0);
  const minimum = thirds.length * principals.length * targetCount * 2 * (Math.ceil((to - from) / (aspectPolicy.stepDays * DAY)) + 1);
  if (status === "complete" && minimum > policy.maxSamples) status = "refused";
  if (status === "complete") {
    try {
      for (const { planet: principal } of principals) for (const third of thirds) for (const { type, angle } of definitions) {
        const current = observeAspect(rows.get(principal)!, rows.get(third)!, type, aspectPolicy);
        for (const target of angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle]) {
          const remaining = Math.floor((policy.maxSamples - samples) / 2);
          if (!remaining) throw new ImpedimentBudgetReached();
          const scan = searchLongitudeCrossingsWith((_planet: ClassicalPlanet, at: Date) => {
            const value = roundedValue(exactSum(readLongitude(principal, at.getTime()), -readLongitude(third, at.getTime())));
            return value < 0 ? value + 360 : value;
          }, principal, target, new Date(from), new Date(to), { stepDays: aspectPolicy.stepDays, maxSamples: remaining });
          if (scan.status === "refused") throw new ImpedimentBudgetReached();
          for (const crossing of scan.crossings) if (crossing.at.getTime() > from) pending.push(Object.freeze({
            principal, third, type, current, at: crossing.at.toISOString(), elapsedDays: (crossing.at.getTime() - from) / DAY,
            directedLongitude: target, relativeDirection: crossing.retrograde ? "decreasing" : "increasing"
          }));
        }
      }
      if (policy.refranation && motion.eventSearch.status === "complete") for (const aspect of patterns) {
        const [applicant, recipient] = orient(aspect);
        const evidence: StationIntervention[] = [];
        for (const event of motion.events) {
          if (event.kind !== "station" || (event.planet.planet !== applicant.planet && event.planet.planet !== recipient.planet)) continue;
          const at = Date.parse(event.at), contact = aspect.timeToPerfection;
          const relation: StationIntervention["relation"] = !contact ? "contact-not-found" :
            Math.abs(at - Date.parse(contact.at)) <= coincidentMs ? "coincident-contact" :
            at < Date.parse(contact.at) ? "before-contact" : "after-contact";
          const observe = (ms: number) => observeAspect({ body: aspect.a.planet, lon: readLongitude(aspect.a.planet, ms), speed: readSpeed(aspect.a.planet, ms) },
            { body: aspect.b.planet, lon: readLongitude(aspect.b.planet, ms), speed: readSpeed(aspect.b.planet, ms) }, aspect.type, aspectPolicy);
          const before = observe(Date.parse(event.evidence.beforeAt)), after = observe(Date.parse(event.evidence.afterAt));
          const recipientSpeed = recipient.planet === aspect.a.planet ? after.aSpeed : after.bSpeed;
          const recipientBeforeSpeed = recipient.planet === aspect.a.planet ? before.aSpeed : before.bSpeed;
          const recipientQuestionSpeed = recipient.planet === aspect.a.planet ? aspect.current.aSpeed : aspect.current.bSpeed;
          const candidate = event.planet.planet === applicant.planet && event.fromMotion === "direct" && event.toMotion === "retrograde" &&
            recipientQuestionSpeed > 0 && recipientBeforeSpeed > 0 && recipientSpeed > 0 &&
            after.motion === "separating" && after.directedLongitude === aspect.current.directedLongitude;
          const stationStatus: StationIntervention["status"] = relation === "after-contact" ? "not-triggered" :
            relation === "coincident-contact" || at - from <= coincidentMs || event.transition !== "reversal" || after.exact ? "requires-review" :
            candidate ? "candidate" : "not-triggered";
          evidence.push(Object.freeze({ kind: "station", event, relation, before, after, status: stationStatus,
            explanation: `${event.planet.planet} station at ${event.at}: ${event.fromMotion} to ${event.toMotion}; ${relation}. ` +
              `The lighter applicant is ${applicant.planet}; the recipient's post-station speed is ${recipientSpeed} degrees/day. ` +
              `The aspect is ${before.motion} at the before probe and ${after.motion} at the after probe. ` +
              (stationStatus === "candidate" ? "The reversal is associated with loss of the question-time application before any found original-branch contact. Later contacts remain possible; causal attribution is not established." :
                stationStatus === "requires-review" ? "The transition or contact order is unresolved; a station alone establishes no refranation." :
                  "This station does not meet the selected applicant-reversal criteria before contact.") }));
        }
        stationEvidence.set(aspect, evidence);
      }
    } catch (error) {
      if (!(error instanceof ImpedimentBudgetReached)) throw error;
      status = "refused";
    }
  }
  const contacts = Object.freeze(status === "complete" ? pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    a.principal.localeCompare(b.principal) || a.third.localeCompare(b.third) || a.type.localeCompare(b.type) || a.directedLongitude - b.directedLongitude) : []);
  const applications = patterns.map((aspect): ImpedimentAssessment => {
    const [applicant, recipient] = orient(aspect);
    const applicantSpeed = applicant.planet === aspect.a.planet ? aspect.current.aSpeed : aspect.current.bSpeed;
    const recipientSpeed = recipient.planet === aspect.a.planet ? aspect.current.aSpeed : aspect.current.bSpeed;
    const swifterApplicant = exactSign([Math.abs(applicantSpeed), -Math.abs(recipientSpeed)]) > 0;
    const contact = aspect.timeToPerfection;
    const interventions: ContactIntervention[] = contact ? contacts.filter(row => Date.parse(row.at) <= Date.parse(contact.at) + coincidentMs)
      .map(row => Object.freeze({ kind: "third-contact", contact: row,
        relation: Math.abs(Date.parse(row.at) - Date.parse(contact.at)) <= coincidentMs || Date.parse(row.at) - from <= coincidentMs
          ? "coincident" : "before" })) : [];
    const observations = (["prohibition", "frustration", "refranation"] as const).map((rule): ImpedimentObservation => {
      let ruleStatus: ImpedimentObservation["status"];
      let evidence: readonly (ContactIntervention | StationIntervention)[] = [];
      let reason: string;
      if (!policy[rule]) { ruleStatus = "disabled"; reason = "The caller disabled this rule."; }
      else if (motion.aspects.search.status !== "complete") {
        ruleStatus = motion.aspects.search.status === "refused" ? "search-refused" : "search-disabled";
        reason = "The principal contact scan did not complete; event order is unavailable.";
      } else if (status === "refused") { ruleStatus = "search-refused"; reason = "The provider budget refused the entire third-contact/probe search; partial intervention evidence is discarded."; }
      else if (rule === "refranation") {
        evidence = Object.freeze(stationEvidence.get(aspect) ?? []);
        ruleStatus = motion.eventSearch.status === "refused" ? "event-search-refused" :
          policy.swifterApplicant && !swifterApplicant ? "not-triggered" :
          evidence.some(row => row.kind === "station" && row.status === "candidate") ? "candidate" :
          evidence.some(row => row.kind === "station" && row.status === "requires-review") ? "requires-review" : "not-triggered";
        reason = ruleStatus === "candidate" ? "An applicant reversal meets the enabled station-associated loss-of-application criteria. This remains bounded, partial evidence." :
          ruleStatus === "event-search-refused" ? "The station budget refused its entire scan; no station conclusion is available." :
            ruleStatus === "requires-review" ? "Station transition or contact order requires review." :
              "No qualifying applicant reversal was established under the enabled criteria in this sampled horizon.";
      } else if (!contact) { ruleStatus = "contact-not-found"; reason = "No principal contact was found on the current branch in the horizon; an intervening contact cannot be ordered against it."; }
      else {
        let relevant = interventions;
        if (rule === "prohibition" && policy.prohibitionScope === "both-principals") relevant = relevant.filter(row =>
          principals.every(principal => interventions.some(other => other.contact.third === row.contact.third && other.contact.principal === principal.planet)));
        if (rule === "frustration") relevant = relevant.filter(row => row.contact.principal === recipient.planet &&
          row.contact.current.withinOrb && !row.contact.current.exact && row.contact.current.motion === "applying" &&
          row.contact.directedLongitude === row.contact.current.directedLongitude &&
          (policy.frustrationScope !== "conjunction-only" || (aspect.type === "conjunction" && row.contact.type === "conjunction")));
        evidence = Object.freeze(relevant);
        const direction = aspect.contacts.find(row => row.at === contact.at && row.directedLongitude === contact.directedLongitude)?.relativeDirection;
        const matches = direction === (exactSign([aspect.current.aSpeed, -aspect.current.bSpeed]) > 0 ? "increasing" : "decreasing");
        // The stricter two-principal reading requires both contacts to precede the endpoint clearly.
        const before = rule === "prohibition" && policy.prohibitionScope === "both-principals" ? relevant.filter(row =>
          row.relation === "before" && principals.every(principal => relevant.some(other => other.relation === "before" &&
            other.contact.third === row.contact.third && other.contact.principal === principal.planet))) : relevant.filter(row => row.relation === "before" &&
              (rule !== "frustration" || row.contact.relativeDirection ===
                (exactSign([row.contact.current.aSpeed, -row.contact.current.bSpeed]) > 0 ? "increasing" : "decreasing")));
        ruleStatus = rule === "frustration" && policy.swifterApplicant && !swifterApplicant ? "not-triggered" :
          !matches || Date.parse(contact.at) - from <= coincidentMs ? "requires-review" : before.length ? "candidate" : relevant.length ? "requires-review" : "not-triggered";
        reason = ruleStatus === "candidate" ? `${before.length} qualifying third contacts precede the principal contact at ${contact.at}.` :
          ruleStatus === "requires-review" ? "Numerical event order or principal-contact direction requires review." :
            "No qualifying earlier third contact was established under this interpretation in the sampled horizon.";
      }
      const interpretation = rule === "prohibition" ? `Selected scope: ${policy.prohibitionScope}; the stricter two-principal reading can change this label.` :
        rule === "frustration" ? `Selected scope: ${policy.frustrationScope}; the broader enabled-aspect interpretation can change this label.` :
          "Selected reading: the lighter applicant reverses from direct to retrograde, the recipient is direct at the question and side probes, and the original branch is separating after the station.";
      return Object.freeze({ rule, source: IMPEDIMENT_SOURCES[rule], status: ruleStatus, evidence: Object.freeze(evidence),
        explanation: `${rule}: ${reason} ${interpretation} ` +
          (rule === "prohibition" ? "General intervention can overlap frustration; labels are retained independently." :
            `Swifter-applicant checking is ${policy.swifterApplicant ? "enabled" : "disabled"}; the instantaneous magnitude comparison ${swifterApplicant ? "passes" : "fails"}.`) +
          " No outcome judgement is made." });
    });
    return Object.freeze({ aspect, applicant, recipient, swifterApplicant, observations: Object.freeze(observations),
      explanation: `${aspect.a.planet} and ${aspect.b.planet} apply by ${aspect.type}. Traditional sphere order identifies ${applicant.planet} as lighter than ${recipient.planet}. ` +
        "Competing rule labels are independent observations; reception and other perfection modes need separate assessment." });
  });
  return Object.freeze({ schema: "horary.impediments/v1", questionId: significators.questionId, policy, aspectPolicy, method: IMPEDIMENT_METHOD,
    motion, assessment, contacts, applications: Object.freeze(applications),
    search: Object.freeze({ status, reason: status === "refused" ? "sample-budget" : null, from: motion.aspects.search.from,
      to: motion.aspects.search.to, samples, rootResolutionMs, clock }),
    explanation: assessment === "shared-principals" ? "Both house roles belong to one planet; no self-application or intervention between distinct principals is assigned." :
      assessment === "disabled" ? "All impediment rules are disabled." : assessment === "no-current-application" ?
        "The house rulers have no current nonexact in-orb application under the enabled aspect policy." :
        "Principal applications are assessed against sampled contacts and stations using explicit interpretations, without an outcome verdict." });
}
function orient(aspect: SignificatorAspect): readonly [PlanetRoles, PlanetRoles] {
  return TRANSLATION_WEIGHT_ORDER.indexOf(aspect.a.planet) < TRANSLATION_WEIGHT_ORDER.indexOf(aspect.b.planet)
    ? [aspect.a, aspect.b] : [aspect.b, aspect.a];
}
function aspectPolicyInput({ schema: _schema, ...input }: HoraryAspectPolicy) { return input; }
export function evaluateImpediments(result: HoraryCast, aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(),
  policy: HoraryImpedimentPolicy = createImpedimentPolicy()): HoraryImpediments {
  return evaluate(bodyLongitude, longitudeSpeed, result, aspectPolicy, policy, "engine-utc-model");
}
/** Current chart, longitude and speed providers must describe one consistent motion law. */
export function evaluateImpedimentsWith(longitudeAt: AspectLongitudeAt, speedAt: AspectSpeedAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(), policy: HoraryImpedimentPolicy = createImpedimentPolicy()): HoraryImpediments {
  return evaluate(longitudeAt, speedAt, result, aspectPolicy, policy, "caller-motion-providers");
}
