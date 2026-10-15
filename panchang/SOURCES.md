# Sources and evidence ledger

Only independently published facts or separately hand-derived arithmetic
may supply expected astronomical/calendar results. Checks comparing the
adapter with the engine establish wiring parity, not physical accuracy.
No Swiss Ephemeris material or per-case output is used. All observer
fixtures and examples in this project must be synthetic.

## M1: JPL longitude smoke reference

The test imports the existing fixture
[src/fixtures/horizons-2020.ts](../src/fixtures/horizons-2020.ts), rather than
copying or replacing it. Its comment records a fetch on 2026-07-05 for
2020-01-01T00:00:00Z with `QUANTITIES='31'`, `CENTER='500@399'`.
The Sun and Moon expectations are respectively 280.009492 degrees and
346.1383767 degrees. The original provider version was not recorded;
this is a limited smoke reference, not a fully reproducible source capture.
The fixture is public numerical material already covered by the
repository's [licensing audit](../LICENSING.md#swiss-ephemeris-exclusion).

JPL's [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html),
"Definition of Observer Table Quantities", quantity 31, read 2026-10-15,
defines apparent observer-centered IAU76/80 ecliptic-of-date longitude and
latitude in degrees. This differs from the engine's IAU2006/2000B frame
and correction conventions, so this check does not assert identical
reductions or establish a transition-time error bound.

Before the adapter's first test run, the longitude smoke threshold was
fixed at 0.01 degrees, the existing engine.test.ts smoke threshold for
this same fixture. [test/engine.test.ts](test/engine.test.ts) enforces it
for the Sun and Moon at this one instant. This is an acceptance threshold,
not a measured maximum or an accuracy claim over a date range.

## M1: engine integration checks

[test/engine.test.ts](test/engine.test.ts) checks that calc results, receipts,
bounds, timescale metadata, sidereal conversion and nakshatra/pada survive
the adapter. It exercises selectable engine ayanamsas and refusal/input
handling. All expectations obtained from engine calls are explicitly
integration checks, never independent evidence.

## M2: civil-date and timezone references

[test/civil.test.ts](test/civil.test.ts) derives expected UTC boundaries by
subtracting published clock offsets from the written midnight. At a
missing midnight it uses the transition instant. Comparisons are exact at
JavaScript millisecond resolution, with no accuracy tolerance; these are
clock/calendar checks, not physical astronomical accuracy evidence.
All coordinates are invented. Zones identify clock rules only, without
asserting that the synthetic site lies in that jurisdiction.

The following primary database records were fetched and read on 2026-10-15.
They are IANA tzdb 2025c public-domain data. No proprietary atlas was used,
and this work makes no correction to the historical time atlas.

- [northamerica](https://data.iana.org/time-zones/tzdb-2025c/northamerica),
  `Rule US 2007 max` March/November rows and `America/New_York`:
  the spring and autumn dates tested are 2024-03-10 and 2024-11-03.
  Standard/daylight offsets are -05:00/-04:00. The resulting intervals
  have 23 and 25 elapsed hours respectively.
- The same `northamerica` file, `Rule Cuba 2012 max` November row,
  `Rule Cuba 2013 max` March row, and `Zone America/Havana`:
  -05:00 standard offset, one hour daylight saving, midnight standard-time
  transitions. Tests use 2024-03-10's missing midnight and 2024-11-03's
  repeated midnight, choosing the earlier occurrence.
- The same file, `Rule StJohns 1988 only` April row and
  `Rule StJohns 1987 2006` October row, with `Zone America/St_Johns`:
  the 1988 daylight saving amount is two hours and the October rollback
  occurs at 00:01 on the last Sunday. The tested 1988-10-29/30 dates
  have disjoint pieces and are refused by the prototype's stated policy.
- [asia](https://data.iana.org/time-zones/tzdb-2025c/asia),
  `Zone Asia/Kathmandu` and its continuation rows: +05:30 until 1986,
  then +05:45. The test on 1986-01-01 starts at the midnight transition,
  1985-12-31T18:30:00Z, when the new local reading is 00:15.
- [australasia](https://data.iana.org/time-zones/tzdb-2025c/australasia),
  `Zone Pacific/Apia`, its continuation rows, and `Rule WS 2011`:
  the date-line change skips 2011-12-30 at 2011-12-30T10:00:00Z.
  Tests refuse that date and preserve the boundaries of its neighbours.
  The same zone's 1892 July change repeats a date; that constructed
  observer case is conservatively refused as a date-boundary fold.

For historical preparation the tests reuse independent vector `L3-TZ-0003`
in [L3-time-calendars.json](../conformance/vectors/L3-time-calendars.json),
whose arbiter is independently compiled zic 2025c with backzone, as described
in [the L3 arbiter record](../conformance/arbiters/l3/README.md).
It records Africa/Banjul's offset as -3996 seconds for 1880-12-31, within
its 1850-01-01 to 1912-01-01 constant segment. The test subtracts that
offset at the date's bounding midnights. Its synthetic longitude is outside
the engine's local mean time substitution range, so the zone clock applies.
The fixture remains in its original file, under the conformance suite's
licensing terms; it is read without modification or duplication.

Separate hand-derived arithmetic covers Gregorian month ends and the
divisibility rules for leap years, including years below 0100. The
synthetic historical observer at longitude -73.25 degrees uses
240 seconds per degree, giving a -04:53 mean-time offset on 1880-06-01.
A constructed clock jumps from 23:50 to 00:20 across midnight, proving
that the civil boundary precedes the engine's shifted missing-midnight
answer. That test supplies invented engine-resolution inputs; it does
not claim that this clock belongs to a real timezone.

Checks comparing retained resolutions with direct engine calls are
integration checks only. Observer validation uses the existing sky
`Observer` contract in [riseset.ts](../src/sky/riseset.ts); its domain
tests enforce input compatibility, not astronomical accuracy.

## M3: instantaneous limb definitions and arithmetic

Primary references read on 2026-10-15:

- India Meteorological Department, Positional Astronomy Centre,
  [Rashtriya Panchang, Explanation, "Details of the Panchang"](https://packolkata.imd.gov.in/panchang/en/explanation).
  The search service retrieved the explanation; direct page requests timed
  out. It defines tithi by Moon minus Sun longitude, karana by half that
  span, nakshatra by the Moon's nirayana longitude, and yoga by the sum of
  the nirayana Sun and Moon longitudes. No daily table values are copied.
- Government of India, Council of Scientific and Industrial Research,
  [Report of the Calendar Reform Committee (1955)](https://dspace.gipe.ac.in/xmlui/bitstream/handle/10973/39692/GIPE-043972.pdf),
  printed pp. 109-110 (PDF pages 124-125), tables "Tithis" and
  "Yogas and Karanas", and the fixed-karana footnote. The PDF was fetched
  and read as extracted text; the karana/yoga page was also rendered for
  inspection. It supplies the traditional names and moving-karana order.
  Its main table puts Naga before Chatushpada; the footnote distinguishes
  the later order Shakuni, Chatushpada, Naga, Kimstughna. This project
  explicitly uses that later order. Only factual traditional names and
  mathematical definitions are transcribed, with ASCII transliterations;
  no prose, images, deities, ritual rules or daily tables are redistributed.

The following exact mathematical conventions are enforced by
[test/limbs.test.ts](test/limbs.test.ts), over a complete angular cycle:

- Normalize Moon minus Sun into [0, 360) degrees. The tithi index is its
  floor quotient by 12; indices 0 through 14 are shukla, 15 through 29
  krishna. Fortnight numbers run from 1 through 15. Purnima is index 14
  and Amavasya index 29. A boundary belongs to the interval starting there.
- The karana index is the elongation's floor quotient by 6. Index 0 is
  Kimstughna. Indices 1 through 56 repeat Bava, Balava, Kaulava, Taitila,
  Gara, Vanija, Vishti. Indices 57, 58, 59 are Shakuni, Chatushpada, Naga.
  Thus the cycle ends with Naga, then begins with Kimstughna.
- Reduce the sum of sidereal longitudes modulo 360. Yoga index is the
  floor quotient by the rational width 40/3 degrees. Nakshatra and pada
  remain the engine's calculation, with the same boundary ownership.

Tests derive expectations by integer arithmetic in artificial angular
units and, separately, by decoding binary64 inputs into integer ratios.
They inspect each rational sector boundary and its adjacent representable
numbers, including cancellation and addition that would round across a
boundary. They use no engine-produced astronomical reference instants.
The implementation reuses the engine's exact-sum arithmetic for sum and
difference decisions; the independent oracle uses BigInt ratios instead.
Reported classification has no epsilon or physical accuracy tolerance.
Inputs must be canonical degrees in [0, 360); results of sum/difference
wrap internally. Exact arithmetic means exact for the supplied doubles,
not exact sky positions. This milestone establishes no transition times.

The instantaneous API retains the entire successful engine snapshot,
including ayanamsa, receipts and bounds. Its integration tests establish
that wiring and preserve engine refusals; they are not accuracy evidence.

## M4: sunrise reference protocol

Before running the sunrise adapter, the comparison threshold is fixed at
60 seconds from each USNO minute label. The tests will use invented sites
at (12.5, 75.25) degrees on 2024-03-20/21 and (-22.25, -60.75) degrees on
2024-06-21/22, height zero. The threshold allows the source's minute
rounding and the difference between its fixed solar radius and the engine's
distance-dependent radius. It is an acceptance threshold for these cases,
not a physical accuracy bound or a measured maximum.

Primary references read on 2026-10-15:

- US Naval Observatory, [Rise, Set, and Twilight Definitions](https://aa.usno.navy.mil/faq/RST_defs),
  "Technical Definitions and Computational Details", sunrise/sunset:
  its horizon depression is 50 arcminutes, comprising 34 arcminutes of
  refraction and 16 arcminutes of solar radius. The engine instead evaluates
  the radius from distance. The horizon is level and perpendicular to the
  local vertical. Observer height moves the engine observer on WGS84 but
  does not apply horizon dip, terrain or weather corrections.
- USNO, [API documentation](https://aa.usno.navy.mil/data/api.html),
  "Complete Sun and Moon Data for One Day": requests with `tz=0` return
  Universal Time clock labels. Comparison treats these as UTC labels;
  no subsecond UT1 agreement is asserted.
- IMD Positional Astronomy Centre, [Rashtriya Panchang explanation](https://packolkata.imd.gov.in/panchang/en/explanation),
  "Details of the Panchang", retrieved through search after a direct
  request timed out: sunrise uses the upper limb; vaar is the day of the
  week. The sunrise-to-following-local-date-sunrise assignment is this
  project's explicit requested convention.

[test/fixtures/usno-sunrise-reference.json](test/fixtures/usno-sunrise-reference.json)
contains the reviewed numerical extracts retrieved on 2026-10-15, with
each request URL, API version, raw response SHA-256 and UT sunrise minute.
USNO supplies the numerical facts as a US Government work, under the same
licensing basis recorded for the engine's USNO fixtures in
[LICENSING.md](../LICENSING.md#swiss-ephemeris-exclusion). No source prose,
images or daily panchang tables are copied.

Run `node scripts/fetch-sunrise-references.mjs` from this project to fetch
the independent responses again. It writes raw responses and the proposed
extract into ignored `generated/` for review, without overwriting the
committed fixture or evaluating the engine. New responses need not have
the same digest if the provider changes its output.

[test/sunrise.test.ts](test/sunrise.test.ts) compares the starting and ending
sunrise of each reference pair with the fixed threshold above. The
corresponding synthetic clocks are Asia/Kolkata and Etc/GMT+4; their
sunrises have the same written UTC and local dates in these cases. The
weekday tests independently advance from the Gregorian Thursday anchor
1970-01-01, and check 0099-12-31 by Gregorian congruence. Additional tests
check local-date ownership across the date line and engine-clock DST
windows. Retained-search/snapshot equality and historical history loading
are integration checks. Constructed boundary, multiple-rise and missing
following-rise cases test refusal/ownership policy, with invented events;
they supply no physical astronomical accuracy evidence.

## M5: independent analytical transition instants

[test/transitions.test.ts](test/transitions.test.ts) supplies independently
prescribed linear trajectories, with no astronomical reference output.
Let t be elapsed integer milliseconds from the invented epoch
2024-03-20T00:00:00Z and U = 2^26 milliseconds. Prescribe tropical and
sidereal Sun longitude t/U and Moon longitude 13t/U degrees, each reduced
modulo a turn. These artificial sidereal coordinates are declared to the
engine classifier; they do not model an actual ayanamsa conversion.
The coordinates are dyadic over the tested span, avoiding ambiguous
rounding at their rational reference roots.

Solving the sector equations independently gives these elapsed times,
where k is any signed integer:

| Change | Unrounded elapsed milliseconds |
| --- | --- |
| Tithi | k U |
| Karana | k U / 2 |
| Nakshatra | 40 k U / 39 |
| Pada | 10 k U / 39 |
| Yoga | 20 k U / 21 |

The independent test oracle evaluates these ratios with BigInt arithmetic
and takes their ceilings to obtain the first whole millisecond owned by
the new sector. It checks exact equality, without a physical error
tolerance. Windows run from -86,400,000 to 172,800,000 milliseconds around
the epoch across the cases, including negative roots, a complete common
boundary at t = 0, fractional roots, very short windows and roots exactly
at an endpoint. Expected transition instants come only from these equations,
never from the engine or a previous adapter run. Receipt-shaped fields in
these mocked snapshots come from an engine seed solely to satisfy the
integration types; they are not astronomical reference positions or
authentic receipts of the artificial trajectories. No mock output is
stored as a fixture.

The implementation sends the karana, pada and yoga sector phases through
the existing engine longitude-crossing solver. A full sector maps to a
phase turn; a search for phase zero finds all sector boundaries. Shared
karana/tithi and pada/nakshatra boundaries are derived from the same roots.
The exact classifiers and the existing engine `firstMillisecond` helper
then settle the instant, checked against its preceding millisecond.
The fixed scan step is 1/96 day, with three elapsed days of padding on
either side of a positive window no longer than two elapsed days. These
are operational settings, not independently measured speed or accuracy
bounds. They are enforced by the tests; no claim extends to arbitrary
trajectories or unobserved rapid changes between samples. Unsupported
backwards or unconfirmed roots and missing bounding changes refuse the
whole result.

The engine's `elapsedDays(timeBasis(a), timeBasis(b), NaN)` continuity check,
also used by its window implementation, detects time-basis discontinuities
without duplicating a leap-second list or model handover dates here.
The prototype conservatively refuses a padded span containing one.
Tests exercise the model seam near 1941, the 1972 time-basis handover,
the leap-second boundary at 2017-01-01 and the IERS table handover in 2027.
These are engine-policy integration checks, not new independent UTC data.

Real-engine tests use the synthetic observer (12.5, 75.25) degrees and the
Asia/Kolkata clock for 2024-03-20, with Lahiri and Raman. They check receipt
retention and equality with the instantaneous classifier on both sides of
every returned interval boundary, and that full intervals overlap the
sunrise window. Those checks validate wiring and local boundary ownership;
they establish neither physical transition-time accuracy nor exhaustive
astronomical reference coverage. Published transition comparisons remain
the work of M11.

## M6: day assembly arithmetic and integration

[test/day.test.ts](test/day.test.ts) reuses the M5 prescribed trajectories
and rational reference roots through the shared test helper
[test/analytical.ts](test/analytical.ts). It supplies artificial sunrise
endpoints to isolate partition assembly from horizon geometry. Original
engine-shaped diagnostics in those mocks are scaffolding only and do
not certify the artificial sunrise or luminary coordinates.

The expected partition is derived independently: include the requested
endpoints and each rational reference root strictly inside them, deduplicate
equal instants, sort, then pair consecutive boundaries. The cases cover
negative elapsed times, roots on either endpoint, a common root of every
limb, fractional roots rounded up to milliseconds, and a window with no
interior change. Segment labels are checked against the inverse rational
periods from M5, reduced to their full-cycle indices. The tests check exact
equality for these constructed instants without an astronomical tolerance.
The oracle does not read transition-search output to decide expected times.

The tests also check that clipped segments retain the original full limb
interval objects and receipts, that vara remains fixed for the sunrise
day, and that a pada change subdivides the day independently of a
nakshatra-name change. Simultaneous events create one boundary and no
zero-duration segment. The segment labels exclude the Moon's continuously
changing nakshatra elapsed fraction.

Real-engine cases use the invented observer (12.5, 75.25) degrees and
Asia/Kolkata clock on 2024-03-20, with Lahiri and Raman. Comparisons to
instantaneous engine calls establish wiring and receipt preservation
only. Operational checks cover refused civil dates, missing sunrise,
separate sunrise/transition budgets, padded coverage refusals and an
engine time-basis discontinuity. The day API introduces no new physical
accuracy evidence; M4's sunrise comparisons and M5's transition limitations
retain their original scope. Published physical transition references
remain the work of M11.

## M7: lunar-month conventions and independent arithmetic

The primary reference is the Government of India, Council of Scientific
and Industrial Research, [Report of the Calendar Reform Committee (1955)](https://dspace.gipe.ac.in/xmlui/bitstream/handle/10973/39692/GIPE-043972.pdf),
printed p. 242, table 16, "Corresponding Names of Solar Months" (PDF page
257), and printed p. 247, "Siddhantic rules for the Lunar Calendar" (PDF
page 262). Fetched and read as extracted text on 2026-10-15; the PDF's
SHA-256 was `4f73afb5665bd0ccd8ccc0b39001fea17fcadc630bfb1628e93987e4be0ac3c2`.
The text extractor misreads printed page 247 as 241; the PDF page locator
identifies the intended page. The PDF is downloaded into memory for
extraction; neither the PDF nor its full text is committed. Only factual
names, definitions and original implementation/tests are redistributed,
without source prose, images or calendar tables. No licence to republish
the scan or the report's text is asserted.

Table 16 maps sidereal solar signs Aries through Pisces to Vaisakha,
Jyaishtha, Ashadha, Sravana, Bhadra, Asvina, Kartika, Agrahayana, Pausha,
Magha, Phalguna, Chaitra. The project uses Bhadrapada for Bhadra and
Margasirsha for Agrahayana; the alternatives appear in the report's
proposed-calendar tabulations (PDF pages 19-20) and the Bhadra month
heading (PDF page 60). The ordinary amanta month takes the name of
the solar month containing its initial new moon. Purnimanta takes the
same name but starts at the full moon preceding that new moon and ends
at the following full moon. Its waning fortnight therefore uses the
name of the following amanta lunation; its waxing fortnight shares the
amanta name. These are the report's Siddhantic naming rules, using the
caller's engine ayanamsa for the sidereal solar signs. The implementation
does not adopt the committee's separately proposed tropical calendar.

The numerical ownership convention is this project's explicit choice.
New moon is the first whole millisecond whose tithi index changes from
29 to 0; full moon is the change from 14 to 15. An ingress is the first
millisecond of the new sidereal solar sign. Every interval includes its
start and excludes its end. An ingress coincident with a naming new moon
belongs to the lunation beginning there, and initial solar sign is read
after that ingress. These tie rules are exercised with an artificial
exact coincidence, without implying astronomical simultaneity within a
millisecond. M7 refuses naming lunations with zero or multiple ingresses
as `non-ordinary-lunation`; M8 will supply anomaly rules and tests.

[test/months.test.ts](test/months.test.ts) prescribes independent dyadic
longitudes over integer elapsed milliseconds t from the invented epoch
2024-03-20T00:00:00Z, with U = 2^26 milliseconds. It sets Sun = a + t/U
and Moon = a + e + 13t/U degrees, both modulo a turn. These artificial
sidereal values equal their tropical values for arithmetic tests only;
no physical ayanamsa conversion is asserted. The reference equations are:

| Event | Unrounded elapsed milliseconds |
| --- | --- |
| New moon | (360k - e) U / 12 |
| Full moon | (180 + 360k - e) U / 12 |
| Solar ingress into sign j | (30j + 360k - a) U |

For e = 0, the new/full moons occur at 30k U and (15 + 30k) U. Taking
a = 30s + 7 for each solar sign s gives the next ingress at 23 U,
and the expected month index is (s + 1) modulo 12, with Chaitra indexed
from zero. Another case sets a = 337, giving Chaitra at t = 0 and
Vaisakha at the following new moon. The purnimanta name changes at
15 U and stays constant across 30 U. With e = 5 the oracle solves the
signed rational phase equations using BigInt and rounds upwards to
whole milliseconds. It compares the event times exactly, without a
physical accuracy tolerance. Tested phase cycles are k = -1, 0, 1;
other cases include exact coincidences, adjacent one-millisecond windows
and the maximum accepted window. These are prescribed mathematical
trajectories, never values from an earlier engine or package run.

Additional constructed trajectories freeze or double solar motion to
exercise the temporary anomaly refusal, or reverse phase motion to
exercise unsupported-crossing refusal. Engine-shaped receipt fields in
mock snapshots are test scaffolding only, not authenticated computation
records for those artificial coordinates. The day partition tests reuse
M5's independent trajectory and test month changes at new/full moons.

The tests enforce the quarter-day solver step, 64 elapsed days of padding
on both sides, positive window of at most two elapsed days, and default
budget of 5,000 unique snapshots. The padding allows the next amanta
lunation's ending new moon to be found during a purnimanta waning half.
These are operational search settings, not measured speed bounds or
astronomical accuracy claims. The solver assumes sampled forward motion;
local adjacent-millisecond checks do not establish exhaustive completeness.
The shared snapshot budget includes refinements and boundary checks.
The engine continuity check applies to the entire padded span, including
the M5 time-basis seams, and engine coverage refusals propagate intact.

Real-engine checks on 2024-03-20/21 use amanta with Lahiri and purnimanta
with Raman, retaining original phase/ingress snapshots and receipts and
checking the classifiers on either side. The source runtime also checks
month wiring on the existing invented historical observer. These are
integration checks only, with no physical month/phase-time accuracy claim.
Published transition comparisons remain M11's work.

## Later milestones

Before adding anomaly detection, document its independent definitions and
boundary conventions. Before testing physical transition instants, record
the primary source URL, locator, retrieval
date, source timescale, observer/horizon details, ayanamsa, permitted
redistribution and the comparison tolerance fixed before measuring the
adapter. Keep downloaded and generated working data in ignored
generated/ or .cache/; commit only small, licensed reference extracts.
