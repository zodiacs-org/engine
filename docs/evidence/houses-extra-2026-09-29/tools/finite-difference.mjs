// Gate F of PREREGISTRATION.md: the analytic speeds of @zodiacs/engine/houses
// against a central difference of the root entry's own cusps and angles, with
// Richardson's extrapolation, on both grids. Engine against engine; no Swiss.
// Run from the repository root after `npm run build`:
//   node docs/evidence/houses-extra-2026-09-29/tools/finite-difference.mjs > results/finite-difference.json
import { HOUSE_SYSTEMS, computeAngles, computeHouses } from "../../../../dist/index.js";
import { SIDEREAL_RATE, houseSpeeds } from "../../../../dist/houses-extra.js";
import { globalGrid, inputOf, ladder } from "./grids.mjs";

const H = 0.001;
const seam = (a, b) => ((((a - b + 180) % 360) + 360) % 360) - 180;
const tolerance = (v) => 0.004 + 1e-6 * Math.abs(v);

function values(c, system, ramc) {
  const input = inputOf(c, ramc);
  const angles = computeAngles(input);
  const { houses, fellBack } = computeHouses(system, input, angles);
  return { cusps: houses.cusps, asc: angles.asc, mc: angles.mc, fellBack };
}

function summary(list, over, extra = {}) {
  const sorted = [...list].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q) => Number(sorted[Math.min(n - 1, Math.floor(q * n))].toPrecision(3));
  return n ? { n, median: pick(0.5), p95: pick(0.95), max: Number(sorted[n - 1].toPrecision(3)), over, ...extra } : { n: 0, over, ...extra };
}

const stats = new Map();
const entry = (key) => {
  if (!stats.has(key)) stats.set(key, { d: [], rel: [], over: 0, void: 0, fellBack: 0 });
  return stats.get(key);
};

for (const c of [...ladder(), ...globalGrid()]) {
  for (const system of HOUSE_SYSTEMS) {
    const analytic = houseSpeeds(system, inputOf(c));
    const e = entry(`${c.set}|${system}`);
    if (analytic.fellBack) {
      e.fellBack += 1;
      continue;
    }
    const samples = [-H, -H / 2, 0, H / 2, H].map((step) => values(c, system, c.ramc + step));
    const series = [
      ...analytic.cusps.map((speed, index) => [speed, samples.map((sample) => sample.cusps[index]), e]),
      ...(system === "equal"
        ? [
            [analytic.angles.asc, samples.map((sample) => sample.asc), entry(`${c.set}|asc`)],
            [analytic.angles.mc, samples.map((sample) => sample.mc), entry(`${c.set}|mc`)]
          ]
        : [])
    ];
    for (const [speed, [m1, m2, c0, p2, p1], target] of series) {
      if ([m1, m2, p2, p1].some((value) => Math.abs(seam(value, c0)) > 1)) {
        target.void += 1;
        continue;
      }
      const d1 = seam(p1, m1) / (2 * H);
      const d2 = seam(p2, m2) / H;
      const numeric = ((4 * d2 - d1) / 3) * SIDEREAL_RATE;
      const d = Math.abs(speed - numeric);
      target.d.push(d);
      target.rel.push(numeric === 0 ? (d === 0 ? 0 : Infinity) : d / Math.abs(numeric));
      if (!(d <= tolerance(numeric))) target.over += 1;
    }
  }
}

const out = { unit: "degrees per day, per value", h: H, tolerance: "0.004 deg/day + 1e-6 |v|", sets: {} };
for (const [key, e] of [...stats].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const [set, name] = key.split("|");
  const rel = summary(e.rel, undefined);
  (out.sets[set] ??= {})[name] = summary(e.d, e.over, {
    relMedian: rel.median,
    relP95: rel.p95,
    relMax: rel.max,
    void: e.void,
    fellBack: e.fellBack
  });
}
console.log(JSON.stringify(out, null, 1));
