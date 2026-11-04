// T4 (../PREREGISTRATION.md, section 6): @zodiacs/engine/time against the
// module zodiacs.org commits (site main 9a67f761,
// src/lib/engine/time-basis.mjs), value for value, with SameValue on every
// number: an identity (regression) check, not accuracy evidence.
//
// Over K1, K2 and K3 on every scale and setting: timeBasis records,
// isDeepStrictEqual. elapsedDays over +-86,400 ms (days 0.002) and
// +-21,600,000 ms (days 0.5) around each K1 and K3 instant, on each scale and
// setting, Object.is; a pair whose sample would lie outside the Date range is
// left out and counted, since the entry refuses such an instant (T10). At the
// TT of every unpinned UTC record and of K4: tilt, eclipticFrame (tt, rows,
// tilt), meanEcliptic and eclipticOfDate of every vector of V, number for
// number. EPHEMERIS_SPAN deep-equal.
//
// The site file is given by path, refused unless its SHA-256 is the pin, and
// loaded from a temporary copy, as the site's generator loads its bundle;
// nothing of the site is committed here. A control changes that copy:
//   a  the last leap second ([57754, 37]) removed: UTC records from
//      2017-01-01 to 2027-10-02 must differ;
//   b  the first nutation coefficient -172064161 read as -172064160: frames
//      must differ at most TTs while every time-basis record agrees;
//   c  the module's timeBasis(ms + 1) against the entry's timeBasis(ms): every
//      record must differ.
//
//   node site-module.mjs --package <dir> --site <time-basis.mjs> --fixture <nutation-erfa.json> [--control a|b|c] [--out <file>]
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { PINS, SCALES, k1, k2, k3, k4, vectors } from "./corpora.mjs";
import { entry, finish, manifest, options } from "./load.mjs";

const SITE_SHA256 = "5857c888df07dd5a1695273797632ea8736f37a26aad2fe908b3d857d2333f40";
const opts = options();
for (const name of ["package", "site", "fixture"]) if (!opts[name]) throw new Error(`--${name} is required`);
const control = opts.control;
if (control !== undefined && !["a", "b", "c"].includes(control)) throw new Error(`unknown control ${control}`);

const bytes = readFileSync(opts.site);
const siteSha256 = createHash("sha256").update(bytes).digest("hex");
if (siteSha256 !== SITE_SHA256) throw new Error(`the site module's SHA-256 is ${siteSha256}, not the pin ${SITE_SHA256}`);
let text = bytes.toString("utf8");
const once = (needle, replacement) => {
  if (text.split(needle).length !== 2) throw new Error(`expected ${needle} once in the site module`);
  text = text.replace(needle, replacement);
};
if (control === "a") once(", [57754, 37]]", "]");
if (control === "b") once("-172064161,", "-172064160,");
const work = mkdtempSync(join(tmpdir(), "time-entry-site-"));
let site;
try {
  const file = join(work, "time-basis.mjs");
  writeFileSync(file, text);
  site = await import(pathToFileURL(file).href);
} finally {
  rmSync(work, { recursive: true, force: true });
}
const time = await entry(opts.package, "./time");
const shift = control === "c" ? 1 : 0;

const { k2a, k2b, v2 } = k2();
const corpora = { K1: k1(), K2: [...k2a, ...k2b], K3: k3() };
const V = vectors(v2);
const pinName = (pin) => (pin === undefined ? "none" : String(pin));
const first = (list, item) => { if (list.length < 20) list.push(item); };

// timeBasis on every scale and setting.
let records = 0;
let recordDifferences = 0;
const recordExamples = [];
const unpinnedUtcTt = [];
const utcRange = { from: Date.UTC(2017, 0, 1), to: Date.UTC(2027, 9, 2), inRange: 0, inRangeDiffering: 0, outsideDiffering: 0 };
for (const [corpus, instants] of Object.entries(corpora)) {
  for (const ms of instants) {
    for (const scale of SCALES) {
      for (const pin of PINS) {
        const ours = time.timeBasis(ms, scale, pin);
        const theirs = site.timeBasis(ms + shift, scale, pin);
        records += 1;
        const same = isDeepStrictEqual(ours, theirs);
        if (!same) {
          recordDifferences += 1;
          first(recordExamples, { corpus, ms, scale, pin: pinName(pin) });
        }
        if (scale === "utc" && pin === undefined) {
          unpinnedUtcTt.push(ours.ttDays);
          const inside = ms >= utcRange.from && ms <= utcRange.to;
          if (inside) utcRange.inRange += 1;
          if (!same) inside ? (utcRange.inRangeDiffering += 1) : (utcRange.outsideDiffering += 1);
        }
      }
    }
  }
}

// elapsedDays around K1 and K3.
let pairs = 0;
let pairsOutsideDateRange = 0;
let elapsedDifferences = 0;
const elapsedExamples = [];
for (const ms of [...corpora.K1, ...corpora.K3]) {
  for (const scale of SCALES) {
    for (const pin of PINS) {
      for (const [step, days] of [[86_400, 0.002], [21_600_000, 0.5]]) {
        if (Math.abs(ms - step) > 8.64e15 || Math.abs(ms + step) > 8.64e15) {
          pairsOutsideDateRange += 1;
          continue;
        }
        pairs += 1;
        const ours = time.elapsedDays(time.timeBasis(ms - step, scale, pin), time.timeBasis(ms + step, scale, pin), days);
        const theirs = site.elapsedDays(site.timeBasis(ms - step + shift, scale, pin), site.timeBasis(ms + step + shift, scale, pin), days);
        if (!Object.is(ours, theirs)) {
          elapsedDifferences += 1;
          first(elapsedExamples, { ms, scale, pin: pinName(pin), step, ours, theirs });
        }
      }
    }
  }
}

// The frame of date at the TT of every unpinned UTC record and of K4.
const sameNumbers = (a, b) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const TILT = ["dpsi", "deps", "mobl", "tobl", "ee"];
const tiltNumbers = (t) => [...TILT.map((key) => t[key]), Object.keys(t).length];
const tts = [...unpinnedUtcTt, ...k4(opts.fixture)];
let numbers = 0;
let frameDifferences = 0;
let ttsDiffering = 0;
const frameExamples = [];
for (const tt of tts) {
  let differs = false;
  const note = (what, ours, theirs) => {
    frameDifferences += 1;
    differs = true;
    first(frameExamples, { tt, what, ours, theirs });
  };
  const ourTilt = time.tilt(tt);
  const theirTilt = site.tilt(tt);
  numbers += 5;
  if (!sameNumbers(tiltNumbers(ourTilt), tiltNumbers(theirTilt))) note("tilt", ourTilt, theirTilt);
  const ourFrame = time.eclipticFrame(tt);
  const theirFrame = site.eclipticFrame(tt);
  const frameNumbers = (f) => [f.tt, ...f.rows, f.rows.length, ...tiltNumbers(f.tilt), Object.keys(f).length];
  numbers += 15;
  if (!sameNumbers(frameNumbers(ourFrame), frameNumbers(theirFrame))) note("eclipticFrame", frameNumbers(ourFrame), frameNumbers(theirFrame));
  for (const [x, y, z] of V) {
    const ours = time.meanEcliptic(ourFrame, x, y, z);
    const theirs = site.meanEcliptic(theirFrame, x, y, z);
    numbers += 3;
    if (!sameNumbers(ours, theirs)) note("meanEcliptic", ours, theirs);
    const ourPlace = time.eclipticOfDate(x, y, z, tt);
    const theirPlace = site.eclipticOfDate(x, y, z, tt);
    numbers += 2;
    if (!sameNumbers([ourPlace.lon, ourPlace.lat, Object.keys(ourPlace).length], [theirPlace.lon, theirPlace.lat, Object.keys(theirPlace).length])) {
      note("eclipticOfDate", ourPlace, theirPlace);
    }
  }
  if (differs) ttsDiffering += 1;
}
const spanEqual = isDeepStrictEqual(time.EPHEMERIS_SPAN, site.EPHEMERIS_SPAN);

const pass = recordDifferences === 0 && elapsedDifferences === 0 && frameDifferences === 0 && spanEqual;
const behaved = {
  a: () => utcRange.inRange > 0 && utcRange.inRangeDiffering === utcRange.inRange && utcRange.outsideDiffering === 0,
  b: () => recordDifferences === 0 && ttsDiffering > tts.length / 2,
  c: () => recordDifferences === records
};
await finish({
  check: "T4",
  tool: "site-module.mjs",
  package: { name: manifest(opts.package).name, version: manifest(opts.package).version },
  site: { sha256: siteSha256 },
  control: control ?? null,
  controlBehaved: control ? behaved[control]() : null,
  counts: {
    instants: Object.fromEntries(Object.entries(corpora).map(([name, list]) => [name, list.length])),
    records,
    elapsedPairs: pairs,
    elapsedPairsOutsideDateRange: pairsOutsideDateRange,
    frameTts: tts.length,
    frameNumbers: numbers,
    vectors: V.length
  },
  differences: { records: recordDifferences, elapsedDays: elapsedDifferences, frameNumbers: frameDifferences, ttsDiffering, span: !spanEqual },
  unpinnedUtcFrom2017To20271002: utcRange,
  examples: { records: recordExamples, elapsedDays: elapsedExamples, frame: frameExamples },
  node: process.version,
  pass
}, opts.out);
