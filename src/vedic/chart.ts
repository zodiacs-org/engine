import { resolvedChart } from "../api.js";
import type { BirthInput, Chart } from "../types.js";
import { definitionOf } from "./ayanamsa.js";
import type { AyanamsaDefinition, AyanamsaName } from "./ayanamsa.js";
import { siderealChartOf } from "./sidereal.js";
import type { SiderealChart } from "./sidereal.js";

/**
 * The chart's bodies, angles and cusps as sidereal longitudes, with the
 * ayanamsa at the chart's instant on its ΔT clock. The ayanamsa is checked
 * first; a supplied Chart is checked as `transits` checks one. Whole-sign
 * cusps are rebuilt from the sidereal ascendant's sign.
 */
export function siderealChart(natal: Chart | BirthInput, ayanamsa: AyanamsaName | AyanamsaDefinition): SiderealChart {
  const definition = definitionOf(ayanamsa);
  return siderealChartOf(resolvedChart(natal).chart, definition);
}
