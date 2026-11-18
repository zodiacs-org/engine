#!/usr/bin/env node
/*
 * An installed engine's TT - UTC and its Moon and Sun on UTC input at the five
 * instants of the Horizons files in sources/, beside Horizons' TDB - UT and
 * apparent ecliptic longitude and latitude:
 *
 *   node horizons-comparison.mjs <package directory> > results/horizons-<version>.json
 *
 * The chart is natalChart({ utc, latitude: 0, longitude: 0 }) on the
 * package's default source (the shipped DE440 pack). Horizons prints the
 * IAU 1976/80 ecliptic of date, the engine the IAU 2006/2000A one; the raw
 * values are compared unrotated, and the share of the residual that is the
 * frame difference is not separated here.
 * TDB - TT is under 2 ms, below what is compared here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) throw new Error("usage: node horizons-comparison.mjs <package directory>");
const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const { natalChart } = await import(pathToFileURL(join(dir, "dist", "index.js")).href);
const { timeBasis } = await import(pathToFileURL(join(dir, "dist", "time.js")).href);

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const rows = (file) => {
  const text = readFileSync(join(here, "sources", file), "utf8");
  const body = text.slice(text.indexOf("$$SOE") + 5, text.indexOf("$$EOE")).trim().split("\n");
  return body.map((line) => {
    const [date, time, tdbUt, lon, lat] = line.trim().split(/\s+/u);
    const [y, m, d] = date.split("-");
    const [hh, mm, ss] = time.split(":");
    return { ms: Date.UTC(Number(y), MONTHS[m], Number(d), Number(hh), Number(mm), Number(ss)), tdbUt: Number(tdbUt), lon: Number(lon), lat: Number(lat) };
  });
};
const arcsec = (a, b) => ((((a - b) % 360) + 540) % 360 - 180) * 3600;
const J2000 = Date.UTC(2000, 0, 1, 12);

const moon = rows("horizons-moon-301.txt");
const sun = rows("horizons-sun-10.txt");
const out = { engine: `${pkg.name}@${pkg.version}`, instants: [] };
for (const [index, { ms, tdbUt }] of moon.entries()) {
  const basis = timeBasis(ms);
  const chart = natalChart({ utc: new Date(ms), latitude: 0, longitude: 0 });
  const at = (name) => chart.bodies.find((row) => row.body === name);
  const entry = {
    utc: new Date(ms).toISOString(),
    basis: chart.timeScale.basis,
    ephemeris: chart.ephemeris?.name ?? null,
    flags: chart.flags,
    ttMinusUtc: Math.round((basis.ttDays * 86_400_000 + J2000 - ms) * 1000) / 1e6,
    horizonsTdbMinusUt: tdbUt,
    deltaT: chart.deltaT.seconds,
    deltaTSigma: chart.deltaT.sigma,
    ut1MinusUtc: chart.timeScale.ut1MinusUtc
  };
  for (const [name, list] of [["Moon", moon], ["Sun", sun]]) {
    const row = at(name);
    entry[name] = {
      lon: row.lon,
      lat: row.lat,
      lonMinusHorizonsArcsec: Math.round(arcsec(row.lon, list[index].lon) * 1000) / 1000,
      latMinusHorizonsArcsec: Math.round((row.lat - list[index].lat) * 3600 * 1000) / 1000
    };
  }
  out.instants.push(entry);
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
