/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared. The
 * barycentric Sun is left out: calc.ts derives its bounds from the
 * barycentre's error.
 *
 * Each row rests on one of three bases:
 * - SWEPT_BASIS, the dense DE440 sweep: every row of the groups SWEPT names
 *   but the mean points (32 rows), from
 *   docs/evidence/de440-sweep-20261111/results/summary.json;
 * - MEAN_POINTS_BASIS (their rates MEAN_POINTS_SPEED_BASIS): the Mean Node,
 *   the Mean South Node and Black Moon Lilith (3 rows), and
 * - MEASURED_BASIS, 32 instants against JPL Horizons: every other row
 *   (60 rows, heliocentric and barycentric), both from
 *   docs/evidence/calc-api/rc16/summary.json.
 *
 * The topocentric rows of the Sun, the Moon and Mars (9 rows) are left out,
 * since the geocentric row of the same correction is at or above each of
 * their 32 instants' values: calc.ts gives that geocentric bound, labelled
 * estimated, as it does for every other topocentric body.
 *
 * Written by docs/evidence/de440-sweep-20261111/tools/write_bounds.py; do not
 * edit by hand. calc-bounds.test.ts checks that they agree.
 */
export const SWEPT_BASIS = "largest difference from JPL's DE440 found at noon TT on each of 146,097 days, JD 2378497.0 to 2524593.0 (TT), in all eight frames; docs/evidence/de440-sweep-20261111";
/** The groups whose rows, but the mean points', rest on SWEPT_BASIS. */
export const SWEPT: readonly string[] = ["geocentric/apparent", "geocentric/astrometric", "geocentric/geometric"];
export const MEASURED_BASIS = "largest difference from JPL Horizons (DE441) over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in all eight frames; docs/evidence/calc-api/rc16";
/** The basis of the mean node's, the mean south node's and Black Moon Lilith's bounds. */
export const MEAN_POINTS_BASIS = "largest difference from the same definition evaluated with ERFA's fundamental arguments (faom03, faf03, fal03) and nut06a's nutation in longitude, over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in all eight frames: a check of the implementation, not of an ephemeris; docs/evidence/calc-api/rc16";
/** The basis of their speed bounds, compared in the true ecliptic of date only. */
export const MEAN_POINTS_SPEED_BASIS = "largest difference from the rate of the same definition evaluated with ERFA's fundamental arguments (faom03, faf03, fal03) and nut06a's nutation in longitude, taken over 0.0001 day either side, over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in the true ecliptic of date only: a check of the implementation, not of an ephemeris; docs/evidence/calc-api/rc16";
type Rows = Readonly<Record<string, readonly [number, number | null, number | null]>>;
const BARYCENTRIC_APPARENT: Rows = {
  "Earth": [3.0, 1.4e-05, 0.18],
  "Jupiter": [13.0, 4e-05, 0.025],
  "Mars": [4.4, 2.1e-05, 0.08],
  "Mercury": [23.0, 7.7e-05, 5.4],
  "Moon": [3.0, 1.4e-05, 0.18],
  "Neptune": [21.0, 4.4e-05, 0.0063],
  "Pluto": [25.0, 6.1e-05, 0.0014],
  "Saturn": [19.0, 6.5e-05, 0.023],
  "Uranus": [19.0, 4.3e-05, 0.0086],
  "Venus": [7.4, 1.5e-05, 0.22]
};
const GEOCENTRIC_ASTROMETRIC: Rows = {
  "Jupiter": [17.0, 7.9e-05, 0.11],
  "Mars": [23.0, 8.7e-05, 0.74],
  "Mercury": [17.0, 7.8e-05, 3.6],
  "Moon": [12.0, 4.8e-05, 2.9],
  "Neptune": [22.0, 4.7e-05, 0.019],
  "Pluto": [30.0, 6.3e-05, 0.018],
  "Saturn": [24.0, 7.7e-05, 0.06],
  "Sun": [3.4, 1.7e-05, 0.24],
  "Uranus": [20.0, 5.6e-05, 0.03],
  "Venus": [24.0, 8.3e-05, 1.4]
};
const HELIOCENTRIC_APPARENT: Rows = {
  "Earth": [3.0, 1.5e-05, 0.18],
  "Jupiter": [13.0, 4e-05, 0.025],
  "Mars": [4.3, 2.3e-05, 0.079],
  "Mercury": [23.0, 8.7e-05, 5.4],
  "Moon": [3.0, 1.5e-05, 0.18],
  "Neptune": [21.0, 4.4e-05, 0.0063],
  "Pluto": [25.0, 6e-05, 0.0017],
  "Saturn": [18.0, 6.5e-05, 0.023],
  "Uranus": [19.0, 4.2e-05, 0.0091],
  "Venus": [6.6, 1.2e-05, 0.21]
};
export const MEASURED: Readonly<Record<string, Rows>> = {
  "barycentric/apparent": BARYCENTRIC_APPARENT,
  "barycentric/astrometric": BARYCENTRIC_APPARENT,
  "barycentric/geometric": {
    "Earth": [3.0, 1.4e-05, 0.18],
    "Jupiter": [13.0, 4e-05, 0.025],
    "Mars": [4.4, 2.1e-05, 0.08],
    "Mercury": [23.0, 7.7e-05, 5.4],
    "Moon": [3.0, 1.4e-05, 0.18],
    "Neptune": [21.0, 4.4e-05, 0.0063],
    "Pluto": [25.0, 6.1e-05, 0.0018],
    "Saturn": [19.0, 6.5e-05, 0.023],
    "Uranus": [19.0, 4.3e-05, 0.0086],
    "Venus": [7.4, 1.5e-05, 0.22]
  },
  "geocentric/apparent": {
    "Black Moon Lilith": [0.0023, null, 0.0032],
    "Jupiter": [17.0, 7.9e-05, 0.11],
    "Mars": [23.0, 8.7e-05, 0.74],
    "Mean Node": [0.0023, null, 0.00081],
    "Mean South Node": [0.0023, null, 0.00081],
    "Mercury": [17.0, 7.8e-05, 3.6],
    "Moon": [12.0, 0.00015, 2.9],
    "Neptune": [22.0, 4.7e-05, 0.019],
    "North Node": [33.0, null, null],
    "Pluto": [30.0, 6.3e-05, 0.018],
    "Saturn": [24.0, 7.7e-05, 0.06],
    "South Node": [33.0, null, null],
    "Sun": [3.4, 1.7e-05, 0.24],
    "Uranus": [20.0, 5.6e-05, 0.03],
    "Venus": [24.0, 8.3e-05, 1.4]
  },
  "geocentric/astrometric": GEOCENTRIC_ASTROMETRIC,
  "geocentric/geometric": GEOCENTRIC_ASTROMETRIC,
  "heliocentric/apparent": HELIOCENTRIC_APPARENT,
  "heliocentric/astrometric": HELIOCENTRIC_APPARENT,
  "heliocentric/geometric": {
    "Earth": [3.0, 1.5e-05, 0.18],
    "Jupiter": [13.0, 4e-05, 0.025],
    "Mars": [4.3, 2.3e-05, 0.079],
    "Mercury": [23.0, 8.7e-05, 5.4],
    "Moon": [3.0, 1.5e-05, 0.18],
    "Neptune": [21.0, 4.4e-05, 0.0062],
    "Pluto": [25.0, 6e-05, 0.002],
    "Saturn": [18.0, 6.5e-05, 0.023],
    "Uranus": [19.0, 4.2e-05, 0.009],
    "Venus": [6.6, 1.2e-05, 0.21]
  }
};
