# Traditional sources and project conventions

Sources describe historical rules. They do not establish predictive validity.
No historical chart or person's question data is used in the fixtures.

## Significator selection

`lilly-house-ruler` and `lilly-moon` refer to William Lilly, *Christian
Astrology*, chapter XX, printed pages 123 and 124. The work first appeared
in 1647. The [linked transcription](https://maestrosdelsaber.com/wp-content/uploads/ftp-files/Astrologia/Astro%20y%20Religion/Astro%20Lilly%2C%20William%20-%20Christian%20Astrology%20Vol%201%201647.pdf)
has a title page naming the second edition, London: John Macock, 1659,
despite the filename. Read on 2026-10-14, PDF pages 150 and 151 (counting
from the first page), chapter XX: the ruler of the sign belonging to the
relevant house is its significator; the Moon accompanies the querent. These
definitions are paraphrased in the code, with no copied text or charts.

`ptolemy-domiciles` refers to Ptolemy, *Tetrabiblos* I.17, translated by
F. E. Robbins (Loeb Classical Library, 1940), the
[LacusCurtius text](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B%2A.html#17),
read on 2026-10-14. This section specifies the traditional domicile rulers
that the engine already provides through `dignityRulersAt`. This project
imports that function and does not maintain its own ruler table. Literal
expectations in `tests/significators.test.ts` are independently transcribed
from the source, as derived in `tests/fixtures.md`.

The implementation applies house-ruler selection to the actual computed
first and declared quesited cusps. Lilly describes the ascending sign for
the querent. Using the first cusp is the explicit project convention when a
caller chooses an engine house system whose first cusp differs from the
Ascendant. No intercepted sign adds a ruler. The quesited house comes from
the caller, and the library does not classify the question label.

`caller-declaration` means a natural significator was explicitly supplied in
the question type. It makes no attribution to Lilly or any other tradition
for that association. No natural planet is chosen automatically.

Role preservation and grouping by physical planet are data conventions:
when a planet has several roles, all assignments remain present, and the
group explains the overlap. The library does not substitute a different
ruler, treat the planet as distinct bodies or infer an outcome from the
shared roles.

## Considerations before judgement

The consideration source records cite Lilly's *Christian Astrology*,
printed pages 122 and 123, under "Considerations before Judgment", in the
same [transcription linked above](https://maestrosdelsaber.com/wp-content/uploads/ftp-files/Astrologia/Astro%20y%20Religion/Astro%20Lilly%2C%20William%20-%20Christian%20Astrology%20Vol%201%201647.pdf),
read on 2026-10-14, PDF pages 149 and 150 counting from the first page.
The tradition names distinguish Lilly's cautions, Arabic rules he reports,
and the Via Combusta variant he attributes to others. This is an attribution
through Lilly, not a claim to have read Alkindus directly.

He lists ascending degrees 0, 1, 2 and 27, 28, 29, and personal-context
exceptions. He defines Via Combusta as the last fifteen degrees of Libra
and first fifteen of Scorpio. His Saturn-first caution emphasizes
retrograde motion; his Saturn-seventh caution concerns the judgement.
An adjacent seventh-house-affliction passage excepts seventh-house questions,
but the Saturn placement passage does not state that exception.

Project conventions translate these to early `[0, 3)`, late `[27, 30)`
degrees within the sign and lunar `[195, 225)` absolute degrees, using
half-open intervals without rounding. Saturn uses actual cusp intervals
through engine `houseOf`, with no cusp anticipation or ecliptic latitude.
Neither personal-context exceptions nor seventh-house suppression are
automatic. All conditions are individually toggleable geometric observations.
`tests/considerations.test.ts` enforces these choices and their boundary
arithmetic; `tests/fixtures.md` gives the derivations. The policy does not
add fixed-star exemptions or other Moon cautions mentioned in the passage.

## Void-of-course convention

`lilly-void-of-course` refers to Lilly's definition in *Christian Astrology*,
printed page 112, PDF page 139 of the same linked transcription. The passage
was fetched and read on 2026-10-14. It describes a planet separated from a
contact without applying to another while remaining in the sign, emphasizing
the Moon. The work's author died centuries ago; no historical question or
chart is copied here.

The project explicitly selects the engine's `last-exact-ptolemaic-aspect-to-sign-exit`
convention with its traditional body set. This operational reading of Lilly
requires exact longitude contacts before ingress. It does not claim to resolve
alternative readings that use application within orb even when perfection
comes after ingress. The start includes the last exact contact, while the end
excludes the next ingress. With no contact, the period starts at sign entry.
These boundary and body-set choices are enforced in the independently derived
linear-motion tests documented in `tests/fixtures.md`.

The rule reports a caution without issuing Lilly's outcome language. It does
not automatically exempt particular signs, account for the strength of other
significators or infer personal circumstances. Callers can disable it. The
period and method record make its interpretation and sampled-search limits
explicit, so an observation cannot be mistaken for a proven exhaustive event
search or an authoritative verdict.

## Essential condition, scoring and receptions

The table traditions are the engine's existing ones, imported directly from
`src/techniques/dignities.ts`. This project copies no production domicile,
exaltation, triplicity, term or face table. The engine's provenance and table
checks are recorded in [`../docs/techniques.md`](../docs/techniques.md),
under "Essential dignities and reception", and in
[`../src/techniques/dignities.test.ts`](../src/techniques/dignities.test.ts).

The Ptolemy text linked under significator selection was read again on
2026-10-14, I.17, I.19 and I.20: domiciles, exaltations and the Egyptian
terms. Term lengths in the source are cumulatively added to produce degree
intervals, rather than taken from engine output.

For triplicity and face fixture derivations, al-Biruni, *The Book of
Instruction in the Elements of the Art of Astrology* (1029), translated by
R. Ramsay Wright (1934), sections 445, 449 and 451, was read on 2026-10-14
from the [Internet Archive OCR](https://archive.org/download/albirunibookofinstruction/albiruni_djvu.txt).
Section 445 gives the same sect and participating lords as the engine's
Dorothean table. The project follows the engine in counting only the chart
sect's lord. Sections 449 and 451 describe and list Chaldean face lords;
their cycle begins Mars, Sun, Venus, Mercury, Moon, Saturn, Jupiter. No OCR
text or copied historical chart is included in the source fixtures.

`lilly-essential-weights` cites *Christian Astrology*, printed page 115,
PDF page 142 of the linked transcription. The essential columns were fetched
and read on 2026-10-14. The defaults give domicile, exaltation, triplicity,
term and face weights `5, 4, 3, 2, 1`, and detriment, fall and peregrine
weights `-5, -4, -5`. Their literal values are checked in
`tests/essential.test.ts`; the hand-derived totals below use those values
over the geometric fixtures in `tests/fixtures.md`. They describe historical
point weights, without establishing measured accuracy or predictive validity.

This is an explicit own-position score, using Lilly's weights on the
engine's named table variants. Lilly's term and triplicity variants are not
introduced here. The score adds simultaneous dignities and debilities;
Mercury's domicile and exaltation can both contribute. Peregrine means no
essential dignity at the planet's own longitude, independently of debility
or reception, and can contribute alongside detriment or fall. Callers can
disable any scoring rule with `false`, change its weight or use a zero weight
without disabling it. A non-default weight is labeled `caller-override`;
the source record names the historical baseline, not authority for the
caller's value. A weight equal to the baseline is labeled `lilly-table`.

Lilly's score table also mentions mutual reception under domicile and
exaltation. This own-position score deliberately omits reception bonuses;
hosting is separate evidence. The result's convention and per-planet
explanation name that choice, so the total cannot be mistaken for a full
transcription of his fortitude table. Disabling the peregrine penalty is one
way to avoid stacking it with another debility; it does not change the
underlying peregrine flag.

`lilly-reception` cites the definition and examples at printed page 112,
PDF page 139, fetched and read on 2026-10-14. The project records mutual
hosting using engine `mutualReceptions`. A directional extension explicitly
uses `host receives guest` when the host holds an enabled dignity at the
guest's longitude, evaluated through engine `essentialDignities`. The default
enables all essential dignities, rather than the engine mutual-reception
API's domicile/exaltation default. A caller can select a subset or disable
all with an empty array. The host/guest orientation is a data convention,
without inferring affection, intention, an aspect, perfection or an outcome.
Self-reception is excluded by grouping physical planets first.

Sect uses engine `sectOf` on the Ascendant angle and Sun longitude, rather
than the first cusp or a planet's own sect. Its ecliptic half-circle convention
counts the Sun at the descendant as day and at the Ascendant as night. It
does not calculate apparent solar altitude, refraction or latitude-dependent
visibility. The convention and boundary inputs are recorded in each result
and tested independently by circle arithmetic.

## Accidental condition

`lilly-accidental-weights` refers to the accidental columns on printed page
115, PDF page 142 of the Lilly transcription linked above, fetched and read
on 2026-10-14, together with the direction definitions on printed page 114.
The selected house weights, in house order, are
`5, 3, 1, 4, 3, -2, 4, -2, 2, 5, 4, -5`. In particular, the sixth and
eighth have penalties of two, and the third has a positive one. Direct motion
has weight `4` and retrograde `-5`; swift and slow motion have weights `2`
and `-2`. The table expressly exempts the Sun and Moon from the direct-motion
award, since they always move forward. The project excludes both luminaries
from all direction points and refuses supplied negative luminary speeds.
`tests/accidental.test.ts` enforces these independently transcribed defaults.

`lilly-mean-motion` names historical daily comparison rates from the planetary
chapters, fetched and read from the same transcription on 2026-10-14:

| Planet | Mean daily motion | Printed page | PDF page |
| --- | --- | --- | --- |
| Saturn | 2 minutes 1 second | 57 | 81 |
| Jupiter | 4 minutes 59 seconds | 61 | 85 |
| Mars | 31 minutes 27 seconds | 65 | 89 |
| Sun | 59 minutes 8 seconds | 69 | 93 |
| Venus | 59 minutes 8 seconds | 72 | 96 |
| Mercury | 59 minutes 8 seconds | 76 | 100 |
| Moon | 13 degrees 10 minutes 36 seconds | 80 | 104 |

Convert each to arcseconds and divide by the arcseconds in a degree. The
literal rates and conversion arithmetic are checked in
`tests/accidental.test.ts`. The Mars chapter gives 31 minutes 27 seconds;
the worked passage on printed page 178 instead gives 30 minutes 27 seconds.
The default explicitly follows the planetary chapter. Callers can override
each rate. The fixture instants and speeds are invented, and no historical
question chart is copied. These rates describe an historical comparator,
without claiming that they model today's ephemeris or have measured accuracy.

The project compares absolute instantaneous engine speed with these rates,
rather than computing a historical daily ephemeris difference. Direction and
magnitude are separate facts; Lilly's worked Saturn example on printed page
178 likewise penalizes retrograde and slow motion together. Neither is
duplicated under another motion name. The configured stationary tolerance
suppresses both direction and rate points within its inclusive interval.
Its default is zero; equality with a mean rate is also neutral. Tolerances
are project/caller choices and do not search for station events.

`ptolemy-planetary-sect` cites Ptolemy, *Tetrabiblos* I.7, translated by
F. E. Robbins (1940), [LacusCurtius text](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B%2A.html#7),
fetched and read on 2026-10-14. Sun, Jupiter and Saturn belong to day; Moon,
Venus and Mars to night. Mercury belongs to day as a morning star and night
as an evening star. The source supplies no numerical point weights for this
match. Both sect weights therefore default disabled; enabled numerical
weights are always the caller's convention.

For Mercury the project uses a longitude proxy: longitude west of the Sun
within the semicircle is morning/day, east is evening/night. Exact
conjunction and opposition are indeterminate. This does not calculate
visibility or heliacal rising. Matching planetary sect to engine chart sect
is the only optional sect condition; it adds no hayz, hemisphere or sign
gender points. The convention and circle-derived boundary fixtures are
checked in `tests/accidental.test.ts`. Engine `exactSign` decides Mercury's
side of conjunction/opposition on the exact supplied binary values, so
floating-point cancellation cannot turn a nonzero offset into indeterminacy.

House assignment delegates to engine `houseOf` using the actual ordered
cusp circuit, including fallback, with no cusp anticipation or latitude.
One physical planet receives one house weight, without an additional angular,
succedent or cadent bonus. The result explains every contribution and retains
shared roles without multiplying a score. Direction and rate consume the
engine chart's sampled speeds without recomputation; `longitudeSpeed` is
exposed only through the local engine adapter for reuse and delegation checks.
No essential condition, reception, solar proximity, lunar phase, aspect,
node, joy or fixed-star rule contributes to this partial accidental score.

## Aspect application and contact searches

`lilly-application;engine-instantaneous-motion` refers to William Lilly,
*Christian Astrology* (1647), Book I, printed pages 106-110, read on
2026-10-14 in this [transcription of the primary text](https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html).
The linked transcription reproduces Lilly's aspect definitions and accounts
of application by direct, retrograde or mixed motion, with separation and
planetary moieties. The passage supplies historical context for observing
longitude contacts; no historical chart or outcome language is copied.

The operational convention follows the existing engine: instantaneous
decrease/increase of absolute angular orb defines applying/separating.
Exact moving contacts are separating, and effectively equal relative speeds
are stationary. This does not reproduce Lilly's separation margin or impose
his lighter/heavier planet restriction. The engine's own five major aspect
orb defaults, luminary replacements and relative-speed threshold are used as
explicit project defaults. Orbs can be replaced and each aspect disabled;
they are not claimed as Lilly's moieties. The exact binary and circular-corner
decisions are delegated to `src/configured-aspects.ts`, which uses
`src/exact.ts`, rather than reimplemented with a tolerance.

Time-to-perfection candidates come from the engine's crossing solver applied
to a-minus-b longitude, using both moving planets. Each nondegenerate angle
has positive and negative directed branches. Only a current in-orb
application's nearest directed branch is used for its candidate; a current
exact contact has elapsed time zero. All sampled contacts remain available
as evidence. These are mathematical longitude-contact records, without a
decision about traditional perfection or an outcome. Sign changes, station
events and competing contacts require the subsequent plan milestones.

Horizons and sample budgets are project resource choices, not traditional
rules or astronomical accuracy bounds. The method reports the reused solver's
sampling assumptions and limits. Its floating-point root search differs from
the exact instantaneous classification, and engine clock seams can invalidate
smooth-motion assumptions. A completed search is not a guarantee of exhaustive
event finding. Default and bounded policy tests are in `tests/aspects.test.ts`;
independently solved motion laws in `tests/aspects.motion.test.ts` check the
root-search adapter, not the accuracy of the astronomical ephemeris.

## Direct contact and continuity checks

`lilly-direct-contact;project-continuity-checks` refers to Lilly's
*Christian Astrology*, first published 1647, printed pages 109-110 and
124-125 of the linked 1659 edition. The
[primary-text transcription](https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html)
was fetched and read on 2026-10-14. Lilly describes direct conjunction and
major aspects as perfection modes with additional requirements, including
strength, reception and absence of intervention. His refrenation example
describes reversal before contact. No historical chart, redrawn table or
outcome language is copied here.

The project reports partial direct-contact evidence for the current in-orb
application selected by the aspect adapter. Its original-sign check and
flagging of every intervening motion reversal are explicit configurable
project conventions. The cited passage does not supply this general
original-sign requirement, nor does it make every station a refrenation.
Sign exits and speed-zero events are therefore preserved as observations;
later milestones evaluate reception and competing contacts. Conjunction,
sextile, square, trine and opposition are all retained as contact modes,
without presenting them as equivalent traditional outcomes.

There is no standalone station-search helper in this engine. The project
calls the existing `longitudeSpeed` and delegates speed zeros to
`searchLongitudeCrossingsWith` through the monotone transform
`atan(speed)*90/pi`, with target zero. It maps finite speeds into the open
interval `(-45,45)` degrees, preserving sign and zero mathematically, and
avoids adding an offset that would cancel very small speeds. The engine's
circular offset arithmetic still rounds extremely small nonzero values to
zero. Sign boundaries use the same solver on ordinary engine longitudes;
sign names come from `dignityRulersAt`, with no new zodiac or dignity table.

Side probes distinguish transitions from touches and unresolved zero
plateaus. Both probes must lie inside the horizon and beyond the numerical
root-resolution interval, without crossing the neighbouring same-target
root. Missing sides, ambiguous touches and coincident events require review.
Departures from an exact sign boundary or speed zero at the question are
preserved explicitly because the engine root interval excludes its start.
This supplements the open-start scan without claiming an earlier history.

Defaults, independent toggles and bounds are enforced in
`tests/direct-perfection.test.ts`. The event provider budget is separate from
the aspect budget, includes evidence probes, and refuses atomically.
`tests/direct-perfection.budget.test.ts` checks it over the synthetic
linear-motion horizon. No event budget, probe spacing or ordering-resolution
choice is attributed to Lilly or used as a physical accuracy bound.
