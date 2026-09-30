#!/usr/bin/env node
/*
 * astronomy-engine's nutation (e_tilt, which calc's frames used up to
 * 0.1.1-rc.15) on a grid, for diagnostics.py's D4: `count` instants from UT
 * `start` (a Julian date) every `step` days, each with the instants 0.01 day
 * either side. Writes, per instant, the TT Julian days (t - h, t, t + h), then
 * Δψ and Δε (arcseconds) at each, as float64 to standard output. With
 * ENGINE_TILT_MODULE, a module whose tilt(tt) is the engine's own nutation
 * (from 0.1.1-rc.16, src/nutation.ts bundled), that nutation instead.
 *
 *   node docs/evidence/calc-api/tools/nutation_values.mjs 2378496.5 146097 1 > nutation.bin
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AstroTime, e_tilt } from "astronomy-engine";

const engineTilt = process.env.ENGINE_TILT_MODULE
  ? (await import(pathToFileURL(resolve(process.env.ENGINE_TILT_MODULE)).href)).tilt
  : null;

const [start, count, step] = process.argv.slice(2, 5).map(Number);
const out = new Float64Array(count * 9);
for (let i = 0; i < count; i++) {
  const at = new AstroTime(start + i * step - 2451545);
  const times = [at.AddDays(-0.01), at, at.AddDays(0.01)];
  times.forEach((time, k) => {
    const { dpsi, deps } = engineTilt ? engineTilt(time.tt) : e_tilt(time);
    out[9 * i + k] = 2451545 + time.tt;
    out[9 * i + 3 + k] = dpsi;
    out[9 * i + 6 + k] = deps;
  });
}
process.stdout.write(Buffer.from(out.buffer));
