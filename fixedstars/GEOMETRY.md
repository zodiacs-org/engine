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
The private adapter's native result identifies its Pluto slot and is absent
from the library index. The prepared public wrapper replaces that label with
starId and captures an explicitly labelled fixedstars call record. Body results
remain native; the engine still supplies no native sky receipt.

## Prepared sky events, refraction and circumpolar geometry

tests/sky.fixedstars.ts repeats the equatorial identities above through the
public prepared search, for the same synthetic J2000 x-axis star, equatorial
observer and 2000-03-20 to 2000-03-21 UTC window. Its geometric altitude and
azimuth checks retain the predeclared 1e-5 degree construction tolerance for
whole-millisecond crossings. The input declination is evaluated on the engine
frame, so these are wiring checks with hand-derived spherical expectations,
not independent physical accuracy evidence or saved output comparisons.

For a point centre, standard horizon refraction changes the threshold from
h = 0 to h = -R. The test uses R = 34/60 degrees, the engine's published USNO
constant, whose source is cited in the parent LICENSING.md, Sky values, and
docs/sky.md, Definitions. Refraction changes no celestial coordinates or
hour angles: transit times and geometry must therefore be exactly unchanged.
At the equator a rising crossing reaches -R before reaching zero, while a
setting crossing reaches -R after reaching zero. The test checks both orders
and each refracted altitude within the same construction tolerance. This
does not test the physical validity of a constant atmospheric refraction.

At a general geodetic latitude phi and true-of-date declination delta, the
infinite-ray spherical identity is

```text
sin(h) = sin(phi) sin(delta) + cos(phi) cos(delta) cos(H)
h_upper = 90 - abs(phi - delta)
h_lower = abs(phi + delta) - 90
```

At H = 0, the first identity reduces to cos(phi - delta); at H = 180 degrees
it reduces to -cos(phi + delta). Taking the altitude branch [-90,90] gives
the two formulas. Synthetic tests at phi = +60 and -60 degrees use stationary
J2000 directions at declination +70 and -70 degrees over the same UTC window.
Directions in the observer's hemisphere stay above the geometric horizon,
and the opposite directions stay below it: the inequalities have ample margin
from zero despite the current frame rotation. At each transit the test uses
the current delta in the identities, compares at the same 1e-5 degree
tolerance, and requires the corresponding native never-sets or never-rises
flag with both transits retained and no horizon crossings.

A separate short window around the equatorial upper transit also carries
never-sets even though that same star rises and sets during the day. This
demonstrates the native flag's window-local meaning. Budget tests find the
unrestricted synthetic call's native sample count, then request a smaller
budget to verify late whole-result refusal and an empty event array. That
count is used only to drive an integration test, not as an independent
reference or an evaluation-cost claim. Refusal accounting is retained rather
than assumed to consume every allowed sample. Tests also retain native
outside-reference-span flags for an invented 1750-03-20 to 1750-03-21 UTC
window on both complete and refused calls; those flags establish no stellar
accuracy coverage.

Public native body result comparisons cover the Sun, Moon and Pluto over the
equatorial synthetic window with their defaults, geometric conventions and
budget refusal, before and after star calls. They are integration comparisons
made at runtime, not independent ephemeris accuracy evidence. Call-record tests
check normalized request and result snapshots, JSON serialization, source
contract identity, model scope, caller-input isolation and independence from
later mutations of native Date objects. No event output fixture is committed.

## Paran time arithmetic and simultaneous angularity

tests/parans.fixedstars.ts uses hand-authored synthetic event schedules to
check the pure matcher. For event times s and b, its definition is

```text
offset = s - b
orb = abs(s - b)
eligible exactly when orb <= orbMs
```

The arithmetic example places star rise at t, star upper transit at t + 1000
ms, body set at t + 500 ms and body lower transit at t + 2000 ms. At a 500 ms
limit, star rise/body set and star upper transit/body set qualify with signed
offsets -500 and +500 ms. All other separations exceed the limit. A limit of
499.99999999999994 ms excludes both boundary contacts, and zero admits only
identical event milliseconds. Every number is constructed input, without a
recorded ephemeris expectation. The matcher retains different event-kind pairs
and every eligible pair, including multiple events and explicit angle anchors.

JavaScript Date timestamps are integer milliseconds but their difference can
exceed the exact-integer range of binary64. The extreme arithmetic test uses
s = 8000000000000000 and b = -1007199254740993 ms, both valid Date values.
Separately implemented BigInt subtraction gives 9007199254740993 ms, or
2^53 + 1. Ordinary subtraction rounds downward to 2^53. A bound of 2^53
must exclude that pair, whereas 2^53 + 2 admits it. The reported orb can then
round down to 2^53, without changing the exact eligibility decision. This is
a pure arithmetic case with fabricated schedules and call-record claims;
no stellar or body solver is called outside its ephemeris span.

The simultaneous-contact integration test chooses the invented instant
2000-03-20T06:00:00Z and constructs an observer rather than choosing a saved
event output. At geodetic latitude zero and height zero, the WGS84 observer
lies on the equatorial circle. Let rho = 6378.137 / 149597870.7 au, using the
engine's published equatorial radius and astronomical unit (parent
LICENSING.md, Sky values). Let (x,y,z) be the native apparent Sun vector on
the engine's true equator at that instant, R = hypot(x,y) and alpha = atan2(y,x).
At sidereal angle theta, the topocentric up and east components are

```text
up = R cos(theta - alpha) - rho
east = -R sin(theta - alpha)
```

Geometric centre rise has up = 0 and east > 0. Therefore choose
theta = alpha - acos(rho/R); set the observer's east-positive longitude to
theta minus the engine Greenwich apparent sidereal angle, reduced into the
accepted longitude range. The native geometric Sun rise then occurs at the
chosen instant by construction. The current Sun vector and clock are inputs
to this identity, not independent physical ephemeris references.

Construct an infinite star at true-of-date RA theta and declination zero.
Its hour angle is zero, so it upper-transits at the same instant. A second
star at RA theta + 180 degrees has hour angle 180 degrees and lower-transits
there. Multiply each true-equator unit direction by the transpose of the
engine equatorRows matrix to obtain its synthetic J2000 catalog direction.
Both directions have explicit unavailable proper motion. The adapter and
native body solver then independently search a window extending 60000 ms
either side of the constructed instant, with refraction disabled and the
centre limb. The test requires both star/Sun contacts and the corresponding
Midheaven/Imum Coeli anchors, with each timestamp within 2 ms of the chosen
instant and a 2 ms paran orb. This predeclared construction allowance covers
the separate first-whole-millisecond crossing conventions and rotation
roundoff; it is not a physical accuracy bound. No star search output is used
to define the expected event time or observer.

Other tests enforce [from,to) membership for events and anchors, no orb
padding, no wrapping a time difference at midnight, deterministic ordering
and retained call indices. Native body comparisons, catalog default selection,
per-call budget exhaustion and circumpolar transit retention are integration
checks over the synthetic equatorial window 2000-03-20 to 2000-03-21 UTC
and its short constructed subwindow. The polar example uses latitude 60
degrees and a J2000 declination of 70 degrees, with the existing spherical
reasoning above and only its window-local horizon flag. Budget counts come
from current unrestricted calls solely to trigger a late refusal; they are
not independent accuracy or performance evidence. Refusal of any selected
search clears every hit, while all complete and refused sky calls remain
available with their separately labelled fixedstars provenance. Mutation
tests check that later native Date changes cannot silently detach new pairs
from the event times captured in the call record.

## CLI geometric and transport checks

tests/cli.fixedstars.ts launches the real executable with invented chart
instants and observers, from a directory outside the checkout. It verifies
option syntax, selections, JSON transport, native natal receipt parsing,
sky-call identity, incomplete-result refusal and the documented exit codes.
These are integration and validation checks; serialized engine values are
not independent astronomical references.

For the broad natal-contact check, the shortest arc between two normalized
longitudes is in [0,180] degrees. Both declinations are in [-90,90], so their
absolute signed difference is at most 180 degrees as well. With both explicit
orbs at 180, every available target must therefore appear once for each
contact kind. The test names the native bodies and available angles and
checks that exact set; it never saves a previous calculated contact list.
The disabled-kind check applies the same construction with only conjunctions
enabled. A zero orb is accepted explicitly and every returned hit must have
zero reported orb. Unknown time and absent coordinates omit angle targets.

For the broad paran check, all event times lie in the same half-open day
window [a,b). Hence every star/body event difference has absolute value
strictly less than b-a. Setting orbMs to b-a must include the entire Cartesian
product of the returned interior star and body events, with no nearest-only
filter. The test reconstructs that product as a transport check and uses
BigInt subtraction of Date millisecond integers as a separate reference for
every reported offset and absolute orb. This does not independently certify
the physical event times. A selected low-budget call must refuse the whole
answer, retain other selected calls and return no hits.

The narrow angle test uses Spica's propagated true-of-date RA at the invented
UTC instant 2000-03-20T06:00:00Z as construction input. For east-positive
longitude L and apparent sidereal time S in degrees, hour angle H=S+L-RA.
Choose L=RA-S modulo a full circle, represented in the observer's longitude
range. Then H=0 at the chosen instant: a non-polar catalog ray lies on the
upper meridian. At an equatorial observer, subtracting the observer position
changes only the ray's radial component, so its east component stays zero.
The prepared engine search must therefore find upper transit at that instant,
within the two-millisecond construction allowance enforced by the test. The
short surrounding window excludes lower transit and horizon crossings. The
Midheaven anchor selects this upper-transit phase and has no body sky call.
The coordinate and sidereal helpers set up the experiment, while the expected
event kind follows the hour-angle identity. This is frame/observer/CLI
construction evidence at one anchor, not an independent physical accuracy
bound. No expectation is taken from saved fixedstars output.

## Coordinate singularities, grazing horizons and event endpoints

[tests/edge-geometry.fixedstars.ts](tests/edge-geometry.fixedstars.ts) extends
the constructed geometry above. No reference in these tests comes from a
previous library result. All instants, observers, directions and exaggerated
motion rates are synthetic. The vector comparisons use toBeCloseTo precision
12; polar latitude checks use precision 10. These are floating-point checks
over the stated constructions, without a physical stellar error bound.

At alpha = 0 and delta = either sign of 89.999 degrees, the east basis stays
(0,1,0). An eastward tangent displacement of one radian, forward or backward,
therefore gives (cos(delta), +/-1, sin(delta))/sqrt(2). A division by cos(delta)
would change this result drastically. At delta = +/-60 degrees, a northward
displacement toward the pole of sqrt(3) radians instead gives
(-1,0,+/-sqrt(3))/2. Its RA is 180 degrees and its declination is again +/-60
degrees: motion has crossed the pole rather than clamping at it. A displacement
of 1/sqrt(3) radians reaches the pole itself. Exact catalog poles accept
unavailable or tabulated zero motion, but refuse nonzero components because
their RA-based tangent convention is ambiguous there.

At zero declination, displacement tan(1 degree) along the east basis rotates
the normalized vector by one degree. Forward propagation from RA 359.5
degrees reaches 0.5 degrees; backward propagation from 0.5 reaches 359.5.
These seam expectations follow from the angle addition identities. Motion is
performed on Cartesian axes, without wrapping an angular displacement first.

The mixed moving-vector check starts at alpha = 45, delta = 30 degrees.
Its independent tangent bases are

```text
u = (sqrt(6)/4, sqrt(6)/4, 1/2)
east = (-1/sqrt(2), 1/sqrt(2), 0)
north = (-sqrt(2)/4, -sqrt(2)/4, sqrt(3)/2)
w = u + E east + N north
|w| = sqrt(1 + E^2 + N^2)
```

The last identity follows because these three vectors are orthonormal. The
test takes E = 0.003 * years and N = -0.004 * years at every TT epoch of the
existing parent nutation-erfa.json fixture across 1800 to 2200. It multiplies
w/|w| by that fixture's eclipticOfDate matrix and rotates the result onto the
equator using the fixture's epsA + deps, as derived above. Each reconstructed
Cartesian component must satisfy the fixture's existing rotationArcsec
tolerance, converted to radians. This extends the independent ERFA rotation
check to a moving direction with mixed components. The tangent model itself
is tested against the hand-derived vectors, without claiming that it models
physical motion accurately across that span.

Pole-neighborhood cases construct true-equator and true-ecliptic directions
(r,0,+/-sqrt(1-r^2)), at TT days -73000, 0 and 73000. The test uses r equal to
0.25 or 8 times the engine RA_POLE_TOLERANCE, well apart from its boundary.
The inverse engine frame provides a catalog direction. The catalog encoding
uses atan2(z,hypot(x,y)) for declination; asin(z/length) can lose the tiny
polar distance when its ratio rounds to either sign of one. Only the
corresponding singular longitude or RA is unavailable below the threshold.
The other frame's longitude and signed declination remain usable. A target
with the identical supplied coordinates matches a parallel and, when
longitude is available, a conjunction at zero orb. These are frame-wiring
and coordinate-availability checks. Unknown-time natal inputs additionally
omit all angle contacts under UTC, UT1 and TT clocks at latitudes -78, 0 and
78 degrees, with a pinned deltaT and requested Placidus houses. Unknown time
does not become a polar fallback or an inferred angular contact.

For the endpoint tests, choose the continuous UTC instant halfway between
2000-03-20T06:00:00.000Z and its next millisecond. At an equatorial observer
with longitude zero, construct a true-equator direction with declination
10 degrees and RA equal to the engine apparent sidereal angle minus H.
The hour angles -90, 90, 0 and 180 degrees place rise, set, upper transit and
lower transit respectively at that chosen instant. The inverse engine frame
constructs each J2000 record. Thus the expected first whole millisecond is
06:00:00.001Z, fixed before any sky call. Independent horizontal dot products
verify opposite signs at the preceding and expected milliseconds. A wide
search, a window ending at the expected millisecond, and successive windows
of one millisecond then test inclusion at from and exclusion at to. A zero-orb
paran to the corresponding angle anchor must match in the included window;
an anchor at the excluded endpoint is refused even with a larger orb.

The horizon cases use both signs of latitude 60 degrees around the invented
UTC instant 2000-03-20T06:00:00Z. From the spherical identity above, an upper
transit at declination -30 degrees is tangent to the horizon for latitude
+60; a lower transit at declination +30 is tangent there instead. Reversing
both signs gives the southern cases. The test verifies the constructed
tangent's instantaneous altitude within 1e-10 degrees. This concerns geometry
at that instant, not a promise of an exact double-root event under evolving
precession and nutation.

Moving declination 0.01 degree to either side creates a short horizon
excursion or a clear miss. The tests search half an hour on either side of
the anchor. The excursion contains rise then set at an upper culmination,
or set then rise at a lower culmination, with both contacts less than one
native hourly coarse step apart. The independently evaluated horizontal
dot products put the anchor inside and both window endpoints outside the
excursion. At each returned horizon contact, the previous millisecond must
still be on the original side and the returned millisecond must have crossed.
Altitude must be within 1e-5 degrees of the geometric horizon and agree at
precision 10 with the independently composed horizontal dot products. The
clear-miss case retains only its transit and the appropriate window-local
never-rises or never-sets flag. These tests exercise extremum detection on
either side of tangency; they establish no completeness guarantee for an
exact touching root or arbitrary time-varying directions.

Budgets 1, 8 and 32 and a budget one below the current unrestricted call's
sample count must refuse whole for each grazing case. The unrestricted count
is an integration trigger, without an independent performance claim. Events,
horizon flags and paran hits must be empty on refusal; the captured call
record retains the refusal, and the used count cannot exceed the requested
budget. The exact unrestricted budget must complete with the same events.
All sky tests execute the unchanged engine solver through the existing scoped
adapter. The horizontal reference uses the engine frame and clock as inputs
to independently composed local dot products, without a copied rise/set or
precession algorithm and without stored event times as a reference.
