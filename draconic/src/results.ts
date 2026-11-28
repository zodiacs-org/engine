import type { BirthInput } from "../../src/index.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import type { NatalEnvelope, NatalEnvelopeContext } from "../../src/receipt.js";
import { compareNatal } from "./compare.js";
import type { NatalDraconicComparison } from "./compare.js";
import { castNatal } from "./engine-adapter.js";
import type { DraconicOptions, SelectedNorthNode } from "./engine-adapter.js";
import { transformNatal } from "./transform.js";
import type { DraconicChart } from "./transform.js";

/** This library's derivation metadata, outside the engine's natal receipt. */
export interface DraconicConventions {
  schema: "zodiacs.draconic-conventions.draft-v1";
  sourceZodiac: "tropical";
  units: "degrees";
  longitudeRange: "[0, 360)";
  northNode: SelectedNorthNode;
  northNodeTargetLongitude: 0;
  rotation: "subtract-natal-north-node-longitude;wrap-to-[0,360)";
  arithmetic: "binary64;positive-zero;rounded-360-to-zero";
  houses: "rotate-existing-natal-cusps;preserve-order-and-computed-system;no-recast";
  latitude: "unchanged";
  motion: "position-snapshot;no-derived-speeds";
  receiptScope: "engine-natal-only;draconic-derived-by-this-library";
}

export interface DraconicChartResult {
  /** Unaltered engine natal envelope, including its tropical positions. */
  natal: NatalEnvelope;
  conventions: DraconicConventions;
  draconic: DraconicChart;
}

export interface DraconicComparisonResult {
  natal: NatalEnvelope;
  conventions: DraconicConventions;
  comparison: NatalDraconicComparison;
}

function conventionsFor(node: SelectedNorthNode): DraconicConventions {
  return {
    schema: "zodiacs.draconic-conventions.draft-v1",
    sourceZodiac: "tropical", units: "degrees", longitudeRange: "[0, 360)",
    northNode: { ...node }, northNodeTargetLongitude: 0,
    rotation: "subtract-natal-north-node-longitude;wrap-to-[0,360)",
    arithmetic: "binary64;positive-zero;rounded-360-to-zero",
    houses: "rotate-existing-natal-cusps;preserve-order-and-computed-system;no-recast",
    latitude: "unchanged", motion: "position-snapshot;no-derived-speeds",
    receiptScope: "engine-natal-only;draconic-derived-by-this-library"
  };
}

/**
 * Cast once, capture the engine's natal envelope and rotate that same chart.
 * No I/O or runtime discovery. Context is checked by the engine receipt codec;
 * source spelling, local resolution and provenance are explicit caller claims.
 * The engine receipt does not describe or authenticate the draconic result.
 */
export function draconicChart(
  birth: BirthInput,
  options: DraconicOptions = {},
  context: NatalEnvelopeContext = {}
): DraconicChartResult {
  const source = castNatal(birth, options);
  const natal = createNatalEnvelope(source.natal, context);
  const draconic = transformNatal(source);
  return { natal, conventions: conventionsFor(source.node), draconic };
}

/** Cast once and attach a natal-only receipt to structured coordinate deltas. */
export function draconicCompare(
  birth: BirthInput,
  options: DraconicOptions = {},
  context: NatalEnvelopeContext = {}
): DraconicComparisonResult {
  const source = castNatal(birth, options);
  const natal = createNatalEnvelope(source.natal, context);
  const comparison = compareNatal(source);
  return { natal, conventions: conventionsFor(source.node), comparison };
}
