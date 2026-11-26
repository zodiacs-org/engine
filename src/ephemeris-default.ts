/**
 * What a call outside `withEphemeris` computes on: the default's name, and
 * the opener of the shipped DE440 pack once `useDe440()`
 * (`@zodiacs/engine/de440/pack`) has registered it. From 3.0.0 the default is
 * astronomy-engine, and nothing in the root's graph imports the pack.
 *
 * This module holds the setting on its own, apart from `src/ephemeris.ts`,
 * so that `@zodiacs/engine/de440/pack` can set it without loading
 * astronomy-engine or the root's code. `src/ephemeris.ts` reads it at each
 * calculation. The build splits the code so that every entry point that
 * imports this module (the root, `./core`, `./calc`, `./window` and the others
 * that share the root's ephemeris, and `./de440/pack`) loads one copy of it
 * from one shared chunk, so they all read the same setting.
 */
import type { De440Source } from "./de440.js";

/** What a call outside `withEphemeris` computes on. */
export type DefaultEphemerisName = "de440" | "astronomy-engine";

let defaultName: DefaultEphemerisName = "astronomy-engine";

/** The shipped pack's opener, as `useDe440()` registered it, or null before. */
let registeredDe440Loader: (() => De440Source) | null = null;

/**
 * Choose what a call outside `withEphemeris` computes on, from now on:
 * `"astronomy-engine"`, the package's default from 3.0.0, or `"de440"`, the
 * DE440 pack the package ships. `useDe440()` from
 * `@zodiacs/engine/de440/pack` loads that pack and chooses it in one call;
 * `"de440"` before it, with no pack loaded, computes on astronomy-engine and
 * flags every result `"de440-unavailable"`, and `defaultEphemeris()` says
 * why. It is one setting for every entry point that shares the root's
 * ephemeris, so set it once, before computing; `withEphemeris` still
 * overrides it for the calls inside.
 */
export function setDefaultEphemeris(name: DefaultEphemerisName): void {
  if (name !== "de440" && name !== "astronomy-engine") throw new TypeError('setDefaultEphemeris takes "de440" or "astronomy-engine"');
  defaultName = name;
}

/** The default's name, as `setDefaultEphemeris` last set it. */
export function defaultEphemerisName(): DefaultEphemerisName {
  return defaultName;
}

/**
 * Register the opener of the shipped DE440 pack, which `src/ephemeris.ts`
 * calls at the first calculation on the pack: `useDe440()` passes
 * `shippedDe440Source`. Registering the same opener again changes nothing.
 *
 * @internal
 */
export function registerDe440Source(loader: () => De440Source): void {
  if (typeof loader !== "function") throw new TypeError("registerDe440Source needs a function that opens the pack");
  registeredDe440Loader = loader;
}

/** The registered opener of the shipped pack, or null. */
export function registeredDe440Source(): (() => De440Source) | null {
  return registeredDe440Loader;
}
