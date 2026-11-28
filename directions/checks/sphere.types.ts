import { hourAngleDegrees, semiArcs, spherePosition, SphereGeometryError } from "../src/index.js";

type SphereInput = Parameters<typeof spherePosition>[0];
type Position = ReturnType<typeof spherePosition>;
type Arcs = ReturnType<typeof semiArcs>;

const valid = {
  ramcDegrees: 45, rightAscensionDegrees: 0,
  latitudeDegrees: 0, declinationDegrees: 0
} as const satisfies SphereInput;

const { ramcDegrees: _ramc, ...noRamc } = valid;
const { rightAscensionDegrees: _ra, ...noRa } = valid;
const { latitudeDegrees: _latitude, ...noLatitude } = valid;
const { declinationDegrees: _declination, ...noDeclination } = valid;
// @ts-expect-error RAMC cannot be inferred from right ascension.
const missingRamc: SphereInput = noRamc;
// @ts-expect-error Right ascension is required explicitly.
const missingRa: SphereInput = noRa;
// @ts-expect-error Geographic latitude cannot default to the equator.
const missingLatitude: SphereInput = noLatitude;
// @ts-expect-error Declination cannot default to the celestial equator.
const missingDeclination: SphereInput = noDeclination;
// @ts-expect-error Coordinates are numbers with explicitly named units.
const stringRamc: SphereInput = { ...valid, ramcDegrees: "45" };
// @ts-expect-error Longitude is not a substitute for right ascension.
const unrelatedLongitude: SphereInput = { ...valid, longitudeDegrees: 45 };

// Never called: these checks compile the public API and immutable metadata.
function readonlyGeometry(position: Position, arcs: Arcs, error: SphereGeometryError): void {
  const hour: number = hourAngleDegrees(45, 0);
  const output: Position = spherePosition(valid);
  const semis: Arcs = semiArcs(0, 0);
  // @ts-expect-error Both hour-angle inputs are required.
  hourAngleDegrees(45);
  // @ts-expect-error Both semi-arc inputs are required.
  semiArcs(0);
  // @ts-expect-error Position inputs cannot be omitted.
  spherePosition();
  // @ts-expect-error Snapshots are readonly.
  position.ramcDegrees = 0;
  // @ts-expect-error Computed coordinates are readonly.
  position.semiArcPositionDegrees = 0;
  // @ts-expect-error Nested semi-arcs are readonly.
  position.semiArcs.diurnalSemiArcDegrees = 0;
  // @ts-expect-error Standalone semi-arcs are readonly.
  arcs.nocturnalSemiArcDegrees = 0;
  // @ts-expect-error Refusal codes are readonly.
  error.code = "invalid-input";
  if (position.kind === "boundary") {
    const boundary: "upper-meridian" | "setting" | "lower-meridian" | "rising" = position.boundary;
    const quadrant: null = position.quadrant;
    const fraction: null = position.quadrantFraction;
    const distance: null = position.meridianDistanceDegrees;
    const semiArc: null = position.semiArcDegrees;
    void [boundary, quadrant, fraction, distance, semiArc];
  } else {
    const boundary: null = position.boundary;
    const quadrant: "above-east" | "above-west" | "below-west" | "below-east" = position.quadrant;
    const fraction: number = position.quadrantFraction;
    const distance: number = position.meridianDistanceDegrees;
    const semiArc: number = position.semiArcDegrees;
    void [boundary, quadrant, fraction, distance, semiArc];
  }
  void [hour, output, semis];
}
void [missingRamc, missingRa, missingLatitude, missingDeclination,
  stringRamc, unrelatedLongitude, readonlyGeometry];
