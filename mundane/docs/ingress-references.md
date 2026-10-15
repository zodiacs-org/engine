# Independent cardinal ingress references

The fixture responses in [test/fixtures/usno](../test/fixtures/usno/) come
from the U.S. Naval Observatory, Astronomical Applications Department,
*Earth's Seasons - Equinoxes, Solstices, Perihelion, and Aphelion* service.
The source years are 1950, 2000, and 2024. Every equinox and solstice row
from these responses is checked, giving twelve published event times.
These are selected years, not a continuous validation span.
[test/ingress-references.test.ts](../test/ingress-references.test.ts)
enforces the years, event count, response digests, and comparison threshold.

## Source and redistribution record

[ingress-sources.json](../test/fixtures/usno/ingress-sources.json) records
the publisher, retrieval date, exact request URLs, response SHA-256 digests,
documentation URLs, time terminology, and tolerance chosen before comparing
with the engine. Each `seasons-*.json` file preserves the response bytes,
including whitespace and the apside rows. Tests select only the season rows;
perihelion and aphelion are not cardinal longitude events.

The responses were already present as untracked files at session start.
Fresh requests to each recorded URL were read and compared byte for byte
before adopting them. They matched. No engine result or Swiss Ephemeris
material supplies a reference time. Routine tests are offline and read the
committed files; they never refresh expectations from a live service.

These tables are works of the U.S. Government, provided by an official U.S.
Navy site. Its [Privacy and Security Notice](https://aa.usno.navy.mil/about/PrivacyNotice),
under the introductory notice, states:

> All information on this site is considered public information and may be distributed or copied unless otherwise specified.

The notice requests appropriate credits. This document and the manifest
credit the Observatory. No other terms were found on the service or API
documentation pages read for these responses. The workbench's code and
documentation are MIT; that licence does not replace the source's terms.
These files stay outside the engine npm package.

## Deriving the references

The [Astronomical Almanac glossary](https://aa.usno.navy.mil/faq/asa_glossary)
was fetched and read at the `equinox`, `equinox, autumnal`, and `solstice`
entries. Its equinox definition describes the Sun crossing the equator,
with apparent ecliptic longitude approximately zero or a half circle;
its autumnal entry specifies the half-circle longitude. Its solstice
entry specifies the quarter-circle and three-quarter-circle longitudes.
The [service page](https://aa.usno.navy.mil/data/Earth_Seasons), under
Notes, associates the spring equinox with March and explains the northern
hemisphere naming convention even for southern hemisphere observers.

Using those definitions, the derivation maps the March equinox to Aries
at 0 degrees, the June solstice to Cancer at 90 degrees, the September
equinox to Libra at 180 degrees, and the December solstice to Capricorn
at 270 degrees. The test defines this mapping separately from the engine
and the library's cardinal table. The equator-crossing equinox definition
is not an assertion of an exact ecliptic longitude root when solar latitude
is nonzero. These season times provide a coarse independent comparison.

For each selected row, the derivation zero-pads the calendar fields and
appends the published `HH:mm` and a zero seconds field to form an ISO string.
It uses JavaScript calendar parsing only, without an engine calculation.
The zero seconds field represents the published minute label; it does not
claim a measured subminute instant. The source fixture checks enforce minute
format, valid calendar round trips, a zero time-zone offset, and disabled
daylight saving. There is no timezone or daylight-saving adjustment to apply.

## Time scale and threshold

The service's time-zone selector labels Universal Time as UT1, while the
[API documentation](https://aa.usno.navy.mil/data/api), under Earth's
Seasons and Apsides, calls its default example UTC. The manifest retains
this inconsistency rather than declaring that the rounded values resolve
UT1 and UTC separately. They are not TT labels. The historical source year
predates UTC, and the engine reads it on modeled UT1 through its UTC input
interface. The modern source years use the engine's IERS UTC time basis.
The chart integration tests enforce the returned basis and observed UT1
metadata where available. No engine-derived offset is applied to the
independent source time to improve agreement.

The maximum absolute difference is 120 seconds, inclusive, fixed in the
manifest before the first comparison in this session. This is a coarse
published-time agreement gate chosen for minute-resolution data, differing
equinox definitions, ambiguous source clock terminology, and ephemeris
differences. It is not a measured physical error bound or an allocation
of separate error contributions. The threshold does not assert a rounding
rule the provider has not stated and was not fitted to observed differences.
The same threshold applies to every selected season and both search shapes.

## What the checks establish

The tests search each selected year at Synthetic Meridian, requesting
Regiomontanus houses, require all expected cardinal events in order, and
compare their found instants with the published minute labels. They also
search source-centered date ranges from one day before to one day after
each published label, requiring only the corresponding cardinal event.
Both paths enforce the same independent timing gate.

For each annual event, the test compares angles, requested and actual houses,
body rows, flags, delta T, and time metadata with a direct engine chart at
the found instant. It checks that angularity and angle-ruler analyses use
that chart and retain their traditional-convention labels. These comparisons
establish integration, not independent accuracy of houses, positions,
angularity, dignities, or predictions. No chart factor is taken from a USNO
season table or pinned from previous engine output.

The test prints observed signed timing differences for the evidence log.
Those measurements never become reference fixtures or later test expectations.
The session record is [evidence/m6/checks.txt](evidence/m6/checks.txt).
Agreement applies only to the selected source events, engine checkout,
dependency version, and runtime recorded there.
