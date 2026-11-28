# Development contact comparisons

`test/contact-references.test.ts` evaluates the contact-time and disk-duration
checks from the unchanged development fixtures. It requires a complete search,
the entire ordered contact sequence, and one result for each expected contact.
Every selected check passes through `assertReferenceChecks` with its original
maximum error. No missing, duplicate, refused or nonfinite result can pass.

The reference gates are the USNO Boston Aldebaran worked example on
January 27-28, 1923, and the NAOJ Saturn prediction for the explicitly supplied
station on May 31, 2024. Their source URLs, locators, rights and byte receipts
remain in `sources.json`; `EVENTS.md` explains their qualified source models.
These are comparisons to published predictions, not observed contacts.

The stellar disappearance and reappearance rows map to the same contact names
in the API. For the planetary disk, the source descriptions map as follows:

| Source row | API contact |
| --- | --- |
| Disappearance starts | `partial-disappearance-start` |
| Disappearance ends | `full-disappearance` |
| Reappearance starts | `full-reappearance-start` |
| Reappearance ends | `partial-reappearance-end` |

Disk-crossing durations subtract the corresponding internal and external
contact times. They prevent a center-only result from passing both edges
under a shared timing allowance. The existing contract retains its separate
timing and duration limits; no allowance is added for source rounding.

The test converts each source window from nominal UT1 to the engine input
clock, then converts each returned time back to nominal UT1 seconds through
the engine time basis. It also calculates durations on that scale. Historical
Greenwich mean solar time is only approximated by this nominal UT1 convention.
The NAOJ source's UT label does not establish modern UTC. Its fixed delta-T
is a reference qualification; the workbench uses its existing engine clock.
The source lunar radius, station datum or planet shape is not fitted.

`test/contact-sky-references.test.ts` adds the M9 position-angle comparisons
for both development sources and the refracted Moon-altitude comparisons for
NAOJ's planetary contacts. It evaluates those quantities at the contacts found
by the solver, using the same nominal UT1 window conversion as the timing
test. It requires the full contact sequence and every original angle and
altitude check. The frozen limits are 2 degrees of shortest circular difference
for position angles and 0.5 degrees for Moon altitude, as preregistered in
`EVENTS.md` and enforced by the test. Position angles run north through east.
The altitude comparison uses the explicitly refracted field; NAOJ's refraction
implementation is undocumented, so this does not establish agreement of
atmospheric models.

At M9, these suites accounted for every check except the local closest-approach
time, which was deferred to M12 for its own calculation and comparison.
Closest approach is not a contact and cannot be replaced by an average of
ingress and egress. M12 now evaluates that separately solved minimum and every
held-out check after fixing the implementation choices; the complete results
are in [RESULTS.md](../../../RESULTS.md). Passing these development checks is
not a general contact accuracy bound or full coverage of the planetary source
case. These references do not validate Sun altitude, Moon phase or the
bright/dark limb classification. The additional preregistered USNO references
in `../sky/PREREGISTRATION.md` cover selected solar-altitude, primary-phase
and horizon samples. Analytic geometry tests check the limb construction,
without claiming independent physical brightness accuracy.

The source's historical stellar catalogue, nominal observer elevation,
untransformed historical coordinates, smooth lunar limb, undocumented NAOJ
planet shape, and correction conventions limit the comparison. The separate
analytic geometry tests establish contact semantics and window behavior.
Neither these development cases nor those analytic tests prove catalogue
completeness, grazing accuracy or terrain-corrected contact times.
