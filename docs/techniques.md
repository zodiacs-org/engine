# Chart techniques

`@zodiacs/engine/techniques` holds six techniques that Zodiacs.org used to
compute outside the package:

- **Solar and lunar returns**: `solarReturnInstant`,
  `mostRecentSolarReturnInstant`, `lunarReturnInstant`, `solarReturn`,
  `lunarReturn`.
- **Composite and Davison charts**: `compositeMidpoints`, `compositeAspects`,
  `compositeChart`, `davisonChart`, `davisonPlace`.
- **The void-of-course Moon**: `moonIngresses`, `moonAspects`,
  `voidOfCourseWindows`, `voidOfCourseAt`.
- **Aspect patterns**: `aspectPatterns`, `chartAspectPatterns`,
  `patternContainment`.
- **Essential dignities and mutual reception**: `dignityFor`, `dignitiesFor`,
  `hasClassicalDignities`, `dignityRulersAt`, `essentialDignities`,
  `mutualReceptions`, and the tables they read.
- **Moon signs for an unknown birth time**: `moonSignCandidates`,
  `moonSignsBetween`.

The root entry point does not import this one, so code that does not use
these techniques does not carry them. The functions take explicit inputs,
return frozen objects, keep no state between calls, and reject bad input with
a `RangeError`. Where a technique needs a chart, it takes a `NatalSource` (a
birth, or a `Chart` from `natalChart`), as the timing techniques do.

```ts
import { dignityRulersAt, lunarReturn, moonSignCandidates, mutualReceptions, solarReturn } from "@zodiacs/engine/techniques";

// Synthetic birth data.
const birth = { utc: "1987-11-04T06:21:00Z", latitude: 48.21, longitude: 16.37, houseSystem: "placidus" as const };

solarReturn(birth, "2031-05-01").instant;                   // the return nearest the date
lunarReturn(birth, "2031-05-01", { location: null }).chart; // the next lunar return, without houses
mutualReceptions([{ body: "Sun", lon: 15 }, { body: "Mars", lon: 135 }]); // Sun in Aries, Mars in Leo
dignityRulersAt(24).term;                                   // { planet: "Mars", from: 20, to: 25 }
moonSignCandidates("2000-04-11").sign;                      // null unless one sign held the whole date everywhere
```

Each function moved from the site was compared with the site's code over a
seeded corpus of synthetic inputs; the Davison chart, the essential
dignities beyond the four sign-level ones, and mutual reception are new and
have fixtures instead. The results, and the other measurements named below,
are in [`evidence/techniques-2026-09-29/`](evidence/techniques-2026-09-29/README.md).

## Solar and lunar returns

A return is the moment the transiting body comes back to the longitude it had
at birth, and the chart cast for that moment. al-Bīrūnī, *Book of
Instruction* §522 (tr. Wright): "each year the ascendant is ascertained when
the sun comes round to the same minute of the ecliptic in which it stood at
the birth". The lunar return takes the Moon's natal longitude in the same
way.

Longitudes are the engine's apparent geocentric longitudes of date. Instants
are found with the engine's crossing solver on its UTC time basis
([time.md](time.md)); with a 1-day step the solver resolves an instant to the
step divided by 2^24, about 5 ms.

- `solarReturnInstant(natalSunLongitude, near)`: the return nearest `near`,
  searched over 200 days either side at 1-day steps. A tie goes to the
  earlier return.
- `mostRecentSolarReturnInstant(natalSunLongitude, at)`: the latest return at
  or before `at`, searched over the 370 days before it: the start of the
  birthday year in progress.
- `lunarReturnInstant(natalMoonLongitude, after)`: the first return after
  `after`, strictly, within 40 days, at 6-hour steps.
- `solarReturn(natal, date, { selection, location, houseSystem })` and
  `lunarReturn(natal, after, { location, houseSystem })` take the natal
  longitude from the chart and cast the return chart with a known time. The
  chart is cast at the natal place by default, at `location` when one is
  given, and without angles or houses for `location: null` or a birth
  without a place. The house system is the natal chart's unless named.
  `selection` is `"nearest"` (default) or `"most-recent"`.

`lunarReturn` refuses a chart without a known birth time, a chart flagged
`dst-gap` or `dst-fold` (a local time that was skipped or repeated), and an
`after` before the birth: the Moon moves fast enough that an uncertain birth
time gives an uncertain return. `solarReturn` takes the Sun
at the chart's instant whatever its time.

Each result has `flags`: `["outside-reference-span"]` when the natal instant
or either end of the searched window lies outside 1800–2200
(`REFERENCE_SPAN`). The chart has its own flags as well. For a chart given on
UT1 or TT, or with a pinned ΔT, the natal longitude is the chart's own and the
return is found on the engine's UTC basis, as `solarArc` does.

**Against published times.** The U.S. Naval Observatory publishes the
equinoxes and solstices, the Sun's returns to 0°, 90°, 180° and 270°, in UT
to the minute. For the 20 of 1850, 1900, 1950, 2000 and 2022,
`solarReturnInstant` is within 42.27 s of the published minute; the gate was
120 s. Inverting the 24 JPL Horizons longitudes of the Sun and the 24 of the
Moon in the conformance suite's L1 vectors (1851 to 2148) gives the vectors'
instants within 32.05 s for the Sun and 6.81 s for the Moon, compared in TT;
the gates were 60 s and 15 s. Those are 0.1.1-rc.16's figures, on the
engine's full IAU 2000B nutation; on astronomy-engine's five-term nutation,
which the engine used up to rc.15, they were 45.35 s, 33.23 s and 6.87 s
(`docs/evidence/techniques-2026-09-29/rc16/`).

**Differences from the site.** The site clips its searches to 1800–2200 and
refuses a return it cannot find inside; it limits a lunar return's date to
1800-01-02 to 2199-11-21 and its houses to whole sign and Placidus, and
requires a birthplace. The package searches without clipping and flags the
result instead, takes any house system, and casts a chart without houses when
there is no place. Where the site's clipped window found a return, the
package finds the same return from its own window within the solver's
resolution. The site's Saturn returns (`saturnReturns`) are not moved: the
root entry's `saturnReturn` already computes them.

## Composite charts

The composite chart takes the midpoint of each pair of like points of two
charts: the two Suns, the two Moons, and so on. John Townley put it into use
with a 48-page book, *The Composite Chart* (1973), from the idea of "a chart
out of mutual midpoints", which he traces to the German midpoint schools;
Robert Hand wrote *Planets in Composite* (Para Research, 1975). Neither book
could be read for this work: the account is from an interview with Townley
(*The Astrology Podcast*, ep. 128); see *Sources*.

- `compositeMidpoints(first, second)` takes two lists of `{ body, lon }` and
  returns the midpoint of each body in both, in the first list's order. The
  midpoint is on the shorter arc. Two longitudes exactly 180° apart have two
  midpoints; the site's convention, kept here, takes the one 90° east of the
  first list's longitude.
- `compositeAspects(points)` finds the major aspects among the composite Sun
  to Pluto with the natal orbs of `ASPECTS`, sorted by orb. Composite points
  have no speeds, so the aspects carry no motion.
- `compositeChart(first, second)` does both for two charts or births. It has
  no angles or houses.

## Davison charts

Ronald C. Davison introduced this chart in *Synastry: Understanding Human
Relations Through Astrology* (New York: ASI Publishers, 1977). It is an
ordinary chart cast for the midpoint in time between two births and for a
place between the two birthplaces: "you create a chart for ... the midpoint
in time between those two ... and for a location that's between the two"
(*The Astrology Podcast*, ep. 128). The book could not be read for this
work, so the conventions below are this package's reading of that
definition, not Davison's text. For that reason the Davison chart,
`davisonChart`, `davisonPlace` and their three types, is experimental from
1.0 ([versioning.md](versioning.md)): these conventions (the place's default,
the house system, a known time only when both are known) may change in a
minor release.

- **Time**: the mean of the two births' UTC instants, rounded down to the
  millisecond. A chart given on UT1 or TT is read at its UTC instant.
- **Place**, `place: "coordinates"` (default): the mean of the two latitudes,
  and the longitude halfway along the shorter arc between the two
  longitudes. For longitudes exactly 180° apart it takes the one 90° east of
  the first. `place: "great-circle"`: the point halfway along the great
  circle between the two places; antipodal places are refused, and so, from
  1.0, are a place outside latitudes −90 to 90 or longitudes −180 to 180 and
  a convention not named. The two readings differ when the places are far
  apart.
- **The chart**: `davisonChart(first, second, { place, houseSystem })` casts
  it with the first chart's house system unless another is named. Its time is
  known only when both birth times are, and it has angles and houses only when
  both births have a place. `davisonPlace(first, second, convention)` gives
  the place alone.

The Davison chart is new: the site did not compute it, so it has no parity
test. Its tests check the mean instant and place on invented births, the
chart against `natalChart` at the same instant and place, and the
great-circle midpoint against a second formula, written from the spherical
triangle rather than from vectors, at 500 random pairs of places.

## The void-of-course Moon

William Lilly, *Christian Astrology* (1647), p. 112, with the long s printed
as s: "A Planet is voyd of course, when he is seperated from a Planet, nor
doth forthwith, during his being in that Signe, apply to any other: This is
most usually in the ☽" (the Moon).

The functions follow one named convention, `VOID_OF_COURSE_CONVENTION`,
`"last-exact-ptolemaic-aspect-to-sign-exit"`:

- **Aspects**: the five Ptolemaic aspects (conjunction, sextile, square,
  trine, opposition), exact in ecliptic longitude. There are no orbs; an
  aspect counts at the instant it perfects. Latitude and declination play no
  part.
- **Bodies**: the Sun and the eight planets with `bodies: "modern"`
  (default), or the Sun to Saturn with `bodies: "traditional"`
  (`VOID_BODIES`). The Moon's aspects to the nodes, the angles and the lots
  do not count.
- **Start**: the last such aspect the Moon perfects while in a sign. If it
  perfects none there, the whole sign is void, from the ingress.
- **End**: the Moon's entry into the next sign, when its longitude reaches
  the next multiple of 30°. An aspect that perfects only after the ingress
  does not end the void period of the sign the Moon has left.

The functions:

- `moonIngresses(from, to)`: every entry into a sign in (from, to].
- `moonAspects(from, to, { bodies })`: every exact aspect in (from, to]. Each
  instant puts the separation within 1e-4° of exact.
- `voidOfCourseWindows(from, to, { bodies })`: every void period whose ending
  ingress falls in (from, to].
- `voidOfCourseAt(at, { bodies })`: whether the Moon is void at `at`, the
  period in progress and the next one.

Windows longer than 3,660 days, and inverted ones, are refused. The instants
depend slightly on where a scan starts, because each search samples on its
own grid: two scans that start at different instants can place the same
aspect slightly apart (the tests allow up to a second).

## Aspect patterns

Four patterns among the Sun to Pluto, as Robert Hand defines them (*Horoscope
Symbols*, 1981, ch. 6, "Aspect Patterns or Harmonic Syndromes"):

- **Grand trine**: "three planets form an equilateral triangle in the
  zodiac": each is trine the other two.
- **Grand cross**: the planets are "ranged around the circle at 90° intervals
  so that each is in either square or opposition to the other planets in the
  cross": two oppositions, each planet square its two neighbours.
- **T-square**: "a grand cross with one arm missing": two planets in
  opposition, both square a third, the apex.
- **Kite**: "a close grand trine, with one of the three planets closely
  opposed by a fourth planet that also lies on the midpoint of the other two
  in the grand trine": a grand trine, and a fourth planet opposite one of its
  planets and sextile the other two.

`aspectPatterns(points, aspects)` works from the aspect records a chart holds
(`chart.aspects`, or any records of the same shape), not from the positions
alone: a pattern is found only when every one of its aspects is among the
records. Each record is checked against the positions with `matchAspect`, so
the orbs are the natal orbs of `ASPECTS`, inclusive, and the luminaries widen
them. A record that the positions do not bear out, repeated or non-finite
positions, and contradictory duplicates are refused with the site's reasons.
Each pattern names its members, its aspects with the orb and the limit that
admitted each, its oppositions and, for a T-square or kite, the roles of its
planets. `chartAspectPatterns(natal)` reads a chart's own bodies and aspects.

`patternContainment(patterns)` sorts the patterns and says which lie inside
which: a pattern lies inside another when it has fewer members, all of them
the other's, and every one of its aspects is the other's. A grand cross holds
four T-squares; a kite holds its grand trine; a grand trine can lie inside two
kites.

The site orders pattern ids with `localeCompare`, which reads the host's
locale; the package compares code units. No body name is a prefix of another,
so the two orders are the same for every id; the corpus shows no difference.
The site's reading texts, scope notes and share cards are presentation and
are not moved.

## Essential dignities

The seven classical planets have five essential dignities and two debilities.
The tables, and where each comes from:

| Table | Content | Source |
| --- | --- | --- |
| `DOMICILE_RULERS` | Mars rules Aries and Scorpio, Venus Taurus and Libra, Mercury Gemini and Virgo, the Moon Cancer, the Sun Leo, Jupiter Sagittarius and Pisces, Saturn Capricorn and Aquarius. | Ptolemy, *Tetrabiblos* I.17; Dorotheus, *Carmen Astrologicum* I.1.8–9 |
| `EXALTATIONS` | The Sun in Aries, the Moon in Taurus, Mercury in Virgo, Venus in Pisces, Mars in Capricorn, Jupiter in Cancer, Saturn in Libra. The fall is the opposite sign. | *Tetrabiblos* I.19; Dorotheus I.2 |
| detriment | The sign opposite a domicile. | al-Bīrūnī, *Book of Instruction* §442 |
| `TRIPLICITY_LORDS` | Dorothean: fire, the Sun by day, Jupiter by night, Saturn participating; earth, Venus, the Moon, Mars; air, Saturn, Mercury, Jupiter; water, Venus, Mars, the Moon. | Dorotheus I.1.3; al-Bīrūnī §445 |
| `EGYPTIAN_TERMS` | Five unequal terms in each sign. | *Tetrabiblos* I.20, "Terms according to the Egyptians"; al-Bīrūnī §453 |
| `CHALDEAN_FACES` | Thirty-six faces of 10°, their lords in descending order of the spheres from Mars in the first face of Aries. | al-Bīrūnī §§449, 451 |

Where traditions differ, the variant is named:

- **Triplicities**: Dorothean. Dorotheus gives each triplicity three lords
  whose order changes with the sect ("the lords of the triplicity of Aries by
  day are the Sun, then Jupiter, then Saturn, by night Jupiter, then the Sun,
  then Saturn"). Ptolemy's fourth triangle (*Tetrabiblos* I.18) differs: Mars
  governs it, with Venus by day and the Moon by night.
- **Terms**: Egyptian. Ptolemy also describes the Chaldean terms and gives a
  table of his own (I.21); al-Bīrūnī writes that professional astrologers
  "are unanimous in using the Egyptian terms". The degrees of each planet's
  Egyptian terms add up to 57 (Saturn), 79 (Jupiter), 66 (Mars), 82 (Venus)
  and 76 (Mercury), 360 in all; Ptolemy mentions these sums as "the number
  derived for each planet from the addition of its terms in all the signs, in
  accordance with which they say the planets assign years of life".
- **Faces**: Chaldean, "according to the agreement of the Persians and
  Greeks" (al-Bīrūnī §449). The Indian decanates, whose lords are those of
  the sign and of the fifth and ninth from it, are the D3 varga of
  `@zodiacs/engine/vedic`. Ptolemy's "faces" (*Tetrabiblos* I.23) are another
  thing, a planet's aspect to the luminaries.

The functions:

- `dignitiesFor(planet, sign)`: every sign-level condition of a planet, in
  the order domicile, exaltation, detriment, fall. The outer planets and the
  nodes have none. `dignityFor(planet, sign)` names one, as the site does:
  exaltation or fall where either holds (Mercury in Virgo is exalted, and
  also in its domicile), else domicile or detriment, else null.
  `hasClassicalDignities(planet)` is true for the seven.
- `dignityRulersAt(longitude)`: who holds each dignity and debility at a
  longitude, with the term's and the face's degrees within the sign.
- `essentialDignities(planet, longitude, sect)`: a classical planet's
  dignities and debilities there, and `peregrine` when it has no dignity
  (Lilly, p. 112). Triplicity counts the lord of the chart's sect only, the
  day lord in a day chart and the night lord in a night chart, as Lilly's
  reception by triplicity does ("if the Question or Nativity be by day");
  the participating lord is listed by `dignityRulersAt` but not counted.
- `mutualReceptions(positions, { dignities, sect })`: every pair of classical
  planets "in each others dignity" (Lilly, p. 112), by the dignities named:
  domicile and exaltation by default, any of the five on request. Reception
  by triplicity needs the sect. Each pair lists the dignities by which each
  planet receives the other, so a mixed reception, one by domicile and the
  other by exaltation, shows as such.

Degrees of exaltation (Dorotheus I.2 gives them: the Sun in 19° Aries, and so
on) and the dignities of the lunar nodes (al-Bīrūnī §443) are not used.

The tests check each table against a transcription of its source written
separately from the code, and Lilly's worked examples on p. 112: reception by
house (the Sun in Aries and Mars in Leo), by triplicity by day (Venus in Aries
and the Sun in Taurus), by term (Venus in the 24th degree of Aries and Mars in
the 16th of Gemini), and peregrine planets (Saturn in the tenth degree of
Aries, but not in its 27th or 28th; the Sun anywhere in Aquarius).

## Moon signs for an unknown birth time

Without a birth time, a chart's Moon is known only to within the day. The
apparent Moon never moves backwards, so the signs it occupies over a span are
the signs from its sign at the start, forward, to its sign at the end.
`moonSignsBetween(from, to)` gives them for a span of at most 20 days.

`moonSignCandidates(date, options)` gives them for a civil date:

- With `timeZone`, the date runs from its local midnight to the millisecond
  before the next, each read as `resolveLocalToUtc` in `@zodiacs/engine/geo`
  reads a wall time: a skipped midnight moves forward, a repeated one takes
  the earlier instant. `longitude`, the birthplace's, reads a date in a
  zone's local mean time era on the birthplace's own mean time. Before 1970,
  await `prepareLocalTime(date, timeZone)` from `@zodiacs/engine/geo` first,
  as for `resolveLocalToUtc`. A date the zone skipped, such as 2011-12-30 in
  Pacific/Apia, is refused.
- Without a zone, the date runs from 00:00 at UTC+14, where a date begins
  first, to 24:00 at UTC−12, where it ends last: 50 hours. Then `sign` is set
  only when the Moon held one sign the whole date in every time zone. This is
  the rule the site uses for a card without a birth time.

In the zone histories the package ships (tzdata 2025c with backzone), every
offset lies within UTC−12:00 to UTC+14:00 except in 16 zone names: those of
Alaska until 1867-10-19, when Alaska kept the Asian side's date, and those of
the Philippines, Guam, Palau and Micronesia until 1844-12-31, when they kept
the American side's. For a birth there and then, a date without a zone can
begin earlier or end later than the span above.

**Differences from the site.** The site answers for a date a zone skipped;
the package refuses it. Before 1970 the site reads a date's midnights on the
host's `Intl` data, the package on its own tzdata 2025c with backzone; they
differ where the two histories do, and the corpus has 7 such dates, all in
Stockholm before 1900, where the midnights differ by 6 min 46 s or 18 min 44 s
and the signs agree. The site's labels and share rules (`moonLabel`,
`moonIsUncertain`) are presentation and are not moved.

## Errors and flags

Every function throws `RangeError` for input it cannot use: a name that is
not a body, sign, house system or option; an unknown option key; a
non-finite number; an invalid date; an inverted or overlong window; a place
out of range; and the refusals named above. astronomy-engine's own failures
far from the present pass through as the root entry's do.

`flags` is `["outside-reference-span"]` on a return, a Davison chart and a
Moon-sign result when the ephemeris was read outside 1800–2200, and empty
otherwise; the result is still computed.

## Not included

- The site's presentation code: reading texts, labels, share cards and
  calendar files.
- Other returns: planetary returns other than Saturn's (the root entry's
  `saturnReturn`), progressed or precessed returns, and returns in the
  sidereal zodiac.
- Composite angles and houses; Davison's own handling of the antimeridian,
  which could not be checked.
- Orbs for the void-of-course Moon, and void periods of other planets.
- Aspect patterns with minor aspects (yod, mystic rectangle, grand sextile),
  and patterns among the nodes or the angles.
- Ptolemaic and Chaldean terms, Ptolemy's and Lilly's triplicities, degrees
  of exaltation, the nodes' dignities, and accidental dignities.

## Sources

Access date for every URL: 2026-09-29.

- al-Bīrūnī, *The Book of Instruction in the Elements of the Art of
  Astrology* (1029), tr. R. Ramsay Wright (London: Luzac, 1934). Typescript
  on archive.org, `albirunibookofinstruction`: §§440–445 (domiciles,
  detriment, exaltation, triplicities), §§449 and 451 (faces, and the table
  of lords of faces), §453 (terms), §522 (the solar revolution). Quoted from
  the item's OCR text with its misreadings corrected ("eoliptio" is
  "ecliptic").
- Dorotheus of Sidon, *Carmen Astrologicum*, ed. and tr. David Pingree
  (Leipzig: Teubner, 1976), book I, ch. 1–2, pp. 161–162; the copy on
  archive.org, `PingreeDS1976`, read from the page images.
- Ptolemy, *Tetrabiblos*, tr. F. E. Robbins (Loeb Classical Library, 1940),
  book I, ch. 17–23, via LacusCurtius:
  <https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B*.html>.
- William Lilly, *Christian Astrology* (London, 1647), p. 112: reception,
  peregrine and void of course. Scan on archive.org, `ca-william-lilly`,
  read from its OCR text; quotations print the long s as s.
- Robert Hand, *Horoscope Symbols* (1981; Schiffer, Red Feather ebook),
  ch. 6, "Aspect Patterns or Harmonic Syndromes"; copy on archive.org,
  `robert-hand-horoscope-symbols-schiffer-publishing-1981`.
- Ronald C. Davison, *Synastry: Understanding Human Relations Through
  Astrology* (New York: ASI Publishers, 1977; Aurora Press, 1983; editions as
  Open Library lists them). Not read: the only copy found, archive.org
  `synastry00rona` (the 1983 edition), is lending-only. The definition above
  is the interview's, below; the conventions for the place are this
  package's.
- John Townley, *The Composite Chart* (1973, the year given in the interview
  below; Open Library lists a 48-page Weiser edition of 1982), and Robert
  Hand, *Planets in Composite* (Para Research, 1975, as Open Library lists
  it). Not read; no copy was found.
- *The Astrology Podcast*, ep. 128, "Composite Charts with Originator John
  Townley", transcript published 2021-04-17:
  <https://theastrologypodcast.com/transcripts/ep-128-transcript-composite-charts-with-originator-john-townley/>.
- U.S. Naval Observatory, Astronomical Applications Department, *Earth's
  Seasons* API: <https://aa.usno.navy.mil/api/seasons?year=2022> and the
  other years (`src/techniques/fixtures/usno-seasons.json` keeps the times
  and each response's SHA-256).
- JPL Horizons DE441 through the conformance suite's L1 vectors
  (`conformance/vectors/L1-positions.json`,
  [`conformance/arbiters/l1/README.md`](../conformance/arbiters/l1/README.md)).
