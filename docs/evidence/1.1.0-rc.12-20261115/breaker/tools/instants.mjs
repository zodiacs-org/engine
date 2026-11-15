// Breaker rc.12, item 0 (B2): the instants to ask JPL Horizons for, from passages.json (this review's own list).
//  - the four passages the rc.11 review named (Mercury 1954-05-08, Uranus 2029-06-04, Neptune 1839-01-30,
//    Jupiter 2032-01-01): 41 instants each, evenly from 2 half-chords before the least separation to 2 after;
//  - a sample of the passages behind the disc: every 5th of each planet in time order (all of Pluto's), and
//    the five of each planet that pass closest to the centre; 13 instants each, at -2, -1.2, -1.01, -0.99,
//    -0.9, -0.5, 0, 0.5, 0.9, 0.99, 1.01, 1.2, 2 half-chords from the least separation (a half-chord is the
//    time from the least separation to the limb, so +-0.99 and +-1.01 are a few arcseconds either side of it);
//  - passages within 0.3 degrees that miss the disc (planet farther): every 4th, 5 instants each;
//  - passages in front of the disc (Mercury, Venus transits): every 6th, 13 instants as above.
//   node instants.mjs <passages.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
const P = JSON.parse(readFileSync(process.argv[2], "utf8"));
const half = (p) => Math.sqrt(Math.max(p.sunRadiusDeg ** 2 - p.minSepDeg ** 2, 0)) / p.relRateDegPerDay; // days
const F13 = [-2, -1.2, -1.01, -0.99, -0.9, -0.5, 0, 0.5, 0.9, 0.99, 1.01, 1.2, 2];
const r9 = (x) => Math.round(x * 1e7) / 1e7;
const out = [];
const named = [["Mercury", 2434871.46], ["Uranus", 2462292.18], ["Neptune", 2392770.12], ["Jupiter", 2463232.82]];
for (const [body, jd] of named) {
  const p = P.find((x) => x.body === body && Math.abs(x.jdTt - jd) < 1); if (!p) throw new Error(`${body} ${jd} not in the list`);
  out.push({ set: "named", body, passage: p, jd: Array.from({ length: 41 }, (_, i) => r9(p.jdTt + (-2 + i * 0.1) * half(p))) });
}
for (const body of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
  const behind = P.filter((x) => x.body === body && x.behind && x.minSepDeg < x.sunRadiusDeg);
  const pick = new Set(behind.filter((_, i) => body === "Pluto" || i % 5 === 2));
  for (const p of [...behind].sort((a, b) => a.minSepDeg - b.minSepDeg).slice(0, 5)) pick.add(p);
  for (const p of behind) if (pick.has(p) && !named.some(([b, jd]) => b === body && Math.abs(p.jdTt - jd) < 1)) out.push({ set: "behind", body, passage: p, jd: F13.map((f) => r9(p.jdTt + f * half(p))) });
  const miss = P.filter((x) => x.body === body && x.behind && x.minSepDeg >= x.sunRadiusDeg);
  miss.forEach((p, i) => { if (i % 4 === 0) out.push({ set: "miss", body, passage: p, jd: [-0.2, -0.05, 0, 0.05, 0.2].map((f) => r9(p.jdTt + f * p.sunRadiusDeg / p.relRateDegPerDay)) }); });
  const front = P.filter((x) => x.body === body && !x.behind && x.minSepDeg < x.sunRadiusDeg);
  front.forEach((p, i) => { if (i % 6 === 0) out.push({ set: "front", body, passage: p, jd: F13.map((f) => r9(p.jdTt + f * half(p))) }); });
}
writeFileSync(process.argv[3], JSON.stringify(out));
const n = {}; for (const o of out) { n[o.set] ??= { passages: 0, instants: 0 }; n[o.set].passages++; n[o.set].instants += o.jd.length; }
console.log(JSON.stringify(n), out.length);
