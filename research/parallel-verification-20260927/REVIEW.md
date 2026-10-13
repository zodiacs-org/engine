# Independent integration review

Reviewed on 27 September 2026 by a separate AI agent. This was a code, numerical-convention, integrity and reproducibility review; it was not a human astronomical audit or fresh corroboration of every historical source.

**Verdict: no remaining blocking issue within this package's stated research scope.** The delivered `results/rc10/summary.json` records all ten suites passing. Its target identity matches both the frozen engine distribution and the recorded dependency file digests. Passing these research suites does not approve a production release.

## Executed checks

The reviewer independently reran the following checks and inspected the final integrated results:

| Check | Result |
|---|---|
| Raw position-reference integrity controls | 15 passed, including wrong target, origin, time scale, calendar and swapped columns |
| Independent JPL position comparisons | 210 rows; none outside the 60-arcsecond diagnostic gate; 168 outside the one-arcsecond aspirational threshold |
| ERFA/vector ASC and MC comparisons | 1,300 gated comparisons passed; 70 additional ASC cases remain exploratory |
| Event integrity controls | Nine deliberate bad-input/reference cases rejected |
| Two bounded JPL lunations | Both pass the 10-second diagnostic; differences approximately −2.96 and −3.80 seconds |
| Uncertainty companion controls | 25 checks passed; ten future acceptance cases remain explicitly unimplemented |
| Uncertainty real-engine example | 3,602 chart evaluations, all chosen samples handled; continuum coverage remains false |
| Historical clock model | Thirteen controls passed |
| Focused reproductions | Saturn-return clock concern reproduced; illumination approximation measured; five existing guards pass |
| Output isolation | Bootstrap refuses an existing project manifest; master refuses a nonempty result directory; sentinel files preserved |

Both uncertainty JSON Schemas and the three supplied examples also passed schema validation during review. The final nullable source-commit contract was checked against the updated code and example run.

## Findings resolved before delivery

- The uncertainty evaluator now rejects unknown request fields, checks the returned clock/input receipt, and refuses invalid sign, angle, cusp and house values. Equal samples remain `observed-constant`, never certified.
- Event roots and brackets are reconstructed from the saved raw JPL tables. Missing or edited processed numbers, misleading ISO labels, duplicate objects and an ignored numerical ΔT pin cannot produce a passing result.
- Position references verify their actual raw response headers as well as request metadata, raw digests, epochs and processed coordinates. The reviewer implemented the header checks and their seven negative controls after identifying this gap.
- Candidate versions and archives are distinguished from the frozen baseline. Candidate source ancestry is a caller assertion or explicitly unknown; the master no longer copies the baseline commit into every candidate preview.
- Baseline identity checks include dependency file hashes. Both runtime creation and report output require fresh directories, preventing project-manifest overwrites and stale reports from surviving a failed new run.

## Scientific and operational boundaries

The ERFA geometry uses a coherent true-equatorial basis, selects the eastern/rising ASC intersection, and explicitly supplies UT1 and TT with the synthetic 69-second offset. Its finite agreement does not validate planetary positions, historical time conversion or house cusps.

JPL position comparisons retain the documented differences in coordinate reduction, corrections and planetary-system barycenters. Their residuals are not pure ephemeris error or absolute accuracy bounds. Two lunations do not establish station accuracy, tangency handling, catalog completeness or a universal timing guarantee. The Moon illumination comparison deliberately shares the engine's astronomical dependency and is labeled accordingly.

The uncertainty implementation samples a bounded domain. Certification, local-clock normalization, priors and multidimensional uncertainty remain proposed work. The historical records are conditional legal-rule fixtures, not verified city/hospital birth-time conversions or newly discovered clock practices.

No engine, website, app or production release configuration was changed by this package. The bootstrap needs network access to obtain its pinned dependency unless already supplied through an appropriate environment; the saved-reference comparisons themselves run offline. Runtime hashes identify tested bytes but do not independently attest a future candidate's source ancestry.

The package is suitable as a separate measuring tool and integration handoff. It provides no basis for claiming that Zodiacs already replaces or exceeds Swiss Ephemeris across its supported scope.
