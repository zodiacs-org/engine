// Checks C4a to C4d of ../PREREGISTRATION.md (section 6): the bands against
// the engine's own response to a pinned ΔT, with their controls. These test
// the first-order propagation and the terms it leaves out; they are not
// accuracy evidence (engine AGENTS.md, "Accuracy expectations come from
// independent arbiters").
//
//   node pinned.mjs --package <root> --corpus T2 --out <c4.json>
//
// A pin on UT1 input moves TT and holds UT1; a pin on TT input moves UT1 and
// holds TT. d0 is the unpinned record's deltaT.seconds.
// - C4a, positions: F2 with pins d0 ± σTT; half the wrapped difference of lon,
//   lat and dist equals the band's TT term within max(1e-4 × band, 1e-6″)
//   (dist: max(1e-4 × band, 1e-15 au)). The true nodes are reported.
// - C4b, angles: F1 at S1 to S5 and S7, 13 systems, whole-sign and fallback
//   cusps left out. (i) pins d0 ± 1 s: half the difference over 1 s equals
//   band ÷ σUT1 within 1e-6 relative (Placidus cusps: plus 3.6e-6″ a second),
//   at every site; (ii) pins d0 ± σUT1: half the difference equals the band
//   within max(1e-3 × band, 1e-6″), judged at S1 to S4, reported at S5, S7.
// - C4c, the angles' TT term: F2 with pins d0 ± 100 s, the same sites and
//   systems: |half the difference| ≤ 1e-6 × |∂Q/∂UT1| × 100 s in the tropical
//   zodiac and Lahiri's, ∂Q/∂UT1 = band ÷ σUT1 of the F1 record.
// - C4d, the topocentric bound: Sun, Moon, Mars, Jupiter and Pluto at S1, S2
//   and S6; P_TT from F2 and P_UT1 from F1 with pins d0 ± 10 s; for each of F1
//   to F5, band ≥ P_TT σTT + P_UT1 σUT1 − 1e-9″ for lon and lat (dist in au,
//   − 1e-15). Reported: band / (P_TT σTT + P_UT1 σUT1).
// Controls: C4a with the bands × 1.001; C4b with the angle bands from the
// solar-time rate, 0.27 % off, which must fail (i) and (ii); C4c's probe made
// in F1, where UT1 moves, whose ratio must exceed 0.5; C4d with the bands
// without w, which must fail on F1 records.
import { CORPORA, SITES, forms } from "./corpora.mjs";
import { entry, finish, manifest, options } from "./load.mjs";

const args = options();
if (!args.package || !CORPORA[args.corpus]) throw new Error("usage: node pinned.mjs --package <root> --corpus T2 --out <file>");
const { calc, houses, CALC_BODIES } = await entry(args.package, "./calc");

const SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const SOLAR = 1 / 1.00273781191135448;
const ok = (result) => {
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return result;
};
const wrap = (d) => (d > 180 ? d - 360 : d <= -180 ? d + 360 : d);
const pinned = (time, pin) => ({ ...time, deltaT: pin });
const place = (site) => ({ latitude: SITES[site].latitude, longitude: SITES[site].longitude });
/** Angles and cusps of a houses() result, by name. */
const quantities = (result) => ({ asc: result.angles.asc, mc: result.angles.mc, vertex: result.vertex, eastPoint: result.eastPoint, ...Object.fromEntries(result.cusps.map((c, k) => [`cusps.${k}`, c])) });
const bandOf = (band, name) => (name.startsWith("cusps.") ? band.cusps[Number(name.slice(6))] : band[name]);

const out = { C4a: [], C4aReported: [], C4b: [], C4bReported: [], C4c: [], C4d: [], C4dRatios: [] };
const controls = { "C4a: bands × 1.001": [], "C4b: the solar-time rate, (i)": [], "C4b: the solar-time rate, (ii)": [], "C4c: the probe in F1": [], "C4d: the bands without w": [] };
let c4cLargest = 0;
let c4cControlSmallest = Infinity;
let records = 0;

for (const item of CORPORA[args.corpus]()) {
  const anchor = calc({ body: "Sun", time: item.time });
  if (anchor.status !== "ok") continue;
  const instant = anchor.receipt.instants[0];
  const { F1, F2 } = forms(item, instant);

  // C4a: TT moves by ± σTT, UT1 holds.
  const positions = [];
  for (const body of CALC_BODIES) {
    if (body === "Earth") continue;
    for (const frame of ["ecliptic-true-of-date", "equatorial-icrs"]) positions.push({ body, frame });
  }
  positions.push({ body: "Mars", center: "heliocentric" });
  for (const request of positions) {
    const base = ok(calc({ ...request, time: F2 }));
    const d0 = base.receipt.instants[0].deltaT.seconds;
    const sigma = base.band.time.tt;
    const [plus, minus] = [ok(calc({ ...request, time: pinned(F2, d0 + sigma) })), ok(calc({ ...request, time: pinned(F2, d0 - sigma) }))];
    const half = { lon: (Math.abs(wrap(plus.lon - minus.lon)) / 2) * 3600, lat: (Math.abs(plus.lat - minus.lat) / 2) * 3600, dist: plus.dist === null ? null : Math.abs(plus.dist - minus.dist) / 2 };
    records += 1;
    for (const name of ["lon", "lat", "dist"]) {
      if (half[name] === null) continue;
      const band = base.band[name];
      const limit = Math.max(1e-4 * band, name === "dist" ? 1e-15 : 1e-6);
      const row = { entry: item.id, request, what: name, band, half: half[name] };
      const target = request.body === "North Node" || request.body === "South Node" ? out.C4aReported : out.C4a;
      if (Math.abs(half[name] - band) > limit) target.push(row);
      if (target === out.C4a && Math.abs(half[name] - 1.001 * band) > Math.max(1e-4 * 1.001 * band, name === "dist" ? 1e-15 : 1e-6)) controls["C4a: bands × 1.001"].push(row);
    }
  }

  // C4b and C4c: the angles.
  for (const site of ["S1", "S2", "S3", "S4", "S5", "S7"]) {
    for (const houseSystem of SYSTEMS) {
      for (const zodiac of [undefined, { sidereal: "lahiri" }]) {
        const request = { place: place(site), houseSystem, ...(zodiac ? { zodiac } : {}) };
        const onTt = ok(houses({ ...request, time: F1 }));
        if (onTt.system === "whole" && zodiac === undefined && houseSystem !== "whole" && site !== "S7") throw new Error(`${site} ${houseSystem} fell back`);
        const names = Object.keys(quantities(onTt)).filter((name) => !(name.startsWith("cusps.") && onTt.system === "whole"));
        const d0 = onTt.receipt.instants[0].deltaT.seconds;
        const sigmaUt1 = onTt.band.time.ut1;
        records += 1;
        if (zodiac === undefined) {
          // (i) the turn rate over ± 1 s of UT1; (ii) first order over ± σUT1.
          const one = [quantities(ok(houses({ ...request, time: pinned(F1, d0 - 1) }))), quantities(ok(houses({ ...request, time: pinned(F1, d0 + 1) })))];
          const wide = [quantities(ok(houses({ ...request, time: pinned(F1, d0 - sigmaUt1) }))), quantities(ok(houses({ ...request, time: pinned(F1, d0 + sigmaUt1) })))];
          for (const name of names) {
            const band = bandOf(onTt.band, name);
            const rate = (Math.abs(wrap(one[0][name] - one[1][name])) / 2) * 3600;
            const half = (Math.abs(wrap(wide[0][name] - wide[1][name])) / 2) * 3600;
            const extra = houseSystem === "placidus" && name.startsWith("cusps.") ? 3.6e-6 : 0;
            const row = { entry: item.id, site, houseSystem, what: name, band, sigmaUt1, rate, half };
            const judged2 = ["S1", "S2", "S3", "S4"].includes(site);
            if (Math.abs(rate - band / sigmaUt1) > 1e-6 * rate + extra) out.C4b.push({ ...row, part: "i" });
            if (Math.abs(half - band) > Math.max(1e-3 * band, 1e-6)) (judged2 ? out.C4b : out.C4bReported).push({ ...row, part: "ii" });
            const solar = band * SOLAR;
            if (Math.abs(rate - solar / sigmaUt1) > 1e-6 * rate + extra) controls["C4b: the solar-time rate, (i)"].push(row);
            if (judged2 && Math.abs(half - solar) > Math.max(1e-3 * solar, 1e-6)) controls["C4b: the solar-time rate, (ii)"].push(row);
          }
        }
        // C4c: TT moves by ± 100 s with UT1 held (F2); the control moves UT1 instead (F1).
        const tt = [quantities(ok(houses({ ...request, time: pinned(F2, d0 - 100) }))), quantities(ok(houses({ ...request, time: pinned(F2, d0 + 100) })))];
        const ut1 = [quantities(ok(houses({ ...request, time: pinned(F1, d0 - 100) }))), quantities(ok(houses({ ...request, time: pinned(F1, d0 + 100) })))];
        for (const name of names) {
          const perSecond = bandOf(onTt.band, name) / sigmaUt1;
          const scale = perSecond * 100;
          const half = (Math.abs(wrap(tt[0][name] - tt[1][name])) / 2) * 3600;
          const control = (Math.abs(wrap(ut1[0][name] - ut1[1][name])) / 2) * 3600;
          if (scale > 0) {
            c4cLargest = Math.max(c4cLargest, half / scale);
            c4cControlSmallest = Math.min(c4cControlSmallest, control / scale);
          }
          if (half > 1e-6 * scale) out.C4c.push({ entry: item.id, site, houseSystem, zodiac: zodiac ? "lahiri" : "tropical", what: name, half, limit: 1e-6 * scale });
          if (control > 1e-6 * scale) controls["C4c: the probe in F1"].push({ entry: item.id, site, houseSystem, what: name, ratio: control / scale });
        }
      }
    }
  }

  // C4d: the topocentric bound against the partials from pins of ± 10 s.
  for (const site of ["S1", "S2", "S6"]) {
    for (const body of ["Sun", "Moon", "Mars", "Jupiter", "Pluto"]) {
      const center = { topocentric: SITES[site] };
      const at = (time) => ok(calc({ body, time, center }));
      const d0 = at(F2).receipt.instants[0].deltaT.seconds;
      const partial = (time) => {
        const [a, b] = [at(pinned(time, d0 + 10)), at(pinned(time, d0 - 10))];
        return { lon: (Math.abs(wrap(a.lon - b.lon)) * 3600) / 20, lat: (Math.abs(a.lat - b.lat) * 3600) / 20, dist: Math.abs(a.dist - b.dist) / 20 };
      };
      const onTtPartial = partial(F2);
      const onUt1Partial = partial(F1);
      for (const [form, time] of Object.entries(forms(item, instant))) {
        const result = at(time);
        const { tt, ut1 } = result.band.time;
        records += 1;
        for (const name of ["lon", "lat", "dist"]) {
          const need = onTtPartial[name] * tt + onUt1Partial[name] * ut1;
          const band = result.band[name];
          const tolerance = name === "dist" ? 1e-15 : 1e-9;
          if (need > 0) out.C4dRatios.push(band / need);
          if (band < need - tolerance) out.C4d.push({ entry: item.id, site, body, form, what: name, band, need });
          if (name !== "dist") {
            const without = (Math.abs(result.speeds[name]) / 24) * tt;
            if (form === "F1" && without < need - tolerance) controls["C4d: the bands without w"].push({ entry: item.id, site, body, form, what: name });
          }
        }
      }
    }
  }
}

const package_ = manifest(args.package);
const ratios = out.C4dRatios.sort((a, b) => a - b);
finish({
  check: "C4",
  pass: records > 0 && out.C4a.length === 0 && out.C4b.length === 0 && out.C4c.length === 0 && out.C4d.length === 0,
  records,
  corpus: args.corpus,
  engine: { name: package_.name, version: package_.version },
  node: process.version,
  failures: { C4a: out.C4a.length, C4b: out.C4b.length, C4c: out.C4c.length, C4d: out.C4d.length },
  firstFailures: { C4a: out.C4a.slice(0, 10), C4b: out.C4b.slice(0, 10), C4c: out.C4c.slice(0, 10), C4d: out.C4d.slice(0, 10) },
  reportedNotJudged: {
    trueNodes: { outside: out.C4aReported.length, first: out.C4aReported.slice(0, 5) },
    angleFirstOrderAtS5AndS7: { outside: out.C4bReported.length, first: out.C4bReported.slice(0, 5) },
    c4cLargestRatio: c4cLargest,
    c4cControlSmallestRatio: c4cControlSmallest,
    c4dBandOverPartials: ratios.length ? { cases: ratios.length, smallest: ratios[0], median: ratios[Math.floor(ratios.length / 2)], largest: ratios.at(-1) } : null
  },
  controls: Object.fromEntries(Object.entries(controls).map(([name, found]) => [
    name,
    // C4c's control must see the full turn: its ratio must exceed 0.5 for every quantity probed.
    name.startsWith("C4c") ? { failed: found.length > 0 && c4cControlSmallest > 0.5, problems: found.length, smallestRatio: c4cControlSmallest } : { failed: found.length > 0, problems: found.length }
  ]))
}, args.out);
