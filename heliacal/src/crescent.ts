import { optionsOf } from "../../src/sky/riseset.js";
import { ODEH_MODEL, evaluateOdeh } from "./odeh.js";
import type { OdehCriterion, OdehGeometry } from "./odeh.js";
import { YALLOP_MODEL, evaluateYallop } from "./yallop.js";
import type { YallopCriterion, YallopGeometry } from "./yallop.js";

export type CrescentModel = typeof YALLOP_MODEL.id | typeof ODEH_MODEL.id;

export type CrescentCriterionRequest =
  | { readonly model: typeof YALLOP_MODEL.id; readonly geometry: YallopGeometry }
  | { readonly model: typeof ODEH_MODEL.id; readonly geometry: OdehGeometry };

/** Narrow by model before interpreting a category, score or coordinate field. */
export type CrescentCriterion = Readonly<YallopCriterion> | Readonly<OdehCriterion>;

export function evaluateCrescent(request: Extract<CrescentCriterionRequest, { model: typeof YALLOP_MODEL.id }>): Readonly<YallopCriterion>;
export function evaluateCrescent(request: Extract<CrescentCriterionRequest, { model: typeof ODEH_MODEL.id }>): Readonly<OdehCriterion>;
export function evaluateCrescent(request: CrescentCriterionRequest): CrescentCriterion;
/**
 * Select an explicitly named pure criterion. The different input frames,
 * widths, scores and categories remain distinct; no category conversion,
 * automatic geometry conversion or default model is supplied.
 */
export function evaluateCrescent(request: CrescentCriterionRequest): CrescentCriterion {
  const input = optionsOf(request, ["model", "geometry"], "crescent criterion request");
  switch (input.model) {
    case YALLOP_MODEL.id: return evaluateYallop(input.geometry as YallopGeometry);
    case ODEH_MODEL.id: return evaluateOdeh(input.geometry as OdehGeometry);
    default: throw new RangeError("model must be yallop-1997/1 or odeh-2006/1.");
  }
}
