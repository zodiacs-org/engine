# Published ingress sample audit

Audit identifier: `ingress-sample-audit-2026-10-15`, revision 1.

No inspected source qualified for an independent mansion ingress fixture.
No external ingress times or positions were copied into the tests, and no
comparison residuals or astronomical timing accuracy figures were measured.
This is an evidence gap for published mansion ingresses, not a finding that
such evidence cannot exist. The library's first changed millisecond remains
a numerical property of the engine and the selected table.

## Admission criteria

A published sample needs all of the following before it becomes a test:

- A primary publication that was fetched and read, with a stable URL,
  author or issuing organization, edition or revision, and a passage or
  page locator. A search result is a lead until the underlying text is read.
- An identifiable lunar mansion and its boundary, zodiac and zero point.
  A sidereal sample also needs its ayanamsa definition and epoch where
  relevant. Rounded printed coordinates must not silently replace this
  project's exact rational boundaries.
- A full instant, calendar, time scale or specified local offset, and
  stated rounding or precision. UT, UTC and TT must not be conflated. An
  ingress is a longitude-boundary crossing, not a star's rising, a lunar
  phase, or a conjunction or occultation of a named star.
- An identified astronomical method independent of this engine's Moon
  ephemeris. Undisclosed software is an unresolved provenance question.
  Results made with the same ephemeris can check another implementation's
  behavior, but cannot establish independent astronomical accuracy here.
  Swiss Ephemeris results are excluded by the repository rules regardless
  of another publisher's permission to distribute them.
- Established redistribution terms for anything placed in-tree. Free
  access and permission to redistribute are separate facts. A page with
  unspecified terms is recorded as unresolved, without asserting that its
  factual contents are legally restricted.

Before running a comparison, fix the sample selection and tolerance from
the publication's precision, coordinate and clock conventions and the
intended accuracy claim. Record any justified transformation separately.
Do not repair an ambiguous source date by comparing it with engine output,
infer an unknown ephemeris from numerical similarity, or widen a tolerance
after seeing a difference. A table mismatch needs its own explicitly sourced
table version before testing that convention.

## Search scope

Public web searches were performed on 2026-10-15. Representative queries:

- `"lunar mansion" "ingress" ephemeris times`
- `"mansions of the moon" ephemeris software Swiss`
- `"manazil" "ephemeris" times`
- `"lunar mansions ephemeris" Stockinger "Swiss"`
- `"lunar mansions" "ingress" "Meeus"`
- `"lunar mansions" "ingress" "JPL"`
- `"lunar mansions" "ephemeris" "license"`
- `"منازل القمر" "دخول" "توقيت" الحساب`

The candidates below are the inspected leads, not an exhaustive catalogue.
Search results about other lunar-mansion systems and seasonal star risings
were not treated as Arabic equal-longitude ingress samples. No paid service,
account, proprietary atlas or separately installed ephemeris was used. The
historical name witnesses already documented in [SOURCES.md](SOURCES.md)
continue to support names and sequence, not modern ingress instants.

All links below were read on 2026-10-15. HTML and extracted PDF text were
read through the web reader unless a different retrieval method is stated.
The report retains bibliographic and methodological observations only;
it does not redistribute the candidate tables, screenshots or event output.

## stockinger-lunar-mansions-2026

Peter Stockinger, [Lunar Mansions Ephemeris](https://starsandstones.wordpress.com/mansions-of-the-moon/lunar-mansions-ephemeris/),
section headed *Ephemeris for the Year 2026*, column headings and opening
cycle. The author's [announcement of 26 December 2025](https://starsandstones.wordpress.com/2025/12/26/free-lunar-mansions-ephemeris-for-2026/)
links readers to this resource.

The list identifies mansions by number, gives zodiacal positions and
Gregorian dates with times through seconds, and labels the clock UT.
Some displayed boundaries differ from the exact division used by
`equal28-aries-v1`; the opening cycle does not explain whether these are
computational targets or transcription or display rounding. The inspected
list and announcement do not identify the ephemeris, lunar coordinate
corrections, timing error or rounding rule, or a redistribution licence.
Calling the resource free does not resolve those omissions.

Decision: unresolved method, coordinate and reuse provenance. No rows are
accepted, including rows whose displayed boundary coincides with this
project's table. No attribution to Swiss Ephemeris is inferred.

## white-witch-grimoire-lunar-ephemeris

White Witch Grimoire, [Mansions of the Moon Lunar Ephemeris 2023](https://www.whitewitchgrimoire.com/mansions-of-the-moon-lunar-ephemeris/),
title, clock statement immediately below it, opening cycle and footer.

The heading's year and the opening rows' years disagree. The clock
statement treats Universal Time and UTC as interchangeable. Some displayed
coordinates differ from this project's rational boundaries, without an
explanation of their construction. The inspected page does not identify
the ephemeris or coordinate corrections, or a rounding rule. Its footer
has a copyright notice; no redistribution licence was found on that page.

Decision: ambiguous year, clock, boundary and ephemeris provenance, with
reuse terms unresolved. No dates or coordinates are corrected, copied or
used as expectations, and no underlying ephemeris is inferred.

## lunarium-universal-calendar

Lunarium, [The Mansions of the Moon](https://lunarium.co.uk/articles/lunar-mansions/),
sections *The Lunar Zodiac* and *How to Know When the Moon is in a
Particular Mansion?*; [Universal Lunar Calendar](https://lunarium.co.uk/calendars/universal/),
location/clock heading and calendar key; [Human Design Calculator](https://lunarium.co.uk/calculators/human-design/),
FAQ *How is the chart calculated?*

The mansion article describes equal divisions and an illustrated calendar
example, but the accompanying prose does not give a complete dated,
zone-specified sample. Its example image could not be fetched. The live
calendar specifies a location and offset and identifies mansion-entry
events in its key. The calculator FAQ explicitly names Swiss Ephemeris
and says other Lunarium calculators use the same astronomical data.

Decision: no output imported. The current shared-data statement is grounds
to exclude the live calculator as an arbiter under this repository's rules;
it does not prove which software produced the older illustration. The
inspected pages have copyright notices and no identified fixture reuse
licence. No historical method or permission is assumed.

## tata-washington-2024-sample

polyphanes, [The Adocentyn Temple Almanac, 2024 Washington sample](https://digitalambler.com/wp-content/uploads/2024/02/tata_washdc_test_2024_sample-1.pdf),
almanac version 1.0, section 16, *Explanations of Calculations*, and
section 16.1, *Ingresses and Ecliptic Degree Transits*, printed p. 813
(PDF page 103).

The methodology names Swiss Ephemeris through pyswisseph and includes
tropical lunar mansion ingresses among its calculations. The extracted
methodology text was readable; a page image request failed. No event table
was imported or used for a comparison.

Decision: excluded by the repository's Swiss Ephemeris rule. Redistribution
terms were not established; permission would not change the exclusion.
Only the publication's methodological provenance is recorded here.

## mansion-tracker

Christopher Warnock, [Mansion Tracker](https://www.renaissanceastrology.com/mansiontracker.html),
sections *Introduction to Mansion Tracker* and *Ordering Mansion Tracker*;
[Mansion Tracker Instructions](https://www.renaissanceastrology.com/mansiontrackerinstructions.html),
time-zone setup and footer. The instructions HTML was fetched directly
and read after the web reader failed to retrieve it.

The product page credits Peter Zilahy Ingerman as developer and describes
tropical mansions. The instructions require the user to set a time zone.
The inspected text does not identify an ephemeris or an astronomical error
model. The pages carry an all-rights-reserved notice, without an identified
fixture redistribution grant. No software was purchased, downloaded or run;
the illustrated application output was not transcribed.

Decision: method and sample reuse provenance unresolved. This audit does
not assert that a paid application is inaccurate or legally prevents reuse
of individual facts. No ephemeris is inferred from the product's age or
purpose.

## asrar-manazil

Asrar, [Manazil al-Qamar: The 28 Lunar Mansions](https://www.asrar.app/manazil),
FAQ *How does Asrar calculate today's manzil?* The HTML was fetched
directly and read after the web reader failed to open the page.

The FAQ identifies tropical equal sectors from Aries and names
`astronomy-engine`, which is also this engine's Moon ephemeris dependency.
The inspected page explains current-position classification; it does not
supply a reproducible published ingress sample with a full instant and
clock conventions. No fixture redistribution licence was identified on
that page.

Decision: no usable published ingress sample, and no independent ephemeris
arbiter. A separate site's use of the same astronomical library cannot
establish this project's physical timing accuracy. No data was imported.

## Consequence for tests and future work

There is no published-ingress fixture or skipped placeholder accuracy test
for this audit. [test/ingresses.test.ts](test/ingresses.test.ts) and
[test/sidereal.test.ts](test/sidereal.test.ts) retain independent rational
synthetic-motion checks and separate engine integration/replay checks.
Their numerical agreement must not be reported as a measurement against
these external publications. Existing engine bounds retain their original
meaning and comparison coverage; this audit adds no timing bound.

A later audit can admit a source when the missing provenance is supplied.
Use a small attributed fixture with the accepted source passage and its
terms, unmodified expected values, explicit coordinate and clock mapping,
and a tolerance justified before comparison. Generated downloads and
larger working data belong in ignored folders. An independent JPL-based
calculation could supply a different kind of astronomical check, but would
need a reproducible generator and conventions audit and must be labelled
as a constructed reference, not a previously published mansion ingress.
