/*
 * The obliquity and sidereal-time scans of
 * docs/evidence/birth-window/rate-bounds.mjs, on the engine's own nutation.
 * That tool reads astronomy-engine's e_tilt and SiderealTime, which the engine
 * used up to 0.1.1-rc.15. From 0.1.1-rc.16 the window's angles take the
 * engine's own true obliquity and sidereal time (src/nutation.ts, and gastHours
 * in src/ephemeris.ts); this tool bundles them from src/ with esbuild and
 * evaluates them as src/window.ts does, on the chart's clock (UTC on the
 * engine's time basis): tilt(time.tt).tobl, and gastHours(time) × 15 for the
 * RAMC less the longitude.
 *
 * The grid is rate-bounds.mjs's: 1800-01-01 to 2200-01-01, every 6 hours for
 * the obliquity and every 24 hours for the RAMC, each rate a central
 * difference over ±10 minutes, and the largest change of rate between
 * consecutive samples. The window's bound on the obliquity's rate is 5e-5
 * degree a day (OBLIQUITY_RATE in src/window.ts). A difference whose two
 * samples straddle a step of the time basis (a leap second, 1972-01-01, the
 * ΔT model's seam, the end of the IERS table), where UT1 and TT jump and the
 * window splits its search, is left out and counted, as src/window.ts's
 * onePiece finds them.
 *
 *   node docs/evidence/rc16-20260930/tools/window-rates.mjs [out.json]
 *
 * out.json defaults to docs/evidence/birth-window/rc16/window-rates.json.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const DAY = 86_400_000;
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const OBLIQUITY_RATE = 5e-5;

const scratch = mkdtempSync(join(tmpdir(), "rc16-window-rates-"));
try {
  const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
  const outfile = join(scratch, "angles.mjs");
  await build({
    stdin: {
      contents:
        'export { gastHours, onChartClock } from "./ephemeris.ts";\nexport { tilt } from "./nutation.ts";\n' +
        'export { elapsedDays, timeBasis } from "./time-scale.ts";\n',
      resolveDir: join(ROOT, "src"),
      sourcefile: "entry.ts",
      loader: "ts"
    },
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["astronomy-engine"],
    outfile,
    logLevel: "error"
  });
  // The bundle imports astronomy-engine, the checkout's.
  mkdirSync(join(scratch, "node_modules"));
  symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
  const { elapsedDays, gastHours, onChartClock, tilt, timeBasis } = await import(pathToFileURL(outfile).href);
  const onePiece = (a, b) => Number.isNaN(elapsedDays(timeBasis(a, "utc"), timeBasis(b, "utc"), Number.NaN));
  const angles = (t) => onChartClock(t, "utc", undefined, (time) => [tilt(time.tt).tobl, gastHours(time) * 15]);
  const wrap = (d) => ((((d % 360) + 540) % 360) - 180);

  const scan = (name, stepHours, index) => {
    const h = 600_000;
    const step = stepHours * 3_600_000;
    let maxAbs = 0;
    let when = FROM;
    let min = Infinity;
    let max = -Infinity;
    let maxAcceleration = 0;
    let previous = null;
    const straddled = [];
    for (let t = FROM; t <= TO; t += step) {
      if (!onePiece(t - h, t + h)) {
        straddled.push(new Date(t).toISOString());
        previous = null;
        continue;
      }
      const rate = wrap(angles(t + h)[index] - angles(t - h)[index]) / ((2 * h) / DAY);
      if (Math.abs(rate) > maxAbs) {
        maxAbs = Math.abs(rate);
        when = t;
      }
      min = Math.min(min, rate);
      max = Math.max(max, rate);
      if (previous !== null) maxAcceleration = Math.max(maxAcceleration, Math.abs(rate - previous) / (step / DAY));
      previous = rate;
    }
    return { name, stepHours, maxAbs, at: new Date(when).toISOString(), min, max, maxAcceleration, leftOutAtSteps: straddled };
  };
  const obliquity = scan("obliquity", 6, 0);
  const ramc = scan("RAMC", 24, 1);
  const report = {
    tool: "docs/evidence/rc16-20260930/tools/window-rates.mjs",
    node: process.version,
    span: [new Date(FROM).toISOString(), new Date(TO).toISOString()],
    units: "degrees and days",
    note: "the engine's true obliquity and sidereal time (src/nutation.ts, src/ephemeris.ts), as src/window.ts evaluates them; rate-bounds.mjs's grid",
    obliquity: { ...obliquity, bound: OBLIQUITY_RATE, boundOverMaximum: OBLIQUITY_RATE / (obliquity.maxAbs + (obliquity.maxAcceleration * obliquity.stepHours) / 48) },
    ramc
  };
  const out = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "docs/evidence/birth-window/rc16/window-rates.json");
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report, null, 1));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
