# Without the ephemeris: `@zodiacs/engine/lite`

`@zodiacs/engine/lite` (from 1.1.0-rc.2) holds four techniques that need no
ephemeris, for a program that must not load one: a page that already has a
chart's positions and must stay small. Its import graph holds no module that
imports astronomy-engine, and it loads in a Node process that cannot load
astronomy-engine at all (below). The root entry does not import it.

```js
import { findDeclinationAspects, sectReading, compositeMidpoints, dignityFor } from "@zodiacs/engine/lite";

// Synthetic positions.
const parallels = findDeclinationAspects(
  [{ body: "Sun", lon: 85.2, lat: 0 }, { body: "Venus", lon: 95.7, lat: 1.1 }],
  23.4392911
);
const reading = sectReading({ convention: "altitude", sunAltitude: -12.5, sunLon: 85.2, mercuryLon: 70.4 });
// reading.sect === "night", reading.light === "Moon", reading.mercury === "oriental"
const composite = compositeMidpoints([{ body: "Sun", lon: 85.2 }], [{ body: "Sun", lon: 101.4 }]);
const sunInLeo = dignityFor("Sun", "leo"); // "domicile"
```

## Its parts

The entry has 51 names, 27 values and 24 types, in four parts. Each part is
built into a file of its own under `dist/` that imports nothing, and
`dist/lite.js` re-exports the four (`scripts/build-lite.mjs`):

| Part | Values | Types |
| --- | --- | --- |
| declinations | `DEFAULT_DECLINATION_ORB_POLICY`, `RA_POLE_TOLERANCE`, `SUN_BOUND_LATITUDE`, `declinationOf`, `declinationOrb`, `declinationsForBodies`, `eclipticToEquatorial`, `findDeclinationAspects` | `DeclinationAspect`, `DeclinationAspectType`, `DeclinationBody`, `DeclinationOrbPolicy`, `DeclinationRow`, `Declinations`, `EquatorialCoordinates` |
| sect | `DIURNAL_PLANETS`, `NOCTURNAL_PLANETS`, `SECT_CONVENTIONS`, `orientality`, `sectReading` | `AltitudeSectInput`, `EclipticSectInput`, `Orientality`, `SectConvention`, `SectInput`, `SectReading` |
| composite | `compositeAspects`, `compositeMidpoints` | `CompositeAspect`, `CompositePosition` |
| dignities | `CHALDEAN_FACES`, `CLASSICAL_PLANETS`, `DOMICILE_RULERS`, `EGYPTIAN_TERMS`, `EXALTATIONS`, `TRIPLICITY_LORDS`, `dignitiesFor`, `dignityFor`, `dignityRulersAt`, `essentialDignities`, `hasClassicalDignities`, `mutualReceptions` | `ClassicalPlanet`, `Debility`, `DignityRulers`, `DignitySpan`, `EssentialDignity`, `MutualReception`, `PlanetDignities`, `ReceptionOptions`, `SignDignity` |

The declination part is the root's (README, *Declinations and parallels*),
the composite and dignity parts are `@zodiacs/engine/techniques`'
([techniques.md](techniques.md), *Composite charts* and *Essential
dignities*), and the sect part is new (below). The declarations of the first
three are the root's and the techniques entry's own, so a value typed from
one entry fits the other (`api/lite.api.md`). Left out: the deprecated
`DECLINATION_ORB` and `DECLINATION_ORB_LUMINARY`
(`DEFAULT_DECLINATION_ORB_POLICY` holds the same orbs); `chartDeclinations`,
`compositeChart` and the Davison functions, which need a chart's instant and
so the ephemeris; and the base types such as `BodyName` and `ZodiacSign`,
which a caller imports with `import type` from the root, which loads nothing.

**Copies.** A function or table of the declination, composite and dignity
parts is a copy of the root's or the techniques entry's, built from the same
source: it gives the same results and refuses the same inputs with the same
error class, but it is not the same object. A program that loads `./lite`
and the root or `./techniques` carries both copies of what it uses. Which
object a name gives is not part of the public API
([versioning.md](versioning.md)); its results are.

## Declinations

The obliquity a caller passes is the one used. The root's
`chartDeclinations` passes the true obliquity of date at the chart's
instant; zodiacs.org passes the IAU 2006 mean obliquity of date. With any
obliquity but the true one, a `Declinations` result's `trueObliquity` field
holds the value passed and its `convention` field still names the true
equator and equinox of date, which the result then is not. A row labelled exactly `"Sun"` is not flagged out of
bounds while its ecliptic latitude is within `SUN_BOUND_LATITUDE`, 0.001°,
as the README says under *Declinations and parallels*.

## Sect

`sectReading(input)` reads a chart's sect under the convention its input
names. There is no default: `convention` is required, so a caller never gets
a rule it did not name.

- `"altitude"`: `{ convention, sunAltitude, sunLon, mercuryLon? }`. Day when
  `sunAltitude`, the Sun's altitude above the horizon in degrees, is 0 or
  more: a Sun exactly on the horizon, and an altitude of -0, count to the day.
  The caller computes the altitude; the engine does not. This is the rule
  zodiacs.org's chart view used (its `src/lib/sect.ts`), ported. The engine's
  own check of a chart's sect against the Sun's altitude in
  `@zodiacs/engine/timing` (the flag `"sect-contradicts-altitude"`) counts
  the Sun as above the horizon only when its altitude is greater than 0, and
  it computes that altitude itself, from the chart's latitude, midheaven and
  true obliquity, with the Sun taken on the ecliptic (`src/timing/shared.ts`),
  not from an altitude a caller passes. Given the same altitude, the two differ
  only for a Sun exactly on the horizon; an altitude computed another way,
  such as the one a caller passes here, can put the Sun on the other side of
  the horizon from the flag's.
- `"ecliptic"`: `{ convention, ascendant, sunLon, mercuryLon? }`. The root's
  `sectOf(ascendant, sunLon)`: day when the Sun is on the half of the ecliptic
  from the descendant through the midheaven to the ascendant. A Sun exactly on
  the ascendant counts to the night, and one exactly on the descendant to the
  day. The root's `chartPoints` takes a chart's sect this way.

The two agree wherever the midheaven is above the horizon, but for a Sun
exactly on the ascendant: taken on the ecliptic, its altitude there is 0, so
the altitude rule gives the day and the ecliptic rule the night. Inside the
polar circles the midheaven can be below the horizon, and then the ecliptic
rule gives the opposite of the Sun's altitude ([timing-hellenistic.md](timing-hellenistic.md),
*Flags*). That guide's two charts at 78.2° N show it: on 1810-01-07 at 17.8405° E the
ecliptic rule gives day with the Sun 11.0° below the horizon, and on
2100-06-26 at 22.924° W night with the Sun 12.1° above it; the altitude rule
gives night and day (`src/sect.test.ts`).

The reading gives the sect, the sect light (the Sun by day, the Moon by
night), Mercury's side of the Sun, and the planets in and out of sect: the
half that matches the chart in the order of `DIURNAL_PLANETS` (the Sun,
Jupiter, Saturn) or `NOCTURNAL_PLANETS` (the Moon, Venus, Mars), then the
other half, with Mercury last in the list its side belongs to. Mercury goes
with the day when it is oriental, rising ahead of the Sun, and with the night
when it is occidental. `orientality(bodyLon, sunLon)` decides it: oriental
when the signed arc from the body to the Sun, in (-180, 180], is above 0,
each longitude taken modulo 360 first, so that one of any size counts as its
place on the circle. Exactly opposite the Sun counts as oriental, and exactly
on it as occidental. Uranus, Neptune and Pluto are on neither list. The result and
its lists are frozen; `sunAltitude` is the altitude given, unchanged, or
null under the ecliptic convention, and `mercury` is null when no Mercury
longitude was given (null or absent).

`sectReading` throws `RangeError` for an input that is not a plain object of
its convention's own keys, a convention other than the two, an altitude that
is not a finite number from -90 to 90, and a longitude that is not a finite
number; `orientality` for a longitude that is not a finite number.

The diurnal and nocturnal planets, the sect light and Mercury's side by its
rising are zodiacs.org's convention, ported. No primary text was read for
this work, and none is cited for them here.

## How the build is checked

`npm run exports:smoke` checks the built entry (checks L1 to L4 and L8 of
`docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md`;
`scripts/lite-entry.mjs` holds L1 to L3 and L8):

- `dist/lite.js` holds the four export lines of its parts and nothing else,
  and no part holds an import or export-from statement or a dynamic import;
- no file of the entry holds `astronomy-engine`, two strings of
  astronomy-engine's own code, or the id of the engine's ΔT model;
- the build's module lists (`dist/metafile-esm.json` and
  `dist/metafile-lite.json`) describe every built file byte for byte, and
  the entry's source modules, read from them and from the `// src/...`
  markers of the built files, are `src/lite.ts` and 15 pinned modules, each
  part holding only its own;
- in a Node process whose module resolution refuses astronomy-engine
  (`scripts/refuse-ephemeris.mjs`), the entry loads with every export
  defined, and the root entry, the control, fails;
- the entry's run-time names, its declarations and each part's names are the
  51 above, none lost to two parts exporting it.

The root entry's isolation check counts `src/lite.ts`, `src/lite/` and
`src/sect.ts` as opt-in, so the root's graph cannot reach them
(`scripts/root-isolation.mjs`). The entry's import graph has a budget of its
own in `scripts/verify-package-contents.mjs`.
