import { ASPECTS, bodyLongitude, CLASSICAL_PLANETS, dateFrom, essentialDignities, exactSign, exactSum,
  roundedValue, searchLongitudeCrossingsWith, sectOf } from "./engine.js";
import type { AspectType, ClassicalPlanet, EssentialDignity, Sect } from "./engine.js";
import { observeAspect } from "./aspect-observation.js";
import type { AspectRow } from "./aspect-observation.js";
import { ASPECT_SEARCH_METHOD, createAspectSearchPolicy, validateAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import type { AspectContact, AspectLongitudeAt, SignificatorAspect } from "./significator-aspects.js";
import { selectSignificators } from "./significators.js";
import { createTranslationPolicy, TRANSLATION_SOURCE, TRANSLATION_WEIGHT_ORDER, validateTranslationPolicy } from "./translation-policy.js";
import type { HoraryTranslationPolicy } from "./translation-policy.js";
import type { HoraryCast, HorarySignificators, PlanetRoles, SignificatorRole } from "./types.js";

const DAY = 86_400_000;
export const TRANSLATION_METHOD = Object.freeze({
  aspectMethod: ASPECT_SEARCH_METHOD,
  interval: "(question-minus-lookback,question-plus-horizon]",
  budgetUnit: "longitude-provider-calls;two-per-relative-evaluation",
  contactUniverse: CLASSICAL_PLANETS,
  receptionEpoch: "question-instant;question-chart-sect",
  limitations: Object.freeze([
    "This is partial translation eligibility evidence, not an outcome or a proof of continuous application.",
    "Sign changes, stations, refrenation and the principals' competing contacts await separate assessment.",
    "Traditional weight uses geocentric sphere order; swiftness uses absolute instantaneous speed as a project proxy.",
    "Only enabled aspect types can interrupt; planets outside the classical set are excluded.",
    "A completed scan inherits the engine's sampling, root merging, rounding and clock limitations.",
    "Events within twice the step-derived root resolution have unresolved order; it is not a physical accuracy bound.",
    "Reception is evaluated at the question, not at the earlier or later contact; sect is also the question's sect.",
    "Edited current geometry and caller motion laws are not authenticated against each other.",
    "The aspect policy's maxSamples is used by the aspect report; this scan uses the translation policy's provider budget."
  ])
} as const);
export interface TranslationCarrier {
  readonly planet: ClassicalPlanet;
  /** Empty for an eligible classical carrier without a declared question role. */
  readonly roles: readonly SignificatorRole[];
}
export interface TranslationContact extends AspectContact {
  readonly carrier: ClassicalPlanet;
  readonly other: ClassicalPlanet;
  readonly type: AspectType;
}
export interface TranslationCheck {
  readonly rule: "lighter-planet" | "swifter-planet" | "principal-separation" | "source-reception" | "ordered-contacts" | "uninterrupted";
  readonly enabled: boolean;
  /** null when disabled or when the scan does not establish the condition. */
  readonly passed: boolean | null;
  readonly source: typeof TRANSLATION_SOURCE;
  readonly explanation: string;
}
export interface TranslationAssessment {
  readonly kind: "translation-of-light";
  readonly carrier: TranslationCarrier;
  readonly from: PlanetRoles;
  readonly to: PlanetRoles;
  readonly status: "translation-candidate" | "rejected" | "requires-review" | "contact-not-found" | "search-disabled" | "search-refused";
  readonly current: Readonly<{
    separation: Readonly<{ type: AspectType; observation: SignificatorAspect["current"] }>;
    application: Readonly<{ type: AspectType; observation: SignificatorAspect["current"] }>;
  }>;
  readonly separationContact: TranslationContact | null;
  readonly applicationContact: TranslationContact | null;
  readonly sourceReception: Readonly<{ host: ClassicalPlanet; guest: ClassicalPlanet; longitude: number; sect: Sect;
    dignities: readonly EssentialDignity[] }>;
  /** Contacts with any classical planet between or coincident with the selected endpoint contacts. */
  readonly intervening: readonly Readonly<{ contact: TranslationContact; relation: "between" | "coincident" }>[];
  readonly checks: readonly TranslationCheck[];
  readonly explanation: string;
}
export interface HoraryTranslation {
  readonly schema: "horary.translation/v1";
  readonly questionId: string;
  readonly policy: HoraryTranslationPolicy;
  readonly aspectPolicy: HoraryAspectPolicy;
  readonly source: typeof TRANSLATION_SOURCE;
  readonly significators: HorarySignificators;
  readonly assessment: "disabled" | "shared-principals" | "no-current-pattern" | "patterns-found";
  readonly search: Readonly<{
    status: "complete" | "refused" | "disabled" | "not-needed";
    reason: "sample-budget" | null;
    from: string; to: string; samples: number; rootResolutionMs: number;
    clock: "engine-utc-model" | "caller-longitude-provider";
    method: typeof TRANSLATION_METHOD;
  }>;
  readonly contacts: readonly TranslationContact[];
  readonly translations: readonly TranslationAssessment[];
  readonly explanation: string;
}
interface Pattern {
  carrier: TranslationCarrier; from: PlanetRoles; to: PlanetRoles;
  separation: TranslationAssessment["current"]["separation"];
  application: TranslationAssessment["current"]["application"];
}
class TranslationBudgetReached {}
function canonical(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("Translation longitudes must be finite degrees in [0,360).");
  }
  return value;
}

function evaluate(longitudeAt: AspectLongitudeAt, result: HoraryCast, inputAspectPolicy: HoraryAspectPolicy,
  inputPolicy: HoraryTranslationPolicy, clock: HoraryTranslation["search"]["clock"]): HoraryTranslation {
  if (typeof longitudeAt !== "function") throw new RangeError("Translation longitude provider must be a function.");
  const policy = validateTranslationPolicy(inputPolicy), aspectPolicy = validateAspectSearchPolicy(inputAspectPolicy);
  const significators = selectSignificators(result);
  const now = dateFrom(result.input.instant, "question instant").getTime();
  const from = new Date(now - policy.lookbackDays * DAY), to = new Date(now + aspectPolicy.horizonDays * DAY);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.getTime() >= now || to.getTime() <= now) {
    throw new RangeError("Translation window requires representable instants before and after the question.");
  }
  const rootResolutionMs = Math.ceil(aspectPolicy.stepDays * DAY / 2 ** 24) + 1;
  const coincidentMs = 2 * rootResolutionMs;
  const querent = significators.planets.find(row => row.roles.includes("querent"))!;
  const quesited = significators.planets.find(row => row.roles.includes("quesited"))!;
  const rows = new Map<ClassicalPlanet, AspectRow>();
  const patterns: Pattern[] = [];
  const principalObservations: SignificatorAspect["current"][] = [];
  let sect: Sect = "day";
  let assessment: HoraryTranslation["assessment"] = !policy.translationOfLight ? "disabled" :
    querent.planet === quesited.planet ? "shared-principals" : "no-current-pattern";
  if (assessment === "no-current-pattern" && policy.carriers.length && aspectPolicy.aspects.length) {
    if (!Array.isArray(result.chart.bodies)) throw new RangeError("Translation requires chart body rows.");
    // All classical planets can intervene, including ones with no question assignment.
    for (const planet of CLASSICAL_PLANETS) {
      const matching = result.chart.bodies.filter(row => row?.body === planet);
      if (matching.length !== 1) throw new RangeError(`Translation requires exactly one ${planet} row.`);
      const row = matching[0]!;
      if (typeof row.speed !== "number" || !Number.isFinite(row.speed)) throw new RangeError("Translation speeds must be finite degrees/day.");
      rows.set(planet, { body: planet, lon: canonical(row.lon), speed: row.speed });
    }
    sect = sectOf(canonical(result.chart.angles.asc), rows.get("Sun")!.lon);
    for (const type of policy.principalAspects) {
      if (aspectPolicy.aspects.includes(type)) principalObservations.push(observeAspect(rows.get(querent.planet)!, rows.get(quesited.planet)!, type, aspectPolicy));
    }
    for (const carrierPlanet of policy.carriers) {
      if (carrierPlanet === querent.planet || carrierPlanet === quesited.planet) continue;
      const carrier = Object.freeze({ planet: carrierPlanet,
        roles: significators.planets.find(row => row.planet === carrierPlanet)?.roles ?? Object.freeze([]) });
      for (const [origin, destination] of [[querent, quesited], [quesited, querent]] as const) {
        const observe = (other: ClassicalPlanet) => aspectPolicy.aspects.map(type => Object.freeze({ type,
          observation: observeAspect(rows.get(carrierPlanet)!, rows.get(other)!, type, aspectPolicy) }));
        const separating = observe(origin.planet).filter(row => row.observation.withinOrb && !row.observation.exact && row.observation.motion === "separating");
        const applying = observe(destination.planet).filter(row => row.observation.withinOrb && !row.observation.exact && row.observation.motion === "applying");
        for (const separation of separating) for (const application of applying) patterns.push({ carrier, from: origin, to: destination, separation, application });
      }
    }
    if (patterns.length) assessment = "patterns-found";
  }
  const carriers = [...new Set(patterns.map(pattern => pattern.carrier.planet))];
  let status: HoraryTranslation["search"]["status"] = assessment === "disabled" || !aspectPolicy.search ? "disabled" :
    carriers.length ? "complete" : "not-needed";
  let samples = 0;
  const pending: TranslationContact[] = [];
  const read = (planet: ClassicalPlanet, date: Date) => {
    if (samples === policy.maxSamples) throw new TranslationBudgetReached();
    samples++;
    return canonical(longitudeAt(planet, new Date(date.getTime())));
  };
  const definitions = ASPECTS.filter(row => aspectPolicy.aspects.includes(row.type));
  const targetCount = definitions.reduce((sum, row) => sum + (row.angle === 0 || row.angle === 180 ? 1 : 2), 0);
  const coarseMinimum = carriers.length * (CLASSICAL_PLANETS.length - 1) * targetCount * 2 *
    (Math.ceil((to.getTime() - from.getTime()) / (aspectPolicy.stepDays * DAY)) + 1);
  if (status === "complete" && coarseMinimum > policy.maxSamples) status = "refused";
  if (status === "complete") {
    try {
      for (const carrier of carriers) for (const other of CLASSICAL_PLANETS) {
        if (carrier === other) continue;
        for (const { type, angle } of definitions) {
          for (const target of angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle]) {
            const remaining = Math.floor((policy.maxSamples - samples) / 2);
            if (!remaining) throw new TranslationBudgetReached();
            const scan = searchLongitudeCrossingsWith((_planet: ClassicalPlanet, at: Date) => {
              const value = roundedValue(exactSum(read(carrier, at), -read(other, at)));
              return value < 0 ? value + 360 : value;
            }, carrier, target, from, to, { stepDays: aspectPolicy.stepDays, maxSamples: remaining });
            if (scan.status === "refused") throw new TranslationBudgetReached();
            for (const crossing of scan.crossings) {
              if (crossing.at.getTime() <= from.getTime()) continue;
              pending.push(Object.freeze({ carrier, other, type, at: crossing.at.toISOString(),
                elapsedDays: (crossing.at.getTime() - now) / DAY, directedLongitude: target,
                relativeDirection: crossing.retrograde ? "decreasing" : "increasing" }));
            }
          }
        }
      }
    } catch (error) {
      if (!(error instanceof TranslationBudgetReached)) throw error;
      status = "refused";
    }
  }
  // Global refusal is atomic, including already scanned carriers and endpoint references.
  const contacts = Object.freeze(status === "complete" ? pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    a.carrier.localeCompare(b.carrier) || a.other.localeCompare(b.other) || a.type.localeCompare(b.type) || a.directedLongitude - b.directedLongitude) : []);
  const translations = patterns.map((pattern): TranslationAssessment => {
    const { carrier, from: origin, to: destination, separation, application } = pattern;
    const carrierRow = rows.get(carrier.planet)!, originRow = rows.get(origin.planet)!, destinationRow = rows.get(destination.planet)!;
    const match = (contact: TranslationContact, other: ClassicalPlanet, observation: typeof separation) =>
      contact.carrier === carrier.planet && contact.other === other && contact.type === observation.type &&
      contact.directedLongitude === observation.observation.directedLongitude;
    const past = contacts.filter(contact => match(contact, origin.planet, separation) && Date.parse(contact.at) < now - coincidentMs).at(-1) ?? null;
    const future = contacts.find(contact => match(contact, destination.planet, application) && Date.parse(contact.at) > now + coincidentMs) ?? null;
    const nearQuestion = contacts.some(contact => (match(contact, origin.planet, separation) || match(contact, destination.planet, application)) &&
      Math.abs(Date.parse(contact.at) - now) <= coincidentMs);
    const intervening = past && future ? contacts.filter(contact => contact.carrier === carrier.planet && contact !== past && contact !== future &&
      Date.parse(contact.at) >= Date.parse(past.at) - coincidentMs && Date.parse(contact.at) <= Date.parse(future.at) + coincidentMs)
      .map(contact => Object.freeze({ contact, relation: Math.abs(Date.parse(contact.at) - Date.parse(past.at)) <= coincidentMs ||
        Math.abs(Date.parse(contact.at) - Date.parse(future.at)) <= coincidentMs ? "coincident" as const : "between" as const })) : [];
    const dignities = Object.freeze(essentialDignities(origin.planet, carrierRow.lon, sect).dignities.filter(dignity => policy.receptionDignities.includes(dignity)));
    const sourceReception = Object.freeze({ host: origin.planet, guest: carrier.planet, longitude: carrierRow.lon, sect, dignities });
    const checks: TranslationCheck[] = [];
    const check = (rule: TranslationCheck["rule"], enabled: boolean, passed: boolean | null, explanation: string) => checks.push(Object.freeze({
      rule, enabled, passed: enabled ? passed : null, source: TRANSLATION_SOURCE,
      explanation: enabled ? explanation : `The caller disabled ${rule} checking.` }));
    check("lighter-planet", policy.lighterPlanet, TRANSLATION_WEIGHT_ORDER.indexOf(carrier.planet) < TRANSLATION_WEIGHT_ORDER.indexOf(origin.planet) &&
      TRANSLATION_WEIGHT_ORDER.indexOf(carrier.planet) < TRANSLATION_WEIGHT_ORDER.indexOf(destination.planet),
      `${carrier.planet} is compared with ${origin.planet} and ${destination.planet} in traditional sphere order, lightest first: ${TRANSLATION_WEIGHT_ORDER.join(", ")}.`);
    check("swifter-planet", policy.swifterPlanet, exactSign([Math.abs(carrierRow.speed), -Math.abs(originRow.speed)]) > 0 &&
      exactSign([Math.abs(carrierRow.speed), -Math.abs(destinationRow.speed)]) > 0,
      `Question-time speed magnitudes are ${Math.abs(carrierRow.speed)}, ${Math.abs(originRow.speed)} and ${Math.abs(destinationRow.speed)} degrees/day; the carrier must exceed both under this project proxy.`);
    check("principal-separation", policy.principalSeparation, principalObservations.some(row => row.withinOrb && !row.exact && row.motion === "separating"),
      `The two house rulers must have a current nonexact in-orb separating ${policy.principalAspects.join(" or ") || "(no selected aspect)"} under the enabled aspect policy.`);
    check("source-reception", policy.receptionDignities.length > 0, dignities.length > 0,
      `${origin.planet} holds ${dignities.join(", ") || "none of the selected dignities"} at ${carrier.planet}'s question longitude ${carrierRow.lon} degrees in ${sect} sect. The source receives the carrier, not the reverse.`);
    const directionMatches = (contact: TranslationContact, other: AspectRow) => contact.relativeDirection ===
      (exactSign([carrierRow.speed, -other.speed]) > 0 ? "increasing" : "decreasing");
    const ordered = past && future && !nearQuestion ? directionMatches(past, originRow) && directionMatches(future, destinationRow) : null;
    check("ordered-contacts", true, ordered,
      past && future ? `The separating branch has a past contact at ${past.at}; the applying branch has a future contact at ${future.at}. Crossing direction must match each current relative motion; nearby question-time roots require review.` :
        "Both endpoint contacts were not established in the bounded sampled window. This does not establish absence outside the window.");
    check("uninterrupted", policy.uninterrupted, !past || !future || status !== "complete" ? null :
      intervening.some(row => row.relation === "between") ? false : intervening.length ? null : true,
      `${intervening.length} other enabled-aspect contacts with classical planets lie between or within numerical ordering resolution of the endpoints. Endpoint-coincident contacts require review.`);
    let translationStatus: TranslationAssessment["status"];
    if (status === "refused") translationStatus = "search-refused";
    else if (status === "disabled") translationStatus = "search-disabled";
    else if (checks.some(row => row.enabled && row.passed === false && row.rule !== "ordered-contacts")) translationStatus = "rejected";
    else if (nearQuestion || ordered === false || checks.some(row => row.enabled && row.passed === null && row.rule === "uninterrupted" && past && future)) translationStatus = "requires-review";
    else if (!past || !future) translationStatus = "contact-not-found";
    else translationStatus = "translation-candidate";
    const reason = translationStatus === "translation-candidate" ? "The current separating/applying pattern has ordered sampled contacts and passes the enabled eligibility checks." :
      translationStatus === "rejected" ? `Enabled eligibility checks failed: ${checks.filter(row => row.enabled && row.passed === false).map(row => row.rule).join(", ")}.` :
      translationStatus === "requires-review" ? "Contact order or direction requires review; the evidence does not establish an uninterrupted transfer." :
      translationStatus === "contact-not-found" ? "Both contacts were not found in this sampled window; this is a bounded-search observation." :
      translationStatus === "search-refused" ? "The global provider budget refused the search; no partial contacts or endpoint references are returned." : "Contact searching is disabled.";
    return Object.freeze({ kind: "translation-of-light", carrier, from: origin, to: destination, status: translationStatus,
      current: Object.freeze({ separation, application }), separationContact: past, applicationContact: future, sourceReception,
      intervening: Object.freeze(intervening), checks: Object.freeze(checks),
      explanation: `${carrier.planet} separates by ${separation.type} from ${origin.planet} and applies by ${application.type} to ${destination.planet}. ${reason} ` +
        "This is partial translation evidence; sign changes, stations and other perfection modes still need assessment. No outcome judgement is made." });
  });
  const explanation = assessment === "disabled" ? "Translation of light is disabled." : assessment === "shared-principals" ?
    "One physical planet rules both principal houses. No transfer between distinct principal planets is assigned." : assessment === "no-current-pattern" ?
      "No selected third planet has both a nonexact in-orb separating contact with one house ruler and an in-orb application to the other under this policy." :
      "Current translation patterns are assessed from ordered contact evidence and the enabled eligibility rules; these observations establish no outcome.";
  return Object.freeze({ schema: "horary.translation/v1", questionId: significators.questionId, policy, aspectPolicy,
    source: TRANSLATION_SOURCE, significators, assessment, contacts, translations: Object.freeze(translations), explanation,
    search: Object.freeze({ status, reason: status === "refused" ? "sample-budget" : null, from: from.toISOString(), to: to.toISOString(),
      samples, rootResolutionMs, clock, method: TRANSLATION_METHOD }) });
}

/** Translation between the two house rulers, retaining a third planet's assigned roles without inventing new ones. */
export function evaluateTranslation(result: HoraryCast, aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(),
  policy: HoraryTranslationPolicy = createTranslationPolicy()): HoraryTranslation {
  return evaluate(bodyLongitude, result, aspectPolicy, policy, "engine-utc-model");
}
/** Independent motion boundary; current chart speeds and provider longitudes must describe the same motion law. */
export function evaluateTranslationWith(longitudeAt: AspectLongitudeAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(), policy: HoraryTranslationPolicy = createTranslationPolicy()): HoraryTranslation {
  return evaluate(longitudeAt, result, aspectPolicy, policy, "caller-longitude-provider");
}
