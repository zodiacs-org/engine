import { chartPoints, natalChart } from "../../src/index.js";
import type { BirthInput, Chart } from "../../src/index.js";

export type NodeChoice = "true" | "mean";

export interface DraconicOptions {
  /** True north node by default. Mean north node requires explicit selection. */
  node?: NodeChoice;
}

export type SelectedNorthNode = {
  kind: "true";
  enginePoint: "North Node";
  longitude: number;
} | {
  kind: "mean";
  enginePoint: "Mean Node";
  longitude: number;
};

export interface NatalForDraconic {
  /** The engine's original tropical chart, with canonical input and flags. */
  natal: Chart;
  /** Natal tropical longitude, in degrees, of the chosen north node. */
  node: SelectedNorthNode;
}

function nodeChoice(options: DraconicOptions): NodeChoice {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Draconic options must be an object.");
  }
  if (Object.keys(options).some((key) => key !== "node")) {
    throw new RangeError('Draconic options only support "node".');
  }
  const choice = options.node;
  if (choice === undefined) return "true";
  if (choice !== "true" && choice !== "mean") {
    throw new RangeError('Node must be "true" or "mean".');
  }
  return choice;
}

/**
 * Cast a natal tropical chart using the engine and select its north node.
 * Does not rotate positions. Birth validation and semantic flags belong to
 * natalChart; chartPoints reads the mean node on that same chart's clock.
 */
export function castNatal(
  birth: BirthInput,
  options: DraconicOptions = {}
): NatalForDraconic {
  const choice = nodeChoice(options);
  const natal = natalChart(birth);
  const longitude = choice === "true"
    ? natal.bodies.find((body) => body.body === "North Node")?.lon
    : chartPoints(natal).points.find((point) => point.point === "Mean Node")?.lon;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < 0 || longitude >= 360) {
    throw new RangeError("Engine did not return a valid north-node longitude.");
  }
  const node: SelectedNorthNode = choice === "true"
    ? { kind: choice, enginePoint: "North Node", longitude }
    : { kind: choice, enginePoint: "Mean Node", longitude };
  return { natal, node };
}
