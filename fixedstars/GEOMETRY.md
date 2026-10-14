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

## Motion from J2000 and true-of-date positions

tests/positions.fixedstars.ts uses the same u, east and north bases derived
above, with motion components converted from mas per Julian year to radians
per Julian year. A Julian year is 365.25 TT days, as recorded in
sources/manifest.json, astrometryImport.julianYearDays. The motion model is:

```text
years = ttDays / 365.25
v = (mu_alpha_star east + mu_delta north) * radians_per_mas
w = u + years v
direction = w / |w|
```

At RA = dec = 0, u = (1,0,0), east = (0,1,0), north = (0,0,1).
A synthetic east motion of one radian per year over one Julian year yields
w = (1,1,0), so the normalized direction is (1,1,0)/sqrt(2) and RA is
atan(1), not a full radian. Backward propagation gives (1,-1,0)/sqrt(2).
East and north motions of three and four radians per year give
(1,3,4)/sqrt(26). These deliberately exaggerated rates reveal the model and
are not assertions about any real star. They test linear tangent propagation,
not a constant angular-speed great-circle model.

At RA = 0, dec = 60 degrees, u = (1/2,0,sqrt(3)/2) and east = (0,1,0).
One radian of east tangent displacement gives
(1/2,1,sqrt(3)/2)/sqrt(2). Dividing that tangent displacement by cos(dec)
would instead double its y component and fail this expectation. At RA = 90,
dec = 0, east = (-1,0,0) and north = (0,0,1), so equal positive east and
negative north displacements produce (-1,1,-1)/sqrt(3).

The constructed TT reading 2000-12-31T18:00:00 is exactly one Julian year
after J2000, while 2001-01-01T18:00:00 is 366.25 days after it. The tests
enforce these calendar-arithmetic expectations and the normalized vector.
All these constructed motion-vector comparisons use toBeCloseTo precision
12. That precision concerns floating-point geometry only.

At J2000 the mean-equator precession is the identity. Given the engine's
nutation in longitude psi and true obliquity epsilon, a unit x direction
becomes (cos(psi),sin(psi),0) on the true ecliptic and
(cos(psi),sin(psi)cos(epsilon),sin(psi)sin(epsilon)) on the true equator.
The test derives these vectors algebraically and compares at precision 12.
Since the angles come from the engine, this is a rotation composition check,
not an independent nutation reference.

For an independent check, the tests read the existing committed parent
src/fixtures/nutation-erfa.json without copying or changing it. Its generator
is docs/evidence/nutation-2026-09-29/tools/erfa_fixtures.py, using pyerfa
2.0.1.5 and ERFA 2.0.1, with provenance recorded in the parent LICENSING.md.
For every TT epoch in that fixture across 1800 to 2200, the synthetic
Cartesian x, y and z directions are multiplied by its independently generated
eclipticOfDate matrix. Those ecliptic vectors are rotated onto the true
equator algebraically using the fixture's epsA + deps, not the engine's
obliquity. Reported RA/Dec and longitude/latitude are converted back to unit
vectors for comparison. Each Cartesian component must differ by less than
the fixture's predeclared rotationArcsec tolerance of 5e-6 arcseconds,
converted to radians. This checks these basis directions over the fixture's
epochs, not physical star accuracy, catalog errors or proper-motion errors.

Other tests compare the full catalog with engine eclipticOfDate and
eclipticToEquatorial at TT days -73000, 0 and 73000, using precision 11.
These are frame-consistency checks and do not establish independent accuracy.
Constructed pole tests apply inverse engine rotations to an exact true-frame
pole; the expected null coordinate is the pole's geometric singularity,
with signed latitude or declination compared at precision 10. Clock tests
compare synthetic natal chart records under UTC, UT1, TT and a pinned deltaT;
they are integration checks, without stored natal coordinates as references.

The direction model omits radial motion, stellar parallax, perspective
acceleration, annual aberration and gravitational deflection. Frame bias was
already applied at catalog import. The later motion and frame operations
apply neither another bias nor the original Hipparcos epoch shift.

## Pure contact geometry

tests/contacts.fixedstars.ts constructs coordinate rows directly. Its geometric
reference is the circle and signed declination, with exact equality assertions
for the binary-representable cases. These tests measure matching decisions
over the listed synthetic coordinates, not physical star accuracy. No saved
library or chart output supplies an expected coordinate or contact.

For normalized ecliptic longitudes a and b, let d be the absolute difference.
The projected conjunction orb is d if d is at most a half circle, otherwise
it is one full circle minus d. Thus longitudes 359.5 and 0.5 degrees have orb
1 degree in either order. Longitudes 270 and 0 degrees have orb 90 degrees;
0 and 180 degrees have orb 180 degrees. Equal longitudes have zero orb even
when their latitudes or declinations differ. This is a projected longitude
contact, not an angular separation on the celestial sphere.

For signed declinations a and b, the parallel orb is abs(a - b). Equal
declinations have zero orb regardless of RA or longitude, including at either
celestial pole. Declinations 30 and 31, or -30 and -31, differ by 1 degree.
Declinations 30 and -30 differ by 60 degrees, rather than matching as a
contraparallel. The two celestial poles differ by 180 degrees. A single pair
can have both a conjunction and a parallel; the README's constructed example
has both at 1 degree. Null longitude removes only the conjunction decision;
null target declination removes only the parallel decision.

The limit is inclusive on the exact values of the supplied binary64 numbers,
using the engine's existing expansion arithmetic. A limit of 1 includes 1,
includes 1 - 2^-53, and excludes 1 + 2^-52. Decimal notation can hide a
difference. In binary64, 1.1 is 2476979795053773 / 2^51 and 0.1 is
3602879701896397 / 2^55. Their exact difference is 1 + 3 * 2^-55, so it
falls outside a limit of 1 even though ordinary subtraction rounds to 1.
In contrast, 13.3 and 12.3 have the same fractional part at denominator
2^48 and differ by exactly 1.

For the wraparound case, the double written 359.7 is
6327909320176435 / 2^44, and 7.6999999999999895 is
8669429282688193 / 2^50. Subtracting the first from a full circle plus the
second gives (8 * 2^50 + 1) / 2^50, or 8 + 2^-50 degrees. It must be
excluded at a limit of 8. Adding the smallest positive subnormal, 2^-1074,
to the 1-degree arc from longitude 359 to zero likewise puts a contact just
outside a limit of 1. These cases require forming the difference and its
full-circle complement without intermediate rounding.

Ordering also uses exact differences. With target declination 1, stars at
declination 2^-1074 and 0 have orbs 1 - 2^-1074 and 1 respectively. Both
report orbDeg 1 after rounding, but the first must sort before the second,
even if its id sorts later. Exact ties use the documented id and kind order,
independently of input order and locale. Negative zero reports as zero.

The independent test oracle decodes IEEE 754 sign, exponent and fraction bits,
representing each finite double as an integer multiple of 2^-1074. It uses
BigInt subtraction, absolute value, and full-circle subtraction to decide
eligibility, without importing the engine exact-arithmetic functions. It checks
every pair in the explicitly enumerated longitude and declination lists at
limits 0, 1, 8, 90 and 180 degrees. The lists include quarter and half circles,
decimal boundaries, subnormals, both poles and wraparound neighbors. This is
an independent arithmetic check on that finite input set, not an astrometric
comparison or a claim that every binary64 combination has been checked.

## Natal target geometry and receipt assembly

tests/natal.fixedstars.ts constructs cardinal ecliptic body and angle
coordinates on a synthetic chart's clock. Its true obliquity reference is
the first epoch in the existing parent src/fixtures/nutation-erfa.json:
TT day -73048.5, the invented TT reading 1800-01-01T00:00:00 relative to
J2000. The expected obliquity is the fixture's independently computed
obl06 + nut00b obliquity, (epsA + deps) / 3600 in degrees. The fixture's
generator and ERFA provenance are recorded in Motion from J2000 above.
The constructed coordinate comparisons use toBeCloseTo precision 10 as
a floating-point geometry check at this epoch, not a physical star bound.

For ecliptic longitude lambda, latitude beta and obliquity epsilon, the
inverse ecliptic rotation derived above gives equatorial vertical component:

```text
z = sin(beta) cos(epsilon) + cos(beta) sin(lambda) sin(epsilon)
declination = asin(z)
```

At beta = 0 and longitudes 0, 90, 180 and 270 degrees this yields
declinations 0, +epsilon, 0 and -epsilon. Those are the expected cardinal
body declinations and the constructed Ascendant, Midheaven, Descendant
and Imum Coeli declinations. The latitude-sensitive body cases use
beta = 30 degrees. At lambda = 0, declination is
asin(cos(epsilon) / 2); at lambda = 90 it is epsilon + 30 degrees,
since this sum is below a right angle. Assigning zero latitude to all
bodies would fail both expectations. Assigning zero latitude to an angle
is deliberate: the natal angle denotes an ecliptic point.

A synthetic star matching row at longitude 359.5 and declination zero
has a conjunction orb of exactly 0.5 degrees to the constructed Ascendant
at longitude zero. It is also parallel to the Ascendant and Descendant,
whose mathematical declinations are zero, but not to the other angles.
The parallel limit of 1e-10 degrees in this constructed case accommodates
trigonometric roundoff at the 180-degree axis. The matcher itself still
uses the exact binary64 decision, without an epsilon. This is a test
policy, not a recommended orb or a physical tolerance.

The supplied chart helper's geometric tests replace numerical chart
coordinates explicitly. Those constructed charts are caller claims and
are not passed to the native receipt creator as real ephemeris results.
The independent reference checks the target construction on this clock,
not the replaced bodies' real positions at that instant.

Separate integration tests cast the invented input 2000-03-20T06:00:00
at latitude 12 and longitude 30 on UTC, UT1 and TT, with and without a
pinned deltaT of 1234 seconds. They check the captured envelope against
createNatalEnvelope, serialize/parse it through the engine, and compare
the body targets and stellar clock with native calls made at test time.
All 12 body rows, including both true lunar nodes, plus the 4 available
angles produce 32 hits for one star when both limits are 180 degrees.
Missing location or time leaves 12 body targets and 24 such hits. These
counts are enforced by the integration tests, not coverage measurements.

Other integration constructions apply the inverse engine ecliptic matrix
to the native Moon direction and the Ascendant ecliptic point, expressing
them as synthetic J2000 catalog records with unavailable motion. Their
conjunctions and parallels must be within the explicit 1e-7 degree test
policy, which allows floating-point inverse-rotation roundoff. An inverse
rotation of the ecliptic north pole must instead retain null longitude
and produce only parallels. These checks verify wiring, round trips and
singularity handling; the engine's own matrices and coordinates participate,
so they are not independent stellar or natal accuracy references.

Receipt tests also retain the native polar house fallback, coverage flags,
unknown-time reference and missing-location reason. Fresh result records
are frozen without freezing caller input. The natal receipt remains the
engine's chart envelope; it covers neither the derived declination targets
nor the stellar positions or their matches. No sky call is made in M6.

## Scoped sky-vector proof

tests/sky-vector.fixedstars.ts checks the adapter's J2000 direction before
the engine solver rotates it. The constructed stationary x-axis star has
ray (D,0,0), with D = 2^500 au as a numerical scale. This is deliberately
not a physical stellar distance. Multiplication by a power of two preserves
the normalized direction in ordinary binary64 arithmetic without a new
angular conversion. It leaves room for the solver's coordinate sums, its
Math.hypot norm and its conversion to kilometres to remain finite. The test
checks that finite norm; no accuracy bound on real stellar parallax follows.
The observer displacement remains in the original engine calculation, but
is negligible on this ray scale. This models an effectively infinite direction.

The synthetic east tangent motion from the earlier motion derivation advances
the x-axis direction over 365.25 TT days to (1,1,0)/sqrt(2). Dividing the
adapter's vector by D gives that same expectation, compared at precision 12.
The vector's AstroTime is retained. No frame bias, precession or nutation
belongs inside this vector provider; the original solver applies equatorRows
at the current TT sample after receiving it. Tests also alter caller
astrometry inside a scope and require its captured motion and direction to
remain unchanged. Other bodies and native natal chart casting stay native.
These are construction and scope checks, not physical star measurements.

tests/sky-adapter.fixedstars.mjs searches an invented equatorial observer at
latitude and longitude zero over 2000-03-20 UTC to 2000-03-21 UTC, for the
same constructed stationary J2000 x-axis star. It requires one rise, one set,
one upper transit and one lower transit in that window. It uses independent
spherical identities to check the solver's altitude and azimuth at the events,
using the current true-of-date declination delta as an input. At latitude zero,
with hour angle H increasing westward, an infinite direction has local components:

```text
east = -cos(delta) sin(H)
north = sin(delta)
up = cos(delta) cos(H)
```

For geometric centre crossings, altitude h is zero, so cos(H) = 0. At rise,
H = -90 degrees and east is positive: azimuth is 90 - delta degrees. At set,
H = +90 degrees and east is negative: azimuth is 270 + delta degrees. At the
upper transit H = 0, altitude is 90 - abs(delta) degrees; at the lower transit
H = 180, altitude is -90 + abs(delta) degrees. The test computes these
identities directly, with refraction disabled and the point-body centre limb.
Comparisons allow 1e-5 degrees for the engine's first-whole-millisecond event
convention and trigonometric roundoff over this single synthetic window.
This is a predeclared construction tolerance, not an astrometric error bound.
The declination input uses the engine frame helpers, so the whole test checks
wiring and geometric construction, not an independent physical event time.

Separate integration tests compare every ordinary native body sky call before
and after interleaved star searches, including the original Pluto, with the
direct unadapted engine call made at test time. They check exact agreement
for the invented observer at latitude 12, longitude 30 over the same window.
Those comparisons prove scoped substitution over the enumerated calls; they
do not supply an independent ephemeris reference. Clock errors, invalid
observer/window/limb settings and sample-budget refusal must clear the slot.
The engine returns no partial events on refusal, unchanged by the adapter.

The committed engine-sky-contract.json binds the parent source files actually
parsed during bundling and the ephemeris ESM bytes. The bundle plugin reads
src/sky/riseset.ts unchanged and replaces only its import edge; no event
algorithm is copied into fixedstars source. Compatibility tests inject changed
bytes through a test reader rather than editing the engine. They also refuse
changed versions, a missing input and a mismatched graph. Runtime loading
compiles in memory and gives each module an independent synchronous scope.
The private proof's native result still identifies its Pluto slot and is
not exposed through the library index. A future star-event wrapper must label
the star and its fixedstars call provenance explicitly, while retaining native
body results and the absence of native stellar receipt support.
