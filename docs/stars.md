# Fixed stars: `@zodiacs/engine/stars`

```ts
import { findFixedStar, fixedStarPosition, fixedStars } from "@zodiacs/engine/stars";

fixedStars().length;                       // 411
findFixedStar("alpha Leo")?.name;          // "Regulus"
fixedStarPosition("Regulus", new Date());  // { longitude, latitude, distanceParsecs, star }
```

## Catalogue

The 411 IAU-named stars (IAU Working Group on Star Names) that have a
Hipparcos number, from the Hipparcos new reduction (van Leeuwen 2007, VizieR
I/311) with SIMBAD radial velocities, carried to J2000.0, plus the Galactic
Center. The catalogue is Ephemera's (MIT, see NOTICE). Stars are found by IAU
name, by designation ("alf Leo" or "alpha Leo") or by Hipparcos number
("HIP 49669").

## Method

Straight-line space motion from J2000.0, annual parallax from the Earth's
barycentric position, light deflection by the Sun, aberration with the Earth's
barycentric velocity (ERFA's formulas), then the engine's IAU 2006 precession
and IAU 2000B nutation to the true ecliptic and equinox of date. With
`{ apparent: false }` the result is the astrometric place on the mean ecliptic
and equinox of date.

A `Date` is read as UTC through astronomy-engine's `MakeTime`; an `AstroTime`
is used as given.

## Accuracy

`src/stars.test.ts` compares every star at 1900.0, J2000.0, 2027-01-01 and
2100.0 TT (1,644 cases) with ERFA's apparent places (`eraAtci13`, IAU
2006/2000A, see `scripts/make-star-reference.py`). The worst difference is
0.0020 arcsec; the test allows 0.01 arcsec.
