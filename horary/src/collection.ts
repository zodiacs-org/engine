import { ASPECTS, bodyLongitude, dateFrom, essentialDignities, exactSign, exactSum, roundedValue,
  searchLongitudeCrossingsWith, sectOf } from "./engine.js";
import type { AspectType, ClassicalPlanet, EssentialDignity, Sect } from "./engine.js";
import { observeAspect } from "./aspect-observation.js";
import type { AspectRow } from "./aspect-observation.js";
import { ASPECT_SEARCH_METHOD, createAspectSearchPolicy, validateAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import { COLLECTION_SOURCE, COLLECTION_WEIGHT_ORDER, createCollectionPolicy, validateCollectionPolicy } from "./collection-policy.js";
import type { HoraryCollectionPolicy } from "./collection-policy.js";
import { selectSignificators } from "./significators.js";
import type { AspectContact, AspectLongitudeAt, SignificatorAspect } from "./significator-aspects.js";
import type { HoraryCast, HorarySignificators, PlanetRoles, SignificatorRole } from "./types.js";

const DAY = 86_400_000;
export const COLLECTION_METHOD = Object.freeze({
  aspectMethod: ASPECT_SEARCH_METHOD,
  interval: "(question-instant,horizon-end]",
  budgetUnit: "longitude-provider-calls;two-per-relative-evaluation",
  receptionEpoch: "question-instant;question-chart-sect",
  limitations: Object.freeze([
    "Partial converging-contact evidence establishes no outcome or continuous application.",
    "Sign exits, stations and competing third-party contacts require separate assessment.",
    "Weight uses sphere order; slower speed uses absolute instantaneous speed as a project proxy.",
    "Not beholding is interpreted as no current enabled in-orb aspect, not whole-sign aversion.",
    "Reception uses question geometry, engine dignity tables and question sect, not contact-time positions.",
    "Completed scans inherit the engine's sampling, merging, rounded relative longitude and clock limitations.",
    "Contact order within twice the step-derived root resolution is unresolved, not a physical accuracy bound.",
    "Caller chart geometry is not authenticated against the motion provider.",
    "This report uses its own provider budget, independent of aspect-policy maxSamples."
  ])
} as const);
export interface CollectionCollector {
  readonly planet: ClassicalPlanet;
  readonly roles: readonly SignificatorRole[];
}
export interface CollectionContact extends AspectContact {
  readonly principal: ClassicalPlanet;
  readonly collector: ClassicalPlanet;
  readonly type: AspectType;
}
export interface CollectionReception {
  readonly host: ClassicalPlanet;
  readonly guest: ClassicalPlanet;
  readonly longitude: number;
  readonly sect: Sect;
  readonly dignities: readonly EssentialDignity[];
  readonly required: boolean;
}
export interface CollectionCheck {
  readonly rule: "heavier-planet" | "slower-planet" | "principals-not-aspecting" | "both-receptions" | "converging-contacts";
  readonly enabled: boolean;
  readonly passed: boolean | null;
  readonly source: typeof COLLECTION_SOURCE;
  readonly explanation: string;
}
export interface CollectionApplication {
  readonly principal: PlanetRoles;
  readonly type: AspectType;
  readonly current: SignificatorAspect["current"];
  readonly contact: CollectionContact | null;
}
export interface CollectionAssessment {
  readonly kind: "collection-of-light";
  readonly collector: CollectionCollector;
  readonly applications: readonly CollectionApplication[];
  readonly receptions: readonly CollectionReception[];
  readonly checks: readonly CollectionCheck[];
  readonly contactOrder: "querent-first" | "quesited-first" | "coincident-or-unresolved" | "not-established";
  readonly completion: CollectionContact | null;
  readonly status: "collection-candidate" | "rejected" | "requires-review" | "contact-not-found" | "search-disabled" | "search-refused";
  readonly explanation: string;
}
export interface HoraryCollection {
  readonly schema: "horary.collection/v1";
  readonly questionId: string;
  readonly policy: HoraryCollectionPolicy;
  readonly aspectPolicy: HoraryAspectPolicy;
  readonly source: typeof COLLECTION_SOURCE;
  readonly significators: HorarySignificators;
  readonly assessment: "disabled" | "shared-principals" | "no-current-pattern" | "patterns-found";
  readonly search: Readonly<{
    status: "complete" | "refused" | "disabled" | "not-needed";
    reason: "sample-budget" | null;
    from: string; to: string; samples: number; rootResolutionMs: number;
    clock: "engine-utc-model" | "caller-longitude-provider";
    method: typeof COLLECTION_METHOD;
  }>;
  readonly contacts: readonly CollectionContact[];
  readonly collections: readonly CollectionAssessment[];
  readonly explanation: string;
}
interface Pattern {
  collector: CollectionCollector;
  applications: readonly Omit<CollectionApplication, "contact">[];
}
class CollectionBudgetReached {}
function canonical(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("Collection longitudes must be finite degrees in [0,360).");
  }
  return value;
}
function evaluate(longitudeAt: AspectLongitudeAt, result: HoraryCast, inputAspectPolicy: HoraryAspectPolicy,
  inputPolicy: HoraryCollectionPolicy, clock: HoraryCollection["search"]["clock"]): HoraryCollection {
  if (typeof longitudeAt !== "function") throw new RangeError("Collection longitude provider must be a function.");
  const policy = validateCollectionPolicy(inputPolicy), aspectPolicy = validateAspectSearchPolicy(inputAspectPolicy);
  const significators = selectSignificators(result);
  const now = dateFrom(result.input.instant, "question instant").getTime(), from = new Date(now);
  const to = new Date(now + aspectPolicy.horizonDays * DAY);
  if (!Number.isFinite(to.getTime()) || to.getTime() <= now) throw new RangeError("Collection requires a representable future horizon.");
  const rootResolutionMs = Math.ceil(aspectPolicy.stepDays * DAY / 2 ** 24) + 1, coincidentMs = 2 * rootResolutionMs;
  const querent = significators.planets.find(row => row.roles.includes("querent"))!;
  const quesited = significators.planets.find(row => row.roles.includes("quesited"))!;
  const principals = [querent, quesited];
  const rows = new Map<ClassicalPlanet, AspectRow>(), patterns: Pattern[] = [];
  let sect: Sect = "day", principalsAspecting = false;
  let assessment: HoraryCollection["assessment"] = !policy.collectionOfLight ? "disabled" :
    querent.planet === quesited.planet ? "shared-principals" : "no-current-pattern";
  const collectors = policy.collectors.filter(planet => !principals.some(row => row.planet === planet));
  if (assessment === "no-current-pattern" && collectors.length && aspectPolicy.aspects.length) {
    if (!Array.isArray(result.chart.bodies)) throw new RangeError("Collection requires chart body rows.");
    // Only these inputs participate; unselected outer or classical rows are ignored.
    for (const planet of new Set<ClassicalPlanet>(["Sun", ...principals.map(row => row.planet), ...collectors])) {
      const matching = result.chart.bodies.filter(row => row?.body === planet);
      if (matching.length !== 1) throw new RangeError(`Collection requires exactly one ${planet} row.`);
      const row = matching[0]!;
      if (typeof row.speed !== "number" || !Number.isFinite(row.speed)) throw new RangeError("Collection speeds must be finite degrees/day.");
      rows.set(planet, { body: planet, lon: canonical(row.lon), speed: row.speed });
    }
    sect = sectOf(canonical(result.chart.angles.asc), rows.get("Sun")!.lon);
    principalsAspecting = aspectPolicy.aspects.some(type => observeAspect(rows.get(querent.planet)!, rows.get(quesited.planet)!, type, aspectPolicy).withinOrb);
    for (const planet of collectors) {
      const collector = Object.freeze({ planet, roles: significators.planets.find(row => row.planet === planet)?.roles ?? Object.freeze([]) });
      const applications = principals.map(principal => aspectPolicy.aspects.map(type => Object.freeze({ principal, type,
        current: observeAspect(rows.get(principal.planet)!, rows.get(planet)!, type, aspectPolicy) }))
        .filter(row => row.current.withinOrb && !row.current.exact && row.current.motion === "applying"));
      for (const first of applications[0]!) for (const second of applications[1]!) {
        patterns.push({ collector, applications: [first, second] });
      }
    }
    if (patterns.length) assessment = "patterns-found";
  }
  // Scan each participating pair and enabled directed aspect once, even with overlapping patterns.
  const activeCollectors = [...new Set(patterns.map(pattern => pattern.collector.planet))];
  const definitions = ASPECTS.filter(row => aspectPolicy.aspects.includes(row.type));
  let status: HoraryCollection["search"]["status"] = assessment === "disabled" || !aspectPolicy.search ? "disabled" :
    activeCollectors.length ? "complete" : "not-needed";
  let samples = 0;
  const pending: CollectionContact[] = [];
  const read = (planet: ClassicalPlanet, date: Date) => {
    if (samples === policy.maxSamples) throw new CollectionBudgetReached();
    samples++;
    return canonical(longitudeAt(planet, new Date(date.getTime())));
  };
  const targetCount = definitions.reduce((sum, row) => sum + (row.angle === 0 || row.angle === 180 ? 1 : 2), 0);
  const minimum = activeCollectors.length * principals.length * targetCount * 2 *
    (Math.ceil((to.getTime() - now) / (aspectPolicy.stepDays * DAY)) + 1);
  if (status === "complete" && minimum > policy.maxSamples) status = "refused";
  if (status === "complete") {
    try {
      for (const collector of activeCollectors) for (const { planet: principal } of principals) for (const { type, angle } of definitions) {
        for (const target of angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle]) {
          const remaining = Math.floor((policy.maxSamples - samples) / 2);
          if (!remaining) throw new CollectionBudgetReached();
          const scan = searchLongitudeCrossingsWith((_planet: ClassicalPlanet, at: Date) => {
            const value = roundedValue(exactSum(read(principal, at), -read(collector, at)));
            return value < 0 ? value + 360 : value;
          }, principal, target, from, to, { stepDays: aspectPolicy.stepDays, maxSamples: remaining });
          if (scan.status === "refused") throw new CollectionBudgetReached();
          for (const crossing of scan.crossings) {
            if (crossing.at.getTime() <= now) continue;
            pending.push(Object.freeze({ principal, collector, type, at: crossing.at.toISOString(),
              elapsedDays: (crossing.at.getTime() - now) / DAY, directedLongitude: target,
              relativeDirection: crossing.retrograde ? "decreasing" : "increasing" }));
          }
        }
      }
    } catch (error) {
      if (!(error instanceof CollectionBudgetReached)) throw error;
      status = "refused";
    }
  }
  const contacts = Object.freeze(status === "complete" ? pending.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    a.collector.localeCompare(b.collector) || a.principal.localeCompare(b.principal) || a.type.localeCompare(b.type) ||
    a.directedLongitude - b.directedLongitude) : []);
  const collections = patterns.map((pattern): CollectionAssessment => {
    const collectorRow = rows.get(pattern.collector.planet)!;
    const applications = Object.freeze(pattern.applications.map(application => Object.freeze({ ...application,
      contact: contacts.find(contact => contact.collector === pattern.collector.planet && contact.principal === application.principal.planet &&
        contact.type === application.type && contact.directedLongitude === application.current.directedLongitude) ?? null })));
    const receptions = Object.freeze(principals.flatMap(principal => {
      const principalRow = rows.get(principal.planet)!;
      return [[principalRow, collectorRow], [collectorRow, principalRow]].map(([host, guest]) => Object.freeze({
        host: host!.body, guest: guest!.body, longitude: guest!.lon, sect,
        dignities: Object.freeze(essentialDignities(host!.body, guest!.lon, sect).dignities.filter(dignity => policy.receptionDignities.includes(dignity))),
        required: policy.receptionDignities.length > 0 && (policy.receptionDirection === "principals-receive-collector"
          ? host!.body === principal.planet : host!.body === collectorRow.body) }));
    }));
    const checks: CollectionCheck[] = [];
    const check = (rule: CollectionCheck["rule"], enabled: boolean, passed: boolean | null, explanation: string) => checks.push(Object.freeze({
      rule, enabled, passed: enabled ? passed : null, source: COLLECTION_SOURCE,
      explanation: enabled ? explanation : `The caller disabled ${rule} checking.` }));
    check("heavier-planet", policy.heavierPlanet, principals.every(principal => COLLECTION_WEIGHT_ORDER.indexOf(collectorRow.body) > COLLECTION_WEIGHT_ORDER.indexOf(principal.planet)),
      `${collectorRow.body} must follow both house rulers in the traditional sphere order, lightest first: ${COLLECTION_WEIGHT_ORDER.join(", ")}.`);
    check("slower-planet", policy.slowerPlanet, principals.every(principal => exactSign([Math.abs(rows.get(principal.planet)!.speed), -Math.abs(collectorRow.speed)]) > 0),
      `Question-time speed magnitudes are ${collectorRow.body}: ${Math.abs(collectorRow.speed)}, ${principals.map(row => `${row.planet}: ${Math.abs(rows.get(row.planet)!.speed)}`).join(", ")} degrees/day. The collector must be strictly slower than both under the project proxy.`);
    check("principals-not-aspecting", policy.principalsNotAspecting, !principalsAspecting,
      `The house rulers ${principalsAspecting ? "have" : "have no"} current enabled in-orb aspect under the project reading of not beholding.`);
    check("both-receptions", policy.receptionDignities.length > 0, receptions.filter(row => row.required).every(row => row.dignities.length > 0),
      `Required direction: ${policy.receptionDirection}. ${receptions.filter(row => row.required).map(row =>
        `${row.host} receives ${row.guest} by ${row.dignities.join(", ") || "none of the selected dignities"} at ${row.longitude} degrees`).join("; ")}. Question-time sect is ${sect}.`);
    const first = applications[0]!.contact, second = applications[1]!.contact;
    const nearQuestion = applications.some(row => row.contact && Date.parse(row.contact.at) - now <= coincidentMs);
    const directions = applications.every(row => row.contact && row.contact.relativeDirection ===
      (exactSign([row.current.aSpeed, -row.current.bSpeed]) > 0 ? "increasing" : "decreasing"));
    const converging = first && second && !nearQuestion ? directions : null;
    check("converging-contacts", true, converging,
      first && second ? nearQuestion ? "A contact is too close to the question to establish future order at this scan resolution." :
        directions ? "Both current applying branches have future contacts with matching relative-motion directions." :
        "A future crossing conflicts with its current relative-motion direction; the evidence requires review." :
        "Both future contacts were not established in the sampled horizon; absence outside this window is not established.");
    const contactOrder: CollectionAssessment["contactOrder"] = !first || !second ? "not-established" :
      Math.abs(Date.parse(first.at) - Date.parse(second.at)) <= coincidentMs ? "coincident-or-unresolved" :
      Date.parse(first.at) < Date.parse(second.at) ? "querent-first" : "quesited-first";
    const completion = contactOrder === "querent-first" ? second : contactOrder === "quesited-first" ? first : null;
    const collectionStatus: CollectionAssessment["status"] = status === "refused" ? "search-refused" : status === "disabled" ? "search-disabled" :
      checks.some(row => row.enabled && row.passed === false && row.rule !== "converging-contacts") ? "rejected" :
      nearQuestion || converging === false || contactOrder === "coincident-or-unresolved" ? "requires-review" :
      !first || !second ? "contact-not-found" : "collection-candidate";
    const reason = collectionStatus === "collection-candidate" ? "Both future contacts pass the enabled checks." :
      collectionStatus === "search-refused" ? "The provider budget refused the entire search; no partial contact references are retained." :
      collectionStatus === "search-disabled" ? "Contact searching is disabled." :
      collectionStatus === "contact-not-found" ? "Both contacts were not found in the bounded sampled horizon." :
      collectionStatus === "requires-review" ? "Contact direction or numerical order requires review; coincident contacts do not establish a strict arrival order." :
      `Failed enabled checks: ${checks.filter(row => row.enabled && row.passed === false).map(row => row.rule).join(", ")}.`;
    return Object.freeze({ kind: "collection-of-light", collector: pattern.collector, applications, receptions,
      checks: Object.freeze(checks), contactOrder, completion, status: collectionStatus,
      explanation: `${querent.planet} and ${quesited.planet} each apply to ${collectorRow.body}. Status: ${collectionStatus}; ` +
        `contact order: ${contactOrder}. ${reason} ` +
        "This is partial collection evidence; sign changes, stations and competing contacts still need assessment. No outcome judgement is made." });
  });
  return Object.freeze({ schema: "horary.collection/v1", questionId: significators.questionId, policy, aspectPolicy,
    source: COLLECTION_SOURCE, significators, assessment, contacts, collections: Object.freeze(collections),
    explanation: assessment === "disabled" ? "Collection of light is disabled." : assessment === "shared-principals" ?
      "One physical planet rules both principal houses; collection between distinct principals is not assigned." : assessment === "no-current-pattern" ?
      "No selected third planet has two current nonexact in-orb applying contacts from the house rulers." :
      "Converging patterns are assessed through future contacts and explicit reception direction; no outcome is assigned.",
    search: Object.freeze({ status, reason: status === "refused" ? "sample-budget" : null,
      from: from.toISOString(), to: to.toISOString(), samples, rootResolutionMs, clock, method: COLLECTION_METHOD }) });
}
export function evaluateCollection(result: HoraryCast, aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(),
  policy: HoraryCollectionPolicy = createCollectionPolicy()): HoraryCollection {
  return evaluate(bodyLongitude, result, aspectPolicy, policy, "engine-utc-model");
}
/** Independent motion boundary; current geometry and provider motion must agree. */
export function evaluateCollectionWith(longitudeAt: AspectLongitudeAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(), policy: HoraryCollectionPolicy = createCollectionPolicy()): HoraryCollection {
  return evaluate(longitudeAt, result, aspectPolicy, policy, "caller-longitude-provider");
}
