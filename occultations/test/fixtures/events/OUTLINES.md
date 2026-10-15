# M10 outline comparison and numerical policies

Recorded before running the outline implementation against the frozen
development predictions. No source node, partition or error gate changes.
`outline-references.test.ts` must compare every development map node at its
exact longitude, with the original maximum error of 1 degree latitude from
`EVENTS.md`. The development source is NAOJ's Moon/Saturn map for May 31,
2024 (`naoj-map-202408` in `sources.json`). All development local contact
timing, disk-duration, position-angle and altitude gates must continue to pass.
The held-out maps remain for M12.

The geometry is an independently derived sphere cylinder or common tangent
cone, intersected with the engine observer ellipsoid. Analytic cases must
check it against direct angular disk separation, with separate inner and
outer curves, poles, horizon clipping, tangencies and disconnected intervals.
These tests establish mathematical semantics, not measured sky accuracy.

The default time grid is 60 seconds, with a maximum permitted step of
300 seconds. Each meridian keeps the union of its sampled latitude intervals,
then refines the extremal witnesses within their adjacent time cells.
Sampling can miss a short event or a disconnected component between samples.
No physical latitude-error bound or complete continuous-time footprint is
claimed. Longitude bands report their exact evaluated meridian; there is no
interpolation or assertion that the same limits hold throughout the band.

Each reported limb or horizon boundary must be bracketed with the actual
topocentric adapter within 0.1 degree of its plane seed, then bisected to
at most 0.00001 degree latitude. This guard is an implementation refusal
policy, not an accuracy allowance added to the reference gate. Unbracketed,
degenerate or conflicting boundaries make that meridian unresolved. Pole
boundaries require nonpositive limb clearance and a nonnegative target
geometric altitude. Local checks report their signed clearance and altitude,
the bracket, the witness time and source position receipts. Refraction,
terrain, elevation, lunar relief and darkness are not outline filters.

The numerical policies are enforced by `outlines.test.ts` and the geometry
tests. The public result must expose the time step, longitude bands,
unresolved meridians, and a null physical sampling-error bound. A small
numerical root bracket must never be called a physical uncertainty bound.
