/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared. The
 * barycentric Sun is left out: calc.ts derives its bounds from the
 * barycentre's error.
 *
 * Written by docs/evidence/calc-api/tools/bounds.py from
 * docs/evidence/calc-api/rc16/summary.json; do not edit by hand.
 * calc-bounds.test.ts checks the two agree.
 */
export const MEASURED_BASIS = "largest difference from JPL Horizons (DE441) over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in all eight frames; docs/evidence/calc-api/rc16";
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
    "Jupiter": [13.0, 4.7e-05, 0.061],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mean Node": [0.0023, null, 0.00081],
    "Mean South Node": [0.0023, null, 0.00081],
    "Mercury": [9.3, 3.6e-05, 2.2],
    "Moon": [8.3, 0.00014, 1.1],
    "Neptune": [21.0, 4.2e-05, 0.013],
    "North Node": [16.0, null, null],
    "Pluto": [25.0, 6.3e-05, 0.014],
    "Saturn": [18.0, 6.8e-05, 0.03],
    "South Node": [16.0, null, null],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.02],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
  "geocentric/astrometric": {
    "Jupiter": [13.0, 4.7e-05, 0.061],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mercury": [9.3, 3.6e-05, 2.2],
    "Moon": [7.6, 3.6e-05, 1.1],
    "Neptune": [21.0, 4.2e-05, 0.013],
    "Pluto": [25.0, 6.3e-05, 0.014],
    "Saturn": [18.0, 6.8e-05, 0.03],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.02],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
  "geocentric/geometric": {
    "Jupiter": [13.0, 4.7e-05, 0.061],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mercury": [9.3, 3.6e-05, 2.2],
    "Moon": [7.6, 3.6e-05, 0.97],
    "Neptune": [21.0, 4.2e-05, 0.013],
    "Pluto": [25.0, 6.3e-05, 0.014],
    "Saturn": [18.0, 6.8e-05, 0.03],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.02],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
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
  },
  "topocentric/apparent": {
    "Mars": [6.6, 5.8e-05, 0.46],
    "Moon": [7.8, 3.6e-05, 1.4],
    "Sun": [3.0, 1.5e-05, 0.19]
  },
  "topocentric/astrometric": {
    "Mars": [6.6, 5.8e-05, 0.45],
    "Moon": [7.8, 3.6e-05, 1.4],
    "Sun": [3.0, 1.5e-05, 0.18]
  },
  "topocentric/geometric": {
    "Mars": [6.6, 5.8e-05, 0.45],
    "Moon": [7.8, 3.6e-05, 1.5],
    "Sun": [3.0, 1.5e-05, 0.18]
  }
};
