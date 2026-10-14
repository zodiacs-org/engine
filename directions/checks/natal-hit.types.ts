import { hitFromNatal, type NatalHitSelection, type NatalHitResult } from "../src/natal-hit.js";
import type { NatalSnapshot } from "../src/natal.js";

const selection = {
  convention: { system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct", key: "ptolemy" },
  significator: { kind: "body", id: "Moon" }, promissor: { kind: "body", id: "Sun" },
  contact: { kind: "conjunction" }, yearUnit: "julian-365.25-days"
} as const satisfies NatalHitSelection;

// Compile-only contracts, never invoked by the test runner.
function contracts(snapshot: NatalSnapshot, result: NatalHitResult): void {
  hitFromNatal(snapshot, selection);
  hitFromNatal(snapshot, { ...selection, significator: { kind: "angle", angle: "asc" } });
  // @ts-expect-error The snapshot provides geometry; selection cannot replace it.
  hitFromNatal(snapshot, { ...selection, geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 } });
  // @ts-expect-error A selected body has an id only; snapshot coordinates cannot be replaced.
  hitFromNatal(snapshot, { ...selection, promissor: { kind: "body", id: "Sun", coordinates: { longitudeDegrees: 0, latitudeDegrees: 0 } } });
  // @ts-expect-error A mundane branch cannot be combined with a zodiacal convention.
  hitFromNatal(snapshot, { ...selection, contact: { kind: "aspect", aspect: "square", branch: "westward" } });
  // @ts-expect-error The solar key requires solar samples.
  hitFromNatal(snapshot, { ...selection, convention: { ...selection.convention, key: "solar-equatorial-birth-day" } });
  // @ts-expect-error Fixed keys forbid solar even as explicit undefined.
  hitFromNatal(snapshot, { ...selection, solar: undefined });
  // @ts-expect-error Promissors are bodies, not angles.
  hitFromNatal(snapshot, { ...selection, promissor: { kind: "angle", angle: "mc" } });
  if (result.status === "ok") {
    // @ts-expect-error The returned natal geometry is readonly.
    result.natal.geometry.ramcDegrees = 0;
    // @ts-expect-error The returned provenance is deeply readonly.
    result.natal.provenance.ephemeris.version = "changed";
    // @ts-expect-error The retained ecliptic latitude is readonly.
    result.natal.promissor.ecliptic.latitudeDegrees = 0;
  } else if (result.stage === "natal") {
    const code: "invalid-snapshot" | "missing-body" | "ambiguous-body" | "inconsistent-snapshot"
      | "undefined-right-ascension" | "polar-geometry" = result.code;
    void code;
  }
}
void contracts;
