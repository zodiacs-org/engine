# M3 astrometry reference preregistration

These criteria were written on 2026-10-15 before this project's stellar
implementation was compared with the reference. Failed criteria require a
recorded discrepancy, not an increased tolerance fitted to its output.
This checks reduction algorithms, not the accuracy of historical SAO
positions, occultation contact times or catalogue completeness.

`erfa-published.json` transcribes the published numerical inputs and expected
values in [ERFA's versioned validation file](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/t_erfa_c.c).
Its source receipt pins the entire upstream file. The fixture copies no ERFA
implementation. The fixture's BSD licence notice is retained alongside it.
All examples concern stellar coordinates or invented vectors, with no birth
data. Normal offline Vitest tests must enforce these source assertions:

- FK5-to-Hipparcos rotation matrix elements: maximum absolute error `1e-14`;
  spin components: `1e-17` radians per Julian year. These adopt the published
  diagonal-matrix and spin tolerances. Off-diagonal matrix elements use the
  diagonal tolerance here; this change is explicit and predates comparison.
- Proper motion, perspective motion and parallax: maximum angular error
  `1e-6` arcseconds against the published `t_pmpx` vector.
- Relativistic aberration: maximum angular error `1e-6` arcseconds against
  `t_ab`. ERFA's output includes a solar-potential term absent here. The
  [ERFA aberration documentation](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/ab.c)
  estimates that term's maximum at about `0.4` microarcseconds. This allowance
  concerns that documented model difference, not fitted package output.

`astrometry-cases.json` freezes additional synthetic directions and dates.
`scripts/astrometry-reference.py` calls separately installed PyERFA `2.0.1.5`
and NumPy `2.2.6` without importing the engine or this package. All generated
values go to ignored `.generated/astrometry-erfa.json`. The separate extended
validation command must generate these values and run its suite explicitly;
the ordinary offline suite must neither silently skip missing fixtures nor
pretend that it ran the extended comparison.

The additional tolerances, also frozen before comparison, are:

| Comparison | Maximum error |
| --- | ---: |
| Synthetic ICRS propagation against ERFA `pmpx` | `1e-6` arcseconds |
| Synthetic aberration against ERFA `ab`, solar potential suppressed | `1e-6` arcseconds |
| FK5 rotation/spin against ERFA `fk5hip`, propagated synthetic directions | `1e-6` arcseconds |
| Full geocentric apparent directions against ERFA Earth ephemeris and IAU 2006/2000A reduction | `0.1` arcseconds |

The full comparison uses selected SAO source rows as common inputs. Independent
reduction does not independently validate the catalogue measurements. Unknown
parallax and radial velocity are omitted in both reduction models and remain
unknown catalogue fields. The fixture must identify this assumption. The
full reduction tests cover every fixed date and selected star in the case
register, without deleting troublesome cases.

The reference uses TT in place of TDB in the Earth ephemeris and proper-motion
interval, with no gravitational light deflection. [ERFA `epv00`](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/epv00.c)
documents that TT is suitable for most uses and warns outside 1900 to 2100.
The boundary-date results must retain that warning; they are model comparisons,
not evidence that the reference attains its in-range precision there.
The engine uses IAU 2000B nutation; the independent chain uses
[IAU 2006/2000A](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/pnm06a.c).
The full-chain tolerance allows these frame and ephemeris differences. It is
an acceptance criterion on this corpus, not a universal bound.

The propagation reference is [ERFA `pmpx`](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/pmpx.c),
which cites the 1984 Astronomical Almanac, pages B39-B41, and Urban and
Seidelmann, *Explanatory Supplement to the Astronomical Almanac*, 2013,
section 7.2. Its inputs use unweighted RA rate and include the approximate
Roemer delay in the proper-motion interval. The frame reference is
[ERFA `fk5hip`](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/fk5hip.c),
which cites Mignard and Froeschle, A&A 354, 732-739 (2000). Its rotation and
spin model leaves FK5 zonal errors uncorrected. [ERFA `fk52h`](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/fk52h.c)
documents the same motion convention, but its finite-distance, relativistic
space-motion conversion is not used to invent missing SAO distances.

The ordinary suite uses the retained transcription; the full upstream
file is not committed. Run
`python3 scripts/astrometry-reference.py --verify-published-source` separately
to fetch the upstream file, verify its source receipt and check every retained
input and expected value against the published test. This explicit mode needs
only Python's standard library. Neither ordinary tests nor calculations make
a network request.

To prepare the optional independent reference generator, run these commands
from `occultations/`:

```sh
python3 -m pip install --target .cache/erfa --cache-dir .cache/pip pyerfa==2.0.1.5 numpy==2.2.6
python3 scripts/astrometry-reference.py
```

The generator discovers those ignored dependencies locally and verifies their
exact versions. An existing `.cache/erfa` Python virtual environment also
works. Its Python version must match the Python used to run the generator.
