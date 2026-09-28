/**
 * Measured bounds for calc results, keyed "center/correction/body". Each row is
 * [largest angular difference in arcseconds, largest relative distance
 * difference, largest angular-rate difference in arcseconds a day], each
 * rounded up to two significant figures; null where nothing was compared.
 *
 * Written by docs/evidence/calc-api/tools/bounds.py from
 * docs/evidence/calc-api/results/summary.json; do not edit by hand.
 * calc-bounds.test.ts checks the two agree.
 */
export const MEASURED_BASIS = "";
export const MEASURED: Readonly<Record<string, readonly [number, number | null, number | null]>> = {};
