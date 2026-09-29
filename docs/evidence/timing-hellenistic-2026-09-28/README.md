# Hellenistic timing techniques: evidence

2026-09-28. Branch `feature-hellenistic`, based on engine `main` at
`8c4946b142c731ecdec186df6c04b91b7f2463e0` (0.1.1-rc.12 with the conformance
suite v0). It was first written on `df01d2d7`, then rebased and revised after
an independent review (see *Review*).

**Integration into 0.1.1-rc.15 (2026-09-29).** The branch's commits were
cherry-picked onto rc.14 and the time basis (`docs/time.md`), and one
integration commit followed: since rc.14 an instant outside `EPHEMERIS_SPAN`
is refused by the core before astronomy-engine sees it, so the test of
astronomy-engine's thrown strings now checks that refusal; a chart given on
UT1 or TT is read at its UTC instant; and the pinned-ΔT figure in
`docs/timing-hellenistic.md` is restated for an instant a test pins.
Everything below was measured on this branch, where instants were read as UT1
on the ΔT model; rc.15's own checks are in
[`../rc15-20260929/`](../rc15-20260929/README.md). The branch and the
commits cherry-picked from it are local and were never pushed; this
repository's history carries them in rc.15's one integration commit (the same
README, *The published history*).

**Birth data (after the rc.15 review, 2026-09-29).** The podcast examples
below were first checked on public figures' charts, four of them living
people's, with birth dates from the public record. Those checks now run on
invented births, counted by hand from the rules; the tables say which. The
published examples that remain are about people who have died, cited with
page: Saunders's three figures and Estadella's Chaplin example.
`../rc15-20260929/birth-data-mutations.txt` shows the invented charts failing
under every defect the replaced tests caught.

This candidate adds four techniques in `src/timing/`, exported from the
`@zodiacs/engine/timing` entry point:

- annual and monthly profections;
- firdaria;
- zodiacal releasing from the Lots of Fortune and Spirit;
- solar arc directions.

The gate for this work is cited worked examples. Every technique is pinned
to at least two published examples, with the source quoted next to each
fixture in `src/timing/*.test.ts`. The user documentation is
[`docs/timing-hellenistic.md`](../../timing-hellenistic.md).

Three kinds of check are used here, and each is labelled as what it is:

- **Worked examples** compare a figure a source publishes with the engine's
  output.
- **Consistency checks** compare the engine with itself: its ephemeris, its
  tables, its constants and invariants. They find internal errors. They are
  not independent evidence, and a misreading shared by the code and the
  check passes them.
- **The independent comparison** rewrote every rule from the definitions and
  recomputed the dated instants with another ephemeris (see *Independent
  comparison*).

The package version is unchanged. `CHANGELOG.md` has an *Unreleased* entry
and the top-level `README.md` lists the new entry point. No runtime
dependency was added. Swiss Ephemeris was used only in the review, as a
comparison instrument: only statistics from it are recorded here, and no
Swiss Ephemeris code, data or per-case output is committed.

## Changes

- `src/timing/rulers.ts`: `TRADITIONAL_RULERS`, `CHALDEAN_ORDER`.
- `src/timing/profections.ts`, `firdaria.ts`, `releasing.ts`,
  `solar-arc.ts`: the four techniques.
- `src/timing/shared.ts`, `solar-years.ts`: internal helpers for options,
  signs and chart longitudes, the result flags, the check of the sect
  against the Sun's altitude, and years counted by solar returns.
- `src/timing/*.test.ts`: the fixtures and consistency checks.
- `src/timing.ts`: the `@zodiacs/engine/timing` entry point. The root
  entry point is unchanged from `main`.
- `package.json`, `typedoc.json`, `scripts/verify-package-contents.mjs`: the
  new entry point.
- `src/api.ts`: `resolvedChart` is exported (marked `@internal`, not
  re-exported from the root), so the timing modules validate a supplied
  Chart exactly as `chartPoints` does.
- `scripts/module-resolution-smoke.mjs`: checks the new exports.
- `docs/timing-hellenistic.md`: user documentation.
- `CHANGELOG.md` (*Unreleased*) and `README.md` (one line on the entry
  point).
- This README.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 2,681 passed in 34 files: the 2,612 existing tests unchanged, plus 69 for timing (profections 16, firdaria 12, releasing 18, solar arc 15, checks and flags 7, solar-return years 1) |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run exports:smoke` | pass; requires the 14 functions on `@zodiacs/engine/timing`, none of its exports in the root, five published values and frozen tables |
| `npm run package:contents` | pass: 34 files, 299,441 bytes unpacked, against a limit of 300,000. rc.12 was 245,844 |
| `npm run pack:dry-run` | pass: 86.6 kB packed |
| `npm run consumer:smoke` on the packed tarball | pass: a clean consumer type-checks (`--module nodenext`, TypeScript 5.9.3) and runs every entry point, `/timing` included, on Node 22.22.2 |
| `npm run docs` | the `timing` module is documented; the one warning, about `ConventionSet` in the receipt module, is also raised on `main` |
| conformance suite: self-test, 500 vectors, this engine's verdicts, `RESULTS.md` | pass, unchanged |

The timing API is its own entry point, so code that does not import it
does not carry it. Bundled with esbuild, minified, with astronomy-engine
left external, then gzipped at level 9 (bytes, minified / gzipped):

| Bundle | `main` | timing in the root | now |
| --- | --- | --- | --- |
| root entry, every export | 38,434 / 14,555 | 52,942 / 19,346 | 38,435 / 14,565 |
| root entry, `natalChart` only | 19,297 / 7,757 | 20,639 / 8,174 | 19,297 / 7,759 |
| `@zodiacs/engine/timing`, every export | | | 43,464 / 15,796 |
| timing, `annualProfection` only | | | 2,614 / 1,039 |
| root and timing together | | 52,942 / 19,346 | 54,686 / 19,798 |

The root entry bundles the same code as on `main`; the few bytes are chunk
order. The frozen tables in `src/timing/` are marked `/*#__PURE__*/`, which
is why a consumer of `annualProfection` alone carries none of the firdaria
or releasing tables.

The package is 559 bytes under its limit. It fits because the timing
modules' file headers were kept out of `dist/timing.d.ts` and the timing
JSDoc was condensed to the API contract; the sources and the reasoning are
in `docs/timing-hellenistic.md` and the test comments. The release
candidate's own README and CHANGELOG text will need a decision on the
limit.

## Sources

Access date for every URL: 2026-09-28. No source text is redistributed
here; short quotations appear in test comments. SHA-256 values identify the
copies read.

1. **Vettius Valens, *Anthologies***, tr. Mark T. Riley. Unpublished
   translation, released online as a PDF in 2010, 172 pp., listed at
   <https://www.skyscript.co.uk/valens_riley.html>. The Skyscript file is
   behind a browser challenge, so the copy read is the csus.edu original
   archived by the Wayback Machine:
   <https://web.archive.org/web/20160217170947/http://www.csus.edu/indiv/r/rileymt/Vettius%20Valens%20entire.pdf>
   (SHA-256 `0581d4cd17ff899becf1915aef3c01a9c2c35a0b2abb1bbcadd9e3f310e40b9c`).
   Pages below are the PDF's printed pages. Kroll (K) and Pingree (P) page
   markers are as printed.
2. **al-Bīrūnī, *The Book of Instruction in the Elements of the Art of
   Astrology*** (1029), tr. R. Ramsay Wright (London: Luzac, 1934). Cited by
   section. The copy read is a typescript reproduction on archive.org:
   <https://archive.org/details/albirunibookofinstruction>. The passages
   used are on typescript pages equal to their archive.org leaf numbers:
   - §395, on the firdaria: p. 32;
   - §§436–439, the table of periods and "times of association": p. 48;
   - §440, the domiciles: p. 49;
   - the year, month and 13-month passage: p. 119. It follows the heading of
     §522 (p. 118) and precedes that of §525 (p. 120), with no section
     number of its own in the typescript, so it is cited as §§522–524.

   Its OCR garbles the tables, so pp. 32, 48 and 119 were read from the page
   images. Leaf images: SHA-256
   `6f8388015ef9393adfac38dcdb94a6e99248c5d57bc6b13e0da8acd6caabac1d` (p. 32),
   `6d6b71dbb57eb4d8b247c130b2ba37f213d913ae1dcf2e8fa543f433ba6b85c9` (p. 48)
   and `621868afd4fbb200500d082a89333d97d151387477fc9529dd5dbef80be417bf`
   (p. 119).
3. **Ptolemy, *Tetrabiblos***, tr. F. E. Robbins (Loeb Classical Library,
   1940), via LacusCurtius:
   - I.17, "Of the Houses of the Several Planets":
     <https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B*.html>;
   - IV.10 (Loeb p. 453):
     <https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/4C*.html>.
4. **Steven Birchfield, "The Fardārāt in Nativities"** (©2005 as "The
   Firdar", revised ©2020), PDF dated 2020-07-13, 13 pp.:
   <https://birchfieldastrology.com/wp-content/uploads/2020/07/firdar_revision-02-2020-07-13.pdf>
   (SHA-256 `d25e728927c025fe29ae5968412bd0c421ff883ff42b0fe5c26f7a3565823bea`).
   It quotes:
   - Abu Maʿshar, *On the Revolutions of the Years of Nativities* IV.1.1–8
     and IV.7.24, tr. Benjamin Dykes (Cazimi Press, 2019);
   - al-Qabīṣī, *Introduction* IV.20;
   - Bonatti, *Liber astronomiae*, tr. Robert Zoller.

   Its Tables 1–3 (pp. 8–13) were checked against the rendered pages.
5. **Chris Brennan, "Annual Profections: A Basic Time-Lord Technique"**,
   The Astrology Podcast ep. 153 (released 2018-04-24). Transcript by
   Elizabeth Ocean (2019-07-07):
   <https://theastrologypodcast.com/transcripts/ep-153-annual-profections-an-ancient-time-lord-technique/>.
6. **Chris Brennan and Leisa Schaim, "Zodiacal Releasing: An Ancient Timing
   Technique"**, The Astrology Podcast ep. 192 (released 2019-02-11).
   Transcript by Teresa "Peri" Lardo (2021-06-16, updated 2024-02-21):
   <https://theastrologypodcast.com/transcripts/ep-192-transcript-zodiacal-releasing-an-ancient-timing-technique/>.
7. **Hamish Saunders, "Solar Arc Directions"** (©1996, Astrology House,
   Orewa, New Zealand), 6 pp., PDF created 2011-08-15:
   <https://astrology-house.com/content/docs/articles/Solar_Arc.pdf>
   (SHA-256 `684dd4ba0f1c5eec2f981a8cfef04750463b948567b1d5f395402a21f73ab6ae`).
   Its three chart figures (pp. 3–5) set planets and signs in an
   astrological font. They were decoded as follows:
   - planets, in order: ‚ Sun, ƒ Moon, „ Mercury, … Venus, † Mars,
     ‡ Jupiter, ˆ Saturn, ‰ Uranus, Š Neptune, Ô Pluto, ¡ node,
     § Ascendant, ¨ Midheaven, £ Lot of Fortune;
   - signs: Ö Aries through á Pisces.

   The engine's own natal chart confirms every decoded row to within about
   a minute of arc.
8. **Aswin Subramanyan, "Zodiacal Releasing – Peak and Beyond!"**, blog
   post, published 2019-12-22, modified 2020-02-13:
   <https://www.aswinsubramanyan.com/post/zodiacal-releasing-peak-and-beyond>.
   It reports switching from 360-day to 365.25-day years after testing: "I
   tested with the 360 day format which did not seem to match with the
   events of some of the charts I tested". It is cited only for the
   existence of that variant.

The podcasts work their examples on public figures' charts, some of them
living people's. The tests quote only the podcasts' rules and ep. 153's
imagined chart with Cancer rising; the dated checks use invented births
(`CONTRIBUTING.md`, "Birth data is synthetic by default").

Saunders's figures give their own birth data for Christopher Reeve
(1952–2004, p. 3, Figure 1), Coretta Scott King (1927–2006, p. 4, Figure 2)
and Princess Diana (1961–1997, p. 5, Figure 3), and the dates of the events
they direct to.

## 1. Annual and monthly profections

**Definition.** Year by year, a natal point advances one whole sign, and
the ruler of the sign reached is the lord of the year.

- Valens IV.11 (p. 78): "when investigating the current year of a
  nativity, we divide by 12. Count the remainder from a star".
- Ptolemy IV.10: "the annual chronocrators by setting out from each of the
  prorogatory places, in the order of the signs, the number of years from
  birth, one year to each sign, and taking the ruler of the last sign".
- Brennan ep. 153: "you count one sign per year from the rising sign".

Rulers are the traditional domiciles (Ptolemy I.17; al-Bīrūnī §440).

**Conventions.**

- Age is completed years: the first year of life is age 0, so Valens's
  "35th year" is age 34.
- `house` is the place counted inclusively from the starting sign.
- For dated profections, year *n* runs from the *n*-th solar return to the
  next. al-Bīrūnī §§522–524: "Each year the ascendant is ascertained when the sun
  comes round to the same minute of the ecliptic in which it stood at the
  birth".

**Variants: the monthly convention**, chosen by name. The default is
`"solar"`. None of the three is a source's rule as the source states it.

- `"solar"`: each month starts when the Sun has gained another 30° on its
  natal longitude. These are the instants of al-Bīrūnī's monthly revolution
  charts (§§522–524): "every month when the sun arrives at the same degree
  and minute it occupied in the radical or revolutionary figure", when a
  figure is drawn as at birth. He does not profect by them; his profected
  months are thirteenths (below). Valens IV.28 (p. 91) may describe these
  months for day births:
  - IV.28 is part of a method Valens quotes from Seuthos and the school of
    Hermeios (IV.27–IV.29).
  - It counts the Sun's distance "<for day births>", a phrase supplied by
    the translator, and for night births "the distance from the moon at the
    moment in question to the moon at the nativity".
  - "Count that distance from the sign which has been allotted the year"
    does not say whether in whole signs (the month turns when the Sun
    enters a sign) or in 30° arcs from the natal Sun, as here.

  The Moon's count is not implemented. Read like the Sun's, it would change
  a night birth's month every two or three days; the passage goes on to
  births at a new or full Moon, and gives no worked example.
- `"thirteenths"`: thirteen equal parts of each solar-return year, the
  thirteenth repeating the year's sign. This division is the engine's own:
  28 d 2 h 17.6 min on average. al-Bīrūnī §§522–524 gives the signs, with
  months of a fixed length: "each year is divided into (thirteen) months of
  28 days 1 hour 51 minutes and a sign to each given, so that the last
  month ... has the same sign as the first, while the first month of the
  next year has the same sign as the year". His month is 365/13 days, 26.6
  min shorter than the engine's on average, and thirteen of them fall 5 h
  46 min short of a solar-return year. Ptolemy IV.10's months are a third
  scheme: "the number of months from the month of birth ... twenty-eight
  days to a sign", counted from birth, 13.04 to a year.
- `"twelfths"`: twelve equal parts of the year. This is an arithmetic
  convention. No classical text stating it was located (see *Left out*).

**Worked examples** (`src/timing/profections.test.ts`):

| Source | Input | Published | Engine | Result |
| --- | --- | --- | --- | --- |
| Valens IV.11, p. 78 | Ascendant in Virgo, 35th year (age 34) | 11 signs to Cancer | Cancer, Moon, house 11 | pass |
| Valens IV.11, p. 78 | Moon in Scorpio; Venus in Capricorn; age 34 | to Virgo (Mars); to Scorpio (the Moon) | Virgo; Scorpio | pass |
| Invented, counted by hand | Taurus rising, age 37; Scorpio, 13; Sagittarius and Capricorn, 31 | Gemini, Mercury, house 2; Sagittarius, Jupiter, 2; Cancer, the Moon, 8, and Leo, the Sun, 8 | same | pass |
| Invented, counted by hand | Scorpio, 2; Gemini, 10; Pisces, 50; Libra, ages 46–50 | Capricorn, Saturn, 3; Aries, Mars, 11; Taurus, Venus, 3; Leo to Sagittarius, houses 11, 12, 1, 2, 3, Scorpio's year under Mars | same | pass |
| Brennan ep. 153 | an imagined chart, Cancer rising, ages 0–3, 12, 24, …, 60; any sign at 18 and 21 | Cancer/Moon, Leo/Sun, Virgo, Libra/Venus; first house; 7th and 10th | same | pass |
| Invented, counted by hand | untimed births: 1933-06-11 at 1971-06-13 and 1971-06-09; 1940-04-03 at 1971-06-13; 1950-09-14 at 1975-09-15 and 1975-09-12 | ages 38 (house 3) and 37 (2); 31 (8); 25 (2) and 24 (1) | same | pass |
| al-Bīrūnī §§522–524 | thirteen months | 13th month repeats the year's sign; next year starts with the next sign | same | pass |
| al-Bīrūnī §§522–524 | month length | "28 days 1 hour 51 minutes" (365/13 days) | `"thirteenths"`: 28 d 2 h 17.8 min in the year tested, 26.8 min longer | differs by design; the length is not a fixture |

An earlier version of this table counted the arithmetic 365/13 = 28 d 1 h
51 min as agreement with al-Bīrūnī. It was not an engine result, and the
engine's months are longer; the test now pins the difference instead.

**Consistency checks.**

- The profection repeats every 12 years (Valens IV.11, p. 79: "The same
  transmissions are indicated every 12 years"), for ages 0–120 from 48
  starting longitudes.
- `house` is `age mod 12 + 1`, and the ruler comes from the table.
- Months tile each year contiguously under every convention.
- Year boundaries are solar returns: the Sun is within 1e-5° of its natal
  longitude there.
- Solar months begin at natal Sun + 30°k, and last 29.3–31.6 days.
- `profectionAt` agrees with `profectionYear` for every month of a year.
- For 24 births from 1800 to 1992, return *n* stays within 108 minutes of
  `birth + n × 365.2422 days` for 110 years and 268 minutes for 300, inside
  the three days the solver searches.

## 2. Firdaria

**Definition.** al-Bīrūnī §395 (typescript p. 32):

> The first period always begins with the sun in a diurnal nativity and with
> the moon in a nocturnal one; the second with Venus in the one case, in
> the other with Saturn, the remaining periods with the other planets in
> descending order. The years of each period are distributed equally between
> the seven planets, the first seventh belonging exclusively to the
> chronocrator of the period, the second to it in partnership with the
> planet next below it and so on.

The years (§438; Abu Maʿshar IV.1.2) are Sun 10, Venus 8, Mercury 13,
Moon 9, Saturn 11, Jupiter 12, Mars 7, Head 3 and Tail 2: "the amount of
all of that is 75 years, then it returns to the Sun". The nodes "do not
partner with the planets" (IV.1.8).

**Conventions.**

- Sect comes from `chartPoints`.
- Ages are solar-return years, and fractional ages are linear in time
  within their year.
- Each sub-period is one seventh of its period.
- The sequence repeats after 75 years.

**Variants**, named; any other name is a RangeError:

- `"abu-mashar"` (default): nodes after Mercury by night. Abu Maʿshar
  IV.7.24, as quoted by Birchfield: "the Head and Tail distribute for
  diurnal nativities after the years of Mars, and for nocturnal nativities
  after the years of Mercury: and it is when the native enters year 71".
  al-Bīrūnī's table: "Dragon's head 3 years, Tail 2 years, whether day or
  night".
- `"bonatti"`: nodes after Mars by night. This is Birchfield's Table 2,
  "assumed from Bonatti". It rests on Bonatti's "in all respects as was
  explained when it began from the Sun" (tr. Zoller), which Birchfield calls
  ambiguous.

**Not a variant here: the year.** Ages are solar-return years. The sources
read give the periods in years without saying how a year is measured.
Counting 365.25-day years from birth would put age 70 about half a day
later; it is not offered.

**Worked examples** (`src/timing/firdaria.test.ts`):

| Source | Published | Engine | Result |
| --- | --- | --- | --- |
| Birchfield Table 1 (day) | Sun … South Node, end ages 10, 18, 31, 40, 51, 63, 70, 73, 75 | same | pass |
| Birchfield Table 1 | Sun, Venus, Mercury and Moon sub-period orders | same | pass |
| Birchfield Tables 1–3 | Saturn, Jupiter and Mars sub-period orders | follows the stated rule; see discrepancy 4 | discrepancy recorded |
| Birchfield Table 2 (night, Bonatti) | end ages 9, 20, 32, 39, 42, 44, 54, 62, 75 | same | pass |
| Birchfield Table 3 (night, Abu Maʿshar) | end ages 9, 20, 32, 39, 49, 57, 70, 73, 75 | same | pass |
| Abu Maʿshar IV.7.24 | nodes from "year 71", by day and by night | North Node 70–73, South Node 73–75 in both sects | pass |
| al-Bīrūnī §438 | order and years; nodes last "whether day or night"; no sub-periods for the nodes | same | pass |
| al-Bīrūnī §438 | shares: Sun 1y 5m 4d 7h, Moon 1y 3m 12d 21h, Saturn 1y 6m 25d 17h, Jupiter 1y 8m 17d 3h (row 6), Mars 1y (row 7) | one seventh in his notation, same | pass |
| al-Bīrūnī §438 | shares: Venus 5h, Mercury 7h/17h, Jupiter 7h (row 3), Mars 1y 10h (row 4) | 10h, 14h, 3h, 1y; see discrepancy 3 | discrepancy recorded |

**Consistency checks.**

- The nine periods sum to 75 years under every sect and variant, and each
  lord appears once.
- Periods are contiguous.
- Each planetary period has seven equal shares in `CHALDEAN_ORDER` from its
  lord. The nodes have none.
- Whole ages fall on solar returns, the same ones that begin the profection
  years.
- The Sun's first share ends 3/7 of the way through year 1, to within 1 ms.
- `firdariaAt` places each sub-period's midpoint and each boundary instant
  in the right period.
- The sequence begins again at 75.

## 3. Zodiacal releasing

**Definition.** Valens IV.4 (pp. 71–72) begins "the vital sector with the
Lot of Fortune and with Daimon" (Spirit). His worked sequence runs: "Mars
itself allots 15 years first, and from this period it assigns itself 15
months. Next (because of Taurus) it assigns 8 months to Venus ...".

**Minor years.** They are the rulers' minor years (IV.1, p. 71), except
that IV.6 (p. 73) gives "Aquarius allots 30 years, Capricorn 27".

**Level units.** IV.10 (p. 76) divides each level into twelfths: "By
taking one-twelfth of the year (or of each period) we can discover how many
days each star/sign allots". Its table gives each sign's months, days and
"days+hours".

**The year.** IV.9 (p. 75) sets the length: "the universal year has 365 1/4
days, while the year with respect to the distribution has 360". Brennan and
Schaim (ep. 192) use the same: "the technique uses 360-day years and 30-day
months".

**The loosing of the bond.** IV.4 (p. 72): "since the circle of the 12
signs has comprised 17 years 7 months, we will allot the remaining time
using the signs in opposition". IV.10 (p. 77) extends it to days and hours:
"after the completion of the cycle of days and hours (=44), count off the
remaining days and hours in the order of the signs from the sign in
opposition". Brennan (ep. 192) adds that after the jump the order simply
repeats: "it doesn't do a loosing of the bond the second time".

Two other practices Valens reports are not implemented: IV.4 (p. 72), "Some
astrologers allot the remaining chronocratorships beginning with the sign in
trine, but this does not seem scientific to me"; and a marginal note to
IV.10 (p. 76), "Some astrologers allot the days using the triangles".

**Conventions.**

- Level 1 starts at the birth instant from the lot's sign and never
  loosens.
- Each period is divided from its own sign. The last sub-period is cut at
  the parent's end.
- The loosing of the bond happens at most once per parent, to the sign
  opposite the parent's.
- Boundaries are exact integer multiples of the level-4 unit of elapsed
  time.
- The lot comes from `chartPoints`.

**Variants: the year length.** `"valens-360"` is the default. The
alternative is `"julian-365.25"`: 365¼-day years, attested by a
practitioner (source 8). Its twelfths below the year are this engine's
reading of IV.10.

**Worked examples** (`src/timing/releasing.test.ts`):

| Source | Published | Engine | Result |
| --- | --- | --- | --- |
| Valens IV.6, IV.10 table | years, months, days and days+hours per sign (Sun 19, 19, 47½, 3d 23h; …; Venus 8, 8, 20, 1d 16h) | same, all eight rows | pass |
| Valens IV.4, Aries | level 2: Aries 15, Taurus 8, Gemini 20, Cancer 25, Leo 19, Virgo 20, Libra 8, Scorpio 15, Sagittarius 12, Capricorn 27, "Aquarius the remaining 11 months"; then Taurus 8, Gemini 20, Cancer 25, Leo 19 years | same, Aquarius truncated | pass |
| Valens IV.4, Gemini | after 17y 7m, "Sagittarius itself 1 year, the rest to Capricorn to complete the 20 years" | Sagittarius 12 months (loosing of the bond), Capricorn 17 months | pass |
| Valens IV.4 | loosing for L1 Gemini, Cancer, Leo, Virgo, Capricorn, Aquarius | exactly those six | pass |
| Valens IV.8, Fortune in Leo | Leo 19, Virgo 20, Libra 8, Scorpio 15 (62), Sagittarius; sub-periods Sagittarius 1y, Capricorn 2y 3m, Aquarius 2y 6m, Pisces 1y, then Aries (Mars "brings death") | same; Aries 68y 9m–70y contains the death at 69y 4m | pass; see discrepancy 2 |
| Valens IV.8, Daimon in Scorpio | Scorpio 15, Sagittarius 12, Capricorn 27, Aquarius at 54; sub-periods Aquarius 2y 6m … Sagittarius 1y, "the end <69 years 4 months>" | same eleven sub-periods (signs, rulers, months), ending at 69y 4m | pass |
| Valens IV.9 | 32 Alexandrian years + 215 days = "33rd full year ... plus 23 days" | 11,903 days = 33 years + 23 days | pass |
| Valens IV.10, Pisces | L2 Pisces 12, Aries 15, Taurus 8, Gemini 20 months; +255 days: L3 Gemini 50, Cancer 62½, Leo 47½, Virgo 50, Libra 20 days, then Scorpio; L4 Scorpio 3d 3h, Sagittarius 2½d, Capricorn 5d 15h, Aquarius 6d 6h, Pisces 2½d, Aries 3d 3h | same; L4 Taurus 40 h | pass |
| Valens IV.10 | fourth chronocrator "Venus <Taurus>", 255 days into Mercury's period | Taurus (Venus) through the first 19 hours of the 255th day; Gemini (Mercury) at 255 days complete | pass for the day; see discrepancy 1 |
| Valens IV.10 | loosing of the bond after 528 "days" and 44 "days and hours" | after 527.5 days (L3) and 1,055 hours (L4), to the opposite sign | pass |
| Invented, counted by hand in ep. 192's 360-day years and 30-day months: Spirit in Scorpio, born 1961-08-17 | Scorpio 15 years, Sagittarius 12, Capricorn 27; Capricorn's first sub-period 27 months; after 211 months the loosing of the bond to Cancer, 25 months: 1961-08-17, 1976-05-30, 1988-03-28, 2014-11-07; 1988-03-28 to 1990-06-16; 2005-07-27 to 2007-08-16 | the same dates | pass |
| Invented: Spirit in Virgo and Fortune in Aquarius, born 1970-02-09; ep. 192: "about 17-and-a-half years into the general period" | the loosing of the bond after 211 months, 6,330 days, 1987-06-10 | at 6,330 days in both: 17.33 calendar years, 17y 7m of 360-day years, to Pisces and to Leo | pass |
| Saunders (1996) | Lot of Fortune: Reeve 8°42′ Gemini, King 15°46′ Leo | `chartPoints` Fortune 8°43.0′ Gemini and 15°46.1′ Leo; releasing starts there | pass (under 1.5′) |

**Consistency checks** (90 seeded random windows, both year conventions):

- Every whole parent is tiled exactly by its sub-periods. There were 93
  whole level-1 parents, 159 level-2 and 195 level-3.
- Only the last sub-period is truncated. Every other sub-period has its full
  length.
- Sub-periods are consecutive signs from the parent's own, except the
  loosing of the bond. It falls at the thirteenth sub-period, on the sign
  opposite, and occurs exactly when the parent outlasts 211 sub-units: 39,
  65 and 70 loosenings at levels 1–3.
- Sub-period lengths sum to the parent's to the millisecond.
- Level 1 runs contiguously through all twelve signs and back to the start
  after 211 years.
- `releasingAt` equals the containing periods of a surrounding window.
- The Julian convention scales every unit by 365.25/360.

## 4. Solar arc directions

**Definition.**

- Saunders (1996, p. 1) defines solar arc directions as "The symbolic
  movement of all the planets and sensitive points at the same rate of the
  Sun's daily motion". On p. 2 he prefers the arc actually travelled by the
  progressed Sun: "The Individual Solar Arc is the most exact and the most
  reliable for critical timing".
- The engine takes the arc as the secondary-progressed Sun from
  `progressedBodies` / `progressedInstant` (one 365.2422-day year per day)
  minus the natal Sun. Directed = natal + arc, in longitude.

**Conventions.**

- Apparent geocentric longitudes on the engine's ΔT model.
- The arc is counted continuously, with no wrap, and is negative before
  birth.
- Bodies, angles and chart points are all directed by the same arc.

**Worked examples** (`src/timing/solar-arc.test.ts`):

| Source | Published | Engine | Result |
| --- | --- | --- | --- |
| Saunders Fig. 1, Christopher Reeve: 25 Sep 1952 03:12 EDT, 40n46 73w59; target 26 May 1995 02:02:46 EDT | "True SA 42°20′" | 42°20.008′ | pass (0.008′) |
| Saunders Fig. 1 | 14 directed rows (10 planets, node, Ascendant, Midheaven, Lot of Fortune) from the printed radix + 42°20′ | `directLongitudes` reproduces all 14 exactly | pass |
| Saunders Fig. 1 | the same 14 rows | `solarArcDirections` from the engine's own chart: natal within 1.02′ and directed within 1.03′ (largest: Lot of Fortune) | pass (under 1.5′) |
| Saunders Fig. 2, Coretta Scott King: 27 Apr 1927 16:00 CST, 32n37'56 87w19'09; target 5 Apr 1968 12:41:13 CST | "True SA 39°27′" | 39°27.001′ | pass (0.0007′) |
| Saunders Fig. 2 | 14 directed rows from radix + 39°27′ | exact | pass |
| Saunders Fig. 2 | the same 14 rows | natal within 1.01′ and directed within 1.01′ (largest: Saturn) | pass (under 1.5′) |
| Saunders Fig. 3, Princess Diana: 1 Jul 1961 19:45 BST, 52n50 0e30; target 29 Jul 1981 11:30 BST, the wedding | "True SA 19°09′" | 19°9.053′ | pass (0.053′, the printed minute truncated) |
| Saunders Fig. 3 | 14 directed rows from radix + 19°09′ | exact | pass |
| Saunders Fig. 3 | the same 14 rows | natal within 1.03′ and directed within 1.09′ (largest: Lot of Fortune) | pass (under 1.5′) |

The printed minutes are truncated where this can be checked. For example,
King's Moon is 15°56.96′ in the engine and 15°56′ in print. The
two programs' Ascendants also differ by up to 0.75′. Hence the 1.5′
tolerance for rows derived from the engine's chart; the arcs themselves
agree to 0.06′. The node in the figures is the true node: it matches the
engine's `North Node` row, not the mean node (93′ away in Figure 3).

The figures come from the author's chart software, which the article does
not name. They serve here as the article's published worked example, not as
a reference ephemeris. The engine's positions come from its own ephemeris
throughout.

**Consistency checks.** For 36 birth/target pairs, including converse targets:

- the arc equals the progressed Sun minus the natal Sun modulo 360, exactly;
- it runs at 0.95–1.02° a year;
- it continues past 360° after 400 years;
- it is negative before birth;
- every directed row minus its natal row equals the arc.

## Independent comparison

The worked examples check the engine against published figures, and the
consistency checks against itself. Neither measures the dated instants
against another ephemeris. The review of 2026-09-28 did, and recomputed
every rule independently:

- The rules were written again from the definitions quoted here, not from
  the engine's code: profection signs and months, the firdaria sequences and
  shares, zodiacal releasing with the loosing of the bond, and the solar
  arc.
- Positions came from Swiss Ephemeris 2.10.03 through pyswisseph, in its
  Moshier mode (no data files), with its own ΔT, used only as an
  instrument.
- There were 164 births: 150 drawn at random from 1800 to 2150, at
  latitudes within ±66° except every tenth (78.2° N or S, 70° S or
  69.6° N), and 14 chosen ones. The chosen ones are leap days, both ends of
  the reference span, 1066, 1700, 2400, an equinox, a Sun near 0° Aries, a
  southern day and night, and the Reeve and King charts.
- For each birth: eleven profection ages under all three month conventions;
  profections at six dates from three points; four firdaria cycles in both
  variants; releasing from both lots in both year conventions (two levels
  over 130 years, four levels over two years, and the four levels at eight
  or more dates); and thirteen solar arcs.

The rules agreed everywhere:

| Rule | Compared | Identical |
| --- | --- | --- |
| profection year: sign, ruler and house | 5,412 | all |
| profection months: sign, ruler and house, three conventions | 66,748 | all |
| firdaria lords, cycles and ages, both variants | 11,808 | all |
| firdaria sub-period lords and ages | 64,288 | all |
| releasing period lists, both year conventions | 1,312 lists | all |
| releasing at a date, four levels, both year conventions | 14,792 | all |

For the instants, the table gives the engine minus the independent value,
for births and instants inside the reference span (161 births):

| Instants | Count | Median | 99th percentile | Largest |
| --- | --- | --- | --- | --- |
| solar returns (profection years) | 2,674 | 14 s | 57 s | 79 s |
| solar month boundaries | 18,435 | 15 s | 58 s | 84 s |
| firdaria boundaries at whole ages | 15,274 | 18 s | 67 s | 101 s |
| solar arcs | 2,081 | 0.21″ | 1.77″ | 2.65″ |

At the engine's solar month boundaries the independent Sun stood within
3.5″ of the natal Sun + 30°k (median 0.6″). The Sun moves 1″ in about 24 s,
so these are differences of a few arcseconds between two ephemerides and
their ΔT, not differences in the rules. Over all 164 births, including 1066,
1700 and 2400, the largest firdaria boundary difference was 283 s, for the
birth in 2400. The review's scripts and per-case output are not committed.

The same comparison found the sect's polar case: in 3 of the 164 charts, all
at 78.2°, the sect disagreed with the Sun's altitude (see *Flags* in
`docs/timing-hellenistic.md`).

## Source discrepancies

In every case the fixtures keep the value the stated rule gives, and the
source's figure is recorded here.

1. **Valens IV.10 (p. 76), fourth level: a count in whole days.** Valens
   counts Mercury's period to the date as "8 months 15 days, a total of
   255 days", and the fourth chronocrator there as "Venus <Taurus>".
   - His own table gives Venus (Taurus) 1 day 16 hours at this level. The
     six periods before it total 23⅛ days, so Taurus runs from 253 d 3 h to
     254 d 19 h into Mercury's period.
   - Read inclusively, the date is the 255th day, from 254 to 255 days in.
     Taurus holds its first 19 hours and Gemini its last 5. Read as 255 days
     complete, the date begins 5 hours into Gemini. Valens names the day,
     not the hour, so the text does not decide between them.
   - The fixtures test both instants: the middle of the 255th day gives
     Venus, as Valens says, and 255 days complete gives Mercury.
   - The bracketed remainder, "to Taurus the rest <1 day 21 hours> to
     complete the 25 days", is the translator's. It is 5 hours longer than
     Taurus's 1 day 16 hours: the hours the whole-day count leaves open.
   - In the same chapter, "one-twelfth of 37 1/2 days is 3 1/3 hours"
     contradicts the table's "3 days 3 hours", which the engine follows.
2. **Valens IV.8 (p. 75), Aries's share.** Riley's gloss gives Aries "the
   remainder <2 years 3 months> of the 9 years". Aries allots 15 months at
   the second level. The text had counted "the remaining 8 years" to the
   70th year. The engine's Aries period, 68 years 9 months to 70, contains
   the reported death at 69 years 4 months and makes Mars the lord, as the
   text says.
3. **al-Bīrūnī §438 (typescript p. 48).** Four "times of association"
   disagree with one seventh of the period in al-Bīrūnī's own notation
   (360-day year, 30-day months):
   - Venus: "1y.1m.21d.5h." in both rows, for 1y 1m 21d 10h;
   - Mercury: "…8d.7h." (row 3) and "…8d.17h." (row 7), for 1y 10m 8d 14h;
   - Jupiter: "…17d.7h." (row 3), where row 6 prints the correct 3h;
   - Mars: "1y.10h." (row 4), where row 7 prints the correct "1y.".

   These may be typing errors in the typescript. They were not checked
   against the printed 1934 edition.
4. **Birchfield, Tables 1–3 (pp. 8–13).** The Saturn, Jupiter and Mars
   rows list the Mercury sub-period before Venus. This contradicts the rule
   the article quotes: the partner is "the planet which is below it in the
   celestial circle", and Venus's sphere is below the Sun's. It also
   contradicts the article's own Sun, Venus, Mercury and Moon rows. The
   periods and end ages are unaffected.
5. **Brennan & Schaim ep. 192, transcript.** Reading out one chart's
   Capricorn sub-periods, the speaker says "12 in Gemini, 27 in Cancer".
   Gemini and Cancer allot 20 and 25 months, and only those values reach the
   loosing of the bond on the date the episode states. The transcript itself
   warns that it "may contain errors". The chart is a living person's and is
   no longer a fixture.
6. **Saunders (1996), dates.** The text names 27 May 1995 and "the evening
   of the 4th of April 1968". The figures are set for 26 May 1995 02:02:46
   EDT and 5 April 1968 12:41:13 CST. The fixtures use the figures, whose
   arcs they check. A day moves the arc by about 0.16′, which a test pins.
   For Diana the text and Figure 3 agree on 29 July 1981.
7. **Valens's year numbering.**
   - IV.11 (p. 78) counts the "35th year" as 11 signs inclusive: age 34,
     the 11th house.
   - Book V (p. 105) takes the "34th year" to "a remainder of 10" and
     relates it to places "10 signs apart".

   The second is a transmission between planets rather than a profection
   from a fixed point, and its numbering is ambiguous, so it is not used as
   a fixture.

## Left out, and what could not be verified

- **Twelve equal months.** No classical text stating twelve equal monthly
  divisions was located. Seven Stars Astrology (Anthony, 2011, updated
  2019) reports 30-day months in Abu Maʿshar and a calendar-month practice
  of Robert Zoller; neither was checked against a primary text.
  `"twelfths"` is offered as the arithmetic convention the task names, and
  is not the default.
- **Secondary-only sources.** Dorotheus IV.1 on the year starting at the
  solar return is known here only through that same secondary quotation.
  The primary citation used is al-Bīrūnī §§522–524.
- **Texts read only as quoted.** Abu Maʿshar (Dykes 2019), al-Qabīṣī and
  Bonatti (Zoller) were read only as Birchfield quotes them. Bonatti's
  Latin was not consulted, and the `"bonatti"` variant is the reading
  Birchfield tabulates. Brennan's *Hellenistic Astrology* (2017) was not
  consulted.
- **No dated firdaria example.** No firdaria example worked on a named
  nativity with dates was found in a verifiable source. A Marilyn Monroe
  example that search engines attribute to heloastro.com returned HTTP 404.
  The dated firdaria are checked by construction, against solar returns and
  the published age tables.
- **Birth times not needed.** Astro-Databank pages were not reachable. The
  invented releasing checks depend only on the birth date, and the dated
  profection checks count from the Sun of an untimed chart.
- **Julian releasing.** `"julian-365.25"` rests on a practitioner's report.
  No published worked example in that convention was found; it is tested
  only by its scaling property.
- **Techniques not implemented:**
  - daily and hourly profections;
  - continuous, degree-based profections;
  - the Moon's months for night births, and the whole-sign reading of the
    Sun's months (Valens IV.28);
  - al-Bīrūnī's fixed months of 28 d 1 h 51 min, and Ptolemy's 28-day
    months counted from birth (IV.10);
  - Zoller's month-to-ruler variant;
  - firdaria counted in 365.25-day years;
  - Valens's rule for Fortune and Spirit in one sign (IV.4);
  - loosing the bond to the sign in trine (IV.4, rejected by Valens), and
    days by triangles (IV.10, marginal note);
  - peak periods and angularity from Fortune;
  - releasing from lots other than Fortune and Spirit (Brennan also uses
    Eros);
  - nodal firdaria sub-periods and the mundane firdaria;
  - solar arcs in right ascension (Estadella's *Predictive Astrology* uses
    those for house cusps);
  - Naibod or one-degree arcs.
- **No accuracy claims.** Nothing here establishes predictive validity or a
  new physical accuracy bound. The Saunders comparison checks the engine's
  arc against another program's, and the independent comparison against
  another ephemeris; both are ordinary ephemeris calculations.

## Review

An independent review of the first version reported three major and ten
minor findings, and some notes. This version addresses them:

| Finding | Change |
| --- | --- |
| M1. `"solar"` credited to Valens IV.28 and al-Bīrūnī | described as a convention on al-Bīrūnī's monthly-revolution instants; IV.28 quoted with its day and night rules and the sign-or-arc question; al-Bīrūnī cited for the thirteen months; the Moon's count not added, for the reasons given above |
| M2. consistency checks presented as agreement | the al-Bīrūnī month-length row corrected; checks labelled; the *Independent comparison* recorded |
| M3. timing API in the root entry point | moved to `@zodiacs/engine/timing`; frozen tables marked `/*#__PURE__*/`; sizes above |
| m1. discrepancy 1 | restated as a whole-day ambiguity; both instants tested |
| m2. thirteenths | named as the engine's convention; al-Bīrūnī's and Ptolemy's months described |
| m3. unchosen variants | named: the trine loosing, days by triangles, firdaria in 365.25-day years |
| m4. "and Dykes" | removed |
| m5. polar sect | flagged as `"sect-contradicts-altitude"`; the sect is unchanged |
| m6. astronomy-engine's string throws | become `RangeError` in the timing API |
| m7. checks before calculation | names, options and dates checked before the chart |
| m8. return drift; Subramanyan's date | a tested figure; the post dated |
| m9. reference span | flagged as `"outside-reference-span"` |
| m10. naming | `from` and `to` only bound date windows; what a count starts from is its `origin`, and result longitudes are `lon` |
| notes | the example's age corrected to 42.665; Saunders's Figure 3 added |

## Reproduction

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run exports:smoke
npm run package:contents
npm run pack:dry-run
```

The conformance steps run as in CI:

```sh
node --test conformance/harness/selftest.mjs
node conformance/harness/validate.mjs --expect-total 500
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs --check
```

The fixtures and their citations are in:

- `src/timing/profections.test.ts`;
- `src/timing/firdaria.test.ts`;
- `src/timing/releasing.test.ts`;
- `src/timing/solar-arc.test.ts`.

The checks that need no chart, the ephemeris failures and the flags are in
`src/timing/shared.test.ts`; the solar-return drift figure is in
`src/timing/solar-years.test.ts`.
