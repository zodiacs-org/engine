import { zodiacalBodyArc, ZodiacalDirectionError } from "../src/index.js";
import type {
  DirectionEclipticPoint, ZodiacalGeometryInput, ZodiacalContact, ZodiacalBodyInput,
  ZodiacalPreparedPoint, ZodiacalBodyArc, ZodiacalDirectionErrorCode
} from "../src/index.js";

const valid = {
  system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
  geometry: { ramcDegrees: 0, latitudeDegrees: 35, trueObliquityDegrees: 23.5 },
  significator: { longitudeDegrees: 30, latitudeDegrees: 4 },
  promissor: { longitudeDegrees: 70, latitudeDegrees: -3 }, contact: { kind: "conjunction" }
} as const satisfies ZodiacalBodyInput;
const explicitConverse = {
  ...valid, motion: "converse", converseConstruction: "placidus-role-swap"
} as const satisfies ZodiacalBodyInput;
const { system: _system, ...noSystem } = valid;
const { mode: _mode, ...noMode } = valid;
const { latitude: _latitude, ...noLatitude } = valid;
const { motion: _motion, ...noMotion } = valid;
const { geometry: _geometry, ...noGeometry } = valid;
const { significator: _significator, ...noSignificator } = valid;
const { promissor: _promissor, ...noPromissor } = valid;
const { contact: _contact, ...noContact } = valid;
// @ts-expect-error The direction system is explicit.
const missingSystem: ZodiacalBodyInput = noSystem;
// @ts-expect-error The zodiacal mode is explicit.
const missingMode: ZodiacalBodyInput = noMode;
// @ts-expect-error The projection policy is explicit.
const missingLatitude: ZodiacalBodyInput = noLatitude;
// @ts-expect-error Direction motion cannot be inferred.
const missingMotion: ZodiacalBodyInput = noMotion;
// @ts-expect-error Natal geometry is required.
const missingGeometry: ZodiacalBodyInput = noGeometry;
// @ts-expect-error Both roles are required.
const missingSignificator: ZodiacalBodyInput = noSignificator;
// @ts-expect-error Both roles are required.
const missingPromissor: ZodiacalBodyInput = noPromissor;
// @ts-expect-error The contact kind cannot be inferred.
const missingContact: ZodiacalBodyInput = noContact;
// @ts-expect-error Every geometry field is required, including obliquity.
const missingObliquity: ZodiacalGeometryInput = { ramcDegrees: 0, latitudeDegrees: 35 };
// @ts-expect-error RAMC is not inferred from the remaining geometry.
const missingRamc: ZodiacalGeometryInput = { latitudeDegrees: 35, trueObliquityDegrees: 23.5 };
// @ts-expect-error The observer latitude is required.
const missingObserverLatitude: ZodiacalGeometryInput = { ramcDegrees: 0, trueObliquityDegrees: 23.5 };
// @ts-expect-error A projected point still records its original latitude.
const missingBodilyLatitude: DirectionEclipticPoint = { longitudeDegrees: 30 };
// @ts-expect-error Both bodily coordinates are required.
const missingLongitude: DirectionEclipticPoint = { latitudeDegrees: 4 };
// @ts-expect-error Converse must name its construction even though this solver refuses it.
const implicitConverse: ZodiacalBodyInput = { ...valid, motion: "converse" };
// @ts-expect-error Direct and converse construction choices cannot be mixed.
const mixedMotion: ZodiacalBodyInput = { ...valid, converseConstruction: "placidus-role-swap" };
// @ts-expect-error An absent converse option cannot be supplied as undefined.
const undefinedConstruction: ZodiacalBodyInput = { ...valid, converseConstruction: undefined };
// @ts-expect-error Reverse rotation is a different, unsupported construction.
const reverseRotation: ZodiacalBodyInput = { ...valid, motion: "converse", converseConstruction: "reverse-rotation" };
// @ts-expect-error Mundane geometry has its own solver.
const mundane: ZodiacalBodyInput = { ...valid, mode: "mundane" };
// @ts-expect-error Retaining latitude is not this explicit projection policy.
const retainedLatitude: ZodiacalBodyInput = { ...valid, latitude: "retain-both" };
// @ts-expect-error The arc primitive does not silently select a timing key.
const prematureKey: ZodiacalBodyInput = { ...valid, key: "ptolemy" };
// @ts-expect-error Sextile, square and trine need a branch.
const missingBranch: ZodiacalContact = { kind: "aspect", aspect: "square" };
// @ts-expect-error Conjunction has no aspect ray branch.
const conjunctionBranch: ZodiacalContact = { kind: "conjunction", branch: "dexter" };
// @ts-expect-error Opposition has one ray, so a branch would be meaningless.
const oppositionBranch: ZodiacalContact = { kind: "aspect", aspect: "opposition", branch: "sinister" };
// @ts-expect-error A missing branch is not an explicit undefined branch.
const undefinedBranch: ZodiacalContact = { kind: "aspect", aspect: "square", branch: undefined };
// @ts-expect-error Only the supported ecliptic aspects belong in this union.
const unsupportedAspect: ZodiacalContact = { kind: "aspect", aspect: "quincunx", branch: "dexter" };

// Never executed: compile public result contracts and recursively readonly data.
function readonlyArc(result: ZodiacalBodyArc, input: ZodiacalBodyInput, error: ZodiacalDirectionError): void {
  const computed: ZodiacalBodyArc = zodiacalBodyArc(valid);
  const kind: "conjunction-to-body" | "aspect-to-body" = result.kind;
  const motion: "direct" = result.motion;
  const construction: "placidus-direct" = result.construction;
  const projection: "@zodiacs/engine:eclipticToEquatorial" = result.geometry.projection;
  const moving: "promissor-ray" = result.geometry.movingRole;
  const fixed: "significator" = result.geometry.fixedRole;
  const rotation: "westward" = result.geometry.rotation;
  const turns: 0 | 1 = result.geometry.wholeTurnsAdded;
  const point: ZodiacalPreparedPoint = result.geometry.promissor;
  const projectedLatitude: 0 = point.latitudeDegrees;
  const code: ZodiacalDirectionErrorCode = error.code;
  // @ts-expect-error Input is required.
  zodiacalBodyArc();
  // @ts-expect-error Conventions are immutable input choices.
  input.motion = "direct";
  // @ts-expect-error Input geometry is readonly.
  input.geometry.trueObliquityDegrees = 0;
  // @ts-expect-error Input bodily coordinates are readonly.
  input.significator.latitudeDegrees = 0;
  // @ts-expect-error Results are immutable snapshots.
  result.arcDegrees = 0;
  // @ts-expect-error Original coordinates are immutable too.
  result.promissor.longitudeDegrees = 0;
  // @ts-expect-error Contact choices are immutable.
  result.contact.kind = "conjunction";
  // @ts-expect-error Projection and transfer metadata are readonly.
  result.geometry.targetHourAngleDegrees = 0;
  // @ts-expect-error Prepared point data are readonly.
  result.geometry.promissor.rightAscensionDegrees = 0;
  // @ts-expect-error Quadrant metadata is readonly.
  result.geometry.significator.position.hourAngleDegrees = 0;
  // @ts-expect-error Semi-arc metadata is readonly.
  result.geometry.significator.position.semiArcs.diurnalSemiArcDegrees = 90;
  // @ts-expect-error Error codes are readonly.
  error.code = "invalid-input";
  void [computed, kind, motion, construction, projection, moving, fixed, rotation, turns, point, projectedLatitude, code];
}
void [explicitConverse, missingSystem, missingMode, missingLatitude, missingMotion, missingGeometry,
  missingSignificator, missingPromissor, missingContact, missingObliquity, missingRamc,
  missingObserverLatitude, missingBodilyLatitude, missingLongitude,
  implicitConverse, mixedMotion, undefinedConstruction, reverseRotation, mundane, retainedLatitude,
  prematureKey, missingBranch, conjunctionBranch, oppositionBranch, undefinedBranch, unsupportedAspect, readonlyArc];
