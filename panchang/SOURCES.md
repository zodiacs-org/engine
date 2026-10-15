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

## Later milestones

Before adding limb arithmetic or month naming, document the independent
definitions and boundary conventions used. Before testing physical
transition instants, record the primary source URL, locator, retrieval
date, source timescale, observer/horizon details, ayanamsa, permitted
redistribution and the comparison tolerance fixed before measuring the
adapter. Keep downloaded and generated working data in ignored
generated/ or .cache/; commit only small, licensed reference extracts.
