# Geometric test derivations

The expectations in tests/engine.fixedstars.ts are constructed from basis vectors
and spherical geometry, not previous outputs of this library or the engine.
Their numerical comparison uses Vitest toBeCloseTo with precision 12, solely
as a floating-point check of these constructed cases at the J2000 epoch and
the synthetic obliquity specified below. It is not a physical accuracy claim.

At J2000 the rotation from the J2000 mean equator and equinox to itself is
the identity. Therefore its three Cartesian unit vectors remain unchanged.
The mean ecliptic at that epoch is obtained by rotating about the x axis
through the obliquity. Its coordinates are:

```text
x' = x
y' = cos(epsilon) y + sin(epsilon) z
z' = -sin(epsilon) y + cos(epsilon) z
```

Substituting each Cartesian basis vector gives the expected columns tested
against eclipticRows. The J2000 IAU 2006 obliquity is 84381.406 arcseconds,
as documented and attributed in the parent LICENSING.md, Calculation entry
values, to Capitaine, Wallace and Chapront, A&A 412, 567-586 (2003), adopted
by IAU 2006 Resolution B1. No engine output supplies that test constant.

For a deliberately synthetic obliquity of 30 degrees, the inverse rotation
takes an ecliptic point of latitude zero at longitude 0 or 180 degrees
onto the equatorial x axis: its declination is zero and right ascension
equals its longitude. At longitude 90 or 270 degrees it is on the positive
or negative ecliptic y axis. Its declination is respectively +30 or -30
degrees and its right ascension remains 90 or 270 degrees.

An ecliptic point at longitude 90 degrees and latitude 60 degrees has
vector (0, sin(30 degrees), cos(30 degrees)). The inverse rotation by
30 degrees yields (0, 0, 1). Its declination is 90 degrees and right
ascension is undefined. The tests ask for the engine's documented null RA
in this case, rather than assigning a longitude to the pole.

The invented chart's natal-receipt round trip, missing-time behavior, and
the body sky call's sample-budget refusal are integration checks. No saved
body longitude, stellar position, or event time is treated as an independent
reference.
