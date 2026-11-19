// Engine-side event instants (TT days from J2000 via the engine's own time basis),
// run against the carried 1.1.0-rc.3 archive installed beside this file
// (../README.md). Writes JSONL to argv[2].
import * as E from "@zodiacs/engine";
import { moonIngresses, solarReturnInstant } from "@zodiacs/engine/techniques";
import { timeBasis } from "@zodiacs/engine/time";
import { writeFileSync } from "node:fs";

const DAY = 86400000;
const T0 = Date.UTC(1900, 0, 1), T1 = Date.UTC(2051, 0, 1);
const out = [];
const tt = (ms) => timeBasis(ms).ttDays;
const push = (o) => out.push(JSON.stringify(o));
const t = () => process.hrtime.bigint();
let st = t();
const lap = (s) => { const n = t(); console.log(s, Number(n - st) / 1e9, "s"); st = n; };

// 1. Sun and planet ingresses through the public solver
const STEPS = { Sun: 5, Mercury: 1, Venus: 1, Mars: 2, Jupiter: 5, Saturn: 5, Uranus: 5, Neptune: 5, Pluto: 5 };
for (const [body, step] of Object.entries(STEPS)) {
  for (let k = 0; k < 12; k++) {
    for (let y = 1900; y <= 2050; y += 10) {
      const from = new Date(Date.UTC(y, 0, 1)), to = new Date(Math.min(Date.UTC(y + 10, 0, 1), T1));
      for (const c of E.findLongitudeCrossings(body, 30 * k, from, to, step)) {
        const ms = (c.at instanceof Date ? c.at.getTime() : Date.parse(c.at));
        push({ kind: "ingress", body, target: 30 * k, ms, tt: tt(ms), retro: c.retrograde, step });
      }
    }
  }
  lap("ingress " + body);
}
// Sun ingress with the Moon's quarter-day step as a solver-step check (2020-2031)
for (let k = 0; k < 12; k++) {
  for (const c of E.findLongitudeCrossings("Sun", 30 * k, new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2032, 0, 1)), 0.25)) {
    const ms = (c.at instanceof Date ? c.at.getTime() : Date.parse(c.at)); push({ kind: "ingress-step0.25", body: "Sun", target: 30 * k, ms, tt: tt(ms) });
  }
}
// solarReturnInstant for the equinox/solstice longitudes 2020-2031 (techniques entry)
for (let y = 2020; y <= 2031; y++) {
  for (const [k, m] of [[0, 2], [90, 5], [180, 8], [270, 11]]) {
    const ms = solarReturnInstant(k, new Date(Date.UTC(y, m, 21))).getTime();
    push({ kind: "solar-return", body: "Sun", target: k, ms, tt: tt(ms) });
  }
}
lap("sun extras");

// 2. Moon ingresses: 2020-2031 every year, plus every 10th year 1900..2050
const moonYears = new Set([...Array(12).keys()].map((i) => 2020 + i));
for (let y = 1900; y <= 2050; y += 10) moonYears.add(y);
for (const y of [...moonYears].sort()) {
  for (let k = 0; k < 12; k++) {
    for (const c of E.findLongitudeCrossings("Moon", 30 * k, new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y + 1, 0, 1)), 0.25)) {
      const ms = (c.at instanceof Date ? c.at.getTime() : Date.parse(c.at)); push({ kind: "ingress", body: "Moon", target: 30 * k, ms, tt: tt(ms), step: 0.25 });
    }
  }
}
// techniques.moonIngresses for 2026 (consistency with the solver)
for (const m of moonIngresses(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1)))) {
  const at = m.at ?? m.instant ?? m.time; const ms = typeof at === "string" ? Date.parse(at) : +at;
  push({ kind: "moonIngresses-2026", body: "Moon", sign: m.sign ?? m.to, ms, tt: tt(ms) });
}
lap("moon ingresses");

// 3. daily grid of engine positions 1900..2050 (UTC midnight)
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const N = Math.round((T1 - T0) / DAY) + 1;
const LON = {}, SPD = {};
for (const b of BODIES) { LON[b] = new Float64Array(N); SPD[b] = new Float64Array(N); }
for (let i = 0; i < N; i++) {
  for (const p of E.positions(new Date(T0 + i * DAY))) {
    if (LON[p.body]) { LON[p.body][i] = p.lon; SPD[p.body][i] = p.speed; }
  }
}
lap("grid");
const posAt = (ms) => { const r = {}; for (const p of E.positions(new Date(ms))) r[p.body] = p; return r; };
function bisect(f, a, b) { // f(a), f(b) opposite signs; to 1 ms
  let fa = f(a);
  while (b - a > 1) { const m = Math.floor((a + b) / 2); const fm = f(m); if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m; }
  return b;
}
// 4. stations (zero of the engine's longitude speed)
for (const b of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
  const s = SPD[b];
  for (let i = 0; i + 1 < N; i++) {
    if ((s[i] < 0) !== (s[i + 1] < 0)) {
      const ms = bisect((m) => posAt(m)[b].speed, T0 + i * DAY, T0 + (i + 1) * DAY);
      push({ kind: "station", body: b, type: s[i] > 0 ? "R" : "D", ms, tt: tt(ms) });
    }
  }
}
lap("stations");
// 5. aspects: separation (lon a - lon b) mod 360 crossing targets
const wrap = (x) => ((x % 360) + 540) % 360 - 180;
function aspects(a, b, targets, y0, y1, kind) {
  const i0 = Math.round((Date.UTC(y0, 0, 1) - T0) / DAY), i1 = Math.round((Date.UTC(y1 + 1, 0, 1) - T0) / DAY);
  for (const tg of targets) {
    const g = (i) => wrap(LON[a][i] - LON[b][i] - tg);
    for (let i = i0; i < i1 && i + 1 < N; i++) {
      const g0 = g(i), g1 = g(i + 1);
      if ((g0 < 0) !== (g1 < 0) && Math.abs(g0 - g1) < 90) {
        const ms = bisect((m) => { const p = posAt(m); return wrap(p[a].lon - p[b].lon - tg); }, T0 + i * DAY, T0 + (i + 1) * DAY);
        push({ kind, a, b, target: tg, ms, tt: tt(ms) });
      }
    }
  }
}
aspects("Moon", "Sun", [0, 180], 1900, 2050, "lunation");
aspects("Moon", "Sun", [90, 270], 2020, 2031, "quarter");
lap("lunations");
const MAJ = [0, 60, 90, 120, 180, 240, 270, 300];
const PL = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
for (let i = 0; i < PL.length; i++) for (let j = i + 1; j < PL.length; j++) {
  const slow = i >= 4;
  aspects(PL[i], PL[j], MAJ, slow ? 1900 : 2020, slow ? 2050 : 2031, slow ? "aspect-slow" : "aspect");
}
lap("aspects");
writeFileSync(process.argv[2], out.join("\n") + "\n");
console.log("events", out.length);
