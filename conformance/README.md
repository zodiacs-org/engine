# Conformance suite for astrology computation

Test vectors for the numbers an astrology program computes, each with an
independent arbiter and a stated tolerance, and a harness that runs any
engine against them through a small adapter. Version 0.1.0 covers three
levels:

| level | what it checks | vectors |
| --- | --- | ---: |
| L1 | apparent geocentric positions of the Sun, Moon and planets | 240 |
| L2 | ascendant, midheaven, vertex, east point and house cusps in thirteen systems | 150 |
| L3 | time zones and local mean time, TT − UTC, ΔT, and Julian and Gregorian calendar dates | 110 |

Later levels are planned for events and completeness (L4), sidereal and
Vedic techniques (L5), and Hellenistic and timing techniques (L6).

Results for this repository's engine and for Swiss Ephemeris are in
[RESULTS.md](RESULTS.md).

## The rules

- Every vector names its arbiter: the independent source or computation that
  decides the expected value. The arbiters of 0.1.0 are NASA JPL Horizons
  (DE441) for positions, ERFA's sidereal time, precession and nutation with
  the published definition of each house system for angles and cusps, the
  IANA time zone database (2025c, with its `backzone` file) compiled by
  `zic`, the IERS's leap-second table and Earth-rotation series, and exact
  calendar arithmetic implemented twice.
- Every vector names its tolerance, fixed before any engine was run against
  it: 1″ for positions, angles and cusps; 0.1 s for ΔT, a size at which ΔT
  moves the Moon by about 0.05″; exact for time zone offsets and calendar
  dates.
- No vector uses Swiss Ephemeris as its arbiter. Swiss Ephemeris is measured
  by the suite like any other engine.
- A released vector never changes. A vector found to be wrong is withdrawn
  and replaced under a new id; see [DISCREPANCIES.md](DISCREPANCIES.md).

How each arbiter was applied, its inputs with their SHA-256 digests, and its
own uncertainty are recorded in the vector files and in `arbiters/*/README.md`.
The generators are in `arbiters/`; each rebuilds its file byte for byte, and
continuous integration rebuilds them on every change.

Where Swiss Ephemeris touched the suite's history, it is recorded:

- The 24 L1 instants were first chosen as UT plus Swiss's ΔT, although the
  vectors' input is the TT itself.
- The model of Horizons's frame was first identified by comparing candidates
  with Swiss. In this suite it is accepted on an independent DE440s
  reduction instead; see `arbiters/l1/README.md`.

Two conventions deserve a note:

- **Polar house systems.** A cusp vector expects "undefined" only where the
  system's own construction has no solution or gives cusps out of order.
- **Time zones.** The zone vectors use tzdb with its `backzone` file, whose
  pre-1970 histories tzdb's maintainers describe as less reliable than the
  main data. Where that history differs from tzdb's default build, the
  vectors are tagged `backzone-history` and their results are counted
  separately.

## Running an engine against the suite

An adapter is a program that reads one JSON request per line on standard
input and writes one JSON response per line; [SPEC.md](SPEC.md) gives the
format. Two adapters are included:

```bash
# this repository's engine
npm ci && npm run build
node conformance/harness/run.mjs \
  --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --out conformance/results/zodiacs-engine.json

# Swiss Ephemeris through pyswisseph (pip install pyswisseph), with the
# ephemeris files sepl_18.se1 and semo_18.se1 in SE_EPHE_PATH
SE_EPHE_PATH=/path/to/ephe node conformance/harness/run.mjs \
  --adapter "python3 conformance/adapters/pyswisseph.py" \
  --out conformance/results/pyswisseph.json --values none

node conformance/harness/report.mjs   # rewrites RESULTS.md
```

`--values none` records verdicts, the flags Swiss Ephemeris returned and
summary statistics, but no per-vector values. Swiss Ephemeris output is not
redistributed here.

`node conformance/harness/validate.mjs` checks the vector files against
SPEC.md and the arbiters' input digests. In continuous integration the suite
runs against this engine on every change, and the build fails if any vector's
verdict differs from the committed results.

A vector an engine has no function for is reported as `unsupported`, not as
a failure, so the table shows what each engine covers as well as how well.

## Reporting an error in the suite

See [DISCREPANCIES.md](DISCREPANCIES.md). Reports and their dispositions are
public.

## Licence

The vectors, the harness and the adapters in this directory are dedicated to
the public domain under [CC0 1.0](LICENSE). The copied inputs in `sources/`
come from NASA JPL Horizons, the IANA time zone database and the IERS. Each
is named with its source in the arbiter entries of the vector files.
