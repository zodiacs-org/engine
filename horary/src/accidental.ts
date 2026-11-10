import { exactSign, houseOf, sectOf } from "./engine.js";
import type { ClassicalPlanet, HouseNumber, Sect } from "./engine.js";
import {
  ACCIDENTAL_CONVENTIONS, ACCIDENTAL_SCORE_RULES, ACCIDENTAL_SCORE_SOURCE, ACCIDENTAL_SECT_SOURCE,
  ACCIDENTAL_SPEED_SOURCE, DEFAULT_ACCIDENTAL_WEIGHTS, DEFAULT_MEAN_DAILY_MOTION,
  createAccidentalPolicy, validateAccidentalPolicy
} from "./accidental-policy.js";
import type { AccidentalScoreRule, AccidentalWeight, HoraryAccidentalPolicy } from "./accidental-policy.js";
import type { RuleSource } from "./policy.js";
import { selectSignificators } from "./significators.js";
import type { HoraryCast, HorarySignificators, SignificatorRole } from "./types.js";

export interface AccidentalContribution {
  readonly rule: AccidentalScoreRule;
  readonly present: boolean;
  readonly status: "applied" | "not-present" | "not-applicable" | "disabled";
  readonly weight: AccidentalWeight;
  readonly points: number;
  readonly weightOrigin: "lilly-table" | "caller-override" | "project-default-disabled";
  readonly source: RuleSource;
  readonly explanation: string;
}
export interface AccidentalCondition {
  readonly planet: ClassicalPlanet;
  readonly roles: readonly SignificatorRole[];
  readonly longitude: number;
  readonly house: HouseNumber;
  readonly speed: number;
  readonly motion: "direct" | "retrograde" | "stationary";
  readonly rate: "swift" | "slow" | "mean" | "stationary";
  readonly meanDailyMotion: number;
  readonly rateOrigin: "lilly-mean-motion" | "caller-override";
  readonly rateSource: RuleSource;
  readonly planetarySect: Sect | "indeterminate";
  readonly sectMatch: boolean | null;
  readonly contributions: readonly AccidentalContribution[];
  readonly score: number;
  readonly explanation: string;
}
export interface HoraryAccidentalCondition {
  readonly schema: "horary.accidental-condition/v1";
  readonly questionId: string;
  readonly policy: HoraryAccidentalPolicy;
  readonly conventions: typeof ACCIDENTAL_CONVENTIONS;
  readonly significators: HorarySignificators;
  readonly cusps: readonly number[];
  readonly sect: Readonly<{ value: Sect; ascendant: number; sunLongitude: number }>;
  readonly conditions: readonly AccidentalCondition[];
}

function longitude(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError(`${label} must be finite longitude in [0, 360).`);
  }
  return value;
}

function planetarySect(planet: ClassicalPlanet, lon: number, sun: number): Sect | "indeterminate" {
  if (planet === "Mercury") {
    // Decide on the exact supplied doubles. Adding 360 before a modulo
    // would erase small nonzero separations near conjunction/opposition.
    const difference = exactSign([lon, -sun]);
    const aboveOpposition = exactSign([lon, -sun, -180]);
    const belowOpposition = exactSign([lon, -sun, 180]);
    if (difference === 0 || aboveOpposition === 0 || belowOpposition === 0) return "indeterminate";
    return (difference < 0 && belowOpposition > 0) || aboveOpposition > 0 ? "day" : "night";
  }
  return planet === "Sun" || planet === "Jupiter" || planet === "Saturn" ? "day" : "night";
}

/** Pure scoring of engine chart rows; no sky recalculation, station search or outcome judgement. */
export function evaluateAccidentalCondition(
  result: HoraryCast, suppliedPolicy: HoraryAccidentalPolicy = createAccidentalPolicy()
): HoraryAccidentalCondition {
  const policy = validateAccidentalPolicy(suppliedPolicy);
  const significators = selectSignificators(result);
  const chart = result.chart;
  const ascendant = longitude(chart?.angles?.asc, "Ascendant");
  const cusps = Array.from(chart.houses.cusps);
  let wraps = 0;
  for (let i = 0; i < cusps.length; i++) {
    const current = cusps[i]!;
    const next = cusps[(i + 1) % cusps.length]!;
    if (current === next) throw new RangeError("Accidental analysis requires distinct, ordered cusps.");
    if (next < current) wraps++;
  }
  if (wraps !== 1) throw new RangeError("Accidental analysis requires one ordered circuit of cusps.");
  if (!Array.isArray(chart?.bodies)) throw new RangeError("Accidental analysis requires chart body rows.");
  const rows = new Map<ClassicalPlanet, { lon: number; speed: number | null }>();
  const selected = new Set(significators.planets.map(({ planet }) => planet));
  for (const planet of new Set<ClassicalPlanet>(["Sun", ...selected])) {
    const matches = chart.bodies.filter((row) => row?.body === planet);
    if (matches.length !== 1) throw new RangeError(`Accidental analysis requires exactly one ${planet} row.`);
    const row = matches[0]!;
    const lon = longitude(row.lon, planet);
    let speed: number | null = null;
    if (selected.has(planet)) {
      if (typeof row.speed !== "number" || !Number.isFinite(row.speed)) {
        throw new RangeError("Selected planet speeds must be finite degrees/day.");
      }
      if ((planet === "Sun" || planet === "Moon") && row.speed < 0) {
        throw new RangeError("Sun and Moon speeds cannot be retrograde in this chart convention.");
      }
      speed = row.speed;
    }
    rows.set(planet, { lon, speed });
  }
  const sunLongitude = rows.get("Sun")!.lon;
  const sect = sectOf(ascendant, sunLongitude);
  const conditions = significators.planets.map(({ planet, roles }): AccidentalCondition => {
    const { lon, speed: inputSpeed } = rows.get(planet)!;
    const speed = inputSpeed!;
    const house = houseOf(lon, cusps);
    const magnitude = Math.abs(speed);
    const motion = magnitude <= policy.stationarySpeed ? "stationary" : speed < 0 ? "retrograde" : "direct";
    const meanDailyMotion = policy.meanDailyMotion[planet];
    const rate = motion === "stationary" ? "stationary" : magnitude === meanDailyMotion ? "mean" :
      magnitude > meanDailyMotion ? "swift" : "slow";
    const planetSect = planetarySect(planet, lon, sunLongitude);
    const sectMatch = planetSect === "indeterminate" ? null : planetSect === sect;
    const contributions = ACCIDENTAL_SCORE_RULES.map((rule): AccidentalContribution => {
      let applicable = true;
      let present: boolean;
      let evidence: string;
      if (rule.startsWith("house-")) {
        present = rule === `house-${house}`;
        evidence = `Engine houseOf places ${planet} at ${lon} degrees in house ${house} under actual ${chart.houses.system} cusps.`;
      } else if (rule === "direct" || rule === "retrograde") {
        applicable = planet !== "Sun" && planet !== "Moon";
        present = applicable && motion === rule;
        evidence = `${planet} has speed ${speed} degrees/day and is ${motion} under stationary tolerance ${policy.stationarySpeed} degrees/day. ` +
          (applicable ? "Direction is scored separately from speed magnitude." : "Lilly excludes the luminaries from direction scoring.");
      } else if (rule === "swift" || rule === "slow") {
        present = rate === rule;
        evidence = `${planet}'s absolute speed ${magnitude} degrees/day is classified ${rate}, compared with ` +
          `${meanDailyMotion} degrees/day; stationary speeds and equality receive no rate points.`;
      } else {
        applicable = sectMatch !== null;
        present = applicable && (rule === "in-sect" ? sectMatch === true : sectMatch === false);
        evidence = `${planet}'s planetary sect is ${planetSect}; engine sectOf assigns the chart ${sect} sect. ` +
          "This is a chart-sect match only; any numerical weight is the caller's convention.";
      }
      const weight = policy.weights[rule];
      const status = weight === false ? "disabled" : !applicable ? "not-applicable" : present ? "applied" : "not-present";
      const points = weight !== false && present ? weight : 0;
      const isSect = rule === "in-sect" || rule === "out-of-sect";
      return Object.freeze({ rule, present, status, weight, points,
        weightOrigin: weight !== DEFAULT_ACCIDENTAL_WEIGHTS[rule] ? "caller-override" :
          isSect ? "project-default-disabled" : "lilly-table",
        source: isSect ? ACCIDENTAL_SECT_SOURCE : ACCIDENTAL_SCORE_SOURCE,
        explanation: evidence + " " + (weight === false ? "This scoring rule is disabled under the selected policy." :
          `The configured weight is ${weight}; this rule contributes ${points} points.`)
      });
    });
    const score = contributions.reduce((sum, { points }) => sum + points, 0);
    if (!Number.isFinite(score)) throw new RangeError("Configured accidental weights overflow the score.");
    return Object.freeze({ planet, roles, longitude: lon, house, speed, motion, rate, meanDailyMotion,
      rateOrigin: meanDailyMotion === DEFAULT_MEAN_DAILY_MOTION[planet] ? "lilly-mean-motion" : "caller-override",
      rateSource: ACCIDENTAL_SPEED_SOURCE, planetarySect: planetSect, sectMatch,
      contributions: Object.freeze(contributions), score,
      explanation: `${planet} holds the ${roles.join(", ")} roles and has accidental score ${score} ` +
        "under the selected house, motion and sect policy, counted once for this physical planet. " +
        "This partial condition score establishes no perfection or outcome."
    });
  });
  return Object.freeze({ schema: "horary.accidental-condition/v1", questionId: significators.questionId,
    policy, conventions: ACCIDENTAL_CONVENTIONS, significators, cusps: Object.freeze(cusps),
    sect: Object.freeze({ value: sect, ascendant, sunLongitude }), conditions: Object.freeze(conditions) });
}
