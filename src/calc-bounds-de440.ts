/**
 * Measured bounds for the positions calc() takes from the shipped DE440 pack
 * (src/calc.ts, `packGives`): for each body, the largest angle, arcseconds,
 * between the pack's apparent geocentric direction and JPL Horizons's, rounded
 * up to two significant figures.
 *
 * The arbiter is the conformance suite's 240 L1 vectors
 * (conformance/vectors/L1-positions.json): Horizons's apparent geocentric
 * places from DE441 for ten bodies at 24 TT instants from 1851 to 2148,
 * carried into the IAU 2006/2000A true ecliptic of date
 * (conformance/arbiters/l1/). calc-bounds-de440.test.ts recomputes every row
 * from those vectors and fails unless this table is what it finds, so a row
 * is never this engine's own output held against itself.
 *
 * What the table does not cover, and calc() therefore reports as not
 * compared (`value: null`): the distance, the speeds, and the true node and
 * its opposite point, for none of which the suite has a vector. Twenty-four
 * instants a body are few; a denser comparison may find a larger difference.
 */
export const DE440_MEASURED_BASIS =
  "largest angle from JPL Horizons's apparent geocentric place (DE441) at the conformance suite's L1 vectors, 24 TT instants a body from 1851 to 2148, in the true ecliptic of date, on the shipped DE440 pack; src/calc-bounds-de440.ts";
/** The basis in any other frame, where the same bound is an estimate. */
export const DE440_TURNED_BASIS =
  "the bound measured in the true ecliptic of date (JPL Horizons, DE441, the conformance suite's L1 vectors, on the shipped DE440 pack), which this frame is reached from with the engine's own nutation and precession, not compared in this frame; src/calc-bounds-de440.ts";

/** Arcseconds. Mars to Pluto are planetary-system barycentres on both sides. */
export const DE440_MEASURED: Readonly<Record<string, number>> = {
  Jupiter: 0.0038,
  Mars: 0.0034,
  Mercury: 0.0037,
  Moon: 0.013,
  Neptune: 0.0035,
  Pluto: 0.0035,
  Saturn: 0.0035,
  Sun: 0.0037,
  Uranus: 0.0038,
  Venus: 0.0038
};
