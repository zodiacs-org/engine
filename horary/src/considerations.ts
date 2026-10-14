import { HOUSE_SYSTEMS, houseOf } from "./engine.js";
import { normalizeHoraryInput } from "./input.js";
import { CONSIDERATION_RULE_IDS, CONSIDERATION_SOURCES, createRulePolicy, validateRulePolicy } from "./policy.js";
import type { ConsiderationRuleId, HoraryRulePolicy, RuleSource } from "./policy.js";
import type { HoraryCast } from "./types.js";
import { moonVoidOfCourseObservation } from "./void-of-course.js";
import type { MoonVoidOfCourseScan } from "./void-of-course.js";

export interface RuleEvidence {
  readonly fact: string;
  readonly value: number | boolean | string;
  readonly unit?: "degrees" | "house";
}

export interface ConsiderationObservation {
  readonly rule: ConsiderationRuleId;
  readonly status: "triggered" | "not-triggered" | "disabled";
  readonly source: RuleSource;
  readonly evidence: readonly RuleEvidence[];
  readonly explanation: string;
  /** Present only for an enabled void-of-course rule; ISO strings retain no mutable Dates. */
  readonly scan?: MoonVoidOfCourseScan;
}

export interface HoraryConsiderations {
  readonly schema: "horary.considerations/v1";
  readonly questionId: string;
  readonly policy: HoraryRulePolicy;
  /** All implemented rules, including those explicitly disabled, in catalog order. */
  readonly observations: readonly ConsiderationObservation[];
}

function longitude(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError(`${label} must be finite longitude in [0, 360).`);
  }
  return value;
}

/** Observe cautions; the enabled void-of-course rule scans the sky at the input instant. */
export function evaluateConsiderations(
  result: HoraryCast, suppliedPolicy: HoraryRulePolicy = createRulePolicy()
): HoraryConsiderations {
  if (!result || result.schema !== "horary.cast/v1") {
    throw new RangeError("Considerations require a horary.cast/v1 result.");
  }
  const input = normalizeHoraryInput(result.input);
  const policy = validateRulePolicy(suppliedPolicy);
  const chart = result.chart;
  const observations = CONSIDERATION_RULE_IDS.map((rule): ConsiderationObservation => {
    const source = CONSIDERATION_SOURCES[rule];
    if (!policy.rules[rule]) {
      return Object.freeze({ rule, source, status: "disabled", evidence: Object.freeze([]),
        explanation: "The caller disabled this consideration; its condition was not evaluated." });
    }
    if (rule === "moon-void-of-course") return moonVoidOfCourseObservation(input.instant);
    const evidence: RuleEvidence[] = [];
    let triggered: boolean;
    let explanation: string;
    if (rule === "early-ascendant" || rule === "late-ascendant") {
      const asc = longitude(chart?.angles?.asc, "Ascendant");
      const degree = asc % 30;
      const early = rule === "early-ascendant";
      const threshold = early ? 3 : 27;
      triggered = early ? degree < threshold : degree >= threshold;
      evidence.push({ fact: "ascendant-longitude", value: asc, unit: "degrees" },
        { fact: "degree-in-sign", value: degree, unit: "degrees" },
        { fact: early ? "exclusive-upper-bound" : "inclusive-lower-bound", value: threshold, unit: "degrees" });
      explanation = `The Ascendant is ${degree} degrees into its sign, ` +
        `${triggered ? "inside" : "outside"} the ${early ? "early [0, 3)" : "late [27, 30)"} ` +
        "degree interval in this Lilly-based policy. This is a geometric caution; " +
        "Lilly's personal-context exceptions are not evaluated.";
    } else {
      const planet = rule === "moon-via-combusta" ? "Moon" : "Saturn";
      if (!Array.isArray(chart?.bodies)) throw new RangeError("Considerations require chart body rows.");
      const rows = chart.bodies.filter((row) => row?.body === planet);
      if (rows.length !== 1) throw new RangeError(`Considerations require exactly one ${planet} row.`);
      const row = rows[0]!;
      const lon = longitude(row.lon, planet);
      evidence.push({ fact: "planet", value: planet }, { fact: "longitude", value: lon, unit: "degrees" });
      if (rule === "moon-via-combusta") {
        triggered = lon >= 195 && lon < 225;
        evidence.push({ fact: "inclusive-lower-bound", value: 195, unit: "degrees" },
          { fact: "exclusive-upper-bound", value: 225, unit: "degrees" });
        explanation = `The Moon at ${lon} degrees is ${triggered ? "inside" : "outside"} ` +
          "the [195, 225) degree Via Combusta interval. This policy follows the variant " +
          "Lilly reports, without a fixed-star exception.";
      } else {
        const houses = chart.houses;
        if (!houses || !(HOUSE_SYSTEMS as readonly unknown[]).includes(houses.system) ||
            !Array.isArray(houses.cusps) || houses.cusps.length !== 12) {
          throw new RangeError("Saturn considerations require a supported actual house system and twelve cusps.");
        }
        const cusps = Array.from(houses.cusps, (cusp) => longitude(cusp, "House cusp"));
        let wraps = 0;
        for (let i = 0; i < cusps.length; i++) {
          const current = cusps[i]!;
          const next = cusps[(i + 1) % cusps.length]!;
          if (current === next) throw new RangeError("Saturn considerations require distinct, ordered cusps.");
          if (next < current) wraps++;
        }
        if (wraps !== 1) throw new RangeError("Saturn considerations require one ordered circuit of cusps.");
        if (typeof row.retrograde !== "boolean") throw new RangeError("Saturn requires a boolean retrograde flag.");
        const house = houseOf(lon, cusps);
        const target = rule === "saturn-first" ? 1 : 7;
        triggered = house === target;
        evidence.push({ fact: "actual-house-system", value: houses.system },
          { fact: "house", value: house, unit: "house" }, { fact: "target-house", value: target, unit: "house" },
          { fact: "retrograde", value: row.retrograde });
        explanation = `Saturn at ${lon} degrees occupies house ${house} under actual ${houses.system} cusps, ` +
          `${triggered ? "matching" : "not matching"} the house ${target} caution ` +
          "Lilly attributes to Arabic authors. " +
          (target === 1 ? "Lilly emphasizes retrograde Saturn; the condition applies to either direction." :
            "This placement rule remains enabled for seventh-house questions unless the caller disables it.");
      }
    }
    return Object.freeze({ rule, source, status: triggered ? "triggered" : "not-triggered",
      evidence: Object.freeze(evidence.map((fact) => Object.freeze(fact))), explanation });
  });
  return Object.freeze({ schema: "horary.considerations/v1", questionId: input.question.id,
    policy, observations: Object.freeze(observations) });
}
