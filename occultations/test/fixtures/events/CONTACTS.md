# Development contact timing comparison

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

This milestone tests only those timing and duration checks. The test explicitly
enumerates every deferred check so none is silently discarded: position angles
and refracted Moon altitudes belong to M9, and the local closest-approach time
needs its own calculation and comparison by M12. Closest approach is not a
contact and cannot be replaced by an average of ingress and egress. M12 must
run all held-out checks after implementation choices are fixed. Passing this
timing subset is not passing the full source case or a general contact
accuracy bound.

The source's historical stellar catalogue, nominal observer elevation,
untransformed historical coordinates, smooth lunar limb, undocumented NAOJ
planet shape, and correction conventions limit the comparison. The separate
analytic geometry tests establish contact semantics and window behavior.
Neither these development cases nor those analytic tests prove catalogue
completeness, grazing accuracy or terrain-corrected contact times.
