# Geometry and verification design

This is the implementation contract for the remaining milestones. Only the
position adapter and input/receipt foundation are implemented. An unchecked
part of PLAN.md is not a supported calculation or an established error bound.

## Engine boundary and clock

`src/engine.ts` calls the adjacent engine's `calc` with apparent corrections,
true equator or true ecliptic of date, Cartesian output and no speed samples.
It preserves the engine receipt and bounds. `src/input.ts` reuses the engine's
date parser. Frame precession, nutation, delta-T, TT, UT1 and observer rotation
remain the engine's responsibility. Future searches must call
`src/crossings.ts`; rise/set facts must reuse `src/sky.ts`.

The source interfaces and their qualifications are in `../docs/calc.md`,
`../docs/sky.md`, `../src/calc-reduce.ts` and `../src/time-scale.ts`. Their
acceptance range is not an occultation-validation span. A successful position
requires both TT and UT1 within the engine's calculation span; a nominal civil
date just inside an endpoint can still be refused. Tests exercise this boundary.
Seams of the engine time basis must be split or reported before continuous
event root solving. A leap second is not representable as a JavaScript Date.

## Parallax, light-time and aberration

Topocentric samples use the engine's ellipsoidal observer at reception time,
with geodetic latitude, east longitude and elevation in metres. Calc uses the
IERS 2003 ellipsoid; the sky rise/set API uses WGS84. Our elevation is an
ellipsoidal height, not height above mean sea level. The later horizon and
outline work must account for this distinction and any reference station's
vertical datum; it must not silently relabel the calc observer as WGS84.

The engine's geocentric apparent Moon is its geometric series at the instant.
Its topocentric apparent Moon instead passes through the engine's retarded
target/observer calculation. Planets use the engine's light-time and apparent
direction treatment. No second aberration or light-time correction may be
applied to these returned directions. The original correction identifiers
are retained in every successful receipt, including the lunar exception.

Future star samples must propagate catalogue epoch and proper motion in the
catalogue's stated frame, including the distinction between RA rate and
RA rate multiplied by cos(declination). Distance, radial velocity and parallax
are used only when the catalogue supplies them with known conventions.
Annual aberration and the engine's true-of-date frame must put star directions
on a consistent apparent system with the lunar contacts. Missing fields,
double stars and variable magnitudes require explicit flags. Gravitational
deflection is absent from the engine adapter; reference comparisons near
the Sun must expose that omitted correction.

## Sphere contacts and sky facts

The lunar limb will be a sphere using the radius already exported by the
engine's sky entry, with no mountains, valleys or limb-darkening profile.
The apparent angular radius is asin(radius / topocentric range). For a star,
a contact solves angular separation minus lunar angular radius equal to zero.
For a planet disk, external and internal contacts use the sum and difference
of the apparent radii. Planet disks need independently sourced radius and
shape conventions; Saturn's rings are not its solid disk.

Compute separation from unit vectors with atan2(norm(cross), dot) to retain
precision near coincidence. A sign-changing contact and a tangent graze need
separate detection. Closest angular approach, equal right ascension and equal
ecliptic longitude are separate events and must not share a timestamp merely
because they occur nearby. A geocentric disk overlap is also distinct from
an occultation visible somewhere on Earth.

Position angle is measured from celestial north through east at the Moon.
Bright/dark/terminator labels will use the projected Sun direction and lunar
illumination geometry with an explicit ambiguous region. The Sun's altitude,
Moon's phase and horizon status are facts at each contact. Atmospheric
refraction does not belong in the vacuum contact equation; any refracted
horizon convention must be separately named. Daylight and low altitude are
reported without scoring or recommending the event.

## Coarse global outline

Use a fundamental plane perpendicular to the target direction, with north/east
axes and the projected lunar centre. For a stellar target this gives the
cylindrical shadow limit of the lunar sphere. Finite target distance requires
the corresponding conical geometry for planetary disks. Earth rotation and
the ellipsoidal observer must use the engine's UT1 and frame conventions.

For each longitude band, solve intersections and extrema over the event time
interval to find latitude intervals with contact and the required horizon
condition. Preserve multiple intervals or no intersection; do not invent a
single connected footprint at the dateline or near a pole. Northern/southern
envelopes must identify the sampling grid, unresolved bands and assumptions.
A coarse outline is not a terrain-corrected graze prediction. Every chosen
outline limit must be checked against local topocentric contact geometry.

## Accuracy budget in seconds of time

No contact accuracy has been measured in this milestone. The budget will be
evaluated per contact, using independently checked uncertainties and the
contact's normal angular speed. Define:

- `Eposition`, `Estar`, `Eframe`, `Ecorrection`, `Eradius` in arcseconds;
- `vnormal`, the absolute time derivative of angular limb clearance, in
  arcseconds per second;
- `Eclock` and `Esolver` in seconds;
- `Esite` and `Elimb`, transverse station and unmodelled limb error, in km;
- `vshadow`, the corresponding normal shadow speed in km per second.

The conservative linearized budget in seconds is

```text
Etime = Eclock + Esolver
      + (Eposition + Estar + Eframe + Ecorrection + Eradius) / abs(vnormal)
      + (Esite + Elimb) / abs(vshadow)
```

This is a local sensitivity estimate, not a proven bound. The errors are not
assumed independent, so they are not combined in quadrature. Do not count a
limb-radius uncertainty in both `Eradius` and `Elimb`. Engine sample maxima
are evidence over their measured corpus, not universal error limits.

Near grazing, either normal speed can approach zero and this estimate becomes
unbounded; terrain can create or erase contacts. Such cases require an
uncertain/grazing result, not a fixed seconds claim. Solver precision alone
cannot support a physical timing claim. Missing uncertainty inputs remain
unknown rather than being assigned zero.

M4 must freeze numerical maximum-error assertions in seconds against cited
published references, including their time scales, rounded precision, limb
model, station datum and ephemeris lineage. Development and held-out cases
are separate. M8 and M12 will report the actual comparison span and maxima,
with failures retained. The current tests only check integration, input
semantics and receipts; none is presented as independent sky accuracy.

## Receipts and bounded work

The initial position receipt records its schema and adapter implementation,
normalized request, engine identity, engine calculation receipt, frame and
unit conventions, and an explicit unmeasured-validation status. Refusals
also carry a request receipt; no fabricated engine calculation is attached.
Receipts are immutable JSON snapshots, not signatures or trusted attestations.

Event receipts will add catalogue identity and digest, window ownership,
search resolution/budget, contact and outline model, reference-validation
status and limitations. Exhausting a search budget must produce an explicit
refusal or unresolved interval, never a silently complete partial list.
No network request is part of a calculation. Bulk downloads and generated
outputs stay in ignored folders, and no authored file may reach the root build.
