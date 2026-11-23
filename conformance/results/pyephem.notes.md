PyEphem 4.2.1 (Python package `ephem`) includes XEphem/libastro's built-in
planetary and lunar theories, including VSOP87. [Engine licence (MIT)](https://github.com/brandon-rhodes/pyephem/blob/4.2.1/LICENSE).

For L1, PyEphem supplies apparent geocentric right ascension and declination.
Its public `Ecliptic` conversion uses mean obliquity. Every L1 vector requires
true obliquity of date, including the Moon in 1851 (`L1-POS-0002`).
These positions are `unsupported`. PyEphem's new and full Moon searches use
the same conversion for the longitudes that define a lunation.
[Coordinate conversion](https://github.com/brandon-rhodes/pyephem/blob/4.2.1/libastro/eq_ecl.c)
and [Moon phase calculation](https://github.com/brandon-rhodes/pyephem/blob/4.2.1/ephem/__init__.py#L229-L245).

For L3, `ephem.delta_t` reads the supplied UT1 Julian date in PyEphem's
day count. Of 15 measurements, 13 pass and two exceed the 0.1 s tolerance.
The 2019 and 2023 residuals are +0.209 s and +2.312 s. The other kinds lack
a matching public function or calendar convention.
