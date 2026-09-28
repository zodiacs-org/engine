# L1 arbiter: Horizons DE441 in the IAU 2006/2000A true ecliptic of date

The expected values in `vectors/L1-positions.json` (240 cases: 24 instants from
1851 to 2148, ten bodies) are NASA JPL Horizons's apparent geocentric ecliptic
longitude and latitude of date, all from DE441 (QUANTITIES 31, airless, fetched
on 2026-09-22 and kept verbatim in `sources/horizons-24/`), with Mars to Pluto
as system barycentres (NAIF 4 to 9). Horizons gives them in its IAU 1976/1980
frame. `build.py` carries each direction out of the `eopJpl` model of that frame
from the horizons-frame study (IAU 1976 precession without frame bias, IAU 1980
nutation plus the per-instant pole offsets in `frame-offsets.json`) and into the
IAU 2006/2000A true ecliptic and equinox of date with pyerfa. It reads
Horizons's body-centre files for Mars to Pluto only to measure body centre minus
barycentre. That difference is at most 0.084″ for Mars, Jupiter, Saturn and
Pluto, which their satellites explain. The Uranus and Neptune body centres
(satellite solutions `ura184_merged`, `nep098_merged`) depart from DE441's
barycentres by up to 0.67″ and 0.11″, which is why the suite uses barycentres.
To regenerate, run `python3 conformance/arbiters/l1/build.py` with a Python 3
that has pyerfa and numpy (these vectors were built with Python 3.11.15,
pyerfa 2.0.1.5 on ERFA 2.0.1, and numpy 2.4.6). The script reads only
`sources/horizons-24/`, writes the same bytes on every run, and stops if it no
longer reproduces the study's frame terms to within 0.0005″.

`validate.py` is an independent check, not the arbiter. Run
`python3 conformance/arbiters/l1/validate.py path/to/de440s.bsp` (it also needs
jplephem; the kernel's sha256 is `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`).
It reduces all 240 cases from DE440s (light-time, solar deflection, annual
aberration, `pnm06a`, true obliquity), taking Mars to Pluto as barycentres as
the vectors do, compares them with the expected values, and writes statistics
to `validation.json`. The median difference is 1.27 mas in longitude, and
latitude differs by at most 0.95 mas. For the nine bodies other than the Moon,
what is left is a rotation shared by all bodies at each instant, the frame
model's remainder, at most 2.82 mas. The Moon differs by up to 12.63 mas at
1851, which is the lunar difference between DE440 and DE441. `validate.py`
exits with status 1 if the arbiter's uncertainty text no longer quotes these
numbers.
