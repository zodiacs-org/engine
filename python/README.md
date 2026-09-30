# zodiacs for Python

A local Python API and command line tool for tropical planetary positions,
natal charts, transits, synastry, Moon phase, chart points, declinations,
and secondary progressions. This is an **alpha preview**, with an API that
may change. It wraps the unchanged `@zodiacs/engine` **0.1.1-rc.14** release
archive and its pinned `astronomy-engine` **2.1.19** dependency.

## Install

Install **Python 3.10+** and **Node.js 22.7+** (Node 24 LTS recommended).
Node 20.19+ within the 20.x series is also supported. Node must be on PATH;
it is a separate prerequisite, not installed by pip.

```sh
python -m pip install zodiacs==0.1.0a1
zodiacs positions --utc 2000-01-01T12:00:00Z
zodiacs natal-chart --utc 2000-01-01T12:00:00Z --latitude 40 --longitude -74
python -m zodiacs moon-phase --utc 2000-01-01T12:00:00Z
```

## Python API

The following birth input is synthetic:

```python
from datetime import datetime, timezone
from zodiacs import natal_chart, positions, transits

birth = {
    "utc": "2000-01-01T12:00:00Z",
    "latitude": 40.0,
    "longitude": -74.0,
    "houseSystem": "whole",
}
chart = natal_chart(birth)
print(chart["bodies"])
print(positions(datetime(2020, 1, 1, tzinfo=timezone.utc)))
print(transits(birth, "2020-01-01T00:00:00Z"))
```

Functions return ordinary Python lists and dictionaries. Output field names
retain the engine's camelCase spelling; instants in results are ISO strings.
Longitudes, latitudes, house cusps, and angles are degrees; speeds are degrees
per day. Longitude is east-positive. Set `timeKnown=False` when the supplied
instant is only a reference for an unknown birth time. That suppresses houses
and angles; it does not choose a noon convention for you.

| Function | Arguments |
| --- | --- |
| `positions`, `moon_phase` | timestamp |
| `natal_chart`, `chart_points`, `chart_declinations` | birth mapping |
| `transits` | birth mapping, target timestamp |
| `synastry` | two birth mappings |
| `progressed_bodies`, `progressed_instant` | birth timestamp, target timestamp |

Birth mappings accept `utc`, `latitude`, `longitude`, `houseSystem`,
`timeKnown`, `flags`, and `deltaT`. Unknown keys are rejected. A previously
computed chart is not a birth mapping: pass its `input` field instead.
Timestamps must be timezone-aware Python datetimes or ISO strings with
seconds and an explicit timezone, such as `2000-01-01T12:00:00Z` or
`2000-01-01T13:00:00+01:00`. Naive datetimes, date-only strings, leap-second
spellings, invalid calendar dates, numeric timestamps, and submillisecond
precision are rejected. Resolve local wall times and daylight-saving ambiguity
before calling the API.

For a custom Node executable or timeout:

```python
from zodiacs import Engine

engine = Engine(node="/path/to/node", timeout=30)
result = engine.moon_phase("2000-01-01T12:00:00Z")
```

`ValueError` indicates Python-side input validation; `ZodiacsError` indicates
an unavailable runtime, timeout, or rejected calculation. Engine failures use
a generic message so chart inputs are not echoed into error logs.

## Runtime and limitations

Calculations are local and make no network requests. The wheel contains both
npm archives; no npm installation is required. On first use in each Python
process, archive digests are checked and files are materialized in a private
temporary directory, removed on normal process exit. Each call launches a
Node subprocess, so this preview favors simplicity over batch throughput.
The temporary directory must be writable and Node must be executable.

This preview deliberately uses rc.14, the baseline identified for first
publication in the repository's contribution guide, rather than the rc.15
expansion still marked under review. It does not expose the newer time-basis,
historical-zone, Hellenistic, or Vedic APIs. In rc.14, instants labeled `utc`
are treated as UT1, with TT derived from the engine's Delta T model (or the
birth mapping's pinned `deltaT`, in seconds). It does not correct UTC to UT1
using IERS Earth-rotation observations. The inherited Delta T model has a
known step at 1941.0. See the exact bundled archive's README, CHANGELOG,
LICENSING.md and NOTICE for calculation conventions and limitations.

The Python tests check transport parity and packaging, not independent
astronomical accuracy. The repository's independent conformance reports are
version-specific; results for newer engine candidates do not describe this
wrapper's bundled candidate.

## Maintainers

From the repository root:

```sh
python python/tools/verify_vendor.py
python -m pip install build twine
python -m build python
python -m twine check python/dist/*
python -m pip install --force-reinstall python/dist/*.whl
python -m unittest discover -s python/tests -v
```

`python -m build` builds the wheel from its source distribution. The tests
must run against the installed wheel, without adding `python/src` to
PYTHONPATH. `.github/workflows/python.yml` tests the installed distribution
across supported Python and Node versions and operating systems.

After merging passing checks, manually dispatch `pypi.yml` on `main` with
the exact Python version. The workflow builds, validates and tests the
distributions before a separate `pypi` environment job publishes them using
PyPI trusted publishing. No API token is needed. PyPI release files cannot
be overwritten; every subsequent upload needs a new version.
The GitHub `pypi` environment must restrict deployment branches to `main`
and require the repository owner's approval for each publication.

## License and provenance

Python wrapper code is MIT. The distribution is `MIT AND CC-BY-4.0` because
the bundled engine includes attributed Delta T data. All original notices
remain inside the unchanged npm archives, and `THIRD_PARTY_NOTICES.md`
summarizes them. `_vendor/manifest.json` records the source URLs, engine
source commit and archive digests. `tools/verify_vendor.py` checks those
archives against the repository's immutable artifact and dependency lock.
The current repository's [licensing record](https://github.com/zodiacs-org/engine/blob/main/LICENSING.md)
also records an unresolved redistribution-terms question for IERS C04 data
underlying some inherited Delta T values. Bundling rc.14 does not resolve
that upstream question.
