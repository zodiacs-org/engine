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

## Catalog direction and proper-motion conversion

tests/catalog.fixedstars.mjs constructs angular-motion cases, using ordinary
Cartesian rotations rather than previously saved catalog positions. The
identity and quarter-turn comparisons use precision 12 in toBeCloseTo.
The first-order bias case uses precision 10. These are floating-point and
construction checks for the explicit inputs below, not measured sky accuracy.

For right ascension alpha and declination delta, the unit direction and its
unit tangent bases are:

```text
u = (cos(delta) cos(alpha), cos(delta) sin(alpha), sin(delta))
east = (-sin(alpha), cos(alpha), 0)
north = (-sin(delta) cos(alpha), -sin(delta) sin(alpha), cos(delta))
v = mu_alpha_star east + mu_delta north
```

The tangent vector v has units of milliarcseconds per Julian year. A rotation
R acts on both u and v. At the rotated direction, dot products with the new
east and north bases give the new tangential motion components. There is no
division by cos(delta): mu_alpha_star already includes it. At the constructed
declination of 60 degrees the unweighted RA rate would be twice that tangent
component; the identity test preserves the tangent component itself.

The identity maps RA 5 hours to 75 degrees, leaves declination 60 degrees
and motion (10, -20) unchanged. A positive quarter-turn about z adds 90
degrees to RA, producing 165 degrees, with the same declination and tangent
components. A positive quarter-turn about x leaves u = (1, 0, 0) unchanged;
it takes east = (0, 1, 0) into north and north = (0, 0, 1) into negative
east. Thus motion (3, 4) becomes (-4, 3), with magnitude 5 in either basis.
These exact constructed rotations also exercise the handedness of reprojection.

The real import uses transpose(frameMatrix("equatorial-icrs", time)) from
the existing engine, never a new bias or precession model. The matrix is
inertial; its TT epoch object is constructed at day zero. HYG's J2000 epoch
has already been applied by its provider, so no further epoch shift belongs
in this conversion. Missing either source motion component yields null for
the pair; explicit tabulated zeros remain available motion.

An independent first-order check follows IERS Conventions (2010), chapter 5,
equation 5.21, whose offsets and composition are cited in the parent
LICENSING.md, Calculation entry values. Define, in radians:

```text
a = -0.0146 arcseconds
b = -0.041775 arcseconds * sin(84381.448 arcseconds)
c = +0.0068192 arcseconds
R = R1(c) R2(b) R3(a)
R approximately equals [ 1  a -b; -a 1 c; b -c 1 ]
```

For source alpha = delta = 0, this gives u' approximately (1, -a, b), so
RA is approximately +0.0146 arcseconds and declination is approximately b.
For source tangent (0, 3, 4), the projected components are approximately
(3 + 4c, 4 - 3c). The test converts those published angular offsets into
radians or degrees directly. It checks the ICRS-to-J2000 direction and the
motion signs, allowing the omitted higher-order terms, without storing an
engine-produced reference matrix or catalog coordinate. This test derivation
does not replace the full engine rotation used by the importer.

Byte-for-byte regeneration of the catalog from its selected raw HYG records,
and matching source names, identifiers, epochs and lore locators, are separate
provenance checks. They are not independent accuracy evidence.
