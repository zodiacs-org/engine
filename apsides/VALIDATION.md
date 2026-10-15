# Validation status

M10 evaluated the reserved independent corpus with the search fixed at M9.
Independent acceptance is **failing**. The full measured report is
[docs/evidence/m10/RESULTS.md](docs/evidence/m10/RESULTS.md), reproduced by
`scripts/validate-references.mjs` and checked by
`test/validation-evidence.vitest.ts`. It records the exact TT windows,
center conventions, error maxima, every failed comparison, event accounting
and input/code digests. The original registration, development fixtures,
engine archive and search implementation remain unchanged.

The held-out failures are:

- `held-mercury-2024`, 2024-01-01 to 2025-01-01 TT: total-speed error at
  independent reference epochs exceeds the registered 0.005 km/s limit.
  The largest measured magnitude, rounded upward, is 0.00512266 km/s.
- `held-neptune-2005`, 2005-01-01 to 2171-01-01 TT: event
  `held-neptune-2005-05` exceeds the registered 2,592,000 s timing limit.
  The measured magnitude, rounded upward, is 2,618,530 s. All its reference
  events still have unique matches; an excessive time error is not hidden
  by declaring that event unmatched.
- `held-pluto-1900`, 1900-01-01 to 2195-01-01 TT: the search refuses with
  `non-unimodal` during scalar-distance refinement. It returns no partial
  events, so event-time/distance and missing/extra counts are unavailable.
  Separate same-TT distance comparisons still run and exceed the original
  100,000 km limit at `held-pluto-1900-02`, reaching 142,697 km rounded
  upward. This is a sampler discrepancy independent of search refinement.

The remaining held-out cases pass their registered comparisons on their
listed windows. Every completed held-out search has unique matching with
no missing, extra or ambiguous reference events. Those counts describe turns
witnessed on the independent grids, not proof of continuous completeness.
Pluto's development distance failure below also remains active.
All these statements and rounded figures are enforced by the report and
its freshness test, using the frozen fixtures in
[references/held-out/manifest.json](references/held-out/manifest.json).

Physical-center spot checks are separately recorded for the registered
bodies and epochs in `references/plan.json`. They show differences between
the engine and both reference points, as well as differences between the
independent physical-center and system-barycenter samples. They do not
establish physical-center event-time accuracy or change the library's
disclosed barycenter convention. No physical-center acceptance budget was
registered, so these checks carry no accuracy pass/fail verdict.

Reproduce on Node 22.22.2 from `apsides/`:

```sh
npm run typecheck
npm test
npm run validate:references -- --check-evidence
npm run check:isolation
```

The acceptance tests and validation command exit unsuccessfully while these
failures remain. Typechecking, reference integrity, reporting logic,
integration tests and package isolation can pass independently. Report
freshness compares the current implementation with the committed measured
summary; it does not use previous engine output as an accuracy oracle.
Full signed measurements go to ignored `.generated/validation/report.json`.
The command rebuilds only the local ignored CLI output before measurement.

M11's `npm run check` runs all local gates sequentially, including isolation
after acceptance failure. [The local check evidence](docs/evidence/m11/RESULTS.md)
records the resulting statuses and runtime. Runnable example and receipt
replay tests cover existing development inputs only and do not extend the
independent validation span or change any acceptance limit.

M12's [review](REVIEW.md) adds synthetic robustness and CLI acceptance
checks. Its [local check record](docs/evidence/m12/RESULTS.md) preserves the
same independent failures. These checks do not tune the search, change
the numerical measurements in the M10 report or extend its physical
accuracy coverage. Only the report's implementation digest changed to
bind the updated CLI help disclosure.

The reserved cases are now consumed validation data. This milestone records
their failures without adjusting the search, deleting a case or widening
a limit. Future tuning requires a new registration and new held-out cases.
M10 completion means evaluation and reporting are complete, not that the
library meets all its accuracy or search-completion requirements.

## Development evaluation in M5

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
spot checks and Pluto perihelion were reserved for M10. This development
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

M8 adds optional lunar syzygy annotations with an explicit angular orb.
`test/syzygy.vitest.ts` checks the New/Full longitude definition on synthetic
directions, orb boundaries and failure contracts. The integration tests in
`test/syzygy-integration.vitest.ts` check receipt replay, JSON serialization,
shared work accounting and partition equality in the same lunar development
window and its subwindows. They do not establish independent angular
accuracy or extend the existing apsis validation coverage. No held-out
reference was collected or evaluated; the original Pluto distance failures
remain active.

M9 adds the local CLI. `test/cli.vitest.ts` builds and invokes its
launcher in subprocesses, checking strict arguments, JSON stream content,
exit statuses, receipt preservation, selections and TT boundary replay
against the library over the January 2000 development window and its
subwindows. It also exercises malformed-input, budget and coverage
failures. These tests establish command behavior, not independent accuracy.
No held-out reference was collected or evaluated; the original Pluto
distance failures and acceptance limits remain unchanged.
