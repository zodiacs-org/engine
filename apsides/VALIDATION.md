# Development validation status

M5 implements the planetary API and its numerical and integration tests.
Independent validation is **failing** for Pluto's distance. This is an
unresolved acceptance failure, not a widened budget or a passing accuracy
claim. The immutable engine and reference fixtures have not been changed.

The comparisons use the carried `@zodiacs/engine@1.0.0` archive and its
`astronomy-engine@2.1.19` dependency on Node 22.22.2. The committed
`test/planetary-reference.vitest.ts` is the executable evidence, with
reference provenance and byte integrity checked by
`test/references.vitest.ts`. The cases are the geometric heliocentric
Horizons development fixtures indexed in `references/manifest.json`:

| Body | Fixture | TT window | Registered comparison status |
| --- | --- | --- | --- |
| Mercury | `dev-mercury-2000` | 2000-01-01 to 2000-04-01 | Pass |
| Venus | `dev-venus-2000` | 2000-01-01 to 2001-01-01 | Pass |
| Earth | `dev-earth-2000` | 2000-01-01 to 2001-01-01 | Pass |
| Mars | `dev-mars-2000` | 2000-01-01 to 2002-01-01 | Pass |
| Jupiter | `dev-jupiter-2000` | 2000-01-01 to 2013-01-01 | Pass |
| Saturn | `dev-saturn-1980` | 1980-01-01 to 2011-01-01 | Pass |
| Uranus | `dev-uranus-1880` | 1880-01-01 to 1965-01-01 | Pass |
| Neptune | `dev-neptune-1805` | 1805-01-01 to 1971-01-01 | Pass |
| Pluto | `dev-pluto-1805` | 1805-01-01 to 1900-01-01 | Distance fails |

All searches complete on these cases. Counts, kinds, unique event-time
matches, numerical refinement intervals and engine receipt checks pass.
Signed radial and total speeds pass at each independent before/at/after
TT sample. These tests retain all turns witnessed by the reference grids;
they do not assume a fixed number of extrema in an orbit.

Pluto fails the preregistered 100,000 km distance allowance both at its
independently located aphelion and at the reference fixture's own sample
times. The latter comparison directly evaluates the engine at the same TT
as Horizons, so changing the search refinement cannot fix that failure.
The fixture compares the Pluto system barycenter with the Sun center,
matching the disclosed reference convention. It is not a physical-center
comparison. Pluto's event-time and speed budgets pass on this case, but
that does not override the failing distance budget or validate other dates.

These are ordinary failing Vitest assertions. They are neither skipped nor
marked as expected failures. `npm test` and `npm run check` therefore exit
unsuccessfully while the distance failure remains. The implementation and
integration tests can pass without all independent accuracy tests passing.
The search's `status: "complete"` means its numerical work completed;
`completeness: "sampled-not-proven"` and the engine's bounds still apply.

Run the checks from `apsides/` on the stated runtime:

```sh
npm run typecheck
npm test
npm run check:isolation
```

The isolation check is separate here so that the reference failure does not
prevent it from running. It checks the repository's package contents in an
ignored copy using the carried build, without rebuilding the root package.

No held-out case was collected or evaluated in M5. The physical-center
spot checks and Pluto perihelion remain reserved for M10. This development
coverage does not establish continuous completeness, all-date accuracy,
or physical-center event timing for the system-barycenter targets. The
failed budget remains open for that validation review; any future change
to the acceptance registration requires its documented revision process.

M6 adds the combined window API. Its tests check that merged records match
the individual searches, that partition ownership is preserved, and that
one global budget and any body's refusal apply to the entire request.
Coverage failures retain the engine's TT and UT1 span restrictions and
each body's required padding. These are integration and failure-contract
checks in `test/window.vitest.ts` and `test/window-failures.vitest.ts`, not
new independent accuracy measurements. The same development reference
assertions remain active, including the failing Pluto distances. No
held-out references were collected or evaluated in M6.

M7 exposes the cached wider distance witnesses and the extremum sample as
before/at/after motion records. `test/event-records.vitest.ts` checks JSON
round trips, replay of each decoded engine receipt, reported units and
offsets, and cached assembly. It uses the registered development windows
above and the geocentric Moon's `dev-moon-2000` window, 2000-01-01 to
2000-02-01 TT. These are integration checks and do not extend the independent
accuracy coverage. The development reference assertions and acceptance
limits remain unchanged, including the Pluto distance failures. No held-out
references were collected or evaluated in M7.
