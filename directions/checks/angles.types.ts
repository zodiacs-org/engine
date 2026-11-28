import { angleConjunctionArc, AngleDirectionError } from "../src/index.js";
import type { AngleConjunctionInput, AngleConjunctionArc, DirectionAngle } from "../src/index.js";

const valid = {
  coordinates: { ramcDegrees: 315, rightAscensionDegrees: 0, latitudeDegrees: 0, declinationDegrees: 0 },
  angle: "mc", motion: "direct"
} as const satisfies AngleConjunctionInput;

// The input expresses this historical choice so callers receive a typed refusal.
const explicitConverse = {
  ...valid, motion: "converse", converseConstruction: "placidus-role-swap"
} as const satisfies AngleConjunctionInput;
const { angle: _angle, ...noAngle } = valid;
const { motion: _motion, ...noMotion } = valid;
const { coordinates: _coordinates, ...noCoordinates } = valid;
// @ts-expect-error The angular target is required.
const missingAngle: AngleConjunctionInput = noAngle;
// @ts-expect-error Direct or converse construction cannot be inferred.
const missingMotion: AngleConjunctionInput = noMotion;
// @ts-expect-error Explicit equatorial coordinates are required.
const missingCoordinates: AngleConjunctionInput = noCoordinates;
// @ts-expect-error Converse must explicitly name its construction.
const implicitConverse: AngleConjunctionInput = { ...valid, motion: "converse" };
// @ts-expect-error Reverse rotation is not the Placidus role-swap construction.
const reverseRotation: AngleConjunctionInput = { ...valid, motion: "converse", converseConstruction: "reverse-rotation" };
// @ts-expect-error Direct motion must not carry a converse toggle.
const mixed: AngleConjunctionInput = { ...valid, converseConstruction: "placidus-role-swap" };
// @ts-expect-error A missing toggle must be absent rather than explicitly undefined.
const undefinedToggle: AngleConjunctionInput = { ...valid, converseConstruction: undefined };
// @ts-expect-error Angle identifiers are explicit lower-case choices.
const otherAngle: AngleConjunctionInput = { ...valid, angle: "vertex" };
// @ts-expect-error Timing is outside the arc primitive's contract.
const prematureKey: AngleConjunctionInput = { ...valid, key: "ptolemy" };

// Never called: compile the exported result shape and readonly audit metadata.
function readonlyArc(result: AngleConjunctionArc, input: AngleConjunctionInput, error: AngleDirectionError): void {
  const computed: AngleConjunctionArc = angleConjunctionArc(valid);
  const angle: DirectionAngle = result.angle;
  const kind: "conjunction-to-angle" = result.kind;
  const motion: "direct" = result.motion;
  const construction: "placidus-direct" = result.construction;
  const turns: 0 | 1 = result.geometry.wholeTurnsAdded;
  const rotation: "westward" = result.geometry.rotation;
  // @ts-expect-error Input is required.
  angleConjunctionArc();
  // @ts-expect-error Input choices are readonly.
  input.angle = "asc";
  // @ts-expect-error Coordinates are readonly.
  input.coordinates.declinationDegrees = 0;
  // @ts-expect-error Arcs are immutable snapshots.
  result.arcDegrees = 0;
  // @ts-expect-error Geometry metadata is readonly.
  result.geometry.targetHourAngleDegrees = 0;
  // @ts-expect-error Initial coordinates are readonly.
  result.geometry.initial.hourAngleDegrees = 0;
  // @ts-expect-error Nested semi-arcs are readonly.
  result.geometry.initial.semiArcs.diurnalSemiArcDegrees = 90;
  // @ts-expect-error Error codes are readonly.
  error.code = "invalid-input";
  void [computed, angle, kind, motion, construction, turns, rotation];
}
void [explicitConverse, missingAngle, missingMotion, missingCoordinates, implicitConverse,
  reverseRotation, mixed, undefinedToggle, otherAngle, prematureKey, readonlyArc];
