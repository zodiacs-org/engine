# Final reference results

The first M12 held-out evaluation passed every frozen check without a
numerical correction, source change or relaxed threshold afterward. On
Node 22.22.2, the development partition passed 32 checks in 8 cases and the
held-out partition passed 39 checks in 12 cases. There were no omitted,
refused or unresolved preregistered check quantities. These counts and every original
maximum-error assertion are enforced by
[event-validation.test.ts](test/event-validation.test.ts).

The references are independent published predictions, not observed contacts.
Agreement over these particular cases is not a physical error bound or
coverage of the intervening years. The original source clocks, qualified
stations, limb conventions and acceptance limits remain in the frozen
[reference contract](test/fixtures/events/EVENTS.md) and
[source register](test/fixtures/events/sources.json).

## Measured differences

Each entry below is the largest absolute residual in its partition, rounded
upward. Seconds are rounded upward to 0.01 s and degrees to 0.001 degree.
The same test enforces those rounded entries against the original independent
references. These presentation assertions were added after evaluation to keep
this table accurate; they do not replace the preregistered acceptance limits.

| Quantity | Development maximum | Held-out maximum | Frozen acceptance maximum per check |
| --- | ---: | ---: | ---: |
| Planet coordinate conjunction, coarse TT reference | 1647.09 s | 1266.89 s | 3600 s |
| Moon/Mars coordinate conjunction, TT | 23.58 s | 33.11 s | 180 s |
| Planet appulse, coarse outreach occurrence | 1598.61 s | 512.45 s | 3600 s |
| Historical Aldebaran contact, nominal UT1 | 28.35 s | 73.27 s | 120 s |
| Planet disk contact, nominal UT1 | 20.49 s | 2.21 s | 120 s |
| Topocentric local minimum, nominal UT1 | 18.29 s | 35.03 s | 120 s |
| Duration of a planetary disk crossing | 0.19 s | 0.44 s | 10 s |
| Contact position angle, circular difference | 0.399 degrees | 1.326 degrees | 2 degrees |
| Refracted Moon altitude at contact | 0.067 degrees | 0.056 degrees | 0.5 degrees |
| Outline latitude at the exact published longitude | 0.127 degrees | 0.044 degrees | 1 degree |

The measured cases and spans are:

- NAOJ planetary coordinate conjunctions and outreach appulses:
  Jupiter/Saturn on 2020-12-21 in development; Venus/Jupiter on 2022-04-30
  and Mars/Jupiter on 2024-08-14 held out. Hour-rounded conjunctions and
  approximate outreach hours establish only coarse occurrence. Outreach
  clocks are converted from the stated JST to nominal UTC; their center is
  not fully specified.
- NAOJ Moon/Mars RA and ecliptic conjunctions: 2024-01-10 in development
  and 2024-11-20 held out, compared on TT. These are coordinate events,
  not angular minima.
- USNO Aldebaran predictions: the Boston worked example in the registered
  1923-01-27 through 1923-01-29 window in development; the Washington table
  in the 1923-04-19 through 1923-04-21 window held out. Both alternative
  Washington station inputs pass, with neither chosen by residual. Noon-based
  historical mean times and local longitude offsets are retained and
  compared as nominal UT1. Source and engine catalogues, radii and station
  datums differ.
- NAOJ Saturn on 2024-05-31 in development and Mars on 2025-01-14 held out:
  all external/internal contacts, both disk-crossing durations, position
  angles, refracted Moon altitudes, and the separately solved local angular
  minimum. The source's UT labels, fixed delta-T and undocumented model
  details remain qualifications. The workbench uses its existing engine
  clock without a fitted offset.
- NAOJ Saturn and Mars maps on those same respective dates: every selected
  north/south, inner/outer node at its exact published longitude. The evaluator
  also requires distinct disk boundaries, local clearance brackets and local
  contacts on the covered side with absence on the uncovered side. This is
  sparse node coverage, not a validated continuous global contour.

Published contact and local-minimum instants are also retained together in
their candidate envelope, using the existing containment rule with no extra
timing allowance. The minimum search never reads or averages contact times.
All preregistered check quantities are now evaluated; the deferrals in earlier
milestone records describe their state at that milestone.
Other transcribed source fields, such as azimuth, apparent semidiameters,
separation and auxiliary angles, remain context and are not additional
validated quantities.

## Seconds-of-time budget and remaining limits

For all 14 reference contacts, the final evaluator differences the entire
angular clearance at one second on either side. Its reciprocal sensitivities
range from 2.30 to 2.91 seconds per arcsecond and from 1.25 to 1.55 seconds
per transverse kilometre at lunar distance, rounded outward. The same test
enforces these displayed ranges. They describe local numerical sensitivity,
not measured physical errors or validated derivative bounds. The diagnostic
is unavailable at zero or nonfinite speed.

[DESIGN.md](DESIGN.md#accuracy-budget-in-seconds-of-time) gives the conversion
of angular, clock, radius, site and limb errors to seconds and identifies
the unfilled terms. Every generated diagnostic leaves total physical timing
error null. Historical SAO errors, missing distance and binary motion,
lunar relief, station datums, apparent-range conventions and atmospheric
visibility have no established complete uncertainty budget here. At a graze,
the normal speed tends to zero and a finite universal seconds bound fails.

Remaining unvalidated scope includes precision geocentric appulse timing,
all-catalogue contact accuracy and completeness, terrain-corrected grazing,
planetary oblateness and rings, physical bright/dark detectability,
intermediate-phase illuminated-fraction accuracy, and global physical
accuracy at horizon caps, poles and between sampled meridians or instants.
Analytic tests of those geometries do not supply physical reference coverage.
An outline may still return unresolved meridians outside the reference nodes.

The independent ERFA reduction suite and preregistered USNO sky checks also
pass as recorded in [VALIDATION.md](VALIDATION.md). Their own finite scope
and original acceptance criteria remain in
[ASTROMETRY.md](test/fixtures/ASTROMETRY.md) and the
[sky preregistration](test/fixtures/sky/PREREGISTRATION.md). Shared catalogue
inputs in the ERFA comparison do not validate the SAO measurements themselves.

## Reproduce

With the local dependencies installed and the documented Node runtime:

```sh
npm --prefix occultations run check
node occultations/scripts/event-validation.mjs all > occultations/.generated/event-validation.json
npm --prefix occultations run test:astrometry
```

The JSON evaluator records every actual, expected value, residual, frozen
acceptance maximum, source locator, qualification, sensitivity and failure.
Its grouped `maximumObservedAbsoluteError` is the observed maximum; each
check's `maximumAbsoluteError` is the original acceptance threshold. A failed
run exits nonzero and keeps failures in its output. The first held-out report
is retained locally as `.generated/m12-first-held-out.json`; generated data
is ignored rather than committed. The committed evaluator and tests enforce
the claims above. The final source and licence review is [AUDIT.md](AUDIT.md).

The root package-contents check remains unavailable because this checkout
lacks `dist/calc.d.ts` and the task prohibits writing root build output.
The local scope check passes npm exclusion, changed-path isolation, source
sizes, prose rules and dependency pinning. No root build, archive rebuild,
git mutation, release action or publication was performed.
