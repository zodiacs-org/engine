# Next build: investigate the ephemeris provider first

For the 1-arcsecond ambition, the next focused experiment should evaluate the position provider and its declared conventions. The measured rotation difference alone cannot account for the largest residuals in this sample. A rotation patch is still a possible refinement, but these results do not support treating it as the main accuracy upgrade.

This is an optional handoff to Opus, which retains ownership of the engine/runtime and integration. The reviewed target remains rc.10 at `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`; this audit did not change the production branch, implementation, dependencies, CI, or site. No merge or release is proposed here.

## What the completed audit establishes

Source: [results/rc10/report.json](results/rc10/report.json), generated 2026-09-27, with matching distribution and dependency fingerprints. The 210 rows reuse the existing 21 dates × 10 bodies. References use geometric Moon vectors and LT+S for the other bodies, independently rotated with ERFA. Remaining differences are documented in [SOURCE-REVIEW.md](source-review/SOURCE-REVIEW.md) and [AUDIT-PROTOCOL.md](AUDIT-PROTOCOL.md).

| Observed quantity | Result | Interpretation |
|---|---:|---|
| Cases exceeding 1″ in longitude **or** latitude | 168 / 210 | The aspirational coordinate threshold remains unmet in this finite sample. This is not a count of independently diagnosed bugs. |
| Angular residual with independent rotation | Median 2.91584″; maximum 28.77886″ | Position discrepancy under the selected reference conventions. |
| Geometric vector residual before ecliptic rotation | Median 2.95988″; maximum 28.86984″ | A combined kernel/frame/target diagnostic; excludes the final of-date rotation and apparent corrections. |
| Rotation choice on the same supplied vector | Maximum 0.16047″ | The tested AE-versus-ERFA rotation choice is much smaller than the largest position residuals. |
| Public output versus reconstructed provider reduction | Maximum 2.9 × 10⁻¹⁰″ | In these cases the wrapper reproduces the inspected dependency pipeline to numerical precision. This is internal consistency, not astronomical validation. |
| Physical-center versus barycenter controls | Maximum 0.33383″ across 18 controls | Only three epochs for each of Mars–Pluto; no universal bound or proof of the engine coefficients' target semantics. |

These are separate statistics, not additive error components. Do not subtract their maxima or convert their ratios into causal percentages. The source shows truncated VSOP series, a separate analytic Moon model, TOP2013-derived Pluto seeds, and approximate planetary aberration. That makes the provider a concrete investigation target; it does not identify a unique cause for every residual.

## First bounded experiment

1. **Write down the target contract.** Choose supported dates, target centers, native frame, time scale, correction modes, and whether the 1″ goal applies to coordinates or vector separation. Keep the old 210 cases as explanatory/regression cases; preregister an additional holdout before evaluating a candidate.
2. **Compare providers through geometry first.** In an isolated prototype, compare the current dependency with one candidate higher-precision kernel using the same epoch, origin, target identity and fixed axes. Resolve or explicitly retain unknown center/frame semantics. Then evaluate light time, aberration and of-date reduction as separate stages. No empirical offsets fitted to the existing 210 cases.
3. **Require both accuracy and browser costs.** Record per-body residuals, worst cases, date coverage, unsupported cases, artifact/model hashes, download and memory size, initialization cost and warm-query timing. Candidate acceptance must include a matched-reference holdout and a browser budget; passing the audit's integrity checks is not an accuracy gate.
4. **Revisit events after selecting the position contract.** Event timing depends on the chosen vector/correction model and local motion. The current discrepancy-to-rate estimates are local input-time sensitivities, not measured event-time errors or event accuracy guarantees.

The useful next deliverable is a provider decision record and a small executable comparison prototype. Production replacement, event integration and release remain separate decisions for Opus.

## Optional provider boundary

Consider a narrow internal interface that returns **native geometric Cartesian state**, with explicit metadata, before adding apparent corrections or chart conventions. This is a design proposal, not a required refactor or implemented API.

| Component | Responsibility |
|---|---|
| Time resolution | Resolve civil input/calendar/timezone assumptions to tagged epochs; expose deltaT and any TT/TDB conversion. Avoid a hidden shared clock as part of the provider contract. |
| Ephemeris provider | Return position and, when supported, velocity; declare origin, target/body-center meaning, axes, time scale, units, valid range, model version and data digest. Unknown semantics must remain explicit. |
| Coordinate reduction | Convert origins/frames as supported; apply named light-time, aberration and optional deflection policies; reduce to the chosen equator/ecliptic of date. Preserve provenance. |
| Astrology calculations | Consume declared coordinates for signs/aspects/events; use the separately specified time, location and Earth-orientation inputs for angles/houses. |

Allow an adapter to declare genuinely native output, including geocentric Moon geometry, rather than relabeling it as a barycentric state. Frame/origin adapters must be independently tested. The current fast provider could remain available while a precision option is evaluated; no backend is selected by this document.

## Parallel work that remains useful

Historical-time normalization and uncertainty propagation address different sources of error. Their contracts, source provenance and validation can progress independently of the provider experiment. Neither improves the kernel's orbital accuracy by itself, and finite sample residuals must not be reused as certified uncertainty bounds.

This audit demonstrates a measurable engineering opportunity, not superiority to Swiss Ephemeris or a scientific discovery about astrology. The next claim should be the narrower one actually established by a convention-matched holdout, with declared coverage and browser costs.
