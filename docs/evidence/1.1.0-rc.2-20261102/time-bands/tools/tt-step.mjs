// The step of the angles' rate on TT (../PREREGISTRATION.md, section 10,
// "2026-11-03, review 1"): a development run on synthetic instants and sites,
// none of the preregistration's corpora, made to choose the step and show
// that it is sound. It is not a check and judges nothing.
//
//   node tt-step.mjs --package <root> --out <tt-step.json>
//
// houses() at a UT1 instant (UT1 input, so the band is the rate on TT times
// the ΔT band alone) gives the rate its band uses, band ÷ deltaT.sigma. The
// same rate over ±h is half the difference of houses() with ΔT pinned at
// d0 ± h on that UT1 input (TT moves by ±h, UT1 holds), divided by h: the
// central difference the engine takes, by another road. For each h the run
// reports the largest difference from the rate over ±60 s, which is short
// against the nutation's periods and the ayanamsa's motion, so that it shows
// the truncation error of the longer steps (h² f‴ / 6) and the rounding of
// the shorter ones (a few units in the last place of the angle, over h).
//
// Instants: 24 UT1 dates, 1800-01-02 + frac(0.123 + k √2 / 2) × (the span to
// 2199-12-30), k = 0 to 23. Sites: 15 latitudes from 69° S to 66.4° N. The 13
// systems in the tropical zodiac; whole sign and Placidus with Lahiri's, True
// Chitra's and True Pushya's ayanamsas.
import { entry, finish, manifest, options } from "./load.mjs";

const args = options();
if (!args.package) throw new Error("usage: node tt-step.mjs --package <root> --out <file>");
const { houses } = await entry(args.package, "./calc");

const SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const STEPS = [1, 10, 60, 600, 3600, 21600, 86400];
const REFERENCE = 60;
const J2000_JD = 2451545;
const from = Date.UTC(1800, 0, 2);
const to = Date.UTC(2199, 11, 30);
const instants = Array.from({ length: 24 }, (_, k) => J2000_JD + (from + ((0.123 + k * Math.SQRT1_2) % 1) * (to - from) - Date.UTC(2000, 0, 1, 12)) / 86_400_000);
const LATITUDES = [-69, -60, -45, -20, -5, 0.3, 0.5, 12, 33, 45, 52, 60, 64, 66, 66.4];
const sites = LATITUDES.map((latitude, i) => ({ latitude, longitude: Math.round((-170 + i * 23.7) * 10) / 10 }));
const ZODIACS = [["tropical", undefined, SYSTEMS], ...["lahiri", "true-chitra", "true-pushya"].map((name) => [name, { sidereal: name }, ["whole", "placidus"]])];

const ok = (result) => {
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return result;
};
const wrap = (d) => (d > 180 ? d - 360 : d <= -180 ? d + 360 : d);
const quantities = (result) => [result.angles.asc, result.angles.mc, result.vertex, result.eastPoint, ...(result.system === "whole" ? [] : result.cusps)];
const bandsOf = (band, system) => [band.asc, band.mc, band.vertex, band.eastPoint, ...(system === "whole" ? [] : band.cusps)];
const NAMES = ["asc", "mc", "vertex", "eastPoint", ...Array.from({ length: 12 }, (_, k) => `cusps.${k}`)];

const summary = {};
let count = 0;
for (const [zodiacName, zodiac, systems] of ZODIACS) {
  const worst = Object.fromEntries(STEPS.map((h) => [h, { absolute: 0, relative: 0, absoluteAt: null, relativeAt: null }]));
  const worstBand = { absolute: 0, relative: 0, at: null };
  for (const jd of instants) {
    for (const place of sites) {
      for (const houseSystem of systems) {
        const request = { place, houseSystem, ...(zodiac ? { zodiac } : {}) };
        const time = { jd, scale: "ut1" };
        const base = ok(houses({ ...request, time }));
        const d0 = base.receipt.instants[0].deltaT.seconds;
        const sigma = base.band.time.tt;
        const bandRates = bandsOf(base.band, base.system).map((band) => band / sigma);
        const rates = STEPS.map((h) => {
          const [plus, minus] = [quantities(ok(houses({ ...request, time: { ...time, deltaT: d0 + h } }))), quantities(ok(houses({ ...request, time: { ...time, deltaT: d0 - h } })))];
          return plus.map((value, index) => (Math.abs(wrap(value - minus[index])) * 3600) / (2 * h));
        });
        const reference = rates[STEPS.indexOf(REFERENCE)];
        reference.forEach((rate, index) => {
          count += 1;
          const where = { jdUt1: jd, ...place, houseSystem, what: NAMES[index], rateOver60s: rate };
          for (const [s, h] of STEPS.entries()) {
            const d = Math.abs(rates[s][index] - rate);
            const r = rate >= 1e-8 ? d / rate : 0;
            if (d > worst[h].absolute) Object.assign(worst[h], { absolute: d, absoluteAt: { ...where, rate: rates[s][index] } });
            if (r > worst[h].relative) Object.assign(worst[h], { relative: r, relativeAt: { ...where, rate: rates[s][index] } });
          }
          // The band's own rate against the pinned one over ±600 s, the step it takes: the same difference by another road.
          const d = Math.abs(bandRates[index] - rates[STEPS.indexOf(600)][index]);
          const r = rate >= 1e-8 ? d / rate : 0;
          if (d > worstBand.absolute) Object.assign(worstBand, { absolute: d, at: { ...where, bandRate: bandRates[index] } });
          worstBand.relative = Math.max(worstBand.relative, r);
        });
      }
    }
  }
  summary[zodiacName] = {
    fromRateOver60s: Object.fromEntries(STEPS.map((h) => [`${h} s`, worst[h]])),
    bandAgainstPinsOver600s: worstBand
  };
}

const package_ = manifest(args.package);
finish({
  check: "the step of the angles' rate on TT (development, synthetic inputs; not a check)",
  pass: true,
  records: count,
  engine: { name: package_.name, version: package_.version },
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  units: "arcseconds a second; relative differences only where the rate over ±60 s is at least 1e-8″ a second",
  steps: STEPS,
  reference: REFERENCE,
  instants,
  sites,
  summary
}, args.out);
