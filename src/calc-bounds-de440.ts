/**
 * Measured bounds for the positions calc() takes from the shipped DE440 pack
 * (src/calc.ts, `packGives`): for each body, the larger of two largest
 * angles, arcseconds, between the pack's apparent geocentric direction and an
 * arbiter's, rounded up to two significant figures.
 *
 * - JPL Horizons: the conformance suite's 240 L1 vectors
 *   (conformance/vectors/L1-positions.json), Horizons's apparent geocentric
 *   places from DE441 for ten bodies at 24 TT instants from 1851 to 2148,
 *   carried into the IAU 2006/2000A true ecliptic of date
 *   (conformance/arbiters/l1/).
 * - From 1.1.0-rc.12, NAIF's de440.bsp at noon TT of each of the 146,097 days
 *   from 1800-01-01 to 2199-12-31, in all eight frames: the dense sweep's
 *   reduction (docs/evidence/de440-sweep-20261111/tools/sweep.py, light time,
 *   the Sun's light deflection as erfa.ld with erfa.ldsun's limiter and none
 *   behind the Sun's disc, as Horizons, erfa.ab, ERFA's IAU 2006/2000A
 *   frames), run on this build (docs/evidence/1.1.0-rc.12-20261115/sweep-pack/).
 *   It finds up to 0.00395″ for every body but the Moon, over the 24
 *   instants' 0.0034″ to 0.0038″: the engine's IAU 2000B nutation against
 *   ERFA's 2000A, in the frames of date.
 *
 * calc-bounds-de440.test.ts recomputes the L1 rows and reads the sweep's
 * committed summary, and fails unless this table is what they give, so a row
 * is never this engine's own output held against itself; the DE440 sweep
 * workflow holds each new run on the pack to it (check_pack.py).
 *
 * At the Sun's limb calc() quotes DE440_AT_LIMB instead (below). What the
 * table does not cover, and calc() therefore reports as not compared
 * (`value: null`): the distance, the speeds, and the true node and its
 * opposite point.
 */
export const DE440_MEASURED_BASIS =
  "largest angle from JPL Horizons's apparent geocentric place (DE441) at the conformance suite's L1 vectors, 24 TT instants a body from 1851 to 2148, in the true ecliptic of date, and from NAIF's de440.bsp at noon TT every day from 1800 to 2199 in all eight frames, the larger, on the shipped DE440 pack; src/calc-bounds-de440.ts";
/** The basis in any other frame, where the bound is an estimate: Horizons was compared in the true ecliptic of date only. */
export const DE440_TURNED_BASIS =
  "the bound measured in the true ecliptic of date (JPL Horizons, DE441, the conformance suite's L1 vectors; NAIF's de440.bsp every day from 1800 to 2199, which also covers this frame), on the shipped DE440 pack, reached in this frame with the engine's own nutation and precession; Horizons not compared in this frame; src/calc-bounds-de440.ts";

/** Arcseconds. Mars to Pluto are planetary-system barycentres on both sides. */
export const DE440_MEASURED: Readonly<Record<string, number>> = {
  Jupiter: 0.004,
  Mars: 0.004,
  Mercury: 0.004,
  Moon: 0.013,
  Neptune: 0.004,
  Pluto: 0.004,
  Saturn: 0.0039,
  Sun: 0.004,
  Uranus: 0.004,
  Venus: 0.004
};

/**
 * At the Sun's limb (from 1.1.0-rc.12), arcseconds. The pack's reduction
 * bends no light from a planet behind the Sun's disc, as JPL Horizons does
 * not (src/de440/reduce.ts), so the place steps at the limb by the
 * deflection there, at most 4GM/c²R = 1.7512″. Horizons's own edge was
 * found 0.06″ to 0.17″ inside this engine's at five limb crossings
 * (docs/evidence/1.1.0-rc.12-20261115/near-sun/), so within DE440_LIMB_BAND
 * of the limb the two may put a planet on different sides of it, and its
 * bound is this, an estimate: the step and the body's own bound, rounded up
 * to two significant figures.
 */
export const DE440_AT_LIMB = 1.8;
/** How near the Sun's limb, arcseconds of the apparent separation from the Sun's centre, a planet takes DE440_AT_LIMB. */
export const DE440_LIMB_BAND = 3;
export const DE440_AT_LIMB_BASIS =
  "within 3 arcseconds of the Sun's limb, where JPL Horizons and this engine may put the planet on different sides of it and so apply the light deflection there (at most 4GM/c^2R = 1.7512 arcseconds) in one and not the other: the step and the body's own bound, an estimate; src/calc-bounds-de440.ts";
