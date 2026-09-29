/*
 * How far the engine's nutation moved: this tree's src/nutation.ts (all 77
 * terms) against astronomy-engine 2.1.19's e_tilt (its five), which rc.15
 * used, every ten minutes of TT from 1800-01-01 to 2200-01-01: the nutation
 * in longitude and in obliquity, the equation of the equinoxes and the true
 * obliquity. This is the size of the change, not its accuracy, which
 * src/nutation.test.ts and erfa-compare.py measure against ERFA.
 *
 *   node docs/evidence/nutation-2026-09-29/tools/nutation-change.mjs > results/nutation-change.json
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { MakeTime, SetDeltaTFunction, e_tilt } from "astronomy-engine";

import { ROOT } from "./engines.mjs";

const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
const scratch = mkdtempSync(join(tmpdir(), "nutation-change-"));
try {
  const outfile = join(scratch, "nutation.mjs");
  await build({ entryPoints: [join(ROOT, "src/nutation.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "error" });
  const { tilt } = await import(pathToFileURL(outfile).href);
  SetDeltaTFunction(() => 0);
  const from = -73_048.5; // 1800-01-01T00:00 TT, days from J2000.0
  const to = 73_048.5; // 2200-01-01T00:00 TT
  const step = 1 / 144;
  const worst = { dpsi: { arcsec: 0, tt: 0 }, deps: { arcsec: 0, tt: 0 }, ee: { arcsec: 0, tt: 0 }, tobl: { arcsec: 0, tt: 0 } };
  let count = 0;
  const steps = Math.round((to - from) * 144);
  for (let k = 0; k <= steps; k += 1) {
    const tt = from + k * step;
    const five = e_tilt(MakeTime(tt));
    const full = tilt(tt);
    const note = (key, value) => {
      if (Math.abs(value) > worst[key].arcsec) worst[key] = { arcsec: Math.abs(value), tt };
    };
    note("dpsi", full.dpsi - five.dpsi);
    note("deps", full.deps - five.deps);
    note("ee", full.ee - 15 * five.ee);
    note("tobl", (full.tobl - five.tobl) * 3600);
    count += 1;
  }
  const iso = (tt) => new Date(Math.round((Date.UTC(2000, 0, 1, 12) + tt * 86_400_000) / 1000) * 1000).toISOString().replace(".000Z", "Z");
  process.stdout.write(`${JSON.stringify({
    instants: count,
    span: "1800-01-01T00:00 to 2200-01-01T00:00 TT, every 10 minutes",
    unit: "arcseconds, |engine - astronomy-engine|",
    largest: Object.fromEntries(Object.entries(worst).map(([key, { arcsec, tt }]) => [key, { arcsec: Number(arcsec.toPrecision(4)), tt: iso(tt) }]))
  }, null, 1)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
