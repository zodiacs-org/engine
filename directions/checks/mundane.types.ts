import { mundaneBodyArc, MundaneDirectionError } from "../src/index.js";
import type {
  DirectionEquatorialPoint, MundaneGeometryInput, MundaneContact, MundaneBodyInput,
  MundaneBodyArc, MundaneDirectionErrorCode, SpherePosition, SphereQuadrant, SphereBoundary
} from "../src/index.js";

const valid = {
  system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", motion: "direct",
  geometry: { ramcDegrees: 0, latitudeDegrees: 35 },
  significator: { rightAscensionDegrees: 30, declinationDegrees: 4 },
  promissor: { rightAscensionDegrees: 70, declinationDegrees: -3 }, contact: { kind: "conjunction" }
} as const satisfies MundaneBodyInput;
const converse = {
  ...valid, motion: "converse", converseConstruction: "placidus-role-swap"
} as const satisfies MundaneBodyInput;
const { system: _system, ...noSystem } = valid;
const { mode: _mode, ...noMode } = valid;
const { latitude: _latitude, ...noLatitude } = valid;
const { motion: _motion, ...noMotion } = valid;
const { geometry: _geometry, ...noGeometry } = valid;
const { significator: _significator, ...noSignificator } = valid;
const { promissor: _promissor, ...noPromissor } = valid;
const { contact: _contact, ...noContact } = valid;
// @ts-expect-error The direction system is explicit.
const missingSystem: MundaneBodyInput = noSystem;
// @ts-expect-error Mundane mode is explicit.
const missingMode: MundaneBodyInput = noMode;
// @ts-expect-error Latitude retention is explicit.
const missingLatitude: MundaneBodyInput = noLatitude;
// @ts-expect-error Direction motion cannot be inferred.
const missingMotion: MundaneBodyInput = noMotion;
// @ts-expect-error Natal geometry is required.
const missingGeometry: MundaneBodyInput = noGeometry;
// @ts-expect-error Both original roles are required.
const missingSignificator: MundaneBodyInput = noSignificator;
// @ts-expect-error Both original roles are required.
const missingPromissor: MundaneBodyInput = noPromissor;
// @ts-expect-error The contact kind cannot be inferred.
const missingContact: MundaneBodyInput = noContact;
// @ts-expect-error RAMC cannot be inferred from observer latitude.
const missingRamc: MundaneGeometryInput = { latitudeDegrees: 35 };
// @ts-expect-error Observer latitude is required explicitly.
const missingObserverLatitude: MundaneGeometryInput = { ramcDegrees: 0 };
// @ts-expect-error Bodily declination cannot default to zero.
const missingDeclination: DirectionEquatorialPoint = { rightAscensionDegrees: 30 };
// @ts-expect-error Right ascension must be given in degrees.
const missingRightAscension: DirectionEquatorialPoint = { declinationDegrees: 4 };
// @ts-expect-error This solver takes the complete equatorial body, not ecliptic coordinates.
const eclipticPoint: DirectionEquatorialPoint = { longitudeDegrees: 30, latitudeDegrees: 4 };
// @ts-expect-error The solver does no obliquity projection.
const extraObliquity: MundaneGeometryInput = { ...valid.geometry, trueObliquityDegrees: 23.5 };
// @ts-expect-error Converse must name its construction.
const implicitConverse: MundaneBodyInput = { ...valid, motion: "converse" };
// @ts-expect-error Direct and converse construction choices cannot be mixed.
const mixedMotion: MundaneBodyInput = { ...valid, converseConstruction: "placidus-role-swap" };
// @ts-expect-error An absent converse choice cannot be supplied as undefined.
const undefinedConstruction: MundaneBodyInput = { ...valid, converseConstruction: undefined };
// @ts-expect-error Reverse rotation is not the role-swap construction.
const reverseRotation: MundaneBodyInput = { ...valid, motion: "converse", converseConstruction: "reverse-rotation" };
// @ts-expect-error Zodiacal geometry has a separate solver.
const zodiacalMode: MundaneBodyInput = { ...valid, mode: "zodiacal" };
// @ts-expect-error Mundane coordinates retain both bodily declinations.
const projectedLatitude: MundaneBodyInput = { ...valid, latitude: "zero-both" };
// @ts-expect-error Timing keys belong to a later conversion, not this arc primitive.
const prematureKey: MundaneBodyInput = { ...valid, key: "ptolemy" };
// @ts-expect-error Sextile, square and trine require an explicit branch.
const missingBranch: MundaneContact = { kind: "aspect", aspect: "square" };
// @ts-expect-error Conjunction has no branch.
const conjunctionBranch: MundaneContact = { kind: "conjunction", branch: "westward" };
// @ts-expect-error Opposition has one geometric contact.
const oppositionBranch: MundaneContact = { kind: "aspect", aspect: "opposition", branch: "eastward" };
// @ts-expect-error An explicit undefined value does not choose a branch.
const undefinedBranch: MundaneContact = { kind: "aspect", aspect: "square", branch: undefined };
// @ts-expect-error Ecliptic branch terminology cannot silently choose a mundane branch.
const zodiacalBranch: MundaneContact = { kind: "aspect", aspect: "square", branch: "dexter" };
// @ts-expect-error Unsupported aspects are not admitted.
const unsupportedAspect: MundaneContact = { kind: "aspect", aspect: "quincunx", branch: "westward" };

// Never executed: enforce public result contracts and recursively readonly data.
function readonlyArc(result: MundaneBodyArc, input: MundaneBodyInput, error: MundaneDirectionError): void {
  const computed: MundaneBodyArc = mundaneBodyArc(valid);
  const reverse: MundaneBodyArc = mundaneBodyArc(converse);
  const kind: "conjunction-to-body" | "aspect-to-body" = result.kind;
  const motion: "direct" | "converse" = result.motion;
  const construction: "placidus-direct" | "placidus-role-swap" = result.construction;
  const moving: "promissor" | "significator" = result.geometry.movingRole;
  const fixed: "promissor" | "significator" = result.geometry.fixedRole;
  const definition: "placidus-proportional-semiarc" = result.geometry.positionDefinition;
  const branchReference: "original-promissor-to-significator" = result.geometry.branchReference;
  const rotation: "westward" = result.geometry.rotation;
  const turns: 0 | 1 = result.geometry.wholeTurnsAdded;
  const point: SpherePosition = result.geometry.promissor;
  const quadrant: SphereQuadrant | null = result.geometry.targetQuadrant;
  const boundary: SphereBoundary | null = result.geometry.targetBoundary;
  const fraction: number | null = result.geometry.targetMeridianFraction;
  const semiArc: number | null = result.geometry.targetSemiArcDegrees;
  const code: MundaneDirectionErrorCode = error.code;
  // @ts-expect-error Input is required.
  mundaneBodyArc();
  // @ts-expect-error Input conventions are readonly.
  input.motion = "direct";
  // @ts-expect-error Input geometry is readonly.
  input.geometry.latitudeDegrees = 0;
  // @ts-expect-error Input bodily coordinates are readonly.
  input.significator.declinationDegrees = 0;
  // @ts-expect-error Result snapshots are readonly.
  result.arcDegrees = 0;
  // @ts-expect-error Original coordinates are readonly.
  result.promissor.rightAscensionDegrees = 0;
  // @ts-expect-error Contact choices are readonly.
  result.contact.kind = "conjunction";
  // @ts-expect-error Audit metadata is readonly.
  result.geometry.targetHourAngleDegrees = 0;
  // @ts-expect-error Sphere position metadata is readonly.
  result.geometry.promissor.hourAngleDegrees = 0;
  // @ts-expect-error Nested semi-arc metadata is readonly.
  result.geometry.significator.semiArcs.diurnalSemiArcDegrees = 90;
  // @ts-expect-error Error codes are readonly.
  error.code = "invalid-input";
  void [computed, reverse, kind, motion, construction, moving, fixed, definition,
    branchReference, rotation, turns, point, quadrant, boundary, fraction, semiArc, code];
}
void [missingSystem, missingMode, missingLatitude, missingMotion, missingGeometry,
  missingSignificator, missingPromissor, missingContact, missingRamc, missingObserverLatitude,
  missingDeclination, missingRightAscension, eclipticPoint, extraObliquity, implicitConverse,
  mixedMotion, undefinedConstruction, reverseRotation, zodiacalMode, projectedLatitude,
  prematureKey, missingBranch, conjunctionBranch, oppositionBranch, undefinedBranch,
  zodiacalBranch, unsupportedAspect, readonlyArc];
