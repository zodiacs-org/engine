// App (c): the first function @zodiacs/engine/lite exports from its
// declination part (src/lite/declinations.ts), which needs no ephemeris.
import { findDeclinationAspects } from "@zodiacs/engine/lite";
import { report } from "./report.js";

const aspects = findDeclinationAspects([
  { body: "sun", lon: 280.4, lat: 0 },
  { body: "moon", lon: 101.2, lat: 4.9 },
  { body: "venus", lon: 278.9, lat: -1.2 }
], 23.4377);
report("c", { aspects: aspects.length });
