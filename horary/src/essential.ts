import { essentialDignities, mutualReceptions, sectOf } from "./engine.js";
import type { ClassicalPlanet, EssentialDignity, PlanetDignities, Sect } from "./engine.js";
import {
  DEFAULT_ESSENTIAL_WEIGHTS, ESSENTIAL_SCORE_RULES, ESSENTIAL_SCORE_SOURCE,
  ESSENTIAL_TABLE_CONVENTION, RECEPTION_SOURCE, createEssentialPolicy, validateEssentialPolicy
} from "./essential-policy.js";
import type { EssentialScoreRule, EssentialWeight, HoraryEssentialPolicy } from "./essential-policy.js";
import type { RuleSource } from "./policy.js";
import { selectSignificators } from "./significators.js";
import type { HoraryCast, HorarySignificators, SignificatorRole } from "./types.js";

export interface EssentialContribution {
  readonly rule: EssentialScoreRule;
  readonly present: boolean;
  readonly status: "applied" | "not-present" | "disabled";
  readonly weight: EssentialWeight;
  readonly points: number;
  readonly weightOrigin: "lilly-table" | "caller-override";
  readonly source: RuleSource;
  readonly explanation: string;
}
export interface SignificatorCondition extends PlanetDignities {
  readonly roles: readonly SignificatorRole[];
  readonly contributions: readonly EssentialContribution[];
  readonly score: number;
  readonly explanation: string;
}
export interface DirectionalReception {
  readonly host: ClassicalPlanet;
  readonly guest: ClassicalPlanet;
  readonly guestLongitude: number;
  readonly guestSign: PlanetDignities["sign"];
  readonly dignities: readonly EssentialDignity[];
  readonly status: "received" | "not-received" | "disabled";
  readonly source: RuleSource;
  readonly explanation: string;
}
export interface HoraryMutualReception {
  readonly a: ClassicalPlanet;
  readonly b: ClassicalPlanet;
  readonly aReceivesB: readonly EssentialDignity[];
  readonly bReceivesA: readonly EssentialDignity[];
  readonly source: RuleSource;
  readonly explanation: string;
}
export interface HoraryEssentialCondition {
  readonly schema: "horary.essential-condition/v1";
  readonly questionId: string;
  readonly policy: HoraryEssentialPolicy;
  readonly conventions: typeof ESSENTIAL_TABLE_CONVENTION;
  readonly significators: HorarySignificators;
  readonly sect: Readonly<{ value: Sect; ascendant: number; sunLongitude: number; explanation: string }>;
  readonly conditions: readonly SignificatorCondition[];
  /** Each ordered pair of distinct physical significators, including absent/disabled reception. */
  readonly directionalReceptions: readonly DirectionalReception[];
  readonly mutualReceptions: readonly HoraryMutualReception[];
}

function longitude(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError(`${label} must be finite longitude in [0, 360).`);
  }
  return value;
}

/** Pure analysis of supplied chart geometry; does not calculate an ephemeris or issue a verdict. */
export function evaluateEssentialCondition(
  result: HoraryCast, suppliedPolicy: HoraryEssentialPolicy = createEssentialPolicy()
): HoraryEssentialCondition {
  const policy = validateEssentialPolicy(suppliedPolicy);
  const significators = selectSignificators(result);
  const chart = result.chart;
  const ascendant = longitude(chart?.angles?.asc, "Ascendant");
  if (!Array.isArray(chart?.bodies)) throw new RangeError("Essential analysis requires chart body rows.");
  const lonByPlanet = new Map<ClassicalPlanet, number>();
  const required = new Set<ClassicalPlanet>(["Sun", ...significators.planets.map(({ planet }) => planet)]);
  for (const planet of required) {
    const rows = chart.bodies.filter((row) => row?.body === planet);
    if (rows.length !== 1) throw new RangeError(`Essential analysis requires exactly one ${planet} row.`);
    lonByPlanet.set(planet, longitude(rows[0]!.lon, planet));
  }
  const sunLongitude = lonByPlanet.get("Sun")!;
  const sect = sectOf(ascendant, sunLongitude);
  const conditions = significators.planets.map(({ planet, roles }): SignificatorCondition => {
    const facts = essentialDignities(planet, lonByPlanet.get(planet)!, sect);
    const contributions = ESSENTIAL_SCORE_RULES.map((rule): EssentialContribution => {
      const present = rule === "peregrine" ? facts.peregrine :
        rule === "detriment" || rule === "fall" ? facts.debilities.includes(rule) : facts.dignities.includes(rule);
      const weight = policy.weights[rule];
      const status = weight === false ? "disabled" : present ? "applied" : "not-present";
      const points = weight !== false && present ? weight : 0;
      return Object.freeze({ rule, present, status, weight, points,
        weightOrigin: weight === DEFAULT_ESSENTIAL_WEIGHTS[rule] ? "lilly-table" : "caller-override",
        source: ESSENTIAL_SCORE_SOURCE,
        explanation: `${planet} at ${facts.lon} degrees in ${facts.sign} ` +
          (rule === "peregrine" ? `${present ? "is" : "is not"} peregrine` : `${present ? "has" : "does not have"} ${rule}`) +
          ` under the stated engine tables and ${sect} sect. ` +
          (weight === false ? "The caller disabled this scoring rule." :
            `The configured weight is ${weight}; this rule contributes ${points} points.`)
      });
    });
    const score = contributions.reduce((sum, item) => sum + item.points, 0);
    if (!Number.isFinite(score)) throw new RangeError("Configured essential weights overflow the score.");
    return Object.freeze({ ...facts, roles, contributions: Object.freeze(contributions), score,
      explanation: `${planet} holds the ${roles.join(", ")} roles; its own-position essential score is ${score}. ` +
        "The score is a configurable description of condition, without an outcome judgement or reception bonus." });
  });

  const directionalReceptions: DirectionalReception[] = [];
  for (const host of conditions) {
    for (const guest of conditions) {
      if (host.planet === guest.planet) continue;
      const enabled = policy.receptionDignities.length > 0;
      const dignities = enabled ? essentialDignities(host.planet, guest.lon, sect).dignities
        .filter((dignity) => policy.receptionDignities.includes(dignity)) : [];
      directionalReceptions.push(Object.freeze({
        host: host.planet, guest: guest.planet, guestLongitude: guest.lon, guestSign: guest.sign,
        dignities: Object.freeze(dignities), status: !enabled ? "disabled" : dignities.length ? "received" : "not-received",
        source: RECEPTION_SOURCE,
        explanation: !enabled ? "The caller disabled every reception dignity; reception was not evaluated." :
          `${guest.planet} is at ${guest.lon} degrees in ${guest.sign}; ${host.planet} ` +
          (dignities.length ? `receives ${guest.planet} by ${dignities.join(", ")}, holding those dignities at the guest's longitude.` :
            `holds none of the selected dignities there and does not receive ${guest.planet} under this policy.`)
      }));
    }
  }
  const mutual = policy.receptionDignities.length ? mutualReceptions(
    conditions.map(({ planet, lon }) => ({ body: planet, lon })), { dignities: policy.receptionDignities, sect }
  ) : [];
  const mutualRows = mutual.map((pair): HoraryMutualReception => Object.freeze({ ...pair,
    source: RECEPTION_SOURCE,
    explanation: `${pair.a} receives ${pair.b} by ${pair.aReceivesB.join(", ")}; ` +
      `${pair.b} receives ${pair.a} by ${pair.bReceivesA.join(", ")}. ` +
      "This records mutual dignity hosting without requiring an aspect or establishing perfection."
  }));
  return Object.freeze({ schema: "horary.essential-condition/v1", questionId: significators.questionId,
    policy, conventions: ESSENTIAL_TABLE_CONVENTION, significators,
    sect: Object.freeze({ value: sect, ascendant, sunLongitude,
      explanation: `Engine sectOf assigns ${sect} sect from Sun longitude ${sunLongitude} and Ascendant ${ascendant} degrees. ` +
        "It uses the ecliptic horizon half-circle; the descendant belongs to day and the Ascendant to night." }),
    conditions: Object.freeze(conditions), directionalReceptions: Object.freeze(directionalReceptions),
    mutualReceptions: Object.freeze(mutualRows)
  });
}
