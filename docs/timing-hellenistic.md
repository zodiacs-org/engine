# Hellenistic timing techniques

`@zodiacs/engine` computes four traditional timing techniques. They are
exported from the `@zodiacs/engine/timing` entry point, not from the package
root, so code that does not import them does not carry them:

- **Annual and monthly profections**: `annualProfection`, `profectionYear`,
  `profectionAt`.
- **Firdaria**: `firdariaSequence`, `firdariaPeriods`, `firdaria`,
  `firdariaAt`.
- **Zodiacal releasing**: `releasingPeriods`, `releasingAt`,
  `zodiacalReleasing`, `zodiacalReleasingAt`.
- **Solar arc directions**: `solarArc`, `directLongitudes`,
  `solarArcDirections`.

Each technique has a pure function that works from signs, ages or
longitudes. Where a chart is needed, a second function takes a chart source
(`NatalSource`: a birth, or a `Chart` from `natalChart`). The chart-level
functions read the Ascendant, the lots, the sect and the natal Sun from the
engine's own `natalChart` and `chartPoints`, so the lots are Paulus's,
reversed by night.

Every result is frozen, and every `Date` in a result is a fresh instance.
Unknown names, invalid values and unknown option keys throw `RangeError`.
Names, options and dates are checked before the chart is computed; a point
the chart lacks (angles and lots need a birth time and place) and a date
before birth are refused once it is. The worked examples that pin each
technique, with their sources, and an independent comparison of the rules
and the dated instants are in
[`evidence/timing-hellenistic-2026-09-28/README.md`](evidence/timing-hellenistic-2026-09-28/README.md).

```ts
import { annualProfection, firdariaAt, profectionAt, solarArc, zodiacalReleasing } from "@zodiacs/engine/timing";

// Christopher Reeve (1952-2004), a worked example in Hamish Saunders, "Solar
// Arc Directions" (Astrology House, 1996), p. 3, Figure 1.
const birth = { utc: "1952-09-25T07:12:00Z", latitude: 40.7667, longitude: -73.9833 };

annualProfection("virgo", 34);              // { sign: "cancer", ruler: "Moon", house: 11, ... }
profectionAt(birth, "1995-05-26T06:02:46Z"); // age 42: year Aquarius (Saturn), solar month Libra (Venus)
firdariaAt(birth, "1995-05-26T06:02:46Z");   // night birth, age 42.665: Sun period, Mercury's share
zodiacalReleasing(birth, "Lot of Spirit", birth.utc, "2030-01-01", { levels: 2 }); // from Libra
solarArc(birth.utc, "1995-05-26T06:02:46Z").arc; // 42.3335 (42°20′)
```

## Shared vocabulary

`TRADITIONAL_RULERS` maps each sign to its traditional domicile ruler:

| Ruler | Signs |
| --- | --- |
| Sun | Leo |
| Moon | Cancer |
| Mercury | Gemini, Virgo |
| Venus | Taurus, Libra |
| Mars | Aries, Scorpio |
| Jupiter | Sagittarius, Pisces |
| Saturn | Capricorn, Aquarius |

Sources: Ptolemy, *Tetrabiblos* I.17; al-Bīrūnī §440. `CHALDEAN_ORDER` lists
the planets from Saturn down to the Moon. The dated functions accept a natal
starting point by name (`ChartLongitudeName`):

- any body row: the Sun, the Moon, the eight planets, `"North Node"` and
  `"South Node"`;
- `"Ascendant"`, `"Midheaven"`, `"Descendant"` or `"Imum Coeli"`;
- any `chartPoints` point: the mean nodes, Black Moon Lilith, the Vertex,
  the East Point and the seven lots.

Angles, lots, the Vertex, the East Point and the sect need a birth time and
place.

### Years of life are solar-return years

Profections and firdaria count age in solar-return years. Year *n* runs
from the *n*-th return of the apparent Sun to its natal longitude to the
next one; year 0 starts at the birth instant. al-Bīrūnī §§522–524 puts it this
way: "each year the ascendant is ascertained when the sun comes round to the
same minute of the ecliptic in which it stood at the birth". Fractional ages
are linear in time within their year.

Returns are found with the engine's own crossing solver, to about 5 ms, on
its apparent geocentric Sun, with the birth read as a UTC instant on the
engine's time basis ([time.md](time.md)). A chart given on UT1 or TT is read
at its UTC instant, as `saturnReturn` reads one; a chart's pinned ΔT is not
applied to the returns. The solver looks for return *n* within three days of
`birth + n × 365.2422 days`. For 24 births from 1800 to 1992, spread through
the year, the first 110 returns fell within 108 minutes of that estimate and
the first 300 within 268 minutes; `src/timing/solar-years.test.ts` repeats
the measurement. A year turns at the return, which can differ from the
calendar birthday by a day.

## Profections

`annualProfection(origin, age)` needs no chart. `origin` is a lowercase
sign name or a longitude in degrees; only its sign matters. `age` is the
number of completed years, a non-negative integer. The result is:

- `origin`: what was counted from, as `{ point, lon, sign }` (`TimingOrigin`),
  with `point` null and `lon` null for a sign name;
- `sign`: the origin's sign advanced `age` signs;
- `ruler`: the traditional ruler of that sign, the lord of the year;
- `house`: `age mod 12 + 1`, the place counted inclusively from the origin.
  From the Ascendant, this is the whole-sign house.

Age 0 is the first year of life, so Valens's "35th year" is age 34. The
cycle repeats every twelve years.

`profectionYear(natal, age, options)` returns that year with its start and
end (two solar returns) and all of its months. `profectionAt(natal, date,
options)` returns the year and the month running at `date`. The options are:

- `point`: the natal point to profect. The default is `"Ascendant"`; any
  `ChartLongitudeName` of the chart is accepted. The result's `origin` gives
  the point, its longitude and its sign.
- `months`: how the year is divided. Month *k* takes the year's sign
  advanced *k* signs.

| `months` | Months | Basis |
| --- | --- | --- |
| `"solar"` (default) | Twelve months. The first begins at the solar return, and each of the others when the transiting Sun has gained another 30° on its natal longitude. They last 29.4–31.5 days. | A convention with the boundaries of al-Bīrūnī's monthly revolution charts; his profected months are thirteenths. Valens IV.28 may describe it for day births. |
| `"twelfths"` | Twelve equal parts of the solar-return year, about 30.44 days each. | An arithmetic convention; no classical statement located. |
| `"thirteenths"` | Thirteen equal parts of each solar-return year, 28 d 2 h 17.6 min on average. The thirteenth repeats the year's sign. | This engine's convention, after al-Bīrūnī's thirteen months. |

`PROFECTION_MONTH_CONVENTIONS` lists the three conventions.
`DEFAULT_PROFECTION_MONTHS` is `"solar"`.

### What the sources say about months

**Valens IV.28** (Riley p. 91) is part of a method that Valens quotes from
Seuthos and the school of Hermeios (IV.27–IV.29):

> You will get the month as follows: <for day births> determine the
> distance from the sun at the moment in question to the sun at the
> nativity, then count that distance from the sign which has been allotted
> the year. For night births, determine the distance from the moon at the
> moment in question to the moon at the nativity, then count <that
> distance> from the sign which has been allotted the year.

- The Sun's count is for day births; the words "for day births" are the
  translator's. Night births count from the Moon.
- "Count that distance" does not say how. In whole signs, the month turns
  when the Sun enters a sign; in 30° arcs from the natal Sun, it turns where
  `"solar"` turns it.

The engine has neither the Moon's count nor the whole-sign reading. Read
the same way as the Sun's, the Moon's distance passes through the twelve
signs in about 27 days, so a night birth's month would change every two or
three days. The passage then turns to births at a new or full Moon, whose
months begin "however many days the moon at the nativity was from the new-
or full-moon position". It gives no worked example, so neither reading of
the Moon's count can be checked.

**al-Bīrūnī §§522–524** (typescript p. 119) describes revolution charts:
"Each year the ascendant is ascertained when the sun comes round to the
same minute of the ecliptic in which it stood at the birth, i.e. the
anniversary (tahwil), and also every month when the sun arrives at the same
degree and minute it occupied in the radical or revolutionary figure". A
footnote adds that a figure is then drawn as at birth. The `"solar"` boundaries
are these monthly instants. His profected months are something else: "each
year is divided into (thirteen) months of 28 days 1 hour 51 minutes and a
sign to each given, so that the last month ... has the same sign as the
first".

Three ways of giving a sign to each of about thirteen months a year:

- **al-Bīrūnī:** months of a fixed length, 28 d 1 h 51 min, which is 365/13
  days. Thirteen make 365 d 0 h 3 min, 5 h 46 min short of a solar-return
  year; he does not say what fills the rest.
- **Ptolemy IV.10:** "the number of months from the month of birth, starting
  from the places that govern the year, twenty-eight days to a sign". The
  months are 28 days long and counted from the month of birth, not from each
  year's start: a year holds 13.04 of them.
- **`"thirteenths"`:** thirteen equal parts of each solar-return year,
  restarting at each return. At 28 d 2 h 17.6 min on average, a month is
  26.6 min longer than al-Bīrūnī's. No source states this division; it is
  the engine's.

## Firdaria

The periods run 75 years in all, then begin again:

| Lord | Years |
| --- | --- |
| Sun | 10 |
| Venus | 8 |
| Mercury | 13 |
| Moon | 9 |
| Saturn | 11 |
| Jupiter | 12 |
| Mars | 7 |
| North Node | 3 |
| South Node | 2 |

By day the sequence is Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars,
North Node, South Node. By night the planets start from the Moon: Moon,
Saturn, Jupiter, Mars, Sun, Venus, Mercury. The variant decides where the
nodes go by night:

| `variant` | Night sequence | Source |
| --- | --- | --- |
| `"abu-mashar"` (default) | nodes last, after Mercury (end ages 9, 20, 32, 39, 49, 57, 70, 73, 75) | Abu Maʿshar, *On the Revolutions of the Years of Nativities* IV.7.24; al-Bīrūnī §438 |
| `"bonatti"` | nodes after Mars, as by day (end ages 9, 20, 32, 39, 42, 44, 54, 62, 75) | Bonatti, *Liber astronomiae* (tr. Zoller), as Birchfield quotes him; Birchfield's Table 2, "assumed from Bonatti" |

Any other name throws `RangeError`. Day sequences are the same under both
variants.

Each planet's period is shared in seven equal sub-periods: the lord's own,
then each planet below it in `CHALDEAN_ORDER`, wrapping from the Moon back
to Saturn. The Sun's period, for example, runs Sun, Venus, Mercury, Moon,
Saturn, Jupiter, Mars, each for 10/7 years. The nodes have no sub-periods.
The functions are:

- `firdariaPeriods(sect, { variant })` gives one cycle by age. It is pure.
- `firdaria(natal, { variant, cycles })` dates 1 to 4 cycles. It takes the
  sect from `chartPoints`, so it needs a birth time and place.
- `firdariaAt(natal, date, { variant })` gives the period and sub-period
  running at a date, with the fractional age and the cycle.

The years are solar-return years, as for profections: whole ages fall on
the returns, and a fraction of a year is a fraction of the time between two
returns. The sources read here give the periods in years without saying
how a year is measured. Counting 365.25-day years from birth instead is a
variant the engine does not offer: it would put age 70 about half a day
later.

## Zodiacal releasing

Each sign allots the minor years of its ruler, except that Capricorn allots
27 and Aquarius 30 (`VALENS_MINOR_YEARS`):

| Sign | Years |
| --- | --- |
| Aries | 15 |
| Taurus | 8 |
| Gemini | 20 |
| Cancer | 25 |
| Leo | 19 |
| Virgo | 20 |
| Libra | 8 |
| Scorpio | 15 |
| Sagittarius | 12 |
| Capricorn | 27 |
| Aquarius | 30 |
| Pisces | 12 |

One round of the twelve signs is 211 units (`RELEASING_CYCLE_UNITS`).

Level 1 starts at birth with the lot's sign for its years, then runs on in
zodiacal order. It is never loosed; one round would take 211 years.

Each period is divided from its own sign, in the same order, in units of
the level below:

- level 2 in months;
- level 3 in "days" of 2½ days;
- level 4 in "hours" of 5 hours.

These unit lengths are for 360-day years. The last sub-period is cut short
where its parent ends (`truncated`).

When the sub-periods complete a round of the twelve signs inside a longer
parent, the next sub-period is not the parent's sign again. It is the sign
opposite, and the order continues from there. This is the **loosing of the
bond** (Valens IV.4, and IV.10 for days and hours). It happens at most once
per parent. The period where it starts carries `loosingOfTheBond: true`.

Valens names two other practices, and the engine has neither:

- IV.4: "Some astrologers allot the remaining chronocratorships beginning
  with the sign in trine, but this does not seem scientific to me."
- A marginal note to IV.10: "Some astrologers allot the days using the
  triangles."

The year length is a real variant; choose it with `years`. Each level below
is a twelfth of the one above, per Valens IV.10. `RELEASING_UNIT_DAYS` gives
the unit lengths in days.

| `years` | Unit lengths | Source |
| --- | --- | --- |
| `"valens-360"` (default) | 360-day years, 30-day months, 2½-day and 5-hour units | Valens IV.9–10; Brennan & Schaim, The Astrology Podcast ep. 192 |
| `"julian-365.25"` | 365¼-day years, divided by twelfths likewise | reported by a practitioner (Subramanyan, 2019), for whom 360-day years did not fit the events in some charts tested; the twelfths below the year are this engine's reading of IV.10 |

Every boundary is an exact whole multiple of the level-4 unit (5 hours, or
365.25/1728 days) of elapsed time after the birth instant. These are not
calendar anniversaries. The functions are:

- `releasingPeriods(origin, birthUtc, from, to, { levels, years })` returns
  every period of levels 1 to `levels` (2 by default) that overlaps
  [from, to]. The list is flat, in pre-order: each period is followed by its
  sub-periods. `origin` is a sign name or a longitude. A `from` before birth
  is clamped to birth. A window holding more than 100,000 periods is
  refused.
- `releasingAt(origin, birthUtc, date, { years })` returns the four periods
  running at `date`, and the elapsed days and releasing years (Valens IV.9
  reckons age the same way).
- `zodiacalReleasing(natal, lot, from, to, options)` and
  `zodiacalReleasingAt(natal, lot, date, options)` start from the chart's
  `"Lot of Fortune"` or `"Lot of Spirit"`, as `chartPoints` computes it. Any
  other lot name is refused.

Each result's `origin` is `{ point, lon, sign }`: the lot, its longitude and
its sign from a chart; `point` null, and `lon` null for a sign name, from the
first two functions.

Valens IV.4 has a rule for when Fortune and Spirit fall in the same sign:
forecasts of activity are taken "from the sign immediately following". The
engine does not apply it. Pass that sign to `releasingPeriods` yourself.
Peak periods and angularity from Fortune are not computed.

## Solar arc directions

`solarArc(birthUtc, target)` takes the secondary-progressed Sun,
`progressedBodies(birthUtc, target)`, minus the natal Sun,
`progressedBodies(birthUtc, birthUtc)`. The progression maps one
365.2422-day year of life to one day, as `progressedInstant` does. The arc
is counted on continuously:

- about +1° a year after birth;
- negative before birth (converse);
- past 360° after about 365 years.

`directLongitudes(rows, arc)` advances any `{ name, lon }` rows by the arc.
`solarArcDirections(natal, target)` advances every body, angle and chart
point of a chart:

- the twelve body rows, including the true nodes;
- the Ascendant, Midheaven, Descendant and Imum Coeli;
- the `chartPoints` rows.

Each result row gives `natal`, `directed`, `sign` and `degree`. Longitudes
are directed by adding the arc in longitude. The arc is not converted to
right ascension.

The arc is always read from UTC instants on the engine's time basis; a chart
given on UT1 or TT is read at its UTC instant. For a chart with a pinned ΔT
the natal longitudes are the chart's own, so its directed Sun can differ from
the progressed Sun: by 139.6″ for a birth at 1600-06-15T12:00Z pinned at
3,600 s and directed to 1650 (`src/timing/solar-arc.test.ts`).

## Flags

Every dated result has `flags`, a list of `TimingFlag` values, empty when
none applies. Like a chart's flags, they mark a result and change nothing
in it.

- `"outside-reference-span"`: the ephemeris was read at an instant outside
  `REFERENCE_SPAN` (1800 to 2200): the birth, a solar return or month
  boundary the result uses, or a solar arc's progressed instant. Releasing
  reads the ephemeris only at birth, for the lot, and releasing from a sign
  never, so `releasingPeriods` and `releasingAt` return no flags.
- `"sect-contradicts-altitude"`: the result depends on the chart's sect, and
  the sect says the opposite of the Sun's altitude at birth.

`chartPoints` takes the sect from the Sun's house: day in houses 7 to 12,
the half of the ecliptic from the descendant through the midheaven to the
ascendant. Wherever the midheaven is above the horizon, so is that half.
Inside the polar circles the midheaven can be below the horizon, and then
the sect is the opposite of the Sun's altitude wherever the Sun is. Two
charts at 78.2° N:

- 1810-01-07 11:57:42.814 UT at 17.8405° E: the sect is day, with the Sun
  11.0° below the horizon in the polar night;
- 2100-06-26 00:24:28.491 UT at 22.924° W: the sect is night, with the Sun
  12.1° above the horizon under the midnight sun.

The flag marks firdaria, releasing from a chart's lot, profections of a lot
and solar arc directions of a chart with lots. The sect itself is not
changed: `chartPoints`, the lots and the firdaria sequence keep it, and the
flag leaves the choice to the reader. The Sun's altitude is taken with the
Sun on the ecliptic, as the sect takes it.

## Limits

These are calculation conventions with cited sources. They are not claims
of predictive validity. The positions underneath keep the engine's
ephemeris and its reference span. Timing results are not part of the natal
receipt.

Positions are computed only inside `EPHEMERIS_SPAN`, Terrestrial Time
0001-04-30 to 3998-09-03, the years astronomy-engine tabulates: an instant
outside it throws a `RangeError`, from the timing functions as from
`natalChart`. Before 0.1.1-rc.14 the engine went on far beyond, where
astronomy-engine's light-time solver could stop converging (first, in a
sampled scan, for a planet in the years 24,984 and −22,669) and threw a
string.

A search with a budget reports it in one of two ways. `planetaryReturns`
returns `{ status: "refused", reason: "sample-budget" }` with no returns when
its `maxSamples` is spent, as the crossing search does. `releasingPeriods`
throws a `RangeError` for a window that holds more than 100,000 periods.

The following are not implemented:

- daily or hourly profections;
- continuous (degree-based) profections;
- the Moon's months for night births and the whole-sign reading of the
  Sun's months (Valens IV.28);
- al-Bīrūnī's fixed months of 28 d 1 h 51 min, and Ptolemy's 28-day months
  counted from birth (IV.10);
- Zoller's month-to-ruler variant;
- firdaria counted in 365.25-day years;
- sub-periods for the nodal firdaria;
- the mundane firdaria;
- loosing the bond to the sign in trine (Valens IV.4), or days by triangles
  (IV.10, marginal note);
- releasing from lots other than Fortune and Spirit;
- solar arcs measured in right ascension;
- Naibod or one-degree symbolic arcs.
