#!/usr/bin/env node
/*
 * astronomy-engine's nutation (e_tilt, which calc's frames use) on a grid, for
 * diagnostics.py's D4: `count` instants from UT `start` (a Julian date) every
 * `step` days, each with the instants 0.01 day either side. Writes, per
 * instant, the TT Julian days (t - h, t, t + h), then Δψ and Δε (arcseconds)
 * at each, as float64 to standard output.
 *
 *   node docs/evidence/calc-api/tools/nutation_values.mjs 2378496.5 146097 1 > nutation.bin
 */
import { AstroTime, e_tilt } from "astronomy-engine";

const [start, count, step] = process.argv.slice(2, 5).map(Number);
const out = new Float64Array(count * 9);
for (let i = 0; i < count; i++) {
  const at = new AstroTime(start + i * step - 2451545);
  const times = [at.AddDays(-0.01), at, at.AddDays(0.01)];
  times.forEach((time, k) => {
    const { dpsi, deps } = e_tilt(time);
    out[9 * i + k] = 2451545 + time.tt;
    out[9 * i + 3 + k] = dpsi;
    out[9 * i + 6 + k] = deps;
  });
}
process.stdout.write(Buffer.from(out.buffer));
