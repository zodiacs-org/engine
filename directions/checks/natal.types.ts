import type { DirectionNatalInput, NatalSnapshot } from "../src/index.js";

const valid = {
  utc: "2000-01-01T12:00:00Z", timeScale: "utc", timeKnown: true,
  latitude: 35, longitude: 20, houseSystem: "placidus"
} as const satisfies DirectionNatalInput;

const { utc: _utc, ...noInstant } = valid;
const { timeKnown: _known, ...noKnownTime } = valid;
const { timeScale: _scale, ...noScale } = valid;
const { latitude: _latitude, ...noLatitude } = valid;
const { longitude: _longitude, ...noLongitude } = valid;
const { houseSystem: _system, ...noHouses } = valid;
// @ts-expect-error A natal instant is required.
const missingInstant: DirectionNatalInput = noInstant;
// @ts-expect-error A known natal time is required explicitly.
const missingKnown: DirectionNatalInput = noKnownTime;
// @ts-expect-error The input clock cannot default to UTC.
const missingScale: DirectionNatalInput = noScale;
// @ts-expect-error Both coordinates are required.
const missingLatitude: DirectionNatalInput = noLatitude;
// @ts-expect-error Both coordinates are required.
const missingLongitude: DirectionNatalInput = noLongitude;
// @ts-expect-error The engine house system cannot be inferred.
const missingHouses: DirectionNatalInput = noHouses;
// @ts-expect-error An unknown time cannot supply direction geometry.
const unknownTime: DirectionNatalInput = { ...valid, timeKnown: false };
// @ts-expect-error Longitude must be numeric.
const stringPlace: DirectionNatalInput = { ...valid, longitude: "20" };

// This function is never called. Compilation checks nested output immutability.
function readonlySnapshot(snapshot: NatalSnapshot): void {
  const instant: string = snapshot.chart.input.utc;
  const mc: number = snapshot.chart.angles.mc;
  const cusp: number | undefined = snapshot.chart.houses.cusps[0];
  // @ts-expect-error The normalized instant is a string, not a mutable Date.
  snapshot.chart.input.utc.setTime(0);
  // @ts-expect-error Nested inputs are readonly.
  snapshot.chart.input.latitude = 0;
  // @ts-expect-error Body arrays are readonly.
  snapshot.chart.bodies.push(snapshot.chart.bodies[0]!);
  // @ts-expect-error Body rows are readonly.
  snapshot.chart.bodies[0]!.lon = 0;
  // @ts-expect-error House cusp arrays are readonly.
  snapshot.chart.houses.cusps[0] = 0;
  // @ts-expect-error Angles are readonly.
  snapshot.chart.angles.mc = 0;
  // @ts-expect-error Equatorial rows are readonly.
  snapshot.equatorial.rows[0]!.dec = 0;
  // @ts-expect-error The nested policy remains readonly.
  snapshot.equatorial.orbPolicy.orb = 0;
  // @ts-expect-error Geometry is readonly.
  snapshot.geometry.ramcDegrees = 0;
  // @ts-expect-error Time-basis metadata is readonly.
  snapshot.chart.deltaT.seconds = 0;
  // @ts-expect-error Nested ephemeris provenance is readonly.
  snapshot.provenance.ephemeris.version = "other";
  void [instant, mc, cusp];
}
void [missingInstant, missingKnown, missingScale, missingLatitude, missingLongitude,
  missingHouses, unknownTime, stringPlace, readonlySnapshot];
