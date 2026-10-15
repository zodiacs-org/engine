# M11 final validation registration

This recipe was written before fetching its new position corpus and before
inspecting any M11 residual. It adds evidence to the retained M5, M7, M8 and
M9 comparisons. It changes no training data, coefficient, interpolation
setting, source solution requirement or acceptance allowance.

The M1 design proposed selecting final epochs before fitting. This final
selection was instead registered after the M5 fit was frozen, and before
new M11 intake or residual inspection. The original design statement is
retained. Independence here rests on training-disjoint epochs, no consultation
of fitted outputs during selection, and exact preservation of the earlier
coefficients and fit settings. It does not rest on a claim that this selection
predated the original fit.

`src/final-recipe.ts` fixes deterministic irregular interior samples in every
segment, every join and samples on both sides of every join, and the installed
coverage endpoints. The final position corpus extends over the entire TT
interval in `FULL_RECIPE`. Derivative centers cover regularly selected segments,
every shard join and the coverage endpoints. Their independent fine and coarse
stencils use the already accepted reference derivative and convergence limits.
All requested epochs, including derivative support outside installed coverage,
must be disjoint from coefficient training. The exact selection, counts and
batching are enforced by `tests/final-recipe.test.ts`.

`FINAL_RECIPE` fixes a seed and integer recurrence, with rounding before
comparison. Training collisions are resolved by the registered forward shift
before intake, without consulting any fitted output. Required coverage edges
and joins can coincide with retained M5 holdouts; final interior selection is
new. This is a held-out test against fitting, not a claim that every validation
epoch is new to every earlier reference corpus.

Complete overlapping derivative stencils stay inside one Horizons response.
Every response must match the frozen fit's solution identity. Intake is serial,
and original responses and full reports remain ignored. A new live response
cannot silently replace a pinned source. Proposed manifests are reviewed and
retained separately from the earlier manifests.

The final event recipe is independent of fitted events. It scans daily Horizons
positions in windows near the start, interior and end of the installed range,
then refines reference sign changes with additional Horizons samples and ERFA.
The exact windows and settings are in `FINAL_EVENT_RECIPE` and enforced by
`tests/final-event-reference.test.ts`. Existing calendar-2000 tests remain
mandatory. Station and ingress brackets use the retained timing allowances;
retrograde windows are checked against those independently derived stations.
This samples event behavior across the range without claiming an exhaustive
scan of every event in the entire installed interval.

The M1 angular, radial and derivative gates, M5 seam gates, and independent
reference convergence gates remain unchanged. All seven position/speed
metrics are reported separately. Numerical failures must be retained and
explained. A revised reference recipe must retain the rejected one and its
outcome. No failure can be erased by tuning on the final corpus.
