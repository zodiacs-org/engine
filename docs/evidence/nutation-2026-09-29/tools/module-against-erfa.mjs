/*
 * The largest differences behind src/nutation.test.ts's tolerances: this
 * tree's nutation, obliquity, equation of the equinoxes, sidereal time and
 * rotation to the ecliptic of date against the ERFA fixture
 * (src/fixtures/nutation-erfa.json, 101 TT instants 1800-2200), and the
 * series against a direct evaluation of NOVAS's own loop on the numbers of
 * src/fixtures/novas-c3.1-iau2000b.txt, every 0.001 century from 1800 to
 * 2200. The tests hold these under the fixed tolerances; this prints what
 * they are.
 *
 *   node docs/evidence/nutation-2026-09-29/tools/module-against-erfa.mjs > results/module-against-erfa.json
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ROOT } from "./engines.mjs";

const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
const scratch = mkdtempSync(join(tmpdir(), "nutation-module-"));
try {
  const outfile = join(scratch, "module.mjs");
  await build({
    stdin: {
      contents: 'export { nutation, tilt } from "./nutation.ts";\nexport { eclipticOfDate } from "./frame.ts";\nexport { gastHours } from "./ephemeris.ts";\n',
      resolveDir: join(ROOT, "src"),
      loader: "ts"
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "error", nodePaths: [join(ROOT, "node_modules")]
  });
  const { nutation, tilt, eclipticOfDate, gastHours } = await import(pathToFileURL(outfile).href);
  const erfa = JSON.parse(readFileSync(join(ROOT, "src/fixtures/nutation-erfa.json"), "utf8"));
  const worst = { dpsi: 0, deps: 0, meanObliquity: 0, equationOfEquinoxes: 0, gast2000B: 0, gst06a: 0, gst00b: 0, rotation: 0 };
  const hours = (h) => ((((h % 24) + 36) % 24) - 12) * 15 * 3600;
  for (const e of erfa.epochs) {
    const t = tilt(e.tt);
    worst.dpsi = Math.max(worst.dpsi, Math.abs(t.dpsi - e.dpsi));
    worst.deps = Math.max(worst.deps, Math.abs(t.deps - e.deps));
    worst.meanObliquity = Math.max(worst.meanObliquity, Math.abs(t.mobl * 3600 - e.epsA));
    worst.equationOfEquinoxes = Math.max(worst.equationOfEquinoxes, Math.abs(t.ee - e.ee2000B));
    const gast = gastHours({ ut: e.ut1, tt: e.tt });
    worst.gast2000B = Math.max(worst.gast2000B, Math.abs(hours(gast - e.gast2000B)));
    worst.gst06a = Math.max(worst.gst06a, Math.abs(hours(gast - e.gst06a)));
    worst.gst00b = Math.max(worst.gst00b, Math.abs(hours(gast - e.gst00b)));
    const m = e.eclipticOfDate;
    for (const [x, y, z] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.36, -0.48, 0.8], [-0.6, 0.64, -0.48]]) {
      const expected = [0, 1, 2].map((row) => m[3 * row] * x + m[3 * row + 1] * y + m[3 * row + 2] * z);
      const { lon, lat } = eclipticOfDate(x, y, z, e.tt);
      const [l, b] = [(lon * Math.PI) / 180, (lat * Math.PI) / 180];
      const a = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
      const cross = Math.hypot(a[1] * expected[2] - a[2] * expected[1], a[2] * expected[0] - a[0] * expected[2], a[0] * expected[1] - a[1] * expected[0]);
      const dot = a[0] * expected[0] + a[1] * expected[1] + a[2] * expected[2];
      worst.rotation = Math.max(worst.rotation, (Math.atan2(cross, dot) * 648_000) / Math.PI);
    }
  }
  // NOVAS's own loop on its own numbers, written out as nutation.test.ts does.
  const source = readFileSync(join(ROOT, "src/fixtures/novas-c3.1-iau2000b.txt"), "utf8");
  const table = (name, columns) => {
    const start = source.indexOf(name);
    const body = source.slice(source.indexOf("{", start), source.indexOf("}};", start) + 2);
    return [...body.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1].split(",").map(Number)).filter((row) => row.length === columns);
  };
  const nals = table("nals_t[77][5] =", 5);
  const cls = table("cls_t[77][6] =", 6);
  const ASEC2RAD = Math.PI / 648_000;
  let direct = 0;
  for (let i = 0; i <= 4000; i += 1) {
    const t = -2 + i / 1000;
    const f = [[485868.249036, 1717915923.2178], [1287104.79305, 129596581.0481], [335779.526232, 1739527262.8478],
      [1072260.70369, 1602961601.209], [450160.398036, -6962890.5431]].map(([a, b]) => ((a + t * b) % 1_296_000) * ASEC2RAD);
    let dp = 0;
    let de = 0;
    for (let k = 76; k >= 0; k -= 1) {
      const n = nals[k];
      const arg = (n[0] * f[0] + n[1] * f[1] + n[2] * f[2] + n[3] * f[3] + n[4] * f[4]) % (2 * Math.PI);
      const [a, a1, a2, b, b1, b2] = cls[k];
      dp += (a + a1 * t) * Math.sin(arg) + a2 * Math.cos(arg);
      de += (b + b1 * t) * Math.cos(arg) + b2 * Math.sin(arg);
    }
    const engine = nutation(t);
    direct = Math.max(direct, Math.abs(engine.dpsi - (dp * 1e-7 - 0.000135)), Math.abs(engine.deps - (de * 1e-7 + 0.000388)));
  }
  const sig = (x) => Number(x.toPrecision(3));
  process.stdout.write(`${JSON.stringify({
    unit: "arcseconds",
    againstErfaFixture: { instants: erfa.epochs.length, largest: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, sig(v)])), tolerance: erfa.tolerance },
    againstNovasLoop: { instants: 4001, span: "t = -2 to 2 Julian centuries of TT from J2000.0, every 0.001", largest: sig(direct), tolerance: 1e-14 }
  }, null, 1)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
