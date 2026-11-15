// Breaker rc.12, item 0: the step at the Sun's limb on the installed package, at the four passages the rc.11
// review named (both limbs each). For each limb: the instant calc() changes sides (bisected to 1e-9 day),
// the size of the step in longitude, latitude and angle, the bound calc() quotes in the 3 arcsecond band and
// either side of it, calc()'s speed either side of the step, and what the crossing searches return for a target longitude inside the step.
//   node limb.mjs <passages.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calc, events } from "@zodiacs/engine/calc";
import { positions, searchLongitudeCrossings } from "@zodiacs/engine";
import { shippedDe440Source } from "@zodiacs/engine/de440/pack";
const source = shippedDe440Source();
const P = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rad = Math.PI / 180;
const q = (body, jd, frame = "ecliptic-true-of-date") => calc({ body, time: { jd, scale: "tt" }, frame });
const u = (r) => [Math.cos(r.lat * rad) * Math.cos(r.lon * rad), Math.cos(r.lat * rad) * Math.sin(r.lon * rad), Math.sin(r.lat * rad)];
const sep = (a, b) => { const x = u(a), y = u(b); const c = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; return (Math.atan2(Math.hypot(...c), x[0] * y[0] + x[1] * y[1] + x[2] * y[2]) / rad) * 3600; };
const named = [["Mercury", 2434871.46], ["Uranus", 2462292.18], ["Neptune", 2392770.12], ["Jupiter", 2463232.82]];
const out = [];
for (const [body, jd0] of named) {
  const p = P.find((x) => x.body === body && Math.abs(x.jdTt - jd0) < 1);
  const half = Math.sqrt(p.sunRadiusDeg ** 2 - p.minSepDeg ** 2) / p.relRateDegPerDay;
  for (const side of [-1, 1]) {
    // the side is the pack source's own decision (place().behindDisc, @zodiacs/engine/de440/pack)
    const base = p.jdTt + side * half * 0.9;
    const bent = (jd) => !source.place(body, jd - 2451545).behindDisc;
    let lo = base, hi = p.jdTt + side * half * 1.1;
    if (bent(lo) || !bent(hi)) throw new Error(`${body} ${side}: not bracketed`);
    for (let i = 0; i < 60 && Math.abs(hi - lo) > 2e-9; i++) { const m = (lo + hi) / 2; if (bent(m)) hi = m; else lo = m; }
    const inside = q(body, lo), outside = q(body, hi), sun = q("Sun", hi);
    const row = { body, limb: side < 0 ? "entering the disc" : "leaving the disc", jdTtInside: lo, jdTtOutside: hi,
      stepLonArcsec: (outside.lon - inside.lon) * 3600, stepLatArcsec: (outside.lat - inside.lat) * 3600, stepAngleArcsec: sep(inside, outside),
      separationFromSunArcsec: sep(outside, sun), boundInside: [inside.bounds.position.value, inside.bounds.position.label], boundOutside: [outside.bounds.position.value, outside.bounds.position.label],
      speedLonInside: inside.speeds.lon, speedLonOutside: outside.speeds.lon, speedLonDifferenceArcsecPerDay: (outside.speeds.lon - inside.speeds.lon) * 3600,
      conventionsSame: JSON.stringify(inside.receipt.conventions) === JSON.stringify(outside.receipt.conventions) };
    // how far from the limb the 1.8 arcsecond bound is quoted, in arcseconds of separation, each way
    const band = [];
    for (const dir of [-1, 1]) { let far = null; for (let k = 0; k <= 400; k++) { const jd = (dir < 0 ? lo : hi) + dir * side * k * 2e-6; const r = q(body, jd); if (r.bounds.position.value === 1.8) far = Math.abs(sep(r, q("Sun", jd)) - row.separationFromSunArcsec); else if (far !== null) break; } band.push(far); }
    row.bandInsideArcsec = band[0]; row.bandOutsideArcsec = band[1];
    // a target longitude in the middle of the step: what do the crossing searches say?
    const target = (inside.lon + outside.lon) / 2;
    // (Dates are UTC; the span of a tenth of a day around the step is wide enough for TT - UTC either way)
    const from = new Date(Math.round((Math.min(lo, hi) - 0.05 - 2440587.5) * 86400000)), to = new Date(Math.round((Math.max(lo, hi) + 0.05 - 2440587.5) * 86400000));
    try { const s = searchLongitudeCrossings(body, target, from, to); row.search = { target, status: s.status, flags: s.flags, crossings: s.crossings.map((c) => ({ at: c.at.toISOString?.() ?? c.at, direction: c.direction ?? c.motion })) }; } catch (e) { row.search = { threw: String(e.message).slice(0, 160) }; }
    try { const e = events({ kind: "longitude-crossing", body, longitude: target, from, to }); row.events = { status: e.status, n: e.events?.length, events: (e.events ?? []).map((x) => x.at ?? x.utc ?? x.time), flags: e.flags, reason: e.reason }; } catch (e) { row.events = { threw: String(e.message).slice(0, 160) }; }
    // the truth by brute force: sign changes of (lon - target) at 1 s steps over the same span, from positions()
    let changes = 0, prev = null; for (let ms = from.getTime(); ms <= to.getTime(); ms += 1000) { const d = positions(new Date(ms)).find((b) => b.body === body).lon - target; if (prev !== null && Math.sign(d) !== Math.sign(prev)) changes++; prev = d; }
    row.signChangesAtOneSecondSteps = changes;
    out.push(row); console.log(JSON.stringify(row));
  }
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
