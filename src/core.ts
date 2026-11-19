/**
 * `@zodiacs/engine/core`: every name the root exports, computed on
 * astronomy-engine, without the shipped DE440 pack. A chart from it names
 * astronomy-engine (`chart.ephemeris`) as the root's does after
 * `setDefaultEphemeris("astronomy-engine")`. `scripts/build-core.mjs`
 * bundles it into `dist/core.js` on its own, with
 * `src/core/ephemeris-shipped.ts` in place of `src/ephemeris-shipped.ts`, so
 * its module state (the default source, `withEphemeris`) is its own and not
 * the root's. Measured in docs/evidence/bundle-weight-20261117/.
 */
export * from "./index.js";
