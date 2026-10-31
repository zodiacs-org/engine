# Final implementation review

M12 reviews the library, CLI, scientific conventions and failure contracts.
The implementation sequence is complete, but independent acceptance is
**failing**. This is a private experimental project, not a claim that all
requested physical extrema are found or meet the registered accuracy budget.
[VALIDATION.md](VALIDATION.md) names the unresolved cases and their measured
windows. The [M12 check record](docs/evidence/m12/RESULTS.md) records the final
local gates. No numerical source, engine dependency, frozen reference or
acceptance limit changed during this review.
CLI help now names the Mercury, Neptune and Pluto validation failures.
The measured report was regenerated to bind that help edit in its source
digest; its numerical measurements and acceptance verdicts did not change.

## Scientific scope

The library searches simultaneous geometric distance using the engine's
public calculation API. Lunar extrema are measured from Earth's center;
planetary extrema from the Sun's center. Mars through Pluto retain the
engine evidence's system-barycenter convention. Their results do not
establish physical planet-center apsides. The independent physical-center
spot checks in the [measured report](docs/evidence/m10/RESULTS.md) do not
provide event-time validation for those centers.

Moon and Pluto use scalar distance refinement. Mercury through Neptune
use analytic distance-rate brackets with wider distance witnesses. A
refinement interval describes numerical localization under the search
assumptions, not the uncertainty of the underlying ephemeris. Pluto's
reported state rate need not vanish at its scalar-distance extremum.
Total relative speed and signed radial speed remain separate quantities.

Internal sampling and event ownership use TT. Civil labels and endpoint
delta-T pins retain the engine's qualifications. Boundary ownership is
`(from,to]` for the returned numerical instant. The before/after motion
probes are the canonical wider witnesses, can be asymmetric, and can lie
outside the request. Replay their receipts using the same engine and
runtime; the receipts do not authenticate externally supplied values.

Optional lunar annotations measure directed apparent ecliptic longitude
elongation at the extremum, with the engine's geometric-Moon exception.
They use the caller's explicit angular orb and label candidates only.
They neither compute the exact New/Full Moon instant nor establish a time
separation from it. No dates are ranked and no personal or event predictions
are made.

## Reviewed contracts and executable checks

| Contract | Checks |
| --- | --- |
| Geometric centers, unit conversion, separate speeds and replay requests | `test/sample.vitest.ts`, `test/event-records.vitest.ts` |
| Strict distance witnesses, numerical plateaus, finite precision and callback budgets | `test/solver.vitest.ts`, `test/solver-edge.vitest.ts` |
| Analytic-rate localization, stationary inflections and inconsistent rate/distance samples | `test/rate-solver.vitest.ts` |
| Nonuniform scalar grids, exact-zero planetary boundary ownership and no partial list after a late numerical refusal | `test/robustness.vitest.ts` |
| Deterministic TT partitions and unavailable padded coverage | `test/lunar.vitest.ts`, `test/planetary.vitest.ts`, `test/window.vitest.ts` |
| Input validation, shared budgets, preserved refusals and unexpected exceptions | `test/lunar-failures.vitest.ts`, `test/window-failures.vitest.ts` |
| Explicit lunar orbs, angular boundaries, receipts and shared work accounting | `test/syzygy.vitest.ts`, `test/syzygy-integration.vitest.ts` |
| CLI arguments, JSON fidelity, exit statuses and TT boundary replay | `test/cli.vitest.ts` |
| Broken local builds, failed output streams, complete large output and late combined refusal | `test/cli-acceptance.vitest.ts` |
| Reproducible examples and receipt replay | `test/examples.vitest.ts` |
| Reference integrity, independent comparisons and measured-report freshness | `test/references.vitest.ts`, `test/lunar-reference.vitest.ts`, `test/planetary-reference.vitest.ts`, `test/validation-evidence.vitest.ts` |
| Continued checks after failure and package isolation | `test/local-checks.vitest.ts`, `scripts/check-isolation.mjs` |

The new robustness tests use analytic curves and explicitly fabricated
receipts. They include smooth curves with extrema hidden between grid
samples that still return a completed empty search. This makes the
`sampled-not-proven` qualification concrete: successful finite sampling
cannot certify that every physical extremum was found. The CLI acceptance
tests use synthetic launcher modules and existing development inputs.
These checks add no independent astronomical coverage.

## Unresolved acceptance and follow-up boundaries

- Mercury's total speed and Neptune's event timing exceed their original
  limits in the consumed held-out corpus.
- Pluto exceeds its original distance allowance in development and held-out
  comparisons, including comparisons at the same TT. Its held-out search
  also refuses rather than returning a partial event list.
- Finite search and reference grids cannot rule out hidden pairs of turns.
  Physical planet-center event timing, civil-time accuracy and lunar
  annotation accuracy remain outside the independent validation claims.

The acceptance assertions remain ordinary failing tests. A CLI success
status means computation completed; it does not override these failures.
Search refusals and errors must remain distinguishable from an empty
completed window. An output-stream failure yields an unsuccessful process
status, but a failed stream cannot promise a diagnostic document.

Further numerical tuning requires new preregistration and fresh held-out
cases. The same-TT distance and speed discrepancies cannot be repaired by
moving an extremum estimate alone. Any engine change requires separately
authorized release work under the repository's archive rules. The current
scope permits neither an engine modification nor an invented physical-center
correction.

Run `npm run check` from `apsides/` as described in
[REPRODUCING.md](REPRODUCING.md). It runs every local gate despite failures
and keeps generated reports in ignored directories. The isolation gate uses
the carried build in a temporary copy; it does not establish a source
rebuild, archive-history binding or completion of all repository CI jobs.
The harness owns git operations and the draft PR.
