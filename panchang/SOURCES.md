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

## Later milestones

Before adding limb arithmetic or month naming, document the independent
definitions and boundary conventions used. Before testing physical
transition instants, record the primary source URL, locator, retrieval
date, source timescale, observer/horizon details, ayanamsa, permitted
redistribution and the comparison tolerance fixed before measuring the
adapter. Keep downloaded and generated working data in ignored
generated/ or .cache/; commit only small, licensed reference extracts.
