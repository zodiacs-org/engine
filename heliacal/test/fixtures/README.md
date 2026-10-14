# Geometry and phase references

`geometry-reference.json` contains independent coordinate examples for the
geometry tests. The selected instant and observing site are synthetic. No
expectation comes from this project's output or from Swiss Ephemeris.
Tests read the committed fixture without network access.

## NASA/JPL Horizons

The Sun and Moon rows were fetched from the public NASA/JPL Solar System
Dynamics [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) on
the retrieval date recorded in the fixture. Each row records the exact
request parameters and URL. Repeating a URL reproduces the request, but
the service can update its ephemeris or Earth-orientation data. Inspect
those changes before replacing an expectation. The fixture preserves the
returned API version, ephemeris name and Earth-orientation filename.

These are numerical ephemeris facts from NASA/JPL, consistent with the
repository's use of public Horizons numerical fixtures described in
`../../../LICENSING.md`. No ephemeris file, provider program or provider
prose is redistributed. Original fixture metadata and this documentation
are under the repository's MIT licence. Attribution belongs to the Solar
System Dynamics Group, Jet Propulsion Laboratory, California Institute of
Technology / NASA; the repository's licence does not claim ownership of
their numerical results.

The fixture uses observer quantities 2, 4, 20, 23 and 31, whose definitions
are in the [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html).
The corresponding fields are apparent right ascension and declination,
airless azimuth and elevation, range, Sun-observer-target separation, and
apparent ecliptic longitude and latitude. The fixture retains distance,
but does not retain range rate. The height in `SITE_COORD` is in kilometres;
the library observer uses metres. Both use zero height in this example.

Horizons uses its EOP-corrected IAU76/80 apparent equator and equinox of
date, and its IAU76/80 ecliptic of date. The engine uses IAU2006 precession
and IAU2000B nutation. Horizons includes gravitational deflection; the
engine omits it. The engine's geocentric Moon deliberately omits light
time and aberration, while its topocentric calculation uses retarded
positions. These are comparisons with stated convention differences.
No atmospheric refraction, local terrain or deflection of the vertical is
part of the reference comparison.

The direction, separation and distance tolerances are recorded in the
fixture and were selected before running the implementation comparison.
Their basis is the existing apparent-position and relative-distance
measurements in `../../../src/calc-bounds.ts`, whose generating evidence
and span are named there. The gates allow for the source and engine
convention differences; the separation gate also allows for the source's
printed precision. They are acceptance gates for the selected examples,
not accuracy bounds over other dates or sites. Compare coordinate
directions by great-circle distance, since a raw azimuth difference is
ill-conditioned near the zenith or nadir.

The engine's sky solver uses a WGS84 observer subtracted from a geocentric
apparent vector at reception. Its calculation entry uses an IERS2003
observer and topocentric apparent correction. Consequently a sky-event
altitude and a horizontal altitude derived from the calculation entry
need not be identical. The fixture checks the calculation entry's
geometry; it does not redefine the sky solver's horizon.

## Phase references

`phase-reference.json` records independently fetched Horizons observer
examples for the Moon and visible planets at its stated instant. It uses
the same synthetic instant and site as the geometry fixture, which supplies
the Sun's longitude for each origin. `phase-reference.test.ts` subtracts
that Sun longitude from the target's reference longitude to check the
signed synodic angle. The expectation is derived from Horizons coordinates,
not from this library's result.

The phase requests include quantities 10, 23, 24, 31 and 43. The retained
fields are the illuminated disk percentage (`Illu%`), apparent angular
elongation (`S-O-T`), apparent ecliptic longitude, and true phase (`phi`,
quantity 43). Quantity 24 (`S-T-O`) has an additional down-leg stellar
aberration contribution and is not the retained phase expectation. The
fixture preserves each target's own ephemeris source, as these are not all
DE441. The attribution and numerical-fact provenance described above for
NASA/JPL apply to this fixture too.

Horizons' true phase uses retarded geometry. The library computes disk
illumination from simultaneous geometric positions, independently of its
apparent elongation and longitude. The predeclared fixture gates allow
for that distinction, source rounding and the engine's existing coordinate
errors. They are sample acceptance gates, not a measured prediction error
over a date range. No eclipse, atmospheric extinction or observer visibility
is tested by these examples. No network request runs during the tests.

The pure geometry tests use exact triangle identities and independently
evaluated law-of-cosines arithmetic. Those test the implementation of the
published disk-fraction definition cited in `../../SOURCES.md`; they do not
validate ephemeris accuracy. Tests comparing receipts and positions with
direct engine calls are integration checks only.

## ERFA horizontal transformation

The fixture transcribes the input and expected numerical constants in
`t_hd2ae` of the [ERFA validation program, release
v2.0.1](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/t_erfa_c.c).
Its locator, original tolerances and our degree-input comparison gate
are recorded in the fixture. The latter allows for conversion between
radians and degrees. The function's [published
definition](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/hd2ae.c)
specifies azimuth measured from north toward east, and altitude relative
to the adopted zenith. This is a coordinate-transform example, not an
ephemeris or visibility observation.

ERFA is a library derived from SOFA, rather than SOFA itself. No ERFA
implementation is copied into the library. The copyright, conditions
and disclaimer accompanying the transcribed test constants are retained
below.

Copyright (C) 2013-2023, NumFOCUS Foundation.
All rights reserved.

This library is derived, with permission, from the International
Astronomical Union's "Standards of Fundamental Astronomy" library,
available from http://www.iausofa.org.

The ERFA version is intended to retain identical functionality to
the SOFA library, but made distinct through different function and
file names, as set out in the SOFA license conditions. The SOFA
original has a role as a reference standard for the IAU and IERS,
and consequently redistribution is permitted only in its unaltered
state. The ERFA version is not subject to this restriction and
therefore can be included in distributions which do not support the
concept of "read only" software.

Although the intent is to replicate the SOFA API (other than
replacement of prefix names) and results (with the exception of
bugs; any that are discovered will be fixed), SOFA is not
responsible for any errors found in this version of the library.

If you wish to acknowledge the SOFA heritage, please acknowledge
that you are using a library derived from SOFA, rather than SOFA
itself.

TERMS AND CONDITIONS

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in
   the documentation and/or other materials provided with the
   distribution.
3. Neither the name of the Standards Of Fundamental Astronomy Board,
   the International Astronomical Union nor the names of its
   contributors may be used to endorse or promote products derived
   from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
