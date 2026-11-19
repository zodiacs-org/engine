# Broad sample against JPL DE421, 13 November 2026

A read-only comparison of the engine with JPL DE421 on many more instants
than the preregistered calc corpus (`docs/evidence/calc-api/rc16`, 32
instants from 1802 to 2188). It changed no computed value, bound, output or
conformance vector. `summary.json` holds the per-body figures, `outputs/`
the comparison's own results and `tools/` the scripts that produced them.

## What ran

- **Build:** the carried `artifacts/zodiacs-engine-1.1.0-rc.3.tgz` (source
  commit `cc910b3`; `src/` is unchanged at `bc0b5a7`), with
  astronomy-engine 2.1.19.
- **Reference:** JPL DE421, read with jplephem 2.24 and reduced with pyerfa
  2.0.1.5 to the apparent geocentric place: light time, solar deflection,
  annual aberration, then IAU 2006/2000A to the true ecliptic of date. Mars to
  Pluto are system barycentres, as in the conformance suite. Every reference
  evaluation uses the engine's own TT and UT1, so the differences are
  ephemeris and reduction only. Against the 140 committed Horizons DE441 L1
  vectors inside 1900 to 2050 the reference agrees in longitude within
  0.008″ for the Sun to Saturn and 0.26″ for Uranus to Pluto, and in latitude
  within 0.018″ and 0.13″ (`outputs/calibrate-l1.txt`).
- **Positions:** 1,711 instants per body. 604 from 1900 to 2050, four a year
  at seeded random days and seconds; 1,096 from 2020 to 2031, every four
  days; and 11 edge instants (1900-01-01, both sides of 1972-01-01 and of the
  2016 leap second, J2000, the end of the IERS table in October 2027,
  2030-12-31 and 2050-12-31).
- **Events:** the Sun's 1,812 sign changes from 1900 to 2050, the Moon's
  4,169 (2020 to 2031 and every tenth year from 1900 to 2050), 3,736 new and
  full Moons from 1900 to 2050 and 297 quarter Moons from 2020 to 2031. The
  reference finds its own events by a daily scan and bisection.

## What it found

Six of the published geocentric apparent position bounds and six of the speed
bounds, each the largest difference seen on the 32-instant corpus, are
exceeded somewhere in this sample: positions for Venus (20.54″ against 11″),
Mars (14.05″ against 6.6″), Saturn (21.96″ against 18″), Mercury (11.91″
against 9.3″), Jupiter (13.86″ against 13″) and the true node (19.2″ against
16″); speeds for the Moon (1.62 against 1.1″ a day), Saturn (0.043 against
0.03), Neptune (0.015 against 0.013), Venus (0.667 against 0.64), Mars (0.59
against 0.45) and Jupiter (0.062 against 0.061). `docs/calc.md` (Bounds)
gives them beside the published values.

The Sun's sign changes are within 50.3 s of DE421 (42.8 s from 2026 to 2030)
and the Moon's within 7.64 s, inside the 60 s and 15 s gates that
`docs/techniques.md` records.

## Limits

- The speeds compare the rate of longitude alone, in arcseconds a day, against
  a reference without solar deflection, the ephemeris's difference alone. The
  published `bounds.speed` is a different metric, the angular rate difference
  hypot(Δ(longitude rate) × cos latitude, Δ(latitude rate)), so these figures
  show the bounds exceeded in longitude rate; they are not angular rate maxima.
  The true node's speed was not compared (its bound is null). With deflection, as Horizons
  applies it, the differences near conjunction with the Sun are larger,
  because the engine applies none (`docs/calc.md`).
- The true node is compared with the ascending node of the osculating
  geocentric orbit of the DE421 Moon. How that orbit's frame is taken moves
  the node by several arcseconds, so the 19.2″ is plausible, not confirmed.
- DE421 ends in 2053, so nothing here is outside 1900 to 2050.
- The per-instant engine dumps (about 6 MB and 2 MB of JSON lines) are not
  committed; the tools regenerate them from the carried archive.

## Reproduce

The tools need Node 20 or later, Python 3 with numpy, jplephem 2.24 and
pyerfa 2.0.1.5, and NAIF's DE421 kernel,
<https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de421.bsp>
(16,788,480 bytes, SHA-256
`a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`). From the
repository root:

```sh
RUN=$(mktemp -d)
mkdir -p "$RUN/node_modules/@zodiacs/engine"
tar -xzf artifacts/zodiacs-engine-1.1.0-rc.3.tgz -C "$RUN/node_modules/@zodiacs/engine" --strip-components=1
cp -r node_modules/astronomy-engine "$RUN/node_modules/"   # 2.1.19, the archive's dependency
cp docs/evidence/broad-sample-2026-11-13/tools/*.mjs "$RUN/"
T=$PWD/docs/evidence/broad-sample-2026-11-13/tools
cp /path/to/de421.bsp "$T/de421.bsp"   # the kernel is read from tools/; do not commit it
python3 -I "$T/calibrate-l1.py"
(cd "$RUN" && node sample-positions.mjs positions.jsonl && node events.mjs events.jsonl)
python3 -I "$T/compare-positions.py" "$RUN/positions.jsonl" "$RUN/positions.json"
python3 -I "$T/compare-events.py" "$RUN/events.jsonl" "$RUN/events.json"
```

The `.mjs` files are copied beside the extracted archive so that
`@zodiacs/engine` resolves to the carried build, not this checkout. The
instants are seeded (`mulberry32(20261112)`), so a rerun gives the same
sample. The positions take seconds; the events take about 3 minutes in Node
and 6 in Python.

| Tool | Writes | Committed result |
| --- | --- | --- |
| `tools/reference.py` | (module) the DE421 apparent place, speed and true node | |
| `tools/calibrate-l1.py` | the reference against the committed L1 Horizons vectors | `outputs/calibrate-l1.txt` |
| `tools/sample-positions.mjs` | the engine's positions, houses and points at 1,711 instants | |
| `tools/compare-positions.py` | position and speed differences per body | `outputs/positions.json`, `outputs/compare-positions.log` |
| `tools/events.mjs` | the engine's ingresses, stations, lunations, quarters and aspects | |
| `tools/compare-events.py` | event time differences | `outputs/events.json`, `outputs/compare-events.log` |

`summary.json` takes its position figures from `outputs/positions.json`
(`nodefl` for the speeds and `positions` for the angles) and its event
figures from `outputs/events.json`. A rerun on 2026-11-13 from these tools,
from a clean extraction of the archive, reproduced `outputs/positions.json`
and `outputs/compare-events.log` exactly and every figure in
`outputs/events.json`; only the order of two entries in its
`_unmatched_examples` list changed, which follows Python's string hashing.
