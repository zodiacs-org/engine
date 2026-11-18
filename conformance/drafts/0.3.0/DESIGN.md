# Draft level L4: event times (design)

Status: **draft**. This level is not part of a released suite version. The
harness (`harness/run.mjs`, `harness/validate.mjs`) does not read it, and no
released vector, digest or result changes because of it. Releasing it as
suite 0.3.0, or showing it on the site, is the owner's decision.

This file is committed alone, before the generator, the vectors or any engine
run, so that its commit time shows the kinds, the instants, the method and
the tolerance rule were fixed before any engine was measured against them.
No later commit changes the tolerance rule or the instant list below.

## What the level checks

Readers see moments, not positions: "the Sun enters Sagittarius at 07:23",
"Mercury turns direct", "full Moon at 13:47". L1 checks positions at given
instants. L4 checks the instants at which a position reaches a given value.

## Kinds

Every instant is a number of seconds from J2000.0, on the scale its key
names:

- `tt_s`: seconds of TT from 2000-01-01T12:00:00 TT (JD 2451545.0 TT), that is
  (JD(TT) - 2451545.0) x 86400.
- `utc_s`: seconds of UTC from 2000-01-01T12:00:00 UTC, counted the same way
  on the UTC calendar (a day is 86400 s; no leap second falls inside any
  window of this level).

| kind | input | expected | tolerance |
| --- | --- | --- | --- |
| `event.ingress` | `body`, `longitude_deg` (a multiple of 30), `after_tt_s`, `before_tt_s` | `tt_s` | `tt_s`: `{ "abs": a, "unit": "s" }` |
| `event.ingress` (UTC set) | `body`, `longitude_deg`, `after_utc_s`, `before_utc_s` | `utc_s` | `utc_s`: `{ "abs": a, "unit": "s" }` |
| `event.station` | `body`, `after_tt_s`, `before_tt_s` | `tt_s`, `direction` (`"retrograde"` or `"direct"`) | `tt_s` in seconds, `direction` exact |
| `event.lunation` | `phase_deg` (0 or 180), `after_tt_s`, `before_tt_s` | `tt_s` | `tt_s` in seconds |
| `event.lunation` (UTC set) | `phase_deg`, `after_utc_s`, `before_utc_s` | `utc_s` | `utc_s` in seconds |

- **Ingress**: the instant in the window at which the body's apparent
  geocentric ecliptic longitude of date equals `longitude_deg`, in either
  direction of motion.
- **Station**: the instant in the window at which the rate of that longitude
  is zero. `retrograde` when the rate turns from positive to negative,
  `direct` when it turns from negative to positive.
- **Lunation**: the instant in the window at which the Moon's longitude minus
  the Sun's, reduced to [0, 360), equals `phase_deg` (0 new Moon, 180 full
  Moon), both apparent geocentric longitudes of date.
- The window is (`after`, `before`], and it holds exactly one such instant.
- Longitudes are those of L1: apparent geocentric positions (light time,
  gravitational deflection by the Sun, annual aberration) in the IAU
  2006/2000A true ecliptic and equinox of date (pnm06a, rotated by the true
  obliquity). The Sun, Moon, Mercury and Venus are the bodies; Mars to Pluto
  are their system barycentres (NAIF 4 to 9), as in L1.

Ids: `L4-ING-nnnn` (ingresses on TT), `L4-STA-nnnn` (stations),
`L4-LUN-nnnn` (lunations on TT), `L4-UTC-nnnn` (the UTC set). The UTC set
carries the tag `utc-input`; the eclipse lunations carry `eclipse`.

## Instants: 141 vectors

Years Y: 1860, 1925, 1990, 2026, 2060, 2140. A date written Y-MM-DD below
means 00:00:00 TT on that date in the TT sets, and 00:00:00 UTC in the UTC
set. "After" is strictly after.

1. **Ingresses on TT, 60.** For each of the Sun, Moon, Mercury, Venus, Mars,
   Jupiter, Saturn, Uranus, Neptune and Pluto, and each year Y: the first
   instant after Y-01-01 at which the body's longitude crosses a multiple of
   30 degrees, in either direction. `longitude_deg` is that multiple.
2. **Stations, 30.** For each of Mercury, Venus, Mars, Jupiter and Saturn,
   and each year Y: the first station after Y-07-01.
3. **Lunations on TT, 30.** For each year Y: the first new Moon and the first
   full Moon after Y-03-01, and the first new Moon and the first full Moon
   after Y-09-01 (24). Six more, each the lunation of an eclipse listed in
   NASA's Five Millennium Canons (Espenak and Meeus, *Five Millennium Canon
   of Solar Eclipses: -1999 to +3000*, NASA/TP-2006-214141, 2006; Espenak
   and Meeus, *Five Millennium Canon of Lunar Eclipses: -1999 to +3000*,
   NASA/TP-2009-214172, 2009), taken as the first new Moon (solar) or full
   Moon (lunar) after three days before the eclipse's date of greatest
   eclipse:
   - total solar eclipse of 1860-07-18,
   - total solar eclipse of 1919-05-29,
   - total solar eclipse of 2026-08-12,
   - total lunar eclipse of 2000-01-21,
   - total lunar eclipse of 2018-07-27,
   - total lunar eclipse of 2025-03-14.

   The generator checks that each such lunation falls within three days of
   the listed date and that the Moon's ecliptic latitude there is under 1.6
   degrees (no eclipse of either kind happens beyond that); a lunation that
   fails is dropped.
4. **The UTC set, 20.** For each of 2028, 2035, 2050, 2100 and 2140: the
   first Sun ingress, the first Moon ingress, the first new Moon and the
   first full Moon after Y-01-01 UTC. The UTC instant is the TT instant
   minus 69.184 s: TAI - UTC = 37 s, as it has been from 2017-01-01 (ERFA
   `dat`; IERS Bulletin C 72 of 2026-07-06, "NO leap second will be
   introduced at the end of December 2026", "until further notice"), plus
   TT - TAI = 32.184 s. The set states this convention; it is how
   `utc_s` is defined for these vectors, not a prediction of future leap
   seconds.
5. **Vector 141, a cross-check.** The Sun's ingress into Sagittarius
   (`longitude_deg` 240) in the window (2026-11-01, 2026-12-01] TT. It must
   solve within 1 s of the independent `de440.bsp` reduction in
   `docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json`
   (JD(TT) 2461366.8086776296, 2026-11-22T07:23:20.563 UTC).

**Windows.** `after` is the start date named above (for vector 141, its
stated window). `before` is the midpoint, rounded to the nearest whole
second, between the event and the next instant at which the same thing
happens again (the same body on the same longitude in either direction; the
same body's next station; the same lunar phase). Where that next instant is
after 2150-01-01 TT, `before` is 2150-01-01 TT. Vector 141's `before` is its
stated window end. Every window is checked to hold exactly one event.

**Coverage.** The kernel ends on 2150-01-22. An event after 2150-01-01 TT is
dropped, and listed with its reason.

## Method: the arbiter

`arbiters/l4/build.py`, in Python with numpy, jplephem and pyerfa (the
versions `arbiters/l1/README.md` names), never imports or calls the engine.

1. `longitude(body, tt)` is the apparent geocentric longitude reduced from
   NASA's `de440s.bsp` exactly as `arbiters/l1/validate.py` reduces it: TDB
   from TT by `erfa.dtdb`; light time iterated; deflection by the Sun
   (`erfa.ld`); annual aberration (`erfa.ab`); `erfa.pnm06a`, then R1 by
   `erfa.obl06` plus the nutation in obliquity of `erfa.nut06a`. The
   generator may evaluate it on arrays of instants, and checks at every
   solved instant that it agrees with `validate.py`'s own `apparent()` to
   within 0.01 mas.
2. The kernel is downloaded, not committed, and refused unless its SHA-256
   is `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`
   (the digest `validate.py` pins).
3. Each event is bracketed by sampling at 1 hour steps from `after` and
   solved by bisection to 1 ms. A station is solved on the rate, taken as a
   central difference over 1 hour either side: (L(t + 1 h) - L(t - 1 h)) /
   2 h.
4. Expected instants are written to 1 ms. The generator records, under
   `sources/l4/`, the kernel's digest and, for every event, the solved
   instant and the longitudes one hour either side (and at the instant).

## Tolerance rule

Tied to the 1 arcsecond the suite already uses for positions: the time the
quantity takes to move 1 arcsecond at that event.

- **Ingress and lunation**: `max(1 s, 1" / |rate|)`, rounded up to a whole
  second, with rate = (L(t + 1 h) - L(t - 1 h)) / 7200 s, in arcseconds per
  second, from the samples recorded for that event; for a lunation, L is
  the Moon's longitude minus the Sun's.
- **Station**: `max(60 s, sqrt(2 x 1" / |acceleration|))`, rounded up to a
  whole second, with acceleration = (L(t + 1 h) - 2 L(t) + L(t - 1 h)) /
  (3600 s)^2: the time the longitude takes to leave its turning value by
  1 arcsecond.
- The direction of a station is compared exactly.

Expected sizes: about 24 s for the Sun, 2 s for the Moon, about an hour for
Neptune; hours for stations, because a station is the flat top of a curve.

## The arbiter's own uncertainty: two checks

a. **Bracket**: every solve is repeated with half hour brackets. The two
   answers must agree within one tenth of the vector's tolerance.
b. **Horizons**: JPL Horizons (DE441), observer quantity 31, CENTER 500@399,
   TIME_TYPE TT, TLIST_TYPE JD, ANG_FORMAT DEG, EXTRA_PREC YES, APPARENT
   AIRLESS, CSV_FORMAT YES, at each solved instant and one hour either side
   (for a lunation, for the Moon and for the Sun). Requests are batched per
   target with TLIST, sent one at a time, and every raw response is kept in
   `sources/l4/` with its SHA-256 in `sources/l4/SHA256SUMS`. Pass rules:
   - ingress: Horizons's longitude at the solved instant equals the target
     within 0.45" (Horizons prints quantity 31 in its IAU 1976/80 frame,
     which differs from the suite's by about -0.36" in 1860 to +0.30" in
     2140, plus 12.63 mas for the lunar difference between DE440 and DE441
     that `validate.py` reports);
   - lunation: Horizons's Moon minus Sun longitude at the solved instant
     equals the phase within 0.45";
   - station: from Horizons's three samples, the rate r and acceleration a
     at the solved instant give Horizons's own station at t - r / a; it must
     lie within the vector's tolerance of the solved instant.

   Horizons is the cross-check, not the arbiter: its frame is not the
   suite's, and that alone moves the Sun's 2026 ingress by about 1.1 s.

A vector that fails check (a), check (b), the eclipse check or the coverage
rule is dropped, and its id and reason are listed in the vector file and in
`RESULTS-DRAFT.md`. Until the Horizons answers are committed, check (b) is
recorded as pending, not as passed.

## Property and mutation checks

- Property: for every ingress vector, the kernel's longitude at
  `tt - tolerance` and at `tt + tolerance` lies on opposite sides of the
  target, each within 1.5" of it. `build.py` checks it on every run.
- Mutation: an expected instant shifted by twice its tolerance must fail
  against the engine's committed answer; a saved source with one byte
  changed must fail `build.py --check` on its digest.

## Engines

The engine's adapter answers ingresses with `events()` of
`@zodiacs/engine/calc` (the documented longitude-crossing search), and
reports `unsupported`, with a reason, for a kind the engine has no public
function for. The draft runner `drafts/0.3.0/run-draft.mjs` reuses the
harness's comparison and adapter protocol (`harness/lib.mjs`) without
changing it. Results on the default source and on astronomy-engine are
recorded as they come, failures included; nothing is tuned to pass.

## Out of scope

Releasing 0.3.0; eclipses as their own kind; house or aspect events; running
Swiss Ephemeris on the draft; changing the engine to pass.
