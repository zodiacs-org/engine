/**
 * Vitest setup, run before each test file (vitest.config.mjs).
 *
 * From 1.1.0-rc.9 to 2.1.0 a plain call computed on the shipped DE440 pack,
 * and this file set astronomy-engine before each test file's tests, since
 * most of the suite was written on it: its regression tests pin
 * astronomy-engine's values to the bit, and its accuracy tests hold
 * astronomy-engine to its own published limits. From 3.0.0 astronomy-engine
 * is the package's default again, and this file still sets it before each
 * file's tests run, so that every file starts there whatever the default.
 * The files that test the shipped pack load it themselves, in a hook, with
 * `useDe440()` from `src/de440-pack.ts`, and set astronomy-engine back
 * after: `src/de440-default.test.ts` (a natalChart on the pack against JPL
 * Horizons at the 240 L1 vectors, and calc(), chart() and events() on the
 * same source), `src/de440-pack.test.ts`, `src/calc-bounds-de440.test.ts`
 * (calc()'s bounds on the pack), `src/window-de440.test.ts` (windows on the
 * pack, against natalChart on it) and `src/ephemeris-fallback.test.ts` (the
 * pack not loaded, missing, damaged, and an instant outside it), among
 * others.
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
