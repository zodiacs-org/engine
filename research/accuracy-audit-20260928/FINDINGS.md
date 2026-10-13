# Findings and their engineering implications

Frozen target: `@zodiacs/engine@0.1.1-rc.10`, source `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`. Both the distribution and Astronomy Engine 2.1.19 dependency match recorded file hashes. Comparisons use 21 synthetic UT1 labels from 1801 to 2198 with TT−UT1 pinned to 69 seconds. These are not historical UTC reconstructions.

## 1. A frame correction alone does not close the observed gap

The first toolkit compared public chart coordinates with JPL Q31 apparent ecliptic positions. This follow-up acquires independent fixed-frame vectors and better matches the correction policy: geometric for the Moon, LT+S for other bodies. Independent ERFA rotation gives a median spherical separation of **2.916 arcseconds** and maximum **28.779 arcseconds**. The largest case is Pluto at the synthetic label `2198-11-23T17:19:00Z`.

The count exceeding one arcsecond in longitude or latitude stays **168 of 210**. The intersection is 164 cases: four drop below and four rise above. This count uses coordinate differences; the table below uses spherical angular separation, a distinct quantity.

| Body | Cases exceeding 1″ in either coordinate | Maximum independent-frame separation | Maximum geometric-vector separation | Maximum rotation-choice separation |
|---|---:|---:|---:|---:|
| Sun | 8/21 | 2.269″ | 2.220″ | 0.160″ |
| Moon | 11/21 | 7.359″ | 7.352″ | 0.158″ |
| Mercury | 21/21 | 8.142″ | 8.194″ | 0.160″ |
| Venus | 16/21 | 14.289″ | 14.285″ | 0.160″ |
| Mars | 11/21 | 3.443″ | 3.417″ | 0.160″ |
| Jupiter | 20/21 | 9.783″ | 9.760″ | 0.160″ |
| Saturn | 21/21 | 16.643″ | 16.678″ | 0.159″ |
| Uranus | 20/21 | 16.259″ | 16.258″ | 0.160″ |
| Neptune | 21/21 | 18.769″ | 18.918″ | 0.160″ |
| Pluto | 19/21 | 28.779″ | 28.870″ | 0.160″ |

The geometric control removes apparent corrections and ecliptic-of-date rotation from that comparison. It still retains model, center, fixed-frame and time-argument distinctions. Its nonzero residual cannot be assigned exclusively to series truncation. Nevertheless, these measurements do not support prioritizing orientation changes as the sole route to a one-arcsecond goal.

## 2. The source reveals intentional approximation choices

The upstream VSOP generator uses a **0.4-arcminute (24-arcsecond)** selection target. The installed engine contains truncated VSOP series; Pluto follows a separate TOP2013-seeded interpolation/integration path. This is evidence of an accuracy/size tradeoff, not a certified bound and not a complete explanation of each observed residual.

Ordinary bodies use a first-order apparent-position approximation that retards both Earth and target. The Moon uses observation-epoch geometric coordinates. The nutation implementation has five terms, and the fixed-frame lineage includes FK5/EQJ assumptions. Exact source evidence and limitations are in [source-review/SOURCE-REVIEW.md](source-review/SOURCE-REVIEW.md).

The engineering implication is to evaluate a more precise native position provider behind an explicit convention contract, while retaining the current provider as a possible compact option. Browser costs, coverage, licensing, and new holdout accuracy must be measured before choosing a replacement. See [NEXT-BUILD.md](NEXT-BUILD.md).

## 3. The decomposition is reproducible, without invented causal percentages

For every case, signed longitude and latitude components satisfy:

`original discrepancy = shared-frame residual + rotation-choice delta + reference-convention delta`.

Maximum numerical closure residual is below `1e-8` arcsecond. Reproducing the public chart through the reviewed dependency path agrees to below `3e-10` arcsecond, a useful clock/adapter consistency check. Neither result proves astronomical accuracy.

The rotation-choice separation never exceeds 0.161 arcsecond in this sample. Changing strict ICRS versus the diagnostic mean-J2000 interpretation changes the projected direction by at most 0.024 arcsecond. Optional physical-center versus system-barycenter comparisons have a maximum of 0.334 arcsecond across 18 observations; individual center solutions and dates are recorded. That does not establish their maximum over all dates or identify the exact center of every approximate coefficient set.

The independent-reference-versus-Q31 component bundles different rotations, apparent corrections, and Moon geometry policy. It is not uniquely “precession error” or “gravity correction.” Aggregate maxima and angular distances are not additive.

## 4. User impact requires local evidence

No tropical sign label differs between the two evaluated chart/reference positions in these 210 cases. These dates are not designed as cusp tests, so this does not establish correctness at sign boundaries or throughout a birth-time window.

The companion computes a formal local input-time scale from longitude discrepancy divided by sampled longitude rate. Its heuristic gates pass all 210 observations, but 96 resulting ratios exceed the ±300-second derivative neighborhood. The largest ratio is about 29.36 days near slow Pluto motion; it is **not an observed 29-day event error or a demonstrated correction to a birth time**. The additive extrapolation flag makes this limitation machine-readable. Actual event discrepancies must be measured by comparing matching roots.

The earlier uncertainty prototype remains valuable because birth-time uncertainty and model precision are separate inputs. This audit supplies measured model differences, not probability distributions or certified uncertainty bounds.
