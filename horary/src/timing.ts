import { houseOf, SIGNS } from "./engine.js";
import type { HouseNumber, Modality, ZodiacSign } from "./engine.js";
import { createAspectSearchPolicy, validateAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import { evaluateSignificatorAspects, evaluateSignificatorAspectsWith } from "./significator-aspects.js";
import type { AspectLongitudeAt, AspectPerfectionCandidate, HorarySignificatorAspects, SignificatorAspect } from "./significator-aspects.js";
import { createTimingPolicy, TIMING_CONVENTIONS, TIMING_SOURCE, validateTimingPolicy } from "./timing-policy.js";
import type { HoraryTimingPolicy, TimingHouseKind, TimingScale } from "./timing-policy.js";
import type { HoraryCast, PlanetRoles } from "./types.js";
import { selectSignificators } from "./significators.js";

export interface SymbolicTimingHint {
  readonly planet: PlanetRoles;
  readonly longitude: number;
  readonly sign: ZodiacSign;
  readonly modality: Modality;
  readonly house: HouseNumber;
  readonly houseKind: TimingHouseKind;
  readonly status: "hint" | "unit-disabled";
  readonly symbolic: Readonly<TimingScale & { quantity: number; origin: "caller-mapping" }> | null;
  readonly explanation: string;
}
export interface TimingAssessment {
  readonly a: PlanetRoles;
  readonly b: PlanetRoles;
  readonly type: SignificatorAspect["type"];
  readonly status: "disabled" | "exact-now" | "no-current-application" | "search-disabled" |
    "aspect-search-refused" | "contact-not-found" | "no-selected-basis" | "unit-disabled" | "hint";
  /** Present only for an exact contact or a sampled candidate for the current in-orb application. */
  readonly degreesToPerfection: number | null;
  /** Computational contact evidence, distinct from every symbolic hint. */
  readonly contact: AspectPerfectionCandidate | null;
  readonly hints: readonly SymbolicTimingHint[];
  readonly explanation: string;
}
export interface HoraryTimingHints {
  readonly schema: "horary.timing-hints/v1";
  readonly questionId: string;
  readonly policy: HoraryTimingPolicy;
  readonly source: typeof TIMING_SOURCE;
  readonly conventions: typeof TIMING_CONVENTIONS;
  readonly aspects: HorarySignificatorAspects;
  /** Actual cusp circuit when enabled; disabled timing does not consume it for placements. */
  readonly cusps: readonly number[];
  readonly assessments: readonly TimingAssessment[];
}

function assess(aspect: SignificatorAspect, aspects: HorarySignificatorAspects, cusps: readonly number[],
  policy: HoraryTimingPolicy): TimingAssessment {
  let status: TimingAssessment["status"];
  let explanation: string;
  let degreesToPerfection: number | null = null;
  let contact: AspectPerfectionCandidate | null = null;
  const hints: SymbolicTimingHint[] = [];
  if (!policy.enabled) {
    status = "disabled"; explanation = "Symbolic timing is disabled; no timing contact search or unit calculation was requested.";
  } else if (aspect.current.exact) {
    status = "exact-now"; degreesToPerfection = 0; contact = aspect.timeToPerfection;
    explanation = "This aspect is exact at the question instant. Its angular gap and elapsed contact time are zero; no future symbolic duration is inferred.";
  } else if (!aspect.current.withinOrb || aspect.current.motion !== "applying") {
    status = "no-current-application"; explanation = "There is no current in-orb application to time for this pair and aspect.";
  } else if (aspects.search.status !== "complete") {
    status = aspects.search.status === "refused" ? "aspect-search-refused" : "search-disabled";
    explanation = "The future contact search did not complete; no symbolic timing hint is emitted.";
  } else if (!aspect.timeToPerfection) {
    status = "contact-not-found"; explanation = "No contact on the current application's branch was found in the sampled horizon; no symbolic timing hint is emitted.";
  } else {
    contact = aspect.timeToPerfection;
    degreesToPerfection = aspect.current.orb;
    for (const [planet, longitude] of [[aspect.a, aspect.current.aLongitude], [aspect.b, aspect.current.bLongitude]] as const) {
      if (policy.basis !== "both" && !planet.roles.includes(policy.basis)) continue;
      // Index canonical degrees directly so wrapping cannot round a value just below an ingress into the next sign.
      const { slug: sign, modality } = SIGNS[Math.floor(longitude / 30)]!;
      const house = houseOf(longitude, cusps);
      const houseKind: TimingHouseKind = house % 3 === 1 ? "angular" : house % 3 === 2 ? "succedent" : "cadent";
      const scale = policy.units[modality][houseKind];
      if (scale !== false && degreesToPerfection * scale.unitsPerDegree === 0) {
        throw new RangeError("A nonzero symbolic timing quantity underflowed; choose a representable scale.");
      }
      const symbolic = scale === false ? null : Object.freeze({ ...scale, quantity: degreesToPerfection * scale.unitsPerDegree,
        origin: "caller-mapping" as const });
      hints.push(Object.freeze({ planet, longitude, sign, modality, house, houseKind,
        status: scale === false ? "unit-disabled" : "hint", symbolic,
        explanation: `${planet.planet} is in ${sign} (${modality}) and actual house ${house} (${houseKind}). ` +
          (symbolic ? `The caller's cell assigns ${symbolic.unitsPerDegree} ${symbolic.unit} per degree; ` +
            `${degreesToPerfection} degrees of current angular gap gives ${symbolic.quantity} symbolic ${symbolic.unit}. ` +
            "This is an optional symbolic hint, not elapsed UTC time, a calendar date or an outcome."
            : "This modality/house cell is disabled; no unit is inferred.") }));
    }
    status = hints.length === 0 ? "no-selected-basis" : hints.some(hint => hint.status === "hint") ? "hint" : "unit-disabled";
    explanation = status === "no-selected-basis" ? "Neither planet has the selected timing role; no planet basis is substituted."
      : status === "unit-disabled" ? "All selected modality/house cells are disabled; no unit is inferred."
      : `The current angular gap is ${degreesToPerfection} degrees. The sampled contact at ${contact.at} is ` +
        `${contact.elapsedDays} elapsed UTC days after the question. Symbolic quantities are separate caller-selected alternatives, ` +
        "not estimates of that elapsed time. Sign changes, stations and other perfection restrictions can interrupt this candidate; no outcome is inferred.";
  }
  return Object.freeze({ a: aspect.a, b: aspect.b, type: aspect.type, status, degreesToPerfection, contact,
    hints: Object.freeze(hints), explanation });
}

function evaluate(longitudeAt: AspectLongitudeAt | null, result: HoraryCast, suppliedAspectPolicy: HoraryAspectPolicy,
  suppliedPolicy: HoraryTimingPolicy): HoraryTimingHints {
  const policy = validateTimingPolicy(suppliedPolicy);
  const aspectPolicy = validateAspectSearchPolicy(suppliedAspectPolicy);
  selectSignificators(result); // Validate the base cast and cusp shape/range before any provider call.
  const cusps = policy.enabled ? Array.from(result.chart.houses.cusps) : [];
  if (policy.enabled) {
    let wraps = 0;
    for (let i = 0; i < cusps.length; i++) {
      const next = cusps[(i + 1) % cusps.length]!;
      if (cusps[i] === next) throw new RangeError("Timing requires distinct, ordered cusps.");
      if (next < cusps[i]!) wraps++;
    }
    if (wraps !== 1) throw new RangeError("Timing requires one ordered cusp circuit.");
  }
  // Timing off must not spend an ephemeris/provider budget on otherwise unused future contacts.
  const effective = policy.enabled ? aspectPolicy : createAspectSearchPolicy({ ...aspectPolicyOptions(aspectPolicy), search: false });
  const aspects = longitudeAt === null ? evaluateSignificatorAspects(result, effective)
    : evaluateSignificatorAspectsWith(longitudeAt, result, effective);
  return Object.freeze({ schema: "horary.timing-hints/v1", questionId: aspects.questionId, policy,
    source: TIMING_SOURCE, conventions: TIMING_CONVENTIONS, aspects, cusps: Object.freeze(cusps),
    assessments: Object.freeze(aspects.aspects.map(aspect => assess(aspect, aspects, cusps, policy))) });
}
function aspectPolicyOptions(policy: HoraryAspectPolicy) {
  const { schema: _schema, ...options } = policy;
  return options;
}

/** Optional symbolic hints for pair contact candidates. Reuses engine exact aspects and contact timing. */
export function evaluateTimingHints(result: HoraryCast, aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(),
  policy: HoraryTimingPolicy = createTimingPolicy()): HoraryTimingHints {
  return evaluate(null, result, aspectPolicy, policy);
}
/** Independent motion-fixture boundary; provider consistency with the chart is the caller's responsibility. */
export function evaluateTimingHintsWith(longitudeAt: AspectLongitudeAt, result: HoraryCast,
  aspectPolicy: HoraryAspectPolicy = createAspectSearchPolicy(), policy: HoraryTimingPolicy = createTimingPolicy()): HoraryTimingHints {
  if (typeof longitudeAt !== "function") throw new RangeError("Timing longitude provider must be a function.");
  return evaluate(longitudeAt, result, aspectPolicy, policy);
}
