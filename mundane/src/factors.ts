import type { ClassicalPlanet, EssentialDignity } from "../../src/techniques/dignities.js";
import type { Sect, ZodiacSign } from "../../src/types.js";
import { analyzeAngleRulers } from "./angle-rulers.js";
import type { AngleRulerAnalysis } from "./angle-rulers.js";
import { analyzeAngularity } from "./angularity.js";
import type { AngleName, AngularityAnalysis, AngularityGeometry, AngularityOptions } from "./angularity.js";

interface FactorText {
  readonly id: string;
  readonly text: string;
}

/** Sources are JSON pointers relative to the containing ChartFactorAnalysis/event. */
export type ChartFactor = FactorText & (
  | { readonly kind: "angular-planet"; readonly planet: ClassicalPlanet;
      readonly source: `/angularity/planets/${number}` }
  | { readonly kind: "angle-ruler"; readonly angle: AngleName; readonly ruler: ClassicalPlanet;
      readonly source: `/angleRulers/rulers/${number}` }
  | { readonly kind: "house-system-fallback"; readonly source: "/angularity/houses" }
);

export interface FactorList {
  readonly label: "traditional conventions, not predictions";
  readonly convention: "descriptive-factors;no-ranking-or-score";
  readonly items: readonly ChartFactor[];
}

export interface ChartFactorAnalysis {
  readonly angularity: AngularityAnalysis;
  readonly angleRulers: AngleRulerAnalysis;
  readonly factors: FactorList;
}

const ANGLE_LABELS: Readonly<Record<AngleName, string>> = Object.freeze({
  asc: "ascendant", mc: "midheaven", dsc: "descendant", ic: "lower meridian"
});

function signLabel(sign: ZodiacSign): string {
  return sign[0]!.toUpperCase() + sign.slice(1);
}

function dignityLabel(dignity: EssentialDignity, sect: Sect): string {
  switch (dignity) {
    case "triplicity": return `${sect} triplicity`;
    case "term": return "Egyptian term";
    case "face": return "Chaldean face";
    default: return dignity;
  }
}

/**
 * Describe engine-backed analyses of supplied geometry without casting a chart.
 * Each source points to the exact row used for the text. Input validation and
 * angle-orb semantics are those of the existing analysis helpers. No supplied
 * prose, dignity annotations, or sect metadata are used.
 */
export function analyzeFactors(
  chart: AngularityGeometry, options: AngularityOptions = {}
): ChartFactorAnalysis {
  const angularity = analyzeAngularity(chart, options);
  const angleRulers = analyzeAngleRulers(chart);
  const items: ChartFactor[] = [];
  const { requested, actual } = angularity.houses;
  if (requested !== actual) {
    items.push(Object.freeze({
      kind: "house-system-fallback", id: "house-system-fallback", source: "/angularity/houses",
      text: `Requested ${requested} houses; chart uses ${actual} houses. Angular house factors use ${actual}.`
    }));
  }
  angularity.planets.forEach((row, index) => {
    if (!row.angular) return;
    const reasons: string[] = [];
    if (row.angularHouse) reasons.push(`in angular house ${row.house} (${actual} houses)`);
    if (row.nearAngles.length > 0) {
      reasons.push(`within the configured longitude orb of: ${row.nearAngles.map(near => ANGLE_LABELS[near.angle]).join(", ")}`);
    }
    items.push(Object.freeze({
      kind: "angular-planet", id: `angular-planet:${row.planet}`, planet: row.planet,
      source: `/angularity/planets/${index}`, text: `${row.planet} is ${reasons.join("; ")}.`
    }));
  });
  angleRulers.rulers.forEach((row, index) => {
    const { dignities, debilities, peregrine, sect, sign } = row.condition;
    const held = dignities.map(dignity => dignityLabel(dignity, sect)).join(", ") || "none";
    const lacking = debilities.join(", ") || "none";
    const angle = ANGLE_LABELS[row.angle];
    items.push(Object.freeze({
      kind: "angle-ruler", id: `angle-ruler:${row.angle}`, angle: row.angle, ruler: row.ruler,
      source: `/angleRulers/rulers/${index}`,
      text: `The ${angle} in ${signLabel(row.sign)} is ruled by ${row.ruler}. ${row.ruler} in ${signLabel(sign)}: dignities ${held}; debilities ${lacking}${peregrine ? "; peregrine (no essential dignity)" : ""}.`
    }));
  });
  return Object.freeze({
    angularity, angleRulers,
    factors: Object.freeze({
      label: "traditional conventions, not predictions",
      convention: "descriptive-factors;no-ranking-or-score",
      items: Object.freeze(items)
    })
  });
}
