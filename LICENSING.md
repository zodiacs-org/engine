# Licensing gate

Status: **GO for an MIT package**, subject to the repository operator having
authority to publish the Zodiacs.org-authored TypeScript under the package's
MIT license.

## Provenance chain

The package implementation was adapted from these Zodiacs.org TypeScript
modules:

- `src/lib/engine/full.ts` — planetary positions and chart assembly
- `src/lib/engine/houses.ts` — independently implemented spherical
  trigonometry for angles, whole-sign houses, and Placidus houses
- `src/lib/engine/aspects.ts` — aspect matching
- `src/lib/engine/synastry.ts` — inter-chart aspect and balance summaries
- `src/lib/engine/returns.ts` — longitude crossing and Saturn-return scans
- `src/lib/time/localToUtc.ts` — host-`Intl` timezone conversion
- `src/lib/geo/search.ts` — client for the separately hosted GeoNames index

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
USNO files (US Government works) and IERS Earth-orientation data, which IERS
distributes free of charge and asks users to cite. The derivation, every
source's digest and licence, and the measurements are in the Zodiacs site
repository, `docs/platform/evidence/deltat-2026-09-25/`. No Swiss Ephemeris
output was used to build the table; Swiss is used there only as a comparison
instrument, and only statistics are committed.

## GeoNames and timezone data

The `./geo` entry point is code-only and bundles no place records. Compatible
indexes may be derived from GeoNames `cities15000`, `admin1CodesASCII`, and
`countryInfo`, which are CC BY 4.0. Downstream users who host or redistribute
that data are instructed to retain `NOTICE`.

Timezone conversion uses the host's `Intl`/ICU implementation. The package
does not redistribute tzdb, so historical timezone completeness is a runtime
property rather than a package-data guarantee.
