# Conformance suite: format and protocol (v0)

This file fixes the format of the vectors and the protocol an engine's
adapter speaks. `README.md` says what the suite is for and how to run it.

## Rules every vector obeys

1. It names its **arbiter**: the independent source or computation that
   decides the expected value. Arbiters are listed once per vector file and
   referred to by id.
2. It names its **tolerance**, per compared field, fixed before any engine
   was run against it.
3. **No vector uses Swiss Ephemeris as its arbiter.** Swiss Ephemeris
   (through pyswisseph) is run against the suite as an instrument, like any
   other engine. It may be used to *check* an arbiter's implementation, and
   such checks are reported as statistics only.
4. Inputs are synthetic: instants, places and calendar dates chosen by a
   stated design. No vector describes a real person's birth.
5. A vector never changes once released under a suite version. A correction
   gets a new id and the old one is withdrawn in `DISCREPANCIES.md`.
6. From 0.2.0 it names its kind and its arbiter as ids of the conventions
   registry (`conventionIds`, below).

## Files

Each release has one file per level, and a released file never changes:

| release | files |
| --- | --- |
| 0.1.0 | `vectors/L1-positions.json`, `vectors/L2-houses-angles.json`, `vectors/L3-time-calendars.json` |
| 0.2.0 | the same names under `vectors/0.2.0/` |
| 0.3.0 | the same names under `vectors/0.3.0/`, and `vectors/0.3.0/L4-events.json` |

0.2.0 holds 0.1.0's vectors unchanged, each with its `conventionIds`; nothing
else in a file differs but `suiteVersion`. 0.3.0 holds 0.2.0's three files
with nothing changed but `suiteVersion`, and adds level L4, event times
(`drafts/0.3.0/DESIGN.md`, fixed before any engine ran), whose vectors carry
their `conventionIds` from the start. The generators of L1 to L3 write every
release from one document (`arbiters/release.py`), and L4's generator
(`arbiters/l4/build.py`) writes its file; `harness/validate.mjs` checks every
release, the identities, and each file's SHA-256 against the one it was
released with (`RELEASE_DIGESTS` in `harness/lib.mjs`); and the harness runs
the latest. Each file:

```json
{
  "suite": "zodiacs-conformance",
  "suiteVersion": "0.3.0",
  "level": "L1",
  "title": "Positions",
  "arbiters": {
    "<arbiter-id>": {
      "name": "human-readable name",
      "source": "what it is and where it comes from (URLs, versions)",
      "inputs": [{ "path": "sources/…", "sha256": "…" }, { "url": "https://…", "sha256": "…" }],
      "method": "what the generator did, in one paragraph",
      "generator": "arbiters/…/build.py",
      "uncertainty": "the arbiter's own uncertainty, and how it was measured"
    }
  },
  "dropped": [ /* optional, see below */ ],
  "vectors": [ /* see below */ ]
}
```

`dropped`, where present, lists the vectors the design called for that the
generator dropped by one of the design's stated rules, each as
`{ "id": "…", "what": "the event, in words", "reason": "the rule it failed" }`.
A dropped id is not a vector of the file and is not used again.

An input with a `path` is a file committed under `conformance/`, and
`harness/validate.mjs` checks its digest. An input with a `url` is a
published file that is not committed (for example a time zone database
release); its generator downloads it and refuses it if the digest differs.

Each vector:

```json
{
  "id": "L1-POS-0001",
  "kind": "position.apparent.ecliptic-true-of-date",
  "input": { "body": "Mars", "jd_tt": 2451545.0 },
  "expected": { "lon": 123.4567891, "lat": -1.2345678 },
  "tolerance": {
    "lon": { "abs": 1, "unit": "arcsec", "wrap": 360 },
    "lat": { "abs": 1, "unit": "arcsec" }
  },
  "arbiter": "<arbiter-id>",
  "conventionIds": ["arbiter:<arbiter-id>", "kind:position.apparent.ecliptic-true-of-date"],
  "note": "optional, one sentence",
  "tags": ["optional-tag"]
}
```

- `id`: `L<level>-<KIND-TAG>-<four digits>`, unique across the suite.
- Angles are degrees. Longitudes are in [0, 360). Latitudes and
  declinations are in [−90, 90]. Geographic longitude is east-positive.
- Julian dates are numbers (double precision). `jd_tt` is Terrestrial
  Time, `jd_ut1` is UT1. Civil times are strings `YYYY-MM-DDTHH:MM:SS`
  (no zone suffix) and UTC instants are strings ending in `Z`.
- Years are astronomical (year 0 = 1 BC).
- `tags`, where present, groups vectors that test the same question, for
  example `backzone-history` for time zone cases where tzdb's `backzone`
  history differs from its default build. Results are counted per tag as
  well as per kind.
- `conventionIds`, from 0.2.0: the vector's arbiter and kind as ids of the
  Zodiacs conventions registry (zodiacs.org/developers/conventions, CC0
  1.0), `arbiter:<arbiter-id>` and `kind:<kind>`, sorted by UTF-16 code unit
  (for these ASCII ids the same as by code point). An id is a
  namespace, a colon and a value, the value being everything after the
  first colon; its address is
  `https://zodiacs.org/developers/conventions/#` followed by the id through
  `encodeURI`. The adapter is not sent them.

### Tolerance

Each key of `tolerance` names a key of `expected`.

| form | passes when |
| --- | --- |
| `{ "abs": a, "unit": "arcsec" }` | \|actual − expected\| × 3600 ≤ a |
| `{ "abs": a, "unit": "deg" }` | \|actual − expected\| ≤ a |
| `{ "abs": a, "unit": "s" }` | \|actual − expected\| ≤ a (seconds) |
| `"wrap": 360` added | the difference is taken on the circle, in (−180, 180] |
| `{ "exact": true }` | actual equals expected exactly (JSON equality) |
| `{ "each": { … } }` | for an array: same length, and each element passes the inner rule |

Every key of `expected` has a `tolerance` entry; the validator refuses a
vector without one.

L4's tolerances follow one rule, from `drafts/0.3.0/DESIGN.md`: the time
the quantity takes to move 1″ at that event, in whole seconds, from the
arbiter's samples one hour either side of the solved instant t.

- Ingress and lunation: `max(1 s, 1″ / |rate|)`, rounded up to a whole
  second, with rate = (L(t + 1 h) − L(t − 1 h)) / 7200 s in arcseconds per
  second. For a lunation, L is the Moon's longitude minus the Sun's.
- Station: `max(60 s, sqrt(2 × 1″ / |acceleration|))`, rounded up to a
  whole second, with acceleration = (L(t + 1 h) − 2 L(t) + L(t − 1 h)) /
  (3600 s)², the time the longitude takes to leave its turning value by 1″.
- A station's `direction` is compared exactly.

### Status results

Where the correct answer is that no value exists, `expected` is
`{ "status": "undefined" }` and `tolerance` is
`{ "status": { "exact": true } }`. For house cusps that means the system's
defining construction has no solution for some cusp at that time and place,
or gives cusps out of zodiacal order; each such vector's arbiter text says
which. An engine passes by refusing the system or by reporting that it
substituted another. Time zone vectors use `status` values `ok`, `ambiguous`
(the local time occurs twice) and `nonexistent` (it is skipped).

## Kinds

| kind | input | expected |
| --- | --- | --- |
| `position.apparent.ecliptic-true-of-date` | `body`, `jd_tt` | `lon`, `lat` |
| `angles.asc-mc` | `jd_ut1`, `lat`, `lon` | `asc`, `mc` |
| `angles.vertex-east-point` | `jd_ut1`, `lat`, `lon` | `vertex`, `east_point` |
| `houses.cusps` | `jd_ut1`, `lat`, `lon`, `system` | `cusps` (12 longitudes, cusp 1 first) or `status` |
| `time.zone-offset` | `zone`, `local` | `status`, and `utc_offset_s` (ok) or `utc_offsets_s` (ambiguous, earlier instant first) |
| `time.local-mean-time` | `lon` | `utc_offset_s` |
| `time.tt-minus-utc` | `utc` | `tt_minus_utc_s` |
| `time.delta-t` | `jd_ut1` | `delta_t_s` (TT − UT1) |
| `calendar.to-jdn` | `calendar`, `year`, `month`, `day` | `jdn` |
| `calendar.from-jdn` | `calendar`, `jdn` | `year`, `month`, `day` |
| `event.ingress` | `body`, `longitude_deg`, and `after_tt_s`, `before_tt_s` or `after_utc_s`, `before_utc_s` | `tt_s` or `utc_s`, on the scale of the window |
| `event.station` | `body`, `after_tt_s`, `before_tt_s` | `tt_s`, `direction` |
| `event.lunation` | `phase_deg`, and `after_tt_s`, `before_tt_s` or `after_utc_s`, `before_utc_s` | `tt_s` or `utc_s`, on the scale of the window |

`body` is one of `Sun`, `Moon`, `Mercury`, `Venus`, `Mars`, `Jupiter`,
`Saturn`, `Uranus`, `Neptune`, `Pluto`. `system` is one of `placidus`,
`koch`, `regiomontanus`, `campanus`, `porphyry`, `alcabitius`, `equal`,
`whole-sign`, `morinus`, `meridian`, `topocentric`, `vehlow`, `equal-mc`.
`calendar` is `gregorian` or `julian` (both proleptic). In L4,
`longitude_deg` is a multiple of 30 in [0, 360), `phase_deg` is 0 (new Moon)
or 180 (full Moon), and `direction` is `retrograde` or `direct`. The L4
vectors that take their window in UTC carry the tag `utc-input`.

Some vectors carry optional extra input keys: `jd_tt` beside `jd_ut1` in
L2, and `utc` beside `jd_ut1` in `time.delta-t`. They record what the
arbiter used; an adapter may ignore them.

Definitions:

- **Bodies.** The Sun, Moon, Mercury and Venus are the bodies themselves.
  Mars to Pluto are their system barycentres (NAIF 4 to 9), which differ from
  the planets' centres by at most 0.084″ over the L1 instants.
- **Positions.** Apparent geocentric positions: light time, gravitational
  deflection by the Sun and annual aberration applied, referred to the true
  equator and equinox of date (IAU 2006 precession, IAU 2000A nutation) and
  rotated to the ecliptic of date by the true obliquity.
- **Vertex and east point.** The vertex is the western intersection of the
  ecliptic with the prime vertical. The east point is the point of the
  ecliptic whose right ascension is the local sidereal time plus 90°.
- **UTC offsets.** `utc_offset_s` is local time minus UTC, in seconds,
  positive east of Greenwich.
- **Julian Day Numbers.** `jdn` is the integer Julian Day Number of the
  civil day, the Julian date at its noon.
- **ΔT.** `delta_t_s` is TT − UT1 in seconds. `tt_minus_utc_s` is TT − UTC,
  which is 32.184 s plus TAI − UTC.
- **Event instants.** `tt_s` is seconds of TT from 2000-01-01T12:00:00 TT,
  that is (JD(TT) − 2451545.0) × 86400. `utc_s` is seconds of UTC from
  2000-01-01T12:00:00 UTC, counted the same way on the UTC calendar, a day
  being 86400 s; no leap second falls inside any L4 window. For the L4
  vectors in UTC, the UTC instant is the TT instant minus 69.184 s
  (TAI − UTC of 37 s, as from 2017-01-01, plus TT − TAI of 32.184 s): that
  is how `utc_s` is defined for them, not a prediction of leap seconds.
- **Event windows.** The window is (`after`, `before`], open at `after` and
  closed at `before`, and holds exactly one event of the vector's kind.
- **Ingress.** The instant in the window at which the body's longitude (as
  in **Positions**, the ecliptic longitude of date) equals `longitude_deg`,
  in either direction of motion.
- **Station.** The instant in the window at which the rate of the body's
  longitude is zero: `retrograde` when the rate turns from positive to
  negative, `direct` when it turns from negative to positive.
- **Lunation.** The instant in the window at which the Moon's longitude
  minus the Sun's, reduced to [0, 360), equals `phase_deg`.

## Adapter protocol

An adapter is any program that reads requests on standard input and writes
responses on standard output, one JSON object per line (UTF-8, `\n`).

1. On start, before reading anything, it writes one line:
   `{"adapter": {"name": "...", "version": "...", "engine": "...", "engineVersion": "...", "configuration": { … }}}`.
2. For each request line `{"id": "...", "kind": "...", "input": { … }}` it
   writes exactly one response line, in order:
   - `{"id": "...", "output": { … }}` with the keys of `expected`;
   - or `{"id": "...", "unsupported": "reason"}` when the engine has no way
     to answer that kind or input;
   - or `{"id": "...", "error": "message"}` when it tried and failed.
   Any response may carry `"meta": { … }` (for example flags the engine
   returned). The harness records it.
3. At end of input it exits with status 0.

The harness (`harness/run.mjs`) sends every vector, compares each output
with the vector's tolerance, and writes a results file. A vector's verdict
is `pass`, `fail`, `unsupported` or `error`.
