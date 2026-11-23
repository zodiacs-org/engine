astronomia 4.3.0 uses the VSOP87B series exported by `astronomia/data`.
[Engine licence (MIT)](https://github.com/commenthol/astronomia/blob/v4.3.0/LICENSE).

For L1 the adapter calls `solar.apparentVSOP87` for the Sun and
`elliptic.position` for Mercury through Neptune. The latter returns apparent
equatorial coordinates. The engine's `Equatorial.toEcliptic` converts them
using its true obliquity of date (`moon.Moon.ε`). Of 192 positions answered,
176 pass. Five Uranus and 11 Neptune positions exceed 1 arcsecond.
The lunar position routine gives the mean equinox of date and Pluto's
astrometric routine gives J2000. Those 48 inputs are unsupported, including
the Moon in 1851 (`L1-POS-0002`).

For L3, `deltat.deltaT` takes the decimal year from `julian.Calendar`.
The Gregorian and Julian calendar functions convert civil noon to JDN and
back in the requested proleptic calendar. All 15 Delta T and 35 calendar
vectors pass. The adapter measures positions and time/calendar conversions.
