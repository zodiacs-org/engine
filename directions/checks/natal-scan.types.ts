import { scanFromNatal, parseNatalScan, type NatalScanInput, type NatalScanResult,
  type NatalScanRow, type NatalScanRefusal } from "../src/index.js";
import type { NatalSnapshot } from "../src/natal.js";

const selection = { significator: { kind: "body", id: "Moon" }, promissor: { kind: "body", id: "Sun" },
  contact: { kind: "aspect", aspect: "square", branch: "dexter" } } as const;
const request = {
  convention: { system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", key: "ptolemy" },
  selections: [selection], motions: [{ motion: "direct" }], yearUnit: "julian-365.25-days",
  ageRange: { fromYears: 0, toYears: 100, includeFrom: true, includeTo: false }, maxEvaluations: 20
} as const satisfies NatalScanInput;

function contracts(snapshot: NatalSnapshot, result: NatalScanResult): void {
  const typed: NatalScanResult = scanFromNatal(snapshot, request);
  const parsed: NatalScanResult = parseNatalScan(snapshot, { unknown: true });
  // @ts-expect-error The snapshot supplies geometry, not the scan request.
  scanFromNatal(snapshot, { ...request, geometry: { ramcDegrees: 0, latitudeDegrees: 0 } });
  // @ts-expect-error Coordinates cannot replace a selected snapshot body.
  scanFromNatal(snapshot, { ...request, selections: [{ ...selection, promissor: { ...selection.promissor, coordinates: { longitudeDegrees: 0, latitudeDegrees: 0 } } }] });
  // @ts-expect-error The common convention cannot carry a motion.
  scanFromNatal(snapshot, { ...request, convention: { ...request.convention, motion: "direct" } });
  // @ts-expect-error Zodiacal contacts cannot use a mundane aspect branch.
  scanFromNatal(snapshot, { ...request, selections: [{ ...selection, contact: { kind: "aspect", aspect: "square", branch: "westward" } }] });
  // @ts-expect-error Solar timing needs explicitly provided samples.
  scanFromNatal(snapshot, { ...request, convention: { ...request.convention, key: "solar-equatorial-birth-day" } });
  // @ts-expect-error A fixed timing key forbids even undefined solar samples.
  scanFromNatal(snapshot, { ...request, solar: undefined });
  // @ts-expect-error Converse requires its named construction.
  scanFromNatal(snapshot, { ...request, motions: [{ motion: "converse" }] });
  if (result.status === "complete") {
    const row: NatalScanRow = result.hits[0]!;
    // @ts-expect-error Rows and their natal provenance remain readonly.
    row.hit.natal.provenance.ephemeris.version = "changed";
    // @ts-expect-error Results contain an immutable row array.
    result.hits.push(row);
  } else {
    const refused: NatalScanRefusal = result;
    if (refused.code === "hit-refused" && refused.cause.stage === "natal") {
      const code: "invalid-snapshot" | "missing-body" | "ambiguous-body" | "inconsistent-snapshot"
        | "undefined-right-ascension" | "polar-geometry" = refused.cause.code;
      void code;
    }
  }
  void [typed, parsed];
}
void contracts;
