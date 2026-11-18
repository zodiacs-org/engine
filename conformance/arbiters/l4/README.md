# L4 arbiter (draft): event times from DE440s

The expected instants of the draft level L4, `drafts/0.3.0/L4-events.json`
(ingresses, stations and new and full Moons), are solved by `build.py` from
NASA's `de440s.bsp` kernel. The design, with the instant list and the
tolerance rule, is `drafts/0.3.0/DESIGN.md`, committed before this
generator. The level is a draft: the released harness does not run it.

## What `build.py` does

- `longitude(body, tt)` is the apparent geocentric longitude in the IAU
  2006/2000A true ecliptic and equinox of date, reduced from DE440s the way
  `arbiters/l1/validate.py` reduces it (TDB from `erfa.dtdb`; light time
  iterated; deflection by the Sun, `erfa.ld`; annual aberration, `erfa.ab`;
  `erfa.pnm06a` and R1 by `erfa.obl06` plus the nutation in obliquity of
  `erfa.nut06a`), here on arrays of instants. Mars to Pluto are the system
  barycentres (NAIF 4 to 9), as in L1. At every solved instant the generator
  compares it with `validate.py`'s own `apparent()`, which it imports, and
  stops beyond 0.01 mas.
- A daily table of each quantity (a body's longitude, or the Moon's minus
  the Sun's) from 1859-12-01 to 2150-01-20 TT shows where to look: a day
  where the quantity crosses a level, or where its motion turns, widened by
  two days either side. There the quantity is sampled at 1 hour steps from
  the window's start, and each crossing (or, for a station, each sign
  change of the rate (L(t + 1 h) - L(t - 1 h)) / 2 h) is solved by bisection
  to 1 ms.
- Each window ends midway to the next time the same thing happens, or at
  2150-01-01 TT, and the generator checks it holds exactly one event.
- Tolerances follow DESIGN.md from the longitudes an hour before, at and an
  hour after the instant, which are recorded in `sources/l4/solutions.json`.
- Check (a) repeats every solve on a half hour grid a quarter hour off the
  hourly one. The property check (every ingress lies on opposite sides of its
  target at t - tolerance and t + tolerance, within 1.5") runs on every
  build. Vector 141 must solve within 1 s of the independent `de440.bsp`
  reduction in `docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json`.

It never imports or calls the engine.

## Running it

```sh
python3 conformance/arbiters/l4/build.py --kernel path/to/de440s.bsp           # writes
python3 conformance/arbiters/l4/build.py --kernel path/to/de440s.bsp --check   # rebuilds in memory, compares
python3 conformance/arbiters/l4/build.py --verify-sources                      # sources/l4 against SHA256SUMS
python3 conformance/arbiters/l4/test_build.py                                  # checks that need no kernel
```

The kernel is not committed. Get it from
`https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp`;
`build.py` refuses it unless its SHA-256 is
`c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2` (the digest
`validate.py` pins). The committed files were built with Python 3.13.18,
numpy 2.4.6, pyerfa 2.0.1.5 (ERFA 2.0.1) and jplephem 2.24, in about five
minutes; `--check` takes as long. `--check` first checks every file in
`sources/l4/` against `SHA256SUMS` (one changed byte fails it), then rebuilds
`L4-events.json`, `solutions.json`, `horizons-requests.txt` and `SHA256SUMS`
in memory and compares them byte for byte.

## The Horizons cross-check (check b)

`sources/l4/horizons-requests.txt` lists the JPL Horizons requests the
cross-check needs, one URL a line: observer quantity 31 at each solved
instant and an hour either side, batched per target with TLIST (for a
lunation, both the Moon and the Sun). The list is made from every solved
event before check (b) drops any, so it stays the list that was sent.

The repository's download job fetched them on 2026-11-17 (Horizons API 1.2,
DE441, EOP file eop.261116.p270212). Its answers are committed verbatim in
`sources/l4/horizons/`: `request-NN.txt` answers line NN of the request list,
and where a request failed (07 and 11 returned HTTP 502) it was fetched again
in two halves, `request-NNa.txt` and `request-NNb.txt`, whose TLISTs join to
give that line's TLIST exactly. `sources/l4/horizons-provenance.tsv` records,
for each fetch, the URL, size, SHA-256, retrieval time (UTC), HTTP status and
the job that fetched it, copied from the job's manifests; the failed fetches
are listed too.

`build.py` reads these files without the network and treats them as data:
each banner must name DE441, the geocentre, no refraction and TT, and every
row must parse. Before checking any event it compares each saved response
with its provenance row (digest and size) and each request line with the
responses that answer it, and stops if anything differs. It then checks every
event, drops any that fails with its reason, keeps each event's own figure
under `horizons` in `solutions.json`, and states the agreement in the vector
file's `uncertainty`. Every file in `sources/l4/` is listed in `SHA256SUMS`.

Horizons gives quantity 31 in the IAU 1976/1980 frame, while the arbiter uses
IAU 2006/2000A, so the two part slowly away from J2000; the limit of 0.45
arcsec for an ingress or a lunation allows for that over 1860 to 2149. For a
station the check is the station Horizons' own longitudes imply (rate over
acceleration, from the three samples), which must lie within the vector's
tolerance.
