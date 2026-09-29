# Rise, set, transit and planetary hours

`@zodiacs/engine/sky` gives the rise, set and upper and lower transit of the
Sun, the Moon and the planets for an observer, and the planetary hours. The
root entry does not import it. The measurements behind the figures below, and
the gates they were held to, are in
[`evidence/sky-chinese-2026-09-29/`](evidence/sky-chinese-2026-09-29/README.md).

```ts
import { planetaryHourAt, planetaryHours, skyEvents, skyEventsOn } from "@zodiacs/engine/sky";

const place = { latitude: 38.89, longitude: -77.03 }; // height defaults to 0 m

skyEventsOn("Sun", place, "2024-06-21", { utcOffsetMinutes: 0 });
// set 00:36:46Z, lower transit 05:09:59Z, rise 09:43:11Z, upper transit 17:10:05Z
skyEvents("Moon", place, "2024-06-20T00:00:00Z", "2024-06-23T00:00:00Z"); // every event in the window
planetaryHours({ latitude: 40, longitude: -75 }, "2025-12-18", { utcOffsetMinutes: -300 });
planetaryHourAt({ latitude: 40, longitude: -75 }, "2025-12-18T19:00:00Z"); // the ninth hour, Mars's
```

## Rise, set and transit

`skyEvents(body, observer, from, to, options?)` returns every rise, set,
upper transit and lower transit of `body` in [`from`, `to`), in time order.
`skyEventsOn(body, observer, date, options?)` does the same for one calendar
day, `date` as YYYY-MM-DD on a clock `utcOffsetMinutes` east of UTC (by
default the observer's local mean time, longitude × 4 minutes).

- `body`: `"Sun"`, `"Moon"`, or a planet from `"Mercury"` to `"Pluto"`.
- `observer`: `{ latitude, longitude, height? }`: geodetic degrees on the
  WGS84 ellipsoid (a = 6,378,137 m, 1/f = 298.257223563; NIMA TR8350.2),
  longitude east positive, height in metres from −10,000 to 100,000.
- Each event is `{ kind, at, altitude, azimuth }`: `at` is a UTC instant on
  the engine's time basis ([time.md](time.md)); `altitude` is the geometric
  (unrefracted) topocentric altitude of the body's centre and `azimuth` its
  azimuth from north through east, both in degrees.

### Definitions

A **rise** or **set** is the instant the geometric topocentric altitude of the
body's centre equals

    h0 = −R − S   (upper limb),   −R   (centre),   −R + S   (lower limb)

where R is the refraction at the horizon and S the topocentric semi-diameter,
asin(radius / distance). This is the definition of the US Naval Observatory:
"sunrise or sunset is defined to occur when the geometric zenith distance of
center of the Sun is 90.8333 degrees", which is 34′ of refraction and 16′ of
radius, and for the Moon "90.5666 degrees + Moon's apparent angular radius −
Moon's horizontal parallax" ([Rise, Set, and Twilight
Definitions](https://aa.usno.navy.mil/faq/RST_defs)). The engine takes the
semi-diameter from the distance of the day rather than USNO's constant 16′
for the Sun, and the horizontal parallax from the topocentric position.
Meeus (*Astronomical Algorithms*, 2nd ed., 1998, ch. 15) uses the same
standard altitudes.

- **Refraction**: `refraction: "standard"` (default) is R = 34′
  (`STANDARD_REFRACTION_ARCMIN`), USNO's "average amount of atmospheric
  refraction at the horizon"; `"none"` is R = 0, the geometric horizon.
  Refraction depends on the weather: USNO states that computed times "may be
  in error by a minute or more" for that reason alone, more at high latitudes.
- **Limb**: `limb: "upper"` (default for the Sun and the Moon), `"centre"` or
  `"lower"`. Planets are taken at their centre, without a disc, and accept
  only `"centre"`.
- **Radii** (`SKY_RADII_KM`): the Sun 696,000 km, which subtends 959.64″ at
  1 au (the solar semi-diameter at unit distance in Meeus ch. 55 is 959.63″);
  the Moon 1,737.4 km, the IAU mean radius (Archinal et al. 2018).
- **Parallax**: every body is observed from the observer's place on the
  ellipsoid, so the Moon's horizontal parallax (54′ to 61′) enters through its
  topocentric position, as do the few arcseconds of Venus and Mars.
- **Height** moves the observer; it does not lower the horizon. No dip is
  applied: the horizon is the plane perpendicular to the ellipsoid normal, as
  in USNO's definition ("the observer's eye is considered to be on the surface
  of the Earth").

An **upper transit** is the instant the topocentric hour angle of the body is
0°, a **lower transit** the instant it is 180°: USNO's "instant that its
center crosses ... the observer's meridian". Parallax does not move a
transit, which lies in the meridian plane.

### Polar day and polar night

A result's `flags` is a list of `SkyFlag` values:

- `"never-sets"`: the window holds no rise and no set, and the body was above
  the horizon of the conventions throughout (polar day, for the Sun);
- `"never-rises"`: the same, below it throughout (polar night);
- `"outside-reference-span"`: the window reaches outside `REFERENCE_SPAN`
  (1800–2200).

The transits are still given, with their altitudes. A window with a rise but
no set, or a set but no rise, has no flag.

### Positions and search

The body's apparent geocentric place comes from astronomy-engine, as the
engine's other positions do: the Sun and planets with light time and
aberration, the Moon from its series, rotated to the true equator and equinox
of date with astronomy-engine's precession and five-term nutation. The
observer is placed with the engine's own Greenwich apparent sidereal time (the
formula of `src/ephemeris.ts`). The difference is the topocentric vector.
Diurnal aberration (at most 0.32″) and polar motion are not applied.

Events are found with the engine's crossing solver (`src/crossings.ts`): the
altitude less h0 against 0, and the hour angle against 0° and 180°, sampled
every hour and bisected to an hour divided by 2^24 (0.2 ms); a turn between
samples that could reach the horizon is searched by golden section, so a
grazing rise and set are both found. Each result says whether its search
completed: `status` is `"complete"`, or `"refused"` with `reason:
"sample-budget"` and no events when `maxSamples` (a positive integer, default
unlimited) ran out. `samples` counts the position evaluations.

### Accuracy

EVIDENCE_SKY

## Planetary hours

`planetaryHours(observer, date, options?)` returns the planetary day that
begins at the Sun's first rise on `date` (YYYY-MM-DD on the clock
`utcOffsetMinutes` east of UTC, by default local mean time). The day from
sunrise to sunset and the night from sunset to the next sunrise are each
divided into twelve equal hours:

> The astrological day begins at the exact moment of local sunrise, and the
> night begins at local sunset. The time between sunrise and sunset is divided
> into twelve equal parts, each of which is called one Planetary Hour.
> Similarly the time from sunset to the following sunrise is also divided into
> twelve equal parts which constitute the Planetary Hours of the night.
> (V. E. Robson, *Electional Astrology*, 1937, pp. 56–57)

Chaucer's *Treatise on the Astrolabe* (II.10) gives the same division of the
"houres in-equales ... cleped houres of planetes". The first hour belongs to
the ruler of the weekday, and the hours follow the Chaldean order
(`CHALDEAN_ORDER`: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon), so that
the 25th hour, the first of the next day, falls three places on. Cassius Dio
(*Roman History* 37.18–19, Cary's translation) gives the scheme: "If you begin
at the first hour to count the hours of the day and of the night, assigning
the first to Saturn, the next to Jupiter, ... you will find that the first
hour of the following day comes to the Sun." `PLANETARY_DAY_RULERS` lists the
weekday rulers from Sunday: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn.

- Sunrise, sunset and the next sunrise are the rise/set function's own events
  for the Sun, with the same `limb` and `refraction`; each hour boundary is
  sunrise + k (sunset − sunrise) / 12 or sunset + k (next sunrise − sunset) /
  12, rounded to the millisecond.
- The weekday is that of `date` itself.
- `status` is `"complete"` with the 24 hours; `"polar"` when the Sun does not
  rise on the date, or does not set and rise again within three days (inside
  and near the polar circles; `flags` says `"never-sets"` or `"never-rises"`
  when the Sun neither rose nor set on the date); or `"refused"` when the
  sample budget ran out.

`planetaryHourAt(observer, at, options?)` returns `{ day, hour }` for an
instant: the planetary day whose sunrise is the last at or before it, and the
hour that contains it (`null` when that day is not complete).

The worked examples the tests pin:

| Source | Date and place | Engine |
| --- | --- | --- |
| Chaucer, *Astrolabe* II.12: "The 13 day of March fil up-on a Saterday per aventure" | 13 March 1389 (Julian; 21 March Gregorian), a Saturday, at Oxford, 51°50′ N (Chaucer II.25), 1°15′ W | day hours Saturn … Venus, night beginning with Mercury and the Moon, the next sunrise the Sun's |
| Skeat's notes to II.7–10: a day of 16½ hours at Oxford when the Sun enters Cancer, "each 'hour inequal' is 1 h. 22½ m.", the night's 37½ m. | 2000-06-21 at Oxford, centre and no refraction (the astrolabe's horizon) | EVIDENCE_SKEAT |
| Heindel, *Simplified Scientific Astrology* (1919), pp. 155–156: at latitude 40 on a Thursday in December, Mars rules "from 1:32 to 2:18 P.M." | Thursday 2025-12-18, 40° N 75° W, local mean time | EVIDENCE_HEINDEL |

Robson also mentions a "modern" division of the day at noon and midnight into
four quarters of six hours; the engine does not offer it.

## Not included

- Twilight (civil, nautical, astronomical) and other altitudes.
- Refraction from temperature and pressure; the dip of the horizon from the
  observer's height; local topography.
- Rise and set of stars; planetary discs; the Moon's phase or libration.
- The noon-and-midnight division of planetary hours.

## Sources

- US Naval Observatory, *Rise, Set, and Twilight Definitions*,
  https://aa.usno.navy.mil/faq/RST_defs (read 2026-09-29).
- J. Meeus, *Astronomical Algorithms*, 2nd ed. (Willmann-Bell, 1998),
  ch. 15 (rising, transit and setting) and ch. 55 (semidiameters).
- B. A. Archinal et al., "Report of the IAU Working Group on Cartographic
  Coordinates and Rotational Elements: 2015", *Celest. Mech. Dyn. Astr.* 130:22
  (2018) (the Moon's mean radius).
- NIMA TR8350.2, *Department of Defense World Geodetic System 1984*, 3rd ed.
  (2000).
- G. Chaucer, *A Treatise on the Astrolabe* (c. 1391), II.10, II.12 and II.25,
  with W. W. Skeat's notes, in *The Complete Works of Geoffrey Chaucer*,
  vol. 3 (Clarendon Press, 1894; Project Gutenberg ebook 45027).
- Cassius Dio, *Roman History* 37.18–19, tr. E. Cary (Loeb, 1914), via
  LacusCurtius.
- V. E. Robson, *Electional Astrology* (1937), ch. V, pp. 56–57.
- M. Heindel, *Simplified Scientific Astrology* (1919), pp. 153–156.
