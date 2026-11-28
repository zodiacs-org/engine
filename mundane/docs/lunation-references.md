# Independent New and Full Moon references

The committed `phases-*.json` responses in
[test/fixtures/usno](../test/fixtures/usno/) come from the U.S. Naval
Observatory, Astronomical Applications Department, *Dates of Primary Phases
of the Moon*. The selected years are 1950, 2000, and 2024. Every New Moon
and Full Moon row is checked: 25 lunations per year, 75 in total. These
selected years do not establish agreement throughout the intervening span.
[test/lunation-references.test.ts](../test/lunation-references.test.ts)
enforces this selection, the response digests, and the comparison gate.

## Source and redistribution record

[lunation-sources.json](../test/fixtures/usno/lunation-sources.json) records
the publisher, retrieval date, request URLs, response SHA-256 digests,
documentation locators, clock terminology, and threshold fixed before
running the engine comparison. The annual API responses were fetched and
read directly from their recorded URLs. The fixtures preserve the response
bytes, including whitespace and quarter phases. No previous engine output
or Swiss Ephemeris material supplies an expectation. Tests read only the
committed fixtures and do not contact the service.

The [API documentation](https://aa.usno.navy.mil/data/api), at *Web Service
API Examples / Phases of the Moon / JSON Notes*, describes the annual
endpoint and its phase-name, calendar, and Universal Time fields. The
tests check response headers, chronological order, unique instants,
supported phase names, and calendar round trips before comparison.
Quarter phases remain in the raw tables but are excluded from lunation
search expectations.

The tables are U.S. Government works from an official U.S. Navy site.
Its [Privacy and Security Notice](https://aa.usno.navy.mil/about/PrivacyNotice),
at *NOTICE: This is a U.S. Government Web Site / item 2*, states:

> All information on this site is considered public information and may be distributed or copied unless otherwise specified.

The notice also requests appropriate credits; this document and the manifest
credit the Observatory. No other terms were found for the phase tables on
the pages read. The project's MIT licence does not replace the source terms.
These fixtures are outside the engine npm package.

## Derivation and clock

The Observatory's
[phase definition](https://aa.usno.navy.mil/faq/moon_phases), in the
paragraph beginning *Technically, the phases New Moon*, defines primary
phases by directed apparent ecliptic longitude of the Moon minus that of
the Sun. New Moon corresponds to 0 degrees and Full Moon to 180 degrees.
The test defines that mapping independently of `LUNATION_PHASES`, selecting
the exact source names `New Moon` and `Full Moon`. This is a longitude
conjunction or opposition, rather than an extremum of illuminated fraction
or a claim that the bodies have identical or opposite spatial directions.

For each selected row, the test zero-pads month and day, appends the
published `HH:mm`, and supplies zero seconds. JavaScript calendar parsing
turns that label into a comparison timestamp without engine date helpers
or ephemeris calculations. No subminute time or provider rounding rule is
inferred. The same procedure validates the unselected calendar rows.

The [service page](https://aa.usno.navy.mil/data/MoonPhases), under
*Notes / Time Format*, reports Universal Time at minute resolution. Its
linked [Universal Time explanation](https://aa.usno.navy.mil/faq/UT), in
the paragraphs about astronomical usage and Department data, identifies
this UT as UT1. The source labels are not TT. The fixture manifest retains
that basis rather than relabelling the source as measured UTC.

The test's appended `Z` encodes the unshifted source clock label for a coarse
comparison; it is not a UT1-to-UTC conversion. In the historical source year
the engine's UTC input interface uses modeled UT1 and delta T. In the modern
years it uses IERS UTC, including observed Earth-rotation metadata. The
chart integration assertions check those returned bases. No engine-derived
clock correction is applied to the independent label to improve agreement.

## Gate and check scope

The maximum absolute timing difference is 120 seconds, inclusive. It was
recorded before the first engine comparison and applies to every selected
event in both annual and date-range searches. This coarse agreement gate
allows for minute labels, unconverted source clock differences, and differing
ephemeris reductions. It does not estimate separate error contributions,
assert subminute accuracy, or provide a physical error bound.

Annual searches at Synthetic Meridian request Regiomontanus houses and must
return the source's entire New and Full Moon sequence in order. Each source
label is also searched in a separate range from one day before to one day
after it, requiring exactly the corresponding event. Those date ranges
check phase identity and timing with a different sample grid. The fixture
tables are the independent timing reference for both search shapes.

At each annual found instant, the test compares angles, requested and actual
houses, body rows, flags, delta T, time basis, and provenance with a direct
engine chart. It checks angularity and angle-ruler analyses and their
`traditional conventions, not predictions` labels. These assertions establish
integration only. The USNO tables supply no house, dignity, angularity, or
prediction reference, and the comparisons do not independently verify those
chart factors.

Signed timing differences are printed as observations in
[evidence/m8/checks.txt](evidence/m8/checks.txt), never reused as expectations.
Agreement is limited to the selected events, checkout, dependency version,
and runtime recorded there. Existing polar fallback and search-edge tests
remain in [test/lunations.test.ts](../test/lunations.test.ts).
