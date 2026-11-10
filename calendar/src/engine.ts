// Relative-source integration leaves the parent build and npm package untouched.
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import type { EngineIdentity } from "./types.js";

/** Identify this checkout only; do not use this to relabel an imported receipt. */
export function currentEngineIdentity(): EngineIdentity {
  return {
    name: "@zodiacs/engine",
    version: ENGINE_VERSION,
    ephemeris: { ...EPHEMERIS }
  };
}
