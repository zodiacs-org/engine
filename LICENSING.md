# Licensing gate

Status: **GO for a package licensed `MIT AND CC-BY-4.0`**, subject to the
repository operator having authority to publish the Zodiacs.org-authored
TypeScript under the MIT license, and with three questions left open for the
owner: no statement of terms was found for IERS EOP 20 C04, so whether its
367 rows of 1972 that the repository carries, and the values the package
derives from it (the UT1 table in 1972 and some of the ΔT table's values from
1941), may be redistributed without other terms is not settled (*IERS
data*); whether a commercial use of the 20 star values that the CDS supplies
needs more than the attribution in `NOTICE` is not settled by the CDS's
terms; and no terms were read for Reid and Brunthaler's two values (*Timing
and Vedic values*).

SPDX licence expression: `MIT AND CC-BY-4.0`. The code is MIT (`LICENSE`). The
package's ΔT module, exported as `@zodiacs/engine/deltat`, carries 32 values
of Table S15 of Stephenson, Morrison & Hohenkerk 2016, which are CC BY 4.0
(see *ΔT data* below), with their attribution in `NOTICE`. The build places
that module in a shared chunk under `dist/`, which `dist/deltat.js`
re-exports. Both licences apply to the package as distributed. From
0.1.1-rc.8, which added those values, to rc.13, `package.json` declared `MIT`
alone; rc.14 corrects it.

## Provenance chain

The package implementation was adapted from these Zodiacs.org TypeScript
modules:

- `src/lib/engine/full.ts` — planetary positions and chart assembly
- `src/lib/engine/houses.ts` — independently implemented spherical
  trigonometry for angles, whole-sign houses, and Placidus houses
- `src/lib/engine/aspects.ts` — aspect matching
- `src/lib/engine/synastry.ts` — inter-chart aspect and balance summaries
- `src/lib/engine/returns.ts` — longitude crossing and Saturn-return scans
- `src/lib/engine/progressions.ts` — elapsed-time secondary-progression mapping
- `src/lib/time/localToUtc.ts` — timezone conversion, with its birthplace
  local mean time, pinned tzdb history and Julian-calendar handling
- `src/lib/geo/search.ts` — client for the separately hosted GeoNames index

`src/exact.ts`, added in 0.1.1-rc.13, is this package's own implementation of
exact sums of binary64 values for the configured-aspect and declination
decisions. It follows published algorithms: the nonoverlapping expansions of
J. R. Shewchuk, "Adaptive Precision Floating-Point Arithmetic and Fast Robust
Geometric Predicates" (1997), in the partial-sums form documented for Python's
`math.fsum`, with one round-to-nearest-even at the end. It adds no dependency.

The computational dependency is `astronomy-engine@2.1.19`. Its installed npm
metadata declares MIT, names Donald Cross as author, and links to
`https://github.com/cosinekitty/astronomy`. Its distributed
`esm/astronomy.js` begins with a preserved MIT notice and a 2019–2023 Don Cross
copyright line. The package uses its geocentric vectors, coordinate rotations,
Moon state, sidereal time, and date helpers.

Repository and dependency searches found no Swiss Ephemeris runtime import,
package dependency, vendored source, or generated lookup table in this npm
package.

## Swiss Ephemeris exclusion

The website test suite contains Placidus reference constants generated with
`pyswisseph`. Those constants and their surrounding test block were
deliberately **not copied**. Package accuracy tests contain only:

- public JPL Horizons longitude vectors;
- geometric and astronomical invariants;
- synthetic aspect fixtures; and
- behavior computed directly by this package.

The Placidus implementation is the site's own formula-based TypeScript, not a
port or translation of Swiss Ephemeris code. This licensing decision must be
revisited before accepting any Swiss Ephemeris source, binary, table, or
generated fixture into the package.

## ΔT data

`src/deltat.ts` ships 32 values of Table S15 of Stephenson, Morrison &
Hohenkerk 2016 (Proc. R. Soc. A 472: 20160404), rounded to 0.01 s, and
constants of its equations (4.1) and (5.1). The article and its electronic
supplement are CC BY 4.0, which permits redistribution with attribution;
`NOTICE` carries it. The 2020 addendum's revised table has no established
licence and is not shipped. From 1941 the table holds values derived from
USNO files (US Government works) and IERS Earth-orientation data (EOP 20 C04
and Bulletin A). For those IERS files this record states only what their
providers' pages say (see *IERS data* below). The derivation, every source's
digest, and the measurements are in the Zodiacs site repository,
`docs/platform/evidence/deltat-2026-09-25/`. No Swiss Ephemeris
output was used to build the table; Swiss is used there only as a comparison
instrument, and only statistics are committed.

## GeoNames and timezone data

The `./geo` entry point bundles no place records. Compatible indexes may be
derived from GeoNames `cities15000`, `admin1CodesASCII`, and `countryInfo`,
which are CC BY 4.0. Downstream users who host or redistribute that data are
instructed to retain `NOTICE`. The country names in the Gregorian adoption
table come from tzdata, not from GeoNames (next section but one).

Its zone histories before 1970 (`dist/tzdb-2025c-*.js`) are compiled by
`scripts/build-tz-shards.mjs` from tzdata 2025c with backzone, which the tz
project places in the public domain; the script checks the archive's SHA-256.
From 1970 conversion uses the host's `Intl`/ICU data.

## Leap-second and UT1 data

`src/time-scale-data.ts` holds the time basis's two IERS tables, which the
root entry's import graph under `dist/` carries. `scripts/build-time-scales.mjs`
builds it from inputs committed in `scripts/time-scale-sources/` and checks
each one's SHA-256:

- **TAI − UTC**: the 28 changes of the IERS leap-second list, with its update
  and expiry dates, from `leap-seconds.list` as the IERS Earth Orientation
  Centre at Paris Observatory serves it at
  https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list (retrieved
  2026-09-29, Last-Modified 2026-07-06T07:54:11Z, SHA-256
  `db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433`;
  updated 2026-07-06 through IERS Bulletin C 72, expires 2027-06-28). Under
  the heading "COPYRIGHT STATUS OF THIS FILE", its header states: "This file
  is in the public domain." The repository carries the file unchanged
  (`scripts/time-scale-sources/leap-seconds.list`). It replaces the copy in
  tzdata 2025c (updated 2025-07-07, expired 2026-06-28), which rc.15 as first
  cut shipped and which is also in the public domain; that copy stays in the
  repository, not packed, as a source of the conformance suite
  (`conformance/sources/l3/leap-seconds.list`), which a unit test also reads
  to check that the IERS list holds the same leap seconds.
- **UT1 − UTC in 1972**: UT1 − TAI on 1972-01-01 and every third day from
  1972-01-02, in whole milliseconds, and the largest formal error of those days,
  derived from the IERS EOP 20 C04 series, `eopc04.1962-now`, which the IERS
  Earth Orientation Centre at Paris Observatory produces and serves at
  https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now (retrieved
  2026-09-29, Last-Modified 2026-09-28T13:21:06Z, SHA-256
  `e16cfbba34574b8bad3cf81e2e56a84c2b4bbfd3c822cf9ebdd860bf97d711dc`). The
  repository carries the file's six header lines and its 367 rows from
  1972-01-01 to 1973-01-01 unchanged
  (`scripts/time-scale-sources/eopc04-1972.txt`); the package carries only the
  values derived from them. No statement of terms was found for it (see *IERS
  data* below).
- **UT1 − UTC from 1973-01-02**: sampled in the same way from IERS
  `finals2000A.all` of 2026-09-24 (Bulletin A; see *IERS data* below). The
  repository carries the date, flag, UT1 − UTC and formal error of the 19,997
  rows that give UT1 − UTC
  (`scripts/time-scale-sources/finals2000A-20260924-ut1.csv.gz`); the package
  carries only the values derived from them.

`NOTICE` names the three sources.

## IERS data

Three IERS products reach the package: `finals2000A.all` and EOP 20 C04 in
the UT1 table and, from 1941, in the ΔT table (see *ΔT data* above), and the
leap-second list in the time basis. For each, this record states what its
providers' pages and files say, and asserts no licence that they do not
state.

- **Bulletin A, `finals2000A.all`.** `finals2000A.all` and Bulletin A are
  products of the IERS Rapid Service/Prediction Centre. Bulletin A itself
  names its primary source as "the official IERS RS/PC website:
  https://maia.usno.navy.mil", the US Naval Observatory's, which is where the
  Zodiacs site's ΔT evidence records `finals2000A.all` of 2026-09-24 as
  downloaded (with a byte-identical copy at datacenter.iers.org). The
  Observatory's pages for these products, Bulletin A's included
  (https://maia.usno.navy.mil/products/bulletin-a, read 2026-09-29), end:
  "Distribution Statement A. Approved for public release: distribution
  unlimited." An earlier version of this file said that IERS distributes
  these data free of charge and asks users to cite them. No IERS statement to
  that effect was found on the IERS pages read on 2026-09-29 (its Terms of
  Reference, its data and publication pages, and the pages of its EOP Centre
  at Paris Observatory), so this file no longer says so.
- **EOP 20 C04, `eopc04.1962-now`.** A product of the IERS Earth Orientation
  Centre at Paris Observatory. The file's header names the Centre, the series
  ("EOP (IERS) 20 C04 TIME SERIES consistent with ITRF 2020 - sampled at 0h
  UTC"), a description and a contact, and states no terms. The description,
  https://hpiers.obspm.fr/eoppc/eop/eopc04/readme (Last-Modified 2026-02-04,
  read 2026-09-29), states none. Neither does the IERS Data Center's record of
  the series
  (https://datacenter.iers.org/versionMetadata.php?filename=latestVersionMeta/254_EOP_C04_20u24.62-NOW254.txt,
  read 2026-09-29), which names the IERS Earth Orientation Centre as its
  creator and publisher, nor the Centre's page for it
  (https://hpiers.obspm.fr/eop-pc/index.php?index=C04&lang=en, read
  2026-09-29). The IERS web site's Legal & Privacy page
  (https://www.iers.org/iers/en/service/imprint, read 2026-09-29) names the
  site's operator, the German Federal Agency for Cartography and Geodesy
  (BKG), and limits the agency's liability for the site and its content; it
  states no terms for IERS data. No statement of terms or licence was found
  for EOP 20 C04. The Centre's page for the series gives, as its technical
  note, Bizouard, Lambert, Gattano, Becker and Richard, "The IERS EOP 14C04
  solution for Earth orientation parameters consistent with ITRF 2014",
  J. Geod. 93, 621–633 (2019), doi:10.1007/s00190-018-1186-3, whose author
  list and title were checked against that DOI's record (read 2026-09-29);
  `NOTICE` cites it.
- **The leap-second list, `leap-seconds.list`.** In the public domain, as
  its own header states (quoted above).

`NOTICE` names the IERS centre that provides each.

## Gregorian adoption dates

`@zodiacs/engine/geo` carries a table of when 18 countries took the Gregorian
calendar (`GREGORIAN_ADOPTION`, `src/geo/calendar.ts`, built into
`dist/geo.js`). Its dates and names come from public-domain sources only:

- the `calendars` file of tzdata 2025c (the archive whose SHA-256 the zone
  histories pin), which says of itself "This file is in the public domain",
  and whose list quotes H. Grotefend, *Taschenbuch der Zeitrechnung des
  deutschen Mittelalters und der Neuzeit*, edited by O. Grotefend (Hannover:
  Hahnsche Buchhandlung, 1941), pp. 26–28;
- Hermann Grotefend's own tables, in the public domain because they were
  published in 1891 and 1898 and their author died in 1931: *Zeitrechnung des
  deutschen Mittelalters und der Neuzeit*, vol. 1 (Hannover: Hahn, 1891),
  pp. 133–134, and *Taschenbuch der Zeitrechnung* (Hannover and Leipzig: Hahn,
  1898), pp. 23–24, read in the Internet Archive's scans;
- for the country names, tzdata 2025c's `iso3166.tab`, which is in the public
  domain.

Each row names the sources that give its date, `GREGORIAN_ADOPTION_SOURCES`
cites them, and `src/fixtures/gregorian-adoption.json` quotes them for every
row, beside copies of the two tzdata files. `NOTICE` names them. The table as
0.1.1-rc.15 was first cut, never published, cited English Wikipedia's list of
adoption dates (CC BY-SA 4.0) and two other Wikipedia articles among its
sources and took its names from a GeoNames index; none of those rows or names
remains.

## Timing and Vedic values

`@zodiacs/engine/timing` and `@zodiacs/engine/vedic` carry the period
lengths, rulers and sequences of the techniques they implement, from the
classical texts that `docs/timing-hellenistic.md` and `docs/vedic.md` cite,
and, for the four star-based ayanamsas, single published values for four
objects: position, proper motion, parallax and radial velocity from the
Hipparcos new reduction (F. van Leeuwen 2007, VizieR I/311), SIMBAD,
Gontcharov 2006 (VizieR III/252) and Famaey et al. 2005 (VizieR
J/A+A/430/165), and for Sgr A* a SIMBAD position with Reid and Brunthaler's
(2004) proper motion. `docs/vedic.md` cites each; no catalogue file or table
is redistributed, only 22 values in `src/vedic/ayanamsa.ts`, built into
`dist/vedic.js`: position, proper motion, parallax and radial velocity for
the three stars, and position and proper motion for Sgr A*. `NOTICE` carries
their attribution.

The terms for the 20 values that the Strasbourg astronomical Data Center
(CDS) supplies, through VizieR and SIMBAD, are the CDS's. Its General Terms and
Conditions (https://cds.unistra.fr/legals/, updated 7 January 2026, read
2026-09-29) say that datasets holding only public information are distributed
under an open licence (the French Licence Ouverte, ODbL or CC BY), or under a
contributor's own licence shown on the dataset's page, and that "The Data Sets
must be cited in any work or product that uses them", with the DOI where there
is one and the CDS service that supplied them. Its rules for VizieR data
(https://cds.unistra.fr/vizier-org/licences_vizier.html, read 2026-09-29) say
that the data "are free of usage in a scientific context" with the original
authors and publication cited, and that "The commercial usage of the data is
subject to rules depending of the origin". None of the three catalogues'
ReadMe files, nor VizieR's record of them, states a licence of its own
(read 2026-09-29). Sgr A*'s two proper-motion values come from Reid and
Brunthaler's article (ApJ 616, 872, 2004, table 2), not from CDS, and no terms
for them were read. The attribution in `NOTICE` meets the CDS citation terms;
whether a commercial use needs more than attribution is not settled by these
sources.

## The conformance suite

Everything under `conformance/` but the copied inputs in `conformance/sources/` is dedicated to the public domain under CC0 1.0 (`conformance/LICENSE`). Those inputs are copies of files from NASA JPL Horizons, the IANA time zone database and the IERS, which the dedication does not cover; the arbiter entries of the vector files name each one's source (`conformance/README.md`, *Licence*). None of `conformance/` is part of the npm package: the package's `files` list leaves it out.

Swiss Ephemeris is used there only as an instrument:

- `conformance/adapters/pyswisseph.py` calls a separately installed pyswisseph;
- no Swiss Ephemeris code, data file or output is committed;
- its results are published as verdicts, returned flags and summary statistics.
