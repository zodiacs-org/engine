import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8"
});
const report = JSON.parse(output)[0];
assert(report, "npm pack returned no report");

const files = report.files.map((entry) => entry.path).sort();
const required = [
  "CHANGELOG.md",
  "LICENSE",
  "LICENSING.md",
  "NOTICE",
  "README.md",
  "dist/calc.d.ts",
  "dist/calc.js",
  "dist/conventions.d.ts",
  "dist/conventions.js",
  "dist/core.d.ts",
  "dist/core.js",
  "dist/crossings.d.ts",
  "dist/de440.d.ts",
  "dist/de440.js",
  "dist/de440-pack.d.ts",
  "dist/de440-pack.js",
  "dist/crossings.js",
  "dist/deltat.d.ts",
  "dist/deltat.js",
  "dist/geo.d.ts",
  "dist/geo.js",
  "dist/houses-extra.d.ts",
  "dist/houses-extra.js",
  "dist/receipt.d.ts",
  "dist/receipt.js",
  "dist/techniques.d.ts",
  "dist/techniques.js",
  "dist/time.d.ts",
  "dist/time.js",
  "dist/sky.d.ts",
  "dist/sky.js",
  "dist/timing.d.ts",
  "dist/timing.js",
  "dist/vedic.d.ts",
  "dist/vedic.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/internal-math.d.ts",
  "dist/internal-math.js",
  "dist/internal.d.ts",
  "dist/internal.js",
  "dist/lite.d.ts",
  "dist/lite.js",
  "dist/lite-composite.js",
  "dist/lite-declinations.js",
  "dist/lite-dignities.js",
  "dist/lite-sect.js",
  "dist/window.d.ts",
  "dist/window.js",
  "package.json"
];
for (const file of required) {
  assert(files.includes(file), `packed package is missing ${file}`);
}

for (const file of files) {
  assert(!file.includes("node_modules"), `dependency leaked into package: ${file}`);
  assert(!file.includes("src/"), `source file leaked into package: ${file}`);
  assert(!file.includes("data/"), `data file leaked into package: ${file}`);
  assert(!file.endsWith(".map"), `source map leaked into package: ${file}`);
}

// Sizes. From 0.1.1-rc.15 the package is gated by budgets rather than by one
// unpacked total: one for each entry point's own import graph, one for the
// zone histories, and a stated cap on the whole package.
//
// An entry's import graph is the JavaScript a plain `import` of it loads: its
// file under dist/ and every chunk it imports, statically and transitively.
// astronomy-engine, the one dependency, is not counted, and neither are
// declarations, which no runtime loads. The root entry (".") is the base
// every other graph is compared with (the notes below, written before
// @zodiacs/engine/core existed, call its graph "the core's"): a
// consumer that imports only it loads only its graph, because the root
// imports no subpath (scripts/module-resolution-smoke.mjs checks that it
// reaches no timing, Vedic or geo module and no zone history).
//
// Each budget is 0.1.1-rc.15's measured graph as first cut, stated beside
// it, with headroom from 4.96 per cent of that size (the root) to 11.32 per
// cent (/receipt). docs/evidence/rc15-20260929/sizes.json gives later
// measurements and each one's headroom. A budget is raised only in a
// candidate whose CHANGELOG says so, with the reason; never in passing.
//
// 0.1.1-rc.16 raises six, each for the feature that grew it, to about 5 per
// cent over its measured graph (docs/evidence/rc16-20260930/sizes.json):
// each was raised after the size it fits had been measured. The IAU 2000B
// nutation (src/nutation.ts, src/frame.ts) sits in the root's ephemeris
// chunk, so every graph that loads the ephemeris carries it: 5,794 bytes in
// the root. Two of the six were preregistered limits: ./techniques's 150,000
// (the techniques entry's gate G5) and ./timing's 120,000 (the houses entry's
// gate B). Raising them does not make those gates pass; rc.16 records both
// as failed (CHANGELOG.md).
//
// 0.1.1-rc.17 raises one, ./calc's, for the sidereal zodiac, after measuring
// the graph it fits (docs/evidence/rc17-20261005/sizes.json).
//
// 1.0.0-rc.1 raises one, ./geo's, for ZoneHistoryNotLoadedError and
// calendarNote's checks, with the owner's approval of 2026-10-06, after
// measuring the graph it fits (docs/evidence/1.0.0-rc.1-20261006/sizes.json).
//
// 1.0.0-rc.2 raises none. What lets a bundler leave out a table
// (scripts/pure-tables.mjs), marks of 16 bytes each and six functions called
// in place, grows each graph by what it loads of it, less 105 bytes where it
// loads the time scale, whose bounds are now written as numbers: the root's
// by 615 bytes. The tables that only ./calc and ./vedic load are not marked,
// because their marks would put those two entries over their budgets
// (docs/evidence/1.0.0-rc.2-20261006/sizes.json).
//
// 1.0.0 raises none. Its graphs are 1.0.0-rc.2's, less the five bytes of
// "-rc.2" in each that loads the engine's version
// (docs/evidence/1.0.0-20261011/sizes.json).
//
// 1.1.0-rc.1 adds ./conventions, with a budget of its own, and raises
// ./receipt's, which loads the ids, with the owner's approval of 2026-10-26,
// after measuring the graph it fits
// (docs/evidence/1.1.0-rc.1-20261026/sizes.json). Each graph that loads the
// engine's version grows by the five bytes of "1.1.0-rc.1" over "1.0.0".
//
// 1.1.0-rc.2 adds ./time and ./lite, each with a budget of its own, and
// raises ./calc's and ./vedic's, each to the ceiling approved under the
// owner's delegation of 2026-11-03 (OQ3 in
// docs/evidence/1.1.0-rc.2-20261102/OWNER-ANSWERS.md) rather than to about 5
// per cent over a measured graph: ./calc for the F-89 corrections and the
// time bands, ./vedic for the varga sensitivity. The graphs they fit are in
// docs/evidence/1.1.0-rc.2-20261102/sizes.json. ./time loads the root's time
// scale, ΔT, nutation, frame, houses and signs without the ephemeris, so the
// build moves the nutation and the frame out of the ephemeris chunk, and
// src/signs.ts out of the chunk it shared with src/aspects.ts and
// src/types.ts, into chunks of their own. Each graph that loads them grows
// by the imports and exports that join the parts: the root's by 345 bytes,
// ./timing's by 337, ./window's by 315 (443 bytes, 0.42 per cent, left),
// ./internal's and ./sky's by 299, and ./receipt's and ./internal/math's by
// 49; ./techniques's by 405, with the two modules the composite functions
// and the name helpers moved to (src/techniques/composite.ts and
// src/techniques/names.ts). None of those budgets is raised.
//
// 1.1.0-rc.9 makes the shipped DE440 pack the root's default source
// (docs/de440.md), so the root's ephemeris chunk imports the code that opens
// and reads a pack (src/de440.ts and src/de440/, with a synchronous SHA-256,
// src/de440/sha256.ts) and the chunk that holds the pack, and so does every
// entry whose graph loads that chunk. Each graph is measured without the
// pack's 3,319,552 characters (PACK_DATA_BYTES below), which are held to
// their exact size instead. Against 1.1.0-rc.7, measured on its carried
// archive (docs/evidence/1.1.0-rc.9-20261114/sizes.json), the ten graphs
// that change, old budget, new measurement and new budget:
//   .             109,000   142,693   144,000
//   ./calc        156,000   188,246   190,000
//   ./internal     69,000   102,834   104,000
//   ./sky          97,000   130,782   132,000
//   ./techniques  160,000   192,603   194,500
//   ./timing      129,000   161,941   163,500
//   ./vedic       144,500   177,728   179,500
//   ./window      107,000   140,974   142,500
//   ./de440        48,000    50,140    50,700
//   ./de440/pack   (new)     51,360    52,000
// Each of the first eight grows by the same code, the root's own growth; the
// last two by the synchronous opener and its SHA-256. Each new budget is the
// measurement and about one per cent. None has the owner's approval: they
// are for the owner to decide with the candidate. The nine other graphs
// (./conventions, ./crossings, ./deltat, ./geo, ./houses, ./internal/math,
// ./lite, ./receipt and ./time) load neither the pack nor its code, and
// their budgets are not raised.
//
// 1.1.0-rc.10 puts the calc and window entries on the default source, flags
// every fallback from the pack on the result itself, names the ephemeris on
// every result, and contains pull request 102 (the far-future ΔT flag and
// its widened bounds). Against 1.1.0-rc.9, measured on the two carried
// archives (docs/evidence/1.1.0-rc.10-20261114/sizes.json), the eleven
// graphs over their budgets, old budget, new measurement and new budget:
//   .             144,000   147,832   149,400
//   ./calc        190,000   197,802   199,900
//   ./geo          35,600    35,614    35,700
//   ./internal    104,000   107,011   108,200
//   ./sky         132,000   134,959   136,400
//   ./techniques  194,500   197,811   199,900
//   ./timing      163,500   167,135   168,900
//   ./vedic       179,500   182,867   184,800
//   ./window      142,500   147,950   149,500
//   ./de440        50,700    52,616    53,200
//   ./de440/pack   52,000    53,836    54,400
// The root's 5,139 bytes are the choice of a source with its reason, the
// labels and flags on charts and bodies, the fallback notes for searches,
// the ΔT flag, and, in the DE440 code it imports, a place's distance and
// the list of record boundaries the window search needs (`steps`); the
// entries that load the root's chunks grow with it. ./calc grows by 9,556:
// that, the pack's path through its frames and bounds, and pull request
// 102's widening. ./window by 6,976: that, the seams and the rate bound
// near the Sun. ./de440 and
// ./de440/pack by 2,476, the boundaries and `steps`. ./geo by 30, the two
// flag names in the list of derived flags it shares. Each new budget is the
// measurement and about one per cent (./geo's 0.24). None has the owner's
// approval: they are for the owner to decide with the candidate. ./receipt
// (75,814 of 76,500) and ./internal/math (19,225 of 20,000) grow inside
// their budgets; the six other graphs do not change.
//
// 1.1.0-rc.11 labels every result of the techniques entry with the ephemeris
// its positions came from and the fallback flags (the rc.10 breaker's B1),
// and adds the detailed forms of its four functions that return a bare
// value. Measured on this build, ./techniques is 201,294 bytes, 3,483 more
// than 1.1.0-rc.10's 197,811 (the labels on three objects and on the
// elements of three lists, and the detailed forms), over its budget of
// 199,900: raised to 203,800, the measurement and about one per cent. It has
// not the owner's approval: it is for the owner to decide with the
// candidate. Every other graph grows inside its budget (the root by 304
// bytes, `ephemerisOver`, which the techniques entry's labels and the
// internal entry's detailed forms share with it in the ephemeris chunk).
//
// 1.1.0-rc.12 bends no light from a planet behind the Sun's disc (the rc.11
// breaker's B2), gives a speed's samples the instant's own side of the disc,
// labels chartPoints and chartDeclinations (B1), and names astronomy-engine
// on a flagged saturnReturn. Measured on this build, the root is 150,170
// bytes beside the pack, 2,034 more than 1.1.0-rc.11's 148,136 (the disc
// rule in the reduction, the labels, the speed's side), over its budget of
// 149,400; the graphs that share the root's chunks grow with it, eight over
// their budgets: ./calc 202,042 (and the limb bound), ./de440 53,988,
// ./de440/pack 55,208, ./internal 109,770, ./sky 137,224, ./timing 169,473,
// ./vedic 185,205 and ./window 149,947 (and the deflection's displacement in
// place of the rate raise). Each is raised to the measurement and about one
// per cent: the root to 151,700, ./calc 204,100, ./de440 54,600,
// ./de440/pack 55,800, ./internal 110,900, ./sky 138,600, ./timing 171,200,
// ./vedic 187,100, ./window 151,500. None has the owner's approval: they are
// for the owner to decide with the candidate. ./techniques (203,328 of
// 203,800) and the other graphs grow inside their budgets or not at all.
//
// 2.0.0-rc.3 merges pull requests 114 (Julian Day Numbers and local mean
// time in ./geo), 115 (near-miss birth keys refused), 117 (the host's time
// zone data checked, with its 2021a to 2026f probe table in ./geo), 118
// (tzdata 2026f's zone histories), 119 (the continuous-UTC rule) and 121
// (the ./core entry). Measured on this build, twelve graphs are over their
// budgets; old budget, 2.0.0-rc.2's measurement, this build's, new budget:
//   .             151,700   151,563   154,173   154,200
//   ./calc        204,100   203,138   205,334   205,400
//   ./core        109,600         -   110,765   110,800
//   ./geo          36,500    36,178    47,715    47,800
//   ./internal    110,900   110,362   112,381   112,400
//   ./receipt      77,400    76,845    81,110    81,200
//   ./sky         138,600   137,816   139,835   139,900
//   ./techniques  207,300   205,247   207,561   207,600
//   ./time         42,600    42,530    44,485    44,500
//   ./timing      171,200   170,866   173,476   173,500
//   ./vedic       187,100   186,598   189,208   189,300
//   ./window      151,500   150,577   152,731   152,800
// The root's 2,610 bytes are 115's key list and check (565), 117's flag in
// the shared flag lists (26), 119's continuous basis, its UT1 solve and the
// receipts' choice of rule (1,910) and 121's split of the root's default
// source into src/ephemeris-shipped.ts (109); every graph that loads the
// root's chunks grows with it. ./geo grows by 11,537: 117's probe table and
// host check and 114's day-number and mean-time functions (10,039 and 1,486
// as each pull request measured itself on main). ./receipt by 4,265: 119's
// two conventions sets, their feature and the old rule kept for old records
// (3,926), and 117's checks of the flag (339). ./time by 1,955, 119's basis.
// ./core is 121's entry, 108,411 as first measured, with 115's, 117's and
// 119's code in the root's graph it copies. ./techniques grows by 2,314: the
// root's growth and 114's calendar chunk, which it shares with ./geo, less
// the local-time code 117's split of the wall-time reader took out of it.
// Each new budget is the measurement rounded up to the next hundred bytes, to
// fit it and no more: they are for the owner to decide with the candidate.
// The other graphs are inside their budgets.
//
// 2.0.0-rc.4 refuses a name that is not a body with a RangeError before any
// source is asked (src/ephemeris.ts, knownBody): 143 bytes in every graph
// that holds src/ephemeris.ts. The root had 27 bytes to spare, so nine
// graphs are over their budgets; old budget, 2.0.0-rc.3's measurement, this
// build's, new budget:
//   .             154,200   154,173   154,316   154,400
//   ./calc        205,400   205,334   205,477   205,500
//   ./core        110,800   110,765   110,908   111,000
//   ./internal    112,400   112,381   112,524   112,600
//   ./sky         139,900   139,835   139,978   140,000
//   ./techniques  207,600   207,561   207,704   207,800
//   ./timing      173,500   173,476   173,619   173,700
//   ./vedic       189,300   189,208   189,351   189,400
//   ./window      152,800   152,731   152,874   152,900
// Each new budget is the measurement rounded up to the next hundred bytes, to
// fit it and no more, for the owner to decide with the candidate. The other
// graphs are inside their budgets, unchanged.
//
// 2.0.0-rc.5 calls assertKnownBody from the root crossing-search wrappers
// (src/returns.ts) and exports it (src/ephemeris.ts): seven graphs are over
// their budgets; old budget, 2.0.0-rc.4's measurement, this build's, new
// budget:
//   .             154,400   154,316   154,422   154,500
//   ./calc        205,500   205,477   205,514   205,600
//   ./sky         140,000   139,978   140,015   140,100
//   ./techniques  207,800   207,704   207,810   207,900
//   ./timing      173,700   173,619   173,725   173,800
//   ./vedic       189,400   189,351   189,457   189,500
//   ./window      152,900   152,874   152,911   153,000
// Each new budget is the measurement rounded up to the next hundred bytes, to
// fit it and no more, for the owner to decide with the candidate. The other
// graphs are inside their budgets, unchanged (./internal 112,561 of 112,600;
// ./core 110,976 of 111,000).
const ENTRY_BUDGETS = {
  // rc.14: 81,712 bytes. rc.15: 95,273. Of the 13,561 bytes more, 10,294 are
  // the time basis every chart now needs (the leap-second and IERS UT1
  // tables, 5,300, and src/time-scale.ts, 4,994), 1,069 its use in the
  // ephemeris and the API, 655 the Placidus bisection, and 1,543 the imports
  // and exports of the chunks the new entry points share with the root
  // (docs/evidence/rc15-20260929/sizes.json). rc.15 as carried: 97,704.
  // rc.16: 103,537, raised from 100,000 for the nutation, 5,794 bytes
  // (src/nutation.ts 4,146 and src/frame.ts 2,110, less 508 in
  // src/ephemeris.ts, and 46 of imports, exports and their use in
  // src/declination.ts and src/points.ts), and for 39 bytes of export names
  // the calc, window and sky entries import from the root's chunk (gastHours,
  // tilt, eclipticOfDate); 4.79 per cent of headroom. 1.1.0-rc.3: 108,531,
  // 2,206 more than 1.1.0-rc.2's 106,325, for withEphemeris and the source's
  // path in the ephemeris chunk, and, after the cut's reviews, the refusal of
  // the code that computes its own positions; raised to 109,000 under the
  // owner's delegation of 2026-11-04; 0.43 per cent of headroom.
  ".": 154_500,
  // New in rc.16 (feature-api): the uniform calculation API, its frames,
  // centers, corrections, bounds and receipts. 106,779 bytes as integrated on
  // rc.15's time basis, 34,449 of them beyond the core's graph; 7.69 per cent
  // of headroom. With the nutation, and its frames of date (src/equator.ts)
  // and topocentric observer on it, 113,904: 0.96 per cent, not raised
  // (docs/evidence/rc16-20260930/sizes.json). rc.17: 139,836, raised from
  // 115,000 for the sidereal zodiac, which imports the Vedic entry's
  // ayanamsas, with their star catalogue and apparent places, and its
  // sidereal charts: 17,596 bytes in a chunk the two entries share and 8,336
  // in calc.js (docs/evidence/rc17-20261005/sizes.json); 4.05 per cent of
  // headroom. 1.0.0-rc.1: 144,694, with the reviews' checks and a caller's
  // epochs across EPHEMERIS_SPAN; 0.55 per cent, not raised
  // (docs/evidence/1.0.0-rc.1-20261006/sizes.json). 1.0.0-rc.2: 145,261, with
  // the core's marks; 0.16 per cent, not raised. 1.1.0-rc.2: 151,426, 6,165
  // more than 1.1.0-rc.1's 145,261, with the F-89 corrections, the time bands
  // (and the timeBands chunk it shares with ./time) and the chunks split out
  // for ./time (above); raised to 156,000, the ceiling approved under the
  // owner's delegation of 2026-11-03 (OQ3); 3.02 per cent of headroom.
  "./calc": 205_600,
  // New in 1.1.0-rc.1: the ids of the conventions registry. 2,754 bytes, its
  // own file and the chunk of ids it shares with ./receipt; 5.30 per cent of
  // headroom.
  "./conventions": 2_900,
  // New with ZOD-292: the root's graph without the DE440 files, bundled on
  // its own into one file by scripts/build-core.mjs. 108,411 bytes as
  // measured on this build, as on the prototype measured in
  // docs/evidence/bundle-weight-20261117/; 1.10 per cent of headroom.
  "./core": 111_000,
  // rc.15: 9,410. 1.0.0-rc.1: 9,942, its options read as the shared reader
  // reads them; 0.58 per cent, not raised.
  "./crossings": 10_000,
  "./deltat": 5_500, // rc.15: 4,968
  // rc.15: 31,672, the zone histories not included (below). With ./techniques
  // 32,136: the local-time code moves to a chunk the two entries share, and
  // geo.js re-exports it. 1.0.0-rc.1: 35,375, with ZoneHistoryNotLoadedError
  // and calendarNote's input checks from the API review; raised from 35,000 to
  // 35,500 with the owner's approval of 2026-10-06; 0.35 per cent of headroom.
  // 1.0.0-rc.2: 35,439, with the marks; 0.17 per cent, not raised.
  // 1.1.0-rc.6: 35,584, with the fold option of the local-time resolver, its
  // input check and its error message; raised from 35,500 to 35,600 with the
  // owner's approval of 2026-11-11; 0.04 per cent of headroom.
  // 2.0.0-rc.1: 36,178, 564 more than 1.1.0's 35,614, with the
  // calendar-unknown flag's zone evidence (the capital-zone list and the
  // narrowed check, pull request 110) and the polar-angles flag (pull
  // request 105); raised from 35,700 to 36,500, the measurement and about
  // one per cent, for the owner to decide with the candidate.
  "./geo": 47_800,
  // Unreleased (feature-houses-extra): 13,606, one file that imports no other
  // module, the root's included, so that its graph cannot grow with the core
  // (docs/evidence/houses-extra-2026-09-29/).
  "./houses": 15_000,
  // New in 1.1.0-rc.3: positions from a sealed DE440 pack the caller
  // supplies (zodiacs.org's P4.1, the hosted backend): dist/de440.js, the
  // pack reader, the reduction and its IAU 2006 frames, and the shared chunks
  // it imports, the one with the engine's IAU 2000B terms among them. 45,793
  // bytes in 4 files; 48,000 approved by the owner on 2026-11-10; 4.81 per
  // cent of headroom.
  "./de440": 54_600,
  // New in 1.1.0-rc.9 (first in the withdrawn draft 1.1.0-rc.8): the entry that
  // gives out the sealed DE440 pack the package ships (docs/de440.md). The
  // lines below are that draft's, when only this entry held the pack; the
  // comment above ENTRY_BUDGETS has 1.1.0-rc.9's measurement.
  // dist/de440-pack.js holds the pack's 2,489,664 bytes as 3,319,552
  // characters of base64 (PACK_DATA_BYTES below, checked on its own) and
  // 1,017 bytes of code that decode and open it; the rest of the graph is
  // ./de440's, which it opens the pack with: 3,366,303 bytes in 5 files,
  // 46,751 of them not the pack. The budget is the pack and 49,400, which
  // leaves that code 5.67 per cent of headroom; for the owner to approve.
  // With a second entry loading it, the build moves ./de440's code from
  // dist/de440.js into a chunk the two share, and ./de440's graph grows by
  // the 276 bytes that join them, to 46,069; its budget is not raised.
  "./de440/pack": 55_800,
  // rc.15: 56,961; as carried, 58,997. rc.16: 64,830, raised from 60,000 for
  // the nutation in the ephemeris chunk; 4.88 per cent of headroom.
  // 1.1.0-rc.3: 68,758, with withEphemeris, the source's path and the
  // refusal in the ephemeris chunk; raised to 69,000 with the owner's
  // approval of 2026-11-10; 0.35 per cent of headroom.
  "./internal": 112_600,
  "./internal/math": 20_000, // rc.15: 18,165
  // New in 1.1.0-rc.2: declination parallels, the sect under a named
  // convention, composite midpoints and their aspects, and the dignities,
  // without the ephemeris: dist/lite.js and the four files it re-exports,
  // each built on its own and importing nothing (scripts/build-lite.mjs).
  // 1.1.0-rc.2: 28,930 bytes in 5 files. 29,000 is the ceiling approved
  // under the owner's delegation of 2026-11-03 (OQ3); 0.24 per cent of
  // headroom.
  "./lite": 29_000,
  // rc.15: 62,880. 1.0.0: 69,491. 1.1.0-rc.1: 72,500, 3,009 more, raised
  // from 70,000 with the owner's approval of 2026-10-26 for the receipt's
  // convention ids: the chunk of ids it shares with ./conventions and the
  // codec's new set, its feature and its check of the ids; 5.51 per cent of
  // headroom.
  // 2.0.0-rc.1: 76,623, with the receipt checks of the calendar-unknown
  // and polar-angles flags (pull requests 110 and 105); raised from 76,500
  // to 77,400, the measurement and about one per cent, for the owner to
  // decide with the candidate.
  "./receipt": 81_200,
  // Returns, composite and Davison charts, the void-of-course Moon, aspect
  // patterns, dignities and Moon-sign candidates, moved from Zodiacs.org:
  // 141,745 as first built, with the core's graph and the local-time chunk
  // it shares with ./geo (docs/evidence/techniques-2026-09-29/); 5.8 per
  // cent of headroom. rc.16: 152,472, raised from 150,000 for the nutation
  // in the ephemeris chunk; 4.93 per cent of headroom.
  // 2.0.0-rc.1: 205,215, with the local-time chunk it shares with ./geo
  // (pull request 110's zone evidence), the bare-date check (109), the
  // positions() rows' flags (111) and the polar-angles flag (105); raised
  // from 203,800 to 207,300, the measurement and about one per cent, for the
  // owner to decide with the candidate.
  "./techniques": 207_900,
  // New in 1.1.0-rc.2: the time basis and the frame of date with no
  // ephemeris (Zodiacs.org's finding F-53), and the time bands it re-exports.
  // 1.1.0-rc.2: 42,306 bytes in 7 files, dist/time.js and the six chunks it
  // imports, the timeBands chunk it shares with ./calc among them. 42,400 is
  // the ceiling approved under the owner's delegation of 2026-11-03 (OQ3);
  // 0.22 per cent of headroom.
  // 1.1.0-rc.3: 42,472, the nutation chunk now also exporting its terms,
  // arguments and offsets to ./de440; raised to 42,600 with the owner's
  // approval of 2026-11-10; 0.30 per cent of headroom.
  "./time": 44_500,
  // Rise, set, transit and planetary hours, 83,254 bytes as first built, of
  // which 15,902 are beyond the core's graph; it reaches the ephemeris chunk
  // for the engine's clock (onChartClock), and so the core modules that chunk
  // imports. 85,237 on rc.15. rc.16: 92,109, raised from 92,000 for the
  // nutation in the ephemeris chunk and the frames of date the entry now
  // takes from it (src/equator.ts, shared with ./calc) in place of
  // astronomy-engine's; 5.31 per cent of headroom.
  "./sky": 140_100,
  // rc.15: 112,485, the core's graph included; as carried, 114,916. With
  // planetary returns 117,219. rc.16: 123,039, raised from 120,000 for the
  // nutation in the ephemeris chunk; 4.84 per cent of headroom.
  "./timing": 173_800,
  // rc.15: 114,106, the core's graph included; as carried, 116,779. rc.16:
  // 122,131, raised from 120,000 for the nutation in the ephemeris chunk
  // (the ayanamsas now use its frame); 4.80 per cent of headroom. rc.17:
  // 123,639, its ayanamsas and sidereal charts now in a chunk it shares with
  // ./calc; 3.52 per cent, not raised. 1.0.0-rc.1: 127,184, its options and
  // inputs read strictly; 0.64 per cent, not raised. 1.0.0-rc.2: 127,751,
  // with the core's marks; 0.19 per cent, not raised. 1.1.0-rc.2: 141,340,
  // 13,589 more than 1.1.0-rc.1's 127,751, with the varga sensitivity and the
  // chunks split out for ./time (above); raised to 143,000, the ceiling
  // approved under the owner's delegation of 2026-11-03 (OQ3); 1.17 per cent
  // of headroom. 1.1.0-rc.3: 143,652, 2,312 more, the ephemeris chunk's
  // growth (above) and the refusals in the ayanamsas and the varga timing;
  // raised to 144,500 under the owner's delegation of 2026-11-04; 0.59 per
  // cent of headroom.
  "./vedic": 189_500,
  // New in rc.16 (feature-window): birth-time window partitions, the search
  // and its enclosures. 97,064 bytes as integrated on rc.15's time basis,
  // 33,971 of them beyond the core's graph; 8.17 per cent of headroom. With
  // the nutation, 102,590: 2.34 per cent, not raised
  // (docs/evidence/rc16-20260930/sizes.json). 1.1.0-rc.3: 106,786, with
  // withEphemeris and the source's path in the ephemeris chunk and
  // birthWindow's refusal inside it; raised to 107,000 with the owner's
  // approval of 2026-11-10; 0.20 per cent of headroom.
  "./window": 153_000
};

/** The dist/ files an entry loads statically, with their bytes. */
function importGraph(entry) {
  const sizes = new Map();
  const visit = (file) => {
    if (sizes.has(file)) return;
    assert(files.includes(file), `${file} is imported but not packed`);
    const code = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    sizes.set(file, Buffer.byteLength(code));
    // Static imports and re-exports, as the build writes them: a statement at
    // the start of a line. Dynamic import() calls (the zone histories) are not
    // part of the graph.
    for (const match of code.matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu)) {
      const specifier = match[1] ?? match[2];
      if (specifier === "astronomy-engine") continue;
      assert(specifier.startsWith("./"), `${file} imports ${specifier}`);
      visit(`dist/${specifier.slice(2)}`);
    }
  };
  visit(entry);
  return sizes;
}

// The DE440 pack: one string of base64 in one shared chunk. Each graph's
// budget is for its code, so a graph that loads the chunk is measured
// without the pack's characters, which have their own exact size.
const PACK_DATA_BYTES = 3_319_552;
const PACK_DATA = /"([A-Za-z0-9+/]{1000,}={0,2})"/gu;
const packedText = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const packHolders = files.filter((file) => file.endsWith(".js") && packedText(file).search(PACK_DATA) !== -1);
assert(packHolders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(packHolders[0]),
  `the DE440 pack's base64 text must be in exactly one shared chunk under dist/; found it in ${packHolders.join(", ") || "no file"}`);
const PACK_HOLDER = packHolders[0];
const packText = [...packedText(PACK_HOLDER).matchAll(PACK_DATA)];
assert(packText.length === 1 && packText[0][1].length === PACK_DATA_BYTES,
  `${PACK_HOLDER} must hold the pack once, as ${PACK_DATA_BYTES} characters of base64`);
const packBytes = Buffer.from(packText[0][1], "base64");
assert.equal(packBytes.length, 2_489_664, "the shipped DE440 pack must be 2,489,664 bytes");
assert.equal(createHash("sha256").update(packBytes).digest("hex"), "51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7",
  "the shipped DE440 pack must be the sealed pack docs/de440.md names");

const exported = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).exports;
assert.deepEqual(Object.keys(exported).sort(), Object.keys(ENTRY_BUDGETS).sort(),
  "every entry point in package.json exports needs a budget here, and every budget an entry point");
const graphs = Object.fromEntries(Object.entries(exported).map(([name, target]) => {
  const sizes = importGraph(target.import.replace(/^\.\//u, ""));
  const all = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  return [name, { files: sizes.size, bytes: all - (sizes.has(PACK_HOLDER) ? PACK_DATA_BYTES : 0), pack: sizes.has(PACK_HOLDER), sizes }];
}));
for (const [name, graph] of Object.entries(graphs)) {
  assert(graph.bytes <= ENTRY_BUDGETS[name],
    `the ${name} entry's import graph is ${graph.bytes} bytes${graph.pack ? " beside the DE440 pack" : ""}, over its budget of ${ENTRY_BUDGETS[name]}`);
}
// The entries whose graphs load the pack: the root and every entry that
// loads the root's ephemeris chunk, and the entry that gives the pack out.
// The others must stay without it (./de440 itself among them: it opens a
// pack the caller supplies).
assert.deepEqual(Object.keys(graphs).filter((name) => graphs[name].pack).sort(), [".", "./calc", "./de440/pack", "./internal", "./sky", "./techniques", "./timing", "./vedic", "./window"],
  "the entry points whose graphs load the DE440 pack must be the ones docs/de440.md names");

// The zone histories before 1970: tzdb data, not code, loaded only by
// @zodiacs/engine/geo and only on request (prepareLocalTime), one of 16 files
// per call, so no core or post-1970 consumer ever downloads them. They have a
// budget of their own, sized for this tzdb release with room for the next
// (rc.15: 189,144 bytes), so that they cannot hide growth in the code.
const SHARD = /^dist\/tzdb-\d{4}[a-z]-\d{2}-[A-Za-z0-9]+\.js$/;
const SHARD_COUNT = 16;
const SHARD_BUDGET = 200_000;
const shards = report.files.filter((entry) => SHARD.test(entry.path));
const shardBytes = shards.reduce((sum, entry) => sum + entry.size, 0);
assert.equal(shards.length, SHARD_COUNT, `expected ${SHARD_COUNT} zone-history shards, found ${shards.length}`);
assert(
  files.every((file) => SHARD.test(file) || !file.startsWith("dist/tzdb-")),
  "an unexpected tzdb file is in the package"
);
assert(shardBytes < SHARD_BUDGET, `zone-history shards are unexpectedly large: ${shardBytes} bytes`);

// The whole package. Until rc.14 one cap, 300,000 bytes unpacked, bounded
// everything; rc.14 was 282,469. rc.15 as first cut was 634,490, 352,021
// more (docs/evidence/rc15-20260929/sizes.json): 274,897 bytes (78.09 per
// cent of the growth) of JavaScript that only the opt-in entry points load,
// 189,144 of them /geo's zone histories; 48,380 (13.75 per cent) of
// declarations, which no runtime loads; 15,183 (4.32 per cent) of README,
// CHANGELOG, licences and manifest; and 13,561 (3.86 per cent) of the root's
// own graph, 11,363 of them the time basis, which the root's budget above
// holds. Code that imports only the root loads only that graph. rc.15 as
// carried was 668,343 bytes, under that cap of 700,000.
//
// rc.16 adds five opt-in entry points (./calc, ./window, ./techniques,
// ./houses and ./sky). Brought onto rc.15, before the nutation, they took the
// package to 879,777 bytes, 211,434 more (docs/evidence/rc16-20260930/
// sizes.json): 137,039 (64.81 per cent) of JavaScript that only the opt-in
// entry points load; 54,041 (25.56 per cent) of declarations; 20,341 (9.62
// per cent) of README, CHANGELOG and manifest; and 13 of the root's own graph.
// The cap was raised to 950,000 bytes after those sizes had been measured
// (5e0d00c), for the new entry points and their documentation, with room for
// the nutation series; the techniques and houses entries' preregistrations
// had fixed it at 700,000 (their gates G5 and B, which rc.16 records as
// failed). rc.16 as packed, with them: 923,282 bytes in 69 files, 254,939
// more than rc.15 as carried: 137,705 (54.01 per cent) of JavaScript that
// only the opt-in entry points load; 56,021 (21.97) of their declarations;
// 54,434 (21.35) of README, CHANGELOG, licences and notices; 5,833 (2.29) of
// the root's own graph, the nutation and 39 bytes of shared exports (above);
// 868 (0.34) of manifest; and 78 (0.03) of the root's declarations. The cap
// leaves 2.89 per cent (docs/evidence/rc16-20260930/sizes.json).
//
// rc.17 adds the sidereal zodiac to ./calc: 946,349 bytes in 70 files, 23,067
// more than rc.16, and the cap, not raised, leaves 0.38 per cent
// (docs/evidence/rc17-20261005/sizes.json).
//
// 1.0.0-rc.1: 982,086 bytes in 74 files, 35,737 more than rc.17. Raised from
// 950,000 to 1,000,000 with the owner's approval of 2026-10-06, for the
// documentation the 1.0 API carries in its declarations, the reviews' fixes
// and the 1.0 changelog (CHANGELOG.md, 1.0.0-rc.1, Sizes).
//
// 1.0.0: 991,915 bytes in 74 files, 2,387 more than 1.0.0-rc.2's 989,528, for
// its changelog entry and the README's release lines. The cap, not raised,
// leaves 8,085 bytes (docs/evidence/1.0.0-20261011/sizes.json).
//
// 1.1.0-rc.1: 1,006,494 bytes in 77 files, 14,579 more than 1.0.0: 3,740
// bytes of JavaScript and 3,370 of declarations for the conventions entry and
// the receipt's ids, 7,328 of README and CHANGELOG, 136 of manifest and the 5
// of the version in the root's graph
// (docs/evidence/1.1.0-rc.1-20261026/sizes.json). Raised from 1,000,000 to
// 1,020,000 with the owner's approval of 2026-10-26, which leaves 13,506
// bytes.
//
// 1.1.0-rc.2: 1,096,783 bytes in 90 files, 90,289 more than 1.1.0-rc.1:
// 50,692 bytes of JavaScript that only the opt-in entry points load, for the
// entries ./time and ./lite, the time bands, the varga sensitivity and the
// F-89 corrections; 21,520 of declarations; 17,312 of README, CHANGELOG,
// LICENSING.md and NOTICE; 420 of manifest; and 345 of the root's graph
// (docs/evidence/1.1.0-rc.2-20261102/sizes.json). Raised from 1,020,000 to
// 1,100,000, the ceiling approved under the owner's delegation of 2026-11-03
// (OQ3 in docs/evidence/1.1.0-rc.2-20261102/OWNER-ANSWERS.md), for those
// entries and features, rather than moving the CHANGELOG's 0.x history out
// of the package; it leaves 3,217 bytes, 0.29 per cent.
//
// 1.1.0-rc.3: 1,142,818 bytes in 94 files, 46,035 more than 1.1.0-rc.2, for
// @zodiacs/engine/de440 (dist/de440.js and its declarations), withEphemeris
// and its refusals, the receipts' DE440 set, and their README, CHANGELOG,
// NOTICE and LICENSING.md lines; raised from 1,100,000 to 1,145,000 with the
// owner's approval of 2026-11-10, which leaves 0.19 per cent.
//
// 1.1.0-rc.6: 1,148,327 bytes in 94 files, 5,509 more than 1.1.0-rc.3: its
// CHANGELOG entry 3,499, its README lines 355, declarations 927 and
// JavaScript 728, all for the fold option; raised from 1,145,000 to
// 1,150,000 with the owner's approval of 2026-11-11, which leaves 0.14 per
// cent.
//
// 1.1.0-rc.7: 1,152,017 bytes in 94 files, 3,690 more than 1.1.0-rc.6: its
// CHANGELOG entry 2,888, its README lines 379, LICENSING.md and NOTICE
// 365, and JavaScript 58, for the error limits from the DE440 sweep; raised
// from 1,150,000 to 1,155,000 for the owner to decide with the candidate,
// which leaves 0.25 per cent.
//
// 1.1.0-rc.9 ships the sealed DE440 pack (docs/de440.md) and makes it the
// root's default source. The pack is data, not code, and larger than
// everything else in the package together. Like the zone histories it has a
// size of its own, so that it cannot hide growth in the code, and unlike
// them an exact one, since its bytes are fixed: the pack's 2,489,664 bytes
// are PACK_DATA_BYTES characters of base64, once, in one shared chunk under
// dist/ (PACK_HOLDER, found above the entry budgets) and in no other packed
// file. The cap bounds the rest of the package, the unpacked size less those
// characters.
//
// 1.1.0-rc.9: 4,502,147 bytes in 98 files, of which 1,182,595 are not the
// pack, 30,578 more than 1.1.0-rc.7's 1,152,017: documents 16,559 (this
// candidate's CHANGELOG entry and the README, LICENSING.md and NOTICE lines
// for the pack and the default source), JavaScript 8,741 (the synchronous
// SHA-256 and opener, the default source and its fallback, and the pack
// entry's code), declarations 5,088 and the manifest 190
// (docs/evidence/1.1.0-rc.9-20261114/sizes.json). Raised from 1,155,000 to
// 1,185,000 for the owner to decide with the candidate, which leaves 0.20
// per cent.
//
// 1.1.0-rc.10: 4,540,059 bytes in 98 files, of which 1,220,507 are not the
// pack, 37,912 more than 1.1.0-rc.9's 1,182,595: documents 17,347 (this
// candidate's CHANGELOG entry and the README's lines), JavaScript 14,156
// (the calc and window entries on the default source, the fallback flags
// and the ephemeris named on every result, the window's seams, and pull
// request 102's ΔT flag and widened bounds), declarations 6,408 and the
// manifest 1 (docs/evidence/1.1.0-rc.10-20261114/sizes.json). Raised from
// 1,185,000 to 1,225,000 for the owner to decide with the candidate, which
// leaves 0.37 per cent.
//
// 1.1.0-rc.11: 4,557,833 bytes in 98 files, of which 1,238,281 are not the
// pack, 17,774 more than 1.1.0-rc.10's 1,220,507: this candidate's CHANGELOG
// entry and the README's lines, and the labels and detailed forms of the
// techniques entry with their declarations. Raised from 1,225,000 to
// 1,245,000 for the owner to decide with the candidate, which leaves 0.54
// per cent.
//
// 1.1.0-rc.12: 4,572,747 bytes in 98 files, of which 1,253,195 are not the
// pack, 14,914 more than 1.1.0-rc.11's 1,238,281: this candidate's CHANGELOG
// entry and the README's lines, the reduction's rule behind the Sun's disc,
// the labels of chartPoints and chartDeclinations, a speed's side of the
// disc, the window's deflection allowance and the limb bound, with their
// declarations. Raised from 1,245,000 to 1,265,000 for the owner to decide
// with the candidate, which leaves 0.93 per cent.
//
// 1.1.0-rc.13: 4,578,211 bytes in 98 files, of which 1,258,659 are not the
// pack, 5,464 more than 1.1.0-rc.12's 1,253,195: documents only (this
// candidate's CHANGELOG entry and the corrections in the README, LICENSING.md
// and NOTICE); the code is rc.12's. The cap is not raised; 0.50 per cent is
// left.
//
// 1.1.0: 4,581,449 bytes in 98 files, of which 1,261,897 are not the pack,
// 3,238 more than 1.1.0-rc.13's 1,258,659: documents only (this release's
// CHANGELOG entry and the README and LICENSING.md lines); the code is rc.13's
// but for the version string. The maintainer approved the budgets and the
// cap rc.12 raised with this release; 3,103 bytes (0.24 per cent) are left.
//
// 2.0.0-rc.1: 4,595,726 bytes in 98 files, of which 1,276,174 are not the
// pack, 14,277 more than 1.1.0's 1,261,897: this candidate's CHANGELOG entry
// and the README's lines, and the code and declarations of pull requests
// 105, 109, 110 and 111. Raised from 1,265,000 to 1,289,000, the
// measurement and about one per cent, for the owner to decide with the
// candidate.
//
// 2.0.0-rc.3: 4,757,064 bytes in 100 files, of which 1,437,512 are not the
// pack, 153,275 more than 2.0.0-rc.2's 1,284,237: dist/core.js and
// dist/core.d.ts, the second copy of the root's code that pull request 121
// adds as @zodiacs/engine/core, the code and declarations of pull requests
// 114, 115, 117, 118 and 119 (117's probe table among them), this
// candidate's CHANGELOG entry and the README's, NOTICE's and LICENSING.md's
// lines. Raised from 1,289,000 to 1,438,000, the measurement rounded up to
// the next 1,000 bytes; the owner approved raising the cap for the core
// entry on 17 November 2026.
//
// 2.0.0-rc.4: 4,765,729 bytes in 101 files, of which 1,446,177 are not the
// pack, 8,665 more than 2.0.0-rc.3's 1,437,512: the body check (143 bytes in
// each copy of the root's ephemeris code), dist/esm-only.cjs and the 20
// "require" conditions in package.json, this candidate's CHANGELOG entry
// and the README's lines. Raised from 1,438,000 to 1,446,200, the
// measurement rounded up to the next 100 bytes, for the owner to decide
// with the candidate.
//
// 2.0.0-rc.5: 4,769,467 bytes in 101 files, of which 1,449,915 are not the
// pack, 3,738 more than 2.0.0-rc.4's 1,446,177: the crossing-search body
// check, this candidate's CHANGELOG entry and the README's lines. Raised
// from 1,446,200 to 1,450,000, the measurement rounded up to the next 100
// bytes, for the owner to decide with the candidate.
//
// 2.0.0-rc.6: 4,778,514 bytes in 101 files, of which 1,458,962 are not the
// pack, 9,047 more than 2.0.0-rc.5's 1,449,915: pull request 128's 9-byte
// Tehran 1979 probe addition, ZOD-341's LICENSING.md and NOTICE updates,
// this candidate's CHANGELOG entry and the README's 2.x lines. Raised from
// 1,450,000 to 1,459,000, the measurement rounded up to the next 1,000 bytes,
// for the owner to decide with the candidate.
//
// 2.0.0: 4,782,240 bytes in 101 files, of which 1,462,688 are not the pack,
// 3,726 more than 2.0.0-rc.6's 1,458,962: the 2.0.0 CHANGELOG entry less the
// shorter version string and trimmed README lead paragraph. Raised from
// 1,459,000 to 1,463,000, the measurement rounded up to the next 1,000 bytes,
// approved under the owner's delegation of 2026-11-21 15:06 Asia/Bangkok.
const TOTAL_CAP = 1_463_000;
const restBytes = report.unpackedSize - PACK_DATA_BYTES;
assert(restBytes <= TOTAL_CAP, `package is unexpectedly large: ${restBytes} bytes unpacked beside the DE440 pack, over ${TOTAL_CAP}`);

// The licence expression covers the code (MIT) and the ΔT values (CC BY 4.0),
// and the packed licensing files say the same.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
/** A file's text with each run of white space made one space, so rewrapping cannot hide a phrase. */
const prose = (name) => read(name).replace(/\s+/gu, " ");
const manifest = JSON.parse(read("package.json"));
const LICENSE_EXPRESSION = "MIT AND CC-BY-4.0";
assert.equal(manifest.license, LICENSE_EXPRESSION, "package.json license must cover the MIT code and the CC BY 4.0 ΔT values");
assert(read("LICENSING.md").includes(`SPDX licence expression: \`${LICENSE_EXPRESSION}\``), "LICENSING.md must state the package's SPDX expression");
assert(read("LICENSE").startsWith("MIT License"), "LICENSE must be the MIT licence");
const notice = prose("NOTICE");
for (const phrase of ["Table S15", "Creative Commons Attribution 4.0 International (CC BY 4.0)", "@zodiacs/engine/deltat",
  "shared chunk under dist/", "dist/deltat.js re-exports"]) {
  assert(notice.includes(phrase), `NOTICE must carry the ΔT attribution (${phrase})`);
}
// dist/core.js (@zodiacs/engine/core, from ZOD-292) is the root's graph
// without the DE440 files, bundled on its own: it carries its own copy of
// every other module of the root's graph, among them the ΔT model, the
// nutation and the frame of date. The checks below of where those three are
// look for the one shared chunk among the other files, and then for the
// copy in dist/core.js, which NOTICE and LICENSING.md name for each of the
// three.
const CORE_FILE = "dist/core.js";
const beside = files.filter((file) => file !== CORE_FILE);
const coreText = read(CORE_FILE);
assert(notice.includes("dist/core.js, the file of @zodiacs/engine/core, carries its own copy of the module, and so of the values"),
  "NOTICE must say that dist/core.js carries a copy of the ΔT values");
assert(prose("LICENSING.md").includes("`dist/deltat.js` re-exports, and a copy of it in `dist/core.js`"),
  "LICENSING.md must say that dist/core.js carries a copy of the ΔT values");
assert(notice.includes("dist/time.js import, and copied into dist/core.js, the file of @zodiacs/engine/core) reproduces"),
  "NOTICE must say that dist/core.js carries a copy of the frame");
assert(prose("LICENSING.md").includes("`dist/core.js`, the file of `@zodiacs/engine/core`, carries its own copy of `src/frame.ts`"),
  "LICENSING.md must say that dist/core.js carries a copy of the frame");
assert(notice.includes("dist/de440.js import, and copied into dist/core.js, the file of @zodiacs/engine/core) carries"),
  "NOTICE must say that dist/core.js carries a copy of the nutation");
assert(prose("LICENSING.md").includes("`./de440`. `dist/core.js`, the file of `@zodiacs/engine/core`, carries its own copy of them"),
  "LICENSING.md must say that dist/core.js carries a copy of the nutation");
assert(coreText.includes("\n// src/time-scale-data.ts\n"), "dist/core.js must carry its own copy of the IERS tables");
assert(prose("LICENSING.md").includes("`@zodiacs/engine/time` under `dist/` carry, and so does `dist/core.js`, the file of `@zodiacs/engine/core`"),
  "LICENSING.md must say that dist/core.js carries the IERS tables");
// NOTICE, LICENSING.md and the README say where the values are: in one shared
// chunk that dist/deltat.js re-exports, not in dist/deltat.js itself. Check the
// build still puts them there, without naming the chunk's hashed file name.
const holders = beside.filter((file) => file.endsWith(".js") && read(file).includes('"zodiacs-deltat/1"'));
assert(coreText.includes('"zodiacs-deltat/1"'), "dist/core.js must carry its own copy of the ΔT model");
assert(holders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(holders[0]),
  `the ΔT model must be in exactly one shared chunk under dist/, as NOTICE says; found it in ${holders.join(", ") || "no file"}`);
assert(read("dist/deltat.js").includes(`./${holders[0].slice("dist/".length)}`), "dist/deltat.js must re-export the chunk that holds the ΔT model");
for (const name of ["LICENSING.md", "README.md"]) {
  assert(prose(name).includes("shared chunk under `dist/`"), `${name} must say the ΔT values are in a shared chunk under dist/`);
  assert(prose(name).includes("`dist/deltat.js` re-exports"), `${name} must say that dist/deltat.js re-exports that chunk`);
}
// The star-based ayanamsas' 22 values, the same way: NOTICE and LICENSING.md
// say they are in a shared chunk that dist/vedic.js and dist/calc.js import
// (rc.16's said dist/vedic.js, where they were until calc loaded them too).
// Spica's right ascension stands for them.
const starHolders = files.filter((file) => file.endsWith(".js") && read(file).includes("201.29835228"));
assert(starHolders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(starHolders[0]),
  `the star values must be in exactly one shared chunk under dist/, as NOTICE says; found them in ${starHolders.join(", ") || "no file"}`);
for (const entry of ["dist/vedic.js", "dist/calc.js"]) {
  assert(read(entry).includes(`./${starHolders[0].slice("dist/".length)}`), `${entry} must import the chunk that holds the star values`);
}
assert(notice.includes("in a shared chunk under dist/ that dist/vedic.js and dist/calc.js import"), "NOTICE must say where the star values are");
assert(prose("LICENSING.md").includes("shared chunk under `dist/` that `dist/vedic.js` and `dist/calc.js` import"),
  "LICENSING.md must say where the star values are");
// The Gregorian adoption table, the same way: NOTICE and LICENSING.md say it
// is in a shared chunk under dist/ that dist/geo.js and dist/techniques.js
// import (1.0.0 and 1.1.0-rc.1 said dist/geo.js, which only re-exports it).
const gregorianHolders = files.filter((file) => file.endsWith(".js") && read(file).includes("var GREGORIAN_ADOPTION ="));
assert(gregorianHolders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(gregorianHolders[0]),
  `the Gregorian adoption table must be in exactly one shared chunk under dist/, as NOTICE says; found it in ${gregorianHolders.join(", ") || "no file"}`);
const gregorianImporters = files.filter((file) => file.endsWith(".js") && read(file).includes(`./${gregorianHolders[0].slice("dist/".length)}`));
assert.deepEqual(gregorianImporters.sort(), ["dist/geo.js", "dist/techniques.js"],
  "exactly dist/geo.js and dist/techniques.js must import the chunk that holds the Gregorian adoption table, as NOTICE says");
assert(notice.includes("in a shared chunk under dist/ that dist/geo.js and dist/techniques.js import"), "NOTICE must say where the Gregorian adoption table is");
assert(prose("LICENSING.md").includes("shared chunk under `dist/` that `dist/geo.js` and `dist/techniques.js` import"),
  "LICENSING.md must say where the Gregorian adoption table is");
// The IAU 2000B nutation and the frame of date, the same way: NOTICE says the
// frame is in a shared chunk under dist/ that the ephemeris chunk and
// dist/time.js import, and LICENSING.md that the nutation is in a shared
// chunk that the ephemeris chunk, dist/time.js and dist/de440.js import
// (until 1.1.0-rc.2 both were in the ephemeris chunk itself; until
// 1.1.0-rc.3, when ./de440 came to load the nutation without the frame, in
// one chunk), which LICENSING.md says the graphs of eleven entry points load
// (ten until 1.1.0-rc.9 added ./de440/pack, which opens its pack with ./de440).
// The series' first coefficient stands for the nutation, and the marker
// esbuild writes before the frame module's code, `// src/frame.ts`, for the
// frame: each must be in exactly one shared chunk, and the frame's chunk
// must hold or import the nutation's.
const nutationHolders = beside.filter((file) => file.endsWith(".js") && read(file).includes("-172064161,"));
assert(coreText.includes("-172064161,"), "dist/core.js must carry its own copy of the nutation");
assert(nutationHolders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(nutationHolders[0]),
  `the nutation must be in exactly one shared chunk under dist/, as NOTICE says; found it in ${nutationHolders.join(", ") || "no file"}`);
const frameHolders = beside.filter((file) => file.endsWith(".js") && read(file).includes("\n// src/frame.ts\n"));
assert(coreText.includes("\n// src/frame.ts\n"), "dist/core.js must carry its own copy of the frame");
assert(frameHolders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(frameHolders[0]),
  `the frame module must be in exactly one shared chunk under dist/, as NOTICE says; found its marker in ${frameHolders.join(", ") || "no file"}`);
const nutationChunk = `./${nutationHolders[0].slice("dist/".length)}`;
assert(frameHolders[0] === nutationHolders[0] || read(frameHolders[0]).includes(nutationChunk),
  "the chunk that holds the frame must hold or import the nutation");
assert(read("dist/time.js").includes(`./${frameHolders[0].slice("dist/".length)}`), "dist/time.js must import the chunk that holds the frame");
assert(!read(nutationHolders[0]).includes('"astronomy-engine"'), "the chunk that holds the nutation must not import astronomy-engine");
assert(read("dist/time.js").includes(nutationChunk), "dist/time.js must import the chunk that holds the nutation");
assert(files.some((file) => /^dist\/chunk-[^/]+\.js$/u.test(file) && /\bfunction gastHours\(/u.test(read(file)) && read(file).includes(nutationChunk)),
  "the ephemeris chunk must import the chunk that holds the nutation");
assert.deepEqual(Object.keys(graphs).filter((name) => graphs[name].sizes.has(nutationHolders[0])).sort(),
  [".", "./calc", "./de440", "./de440/pack", "./internal", "./sky", "./techniques", "./time", "./timing", "./vedic", "./window"],
  "the entry points whose graphs load the nutation must be the ones LICENSING.md names");
assert(read("dist/de440.js").includes(nutationChunk), "dist/de440.js must import the chunk that holds the nutation");
assert(notice.includes("built into a shared chunk under dist/ that the ephemeris chunk and dist/time.js import"), "NOTICE must say where the frame is");
assert(notice.replace(/\s+/gu, " ").includes("src/nutation.ts, built into a shared chunk under dist/ that the ephemeris chunk, dist/time.js and dist/de440.js import"),
  "NOTICE must say where the nutation is");
assert(prose("LICENSING.md").includes("shared chunk under `dist/` that the ephemeris chunk, `dist/time.js` and `dist/de440.js` import"),
  "LICENSING.md must say where the nutation is");
// The essential dignities' tables and the composite code adapted from the
// site, the same way: NOTICE and LICENSING.md say that dist/techniques.js and
// @zodiacs/engine/lite's dist/lite-dignities.js carry the tables, and
// LICENSING.md that the composite code is built into dist/techniques.js and
// dist/lite-composite.js (review 1 of 1.1.0-rc.2). The marker esbuild writes
// before each module's code, `// src/techniques/dignities.ts` and
// `// src/techniques/composite.ts`, stands for them.
const holding = (marker) => files.filter((file) => file.endsWith(".js") && read(file).includes(`\n// ${marker}\n`)).sort();
assert.deepEqual(holding("src/techniques/dignities.ts"), ["dist/lite-dignities.js", "dist/techniques.js"],
  "the dignity tables (src/techniques/dignities.ts) must be built into dist/techniques.js and dist/lite-dignities.js and no other file, as NOTICE says");
assert.deepEqual(holding("src/techniques/composite.ts"), ["dist/lite-composite.js", "dist/techniques.js"],
  "the composite code (src/techniques/composite.ts) must be built into dist/techniques.js and dist/lite-composite.js and no other file, as LICENSING.md says");
assert(read("dist/lite.js").includes("./lite-dignities.js") && read("dist/lite.js").includes("./lite-composite.js"),
  "dist/lite.js must re-export dist/lite-dignities.js and dist/lite-composite.js, as NOTICE and LICENSING.md say");
assert(notice.includes("The techniques entry (dist/techniques.js) and the lite entry (dist/lite-dignities.js, which dist/lite.js re-exports) carry the tables of the essential dignities"),
  "NOTICE must say where the dignity tables are");
assert(prose("LICENSING.md").includes("`@zodiacs/engine/lite` (`dist/lite-dignities.js`, which `dist/lite.js` re-exports) carry the tables of the essential dignities"),
  "LICENSING.md must say where the dignity tables are");
assert(prose("LICENSING.md").includes("also into `dist/lite-composite.js` and `dist/lite-dignities.js`, which `@zodiacs/engine/lite` re-exports"),
  "LICENSING.md must say where the composite and dignity code adapted from the site is built");
assert(read("README.md").includes(LICENSE_EXPRESSION), "README.md must state the licence expression");
// The shipped text refers to the separate earlier package without naming it.
for (const file of files) {
  assert(!read(file).includes("@zodiacs/sdk"), `${file} names the separate earlier package`);
}
// astronomy-engine's ESM is loaded as ESM by plain Node only from 20.19.0 and 22.7.0.
assert.equal(manifest.engines?.node, "^20.19.0 || >=22.7.0", "package.json engines must name the Node versions that load astronomy-engine");

/** Bytes an entry's graph holds beyond the root's: what importing it adds to an app that imports the root. */
const beyondRoot = (graph) =>
  [...graph.sizes].filter(([file]) => !graphs["."].sizes.has(file)).reduce((sum, [, size]) => sum + size, 0);
const budgets = Object.entries(graphs)
  .map(([name, graph]) => `${name} ${graph.bytes} of ${ENTRY_BUDGETS[name]}` + (name === "." ? "" : ` (${beyondRoot(graph)} beyond the root's)`))
  .join(", ");
console.log(
  `@zodiacs/engine package contents passed (${files.length} files, ${report.unpackedSize} bytes unpacked: the DE440 pack ${PACK_DATA_BYTES}, the rest ${restBytes} of ${TOTAL_CAP}; ` +
    `import graphs: ${budgets}; zone histories ${shardBytes} of ${SHARD_BUDGET} in ${shards.length} files; ` +
    `license ${manifest.license}; node ${manifest.engines.node})`
);
