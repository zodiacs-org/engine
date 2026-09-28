/**
 * Measured bounds for calc results, by "center/correction" and body. Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared.
 *
 * Written by docs/evidence/calc-api/tools/bounds.py from
 * docs/evidence/calc-api/results/summary.json; do not edit by hand.
 * calc-bounds.test.ts checks the two agree.
 */
export const MEASURED_BASIS = "largest difference from JPL Horizons (DE441) over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in all eight frames; docs/evidence/calc-api";
export const MEASURED: Readonly<Record<string, Readonly<Record<string, readonly [number, number | null, number | null]>>>> = {
  "barycentric/apparent": {
    "Earth": [3.0, 1.4e-05, 0.2],
    "Jupiter": [13.0, 4e-05, 0.051],
    "Mars": [4.4, 2.1e-05, 0.089],
    "Mercury": [23.0, 7.7e-05, 5.4],
    "Moon": [3.0, 1.4e-05, 0.2],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6.1e-05, 0.044],
    "Saturn": [19.0, 6.5e-05, 0.059],
    "Sun": [520.0, 0.0042, 13.0],
    "Uranus": [19.0, 4.3e-05, 0.043],
    "Venus": [7.5, 1.5e-05, 0.24]
  },
  "barycentric/astrometric": {
    "Earth": [3.0, 1.4e-05, 0.2],
    "Jupiter": [13.0, 4e-05, 0.051],
    "Mars": [4.4, 2.1e-05, 0.089],
    "Mercury": [23.0, 7.7e-05, 5.4],
    "Moon": [3.0, 1.4e-05, 0.2],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6.1e-05, 0.044],
    "Saturn": [19.0, 6.5e-05, 0.059],
    "Sun": [520.0, 0.0042, 13.0],
    "Uranus": [19.0, 4.3e-05, 0.043],
    "Venus": [7.5, 1.5e-05, 0.24]
  },
  "barycentric/geometric": {
    "Earth": [3.0, 1.4e-05, 0.19],
    "Jupiter": [13.0, 4e-05, 0.051],
    "Mars": [4.4, 2.1e-05, 0.089],
    "Mercury": [23.0, 7.7e-05, 5.4],
    "Moon": [3.0, 1.4e-05, 0.2],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6.1e-05, 0.044],
    "Saturn": [19.0, 6.5e-05, 0.059],
    "Sun": [520.0, 0.0042, 13.0],
    "Uranus": [19.0, 4.3e-05, 0.043],
    "Venus": [7.5, 1.5e-05, 0.24]
  },
  "geocentric/apparent": {
    "Black Moon Lilith": [0.2, null, 0.044],
    "Jupiter": [13.0, 4.7e-05, 0.082],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mean Node": [0.2, null, 0.044],
    "Mean South Node": [0.2, null, 0.044],
    "Mercury": [9.4, 3.6e-05, 2.2],
    "Moon": [8.3, 0.00014, 1.1],
    "Neptune": [21.0, 4.2e-05, 0.051],
    "North Node": [16.0, null, null],
    "Pluto": [25.0, 6.3e-05, 0.045],
    "Saturn": [18.0, 6.8e-05, 0.05],
    "South Node": [16.0, null, null],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.044],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
  "geocentric/astrometric": {
    "Jupiter": [13.0, 4.7e-05, 0.082],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mercury": [9.4, 3.6e-05, 2.2],
    "Moon": [7.6, 3.6e-05, 1.1],
    "Neptune": [21.0, 4.2e-05, 0.051],
    "Pluto": [25.0, 6.3e-05, 0.046],
    "Saturn": [18.0, 6.8e-05, 0.05],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.044],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
  "geocentric/geometric": {
    "Jupiter": [13.0, 4.7e-05, 0.082],
    "Mars": [6.6, 5.8e-05, 0.45],
    "Mercury": [9.4, 3.6e-05, 2.2],
    "Moon": [7.6, 3.6e-05, 0.98],
    "Neptune": [21.0, 4.2e-05, 0.051],
    "Pluto": [25.0, 6.3e-05, 0.046],
    "Saturn": [18.0, 6.8e-05, 0.049],
    "Sun": [3.0, 1.5e-05, 0.18],
    "Uranus": [20.0, 4.2e-05, 0.044],
    "Venus": [11.0, 3.2e-05, 0.64]
  },
  "heliocentric/apparent": {
    "Earth": [3.0, 1.5e-05, 0.18],
    "Jupiter": [13.0, 4e-05, 0.053],
    "Mars": [4.3, 2.3e-05, 0.088],
    "Mercury": [23.0, 8.7e-05, 5.4],
    "Moon": [3.0, 1.5e-05, 0.18],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6e-05, 0.044],
    "Saturn": [18.0, 6.5e-05, 0.058],
    "Uranus": [19.0, 4.2e-05, 0.043],
    "Venus": [6.7, 1.2e-05, 0.24]
  },
  "heliocentric/astrometric": {
    "Earth": [3.0, 1.5e-05, 0.18],
    "Jupiter": [13.0, 4e-05, 0.053],
    "Mars": [4.3, 2.3e-05, 0.088],
    "Mercury": [23.0, 8.7e-05, 5.4],
    "Moon": [3.0, 1.5e-05, 0.18],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6e-05, 0.044],
    "Saturn": [18.0, 6.5e-05, 0.058],
    "Uranus": [19.0, 4.2e-05, 0.043],
    "Venus": [6.7, 1.2e-05, 0.24]
  },
  "heliocentric/geometric": {
    "Earth": [3.0, 1.5e-05, 0.18],
    "Jupiter": [13.0, 4e-05, 0.054],
    "Mars": [4.3, 2.3e-05, 0.087],
    "Mercury": [23.0, 8.7e-05, 5.4],
    "Moon": [3.0, 1.5e-05, 0.18],
    "Neptune": [21.0, 4.4e-05, 0.044],
    "Pluto": [25.0, 6e-05, 0.044],
    "Saturn": [18.0, 6.5e-05, 0.058],
    "Uranus": [19.0, 4.2e-05, 0.043],
    "Venus": [6.7, 1.2e-05, 0.23]
  },
  "topocentric/apparent": {
    "Mars": [6.6, 5.8e-05, 0.46],
    "Moon": [7.8, 3.6e-05, 1.4],
    "Sun": [3.0, 1.5e-05, 0.21]
  },
  "topocentric/geometric": {
    "Mars": [6.6, 5.8e-05, 0.45],
    "Moon": [7.8, 3.6e-05, 1.5],
    "Sun": [3.0, 1.5e-05, 0.18]
  }
};
