/**
 * Vitest setup, run before each test file (vitest.config.mjs).
 *
 * From 1.1.0-rc.9 a plain call computes on the shipped DE440 pack. Most of
 * this suite was written on astronomy-engine: its regression tests pin
 * astronomy-engine's values to the bit, its calc, window, sky and vedic
 * tests compare the root's positions with modules that still compute on
 * astronomy-engine, and its accuracy tests hold astronomy-engine to its own
 * published limits. astronomy-engine is still what the engine computes on
 * outside the pack's years, after `setDefaultEphemeris("astronomy-engine")`,
 * and in those modules, so the suite keeps testing it: this file sets that
 * default before each test file's tests run. A file that computes while it is
 * collected, before any hook, sets it itself at its top.
 * The files that test the package's own default set it back themselves (`src/de440-default.test.ts`, which holds a plain
 * `natalChart` to JPL Horizons at the 240 L1 vectors, and
 * `src/de440-pack.test.ts`).
 */
import { beforeAll } from "vitest";

// Imported inside the hook, after the test file's own imports, so that a
// file's vi.mock of astronomy-engine or of the time basis still applies.
beforeAll(async () => {
  try {
    (await import("./ephemeris.js")).setDefaultEphemeris("astronomy-engine");
  } catch (error) {
    // A file that mocks src/ephemeris.ts whole computes on its mock, and has no default to set.
    if (!(error instanceof Error && error.message.includes("mock"))) throw error;
  }
});
