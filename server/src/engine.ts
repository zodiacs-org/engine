import { ENGINE_VERSION, EPHEMERIS, natalChart } from "../../src/index.js";
import { createNatalEnvelope } from "../../src/receipt.js";

export const engineIdentity = Object.freeze({
  name: "@zodiacs/engine",
  version: ENGINE_VERSION,
  ephemeris: EPHEMERIS
});

/** Check the actual engine and receipt path before accepting traffic. */
export function verifyEngine(): void {
  // An invented instant without any personal or location data.
  createNatalEnvelope(natalChart({ utc: "2000-01-02T03:04:05Z", timeKnown: false }));
}
