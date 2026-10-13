# Product impact of angular differences

Design contract, 2026-09-27. The empirical-rate subset is implemented in `sensitivity.mjs`; certified bounds and matched-event analysis below remain specifications. No engine changes. Purpose: show when a numerical discrepancy can alter a displayed chart or event. This does not test astrological interpretation or prediction.

## Computation and language

Compare the same observable, instant, origin, reference frame and timescale. Reject material mismatches before computing impact. The empirical prototype permits documented model/reduction differences within an otherwise aligned comparison; it describes the resulting observable discrepancy, not isolated numerical error. A difference between implementations is not a bound on either implementation's physical error.

For two longitudes, compute the smallest signed circular difference in `[-180°,180°)`; record the sign convention as candidate minus reference. A 180° separation has an ambiguous direction and cannot support local sensitivity. Never divide an unsigned difference by a signed rate and report a signed timing correction.

**Birth-time sensitivity:** estimate how the selected observable changes under changes in the assumed birth instant, keeping other inputs fixed. The prototype compares centered finite differences at 60s and 300s, on a locally unwrapped observable. A future refinement may add step-halving. Record both rates and their difference; neither comparison provides a derivative error bound. For angles/cusps, evaluate the actual quantity at the stated location; do not substitute Earth's rotation rate. For a body relative to a moving cusp, use their relative rate.

Where the local rate is safely nonzero, `abs(discrepancy / rate)` is a **local equivalent input-time change**. It is not a measured event-time error and is not a birth-time uncertainty estimate. Label it approximate; an unknown derivative enclosure prevents a certified bound. Compare the actual observable range over a caller-supplied birth-time window against the measured discrepancy when available. Do not invent a person's recording precision or a prior.

After the first measured run, an additive flag was introduced for ratios exceeding the ±300s derivative-sampling neighborhood. `sampledNeighborhoodHalfWidthSeconds:300` and `extrapolatesBeyondDerivativeSamples:boolean|null` disclose that these are formal ratios, not demonstrated input shifts; linear validity across the implied shift is unestablished. No predeclared gate, computed ratio or status was changed after seeing the data.

**Events:** measure timing disagreement directly by independently locating and matching the same event in each model. For longitude aspects use relative longitude speed, not either body's speed. Near a station, a grazing aspect or a cusp tangency, division by a small slope is unstable. A station is a root of longitude speed; estimating station-time sensitivity requires speed discrepancies and the slope of speed. A positional discrepancy alone cannot determine station timing.

A root-shift upper bound `epsilon / m` is allowed only when: (a) `epsilon` uniformly bounds the event-function discrepancy throughout the common interval; (b) a validated derivative interval for the chosen reference function has one sign and absolute minimum `m>0`; (c) both matching roots exist in that interval, with branch/uniqueness conditions checked. An error measured at one instant, or a maximum over finite test points, is not such an `epsilon`.

**Discrete placements:** report the reference's angular margin to the nearest relevant sign/cusp/aspect boundary and whether the two evaluated models give different labels at the same input. Being farther from a boundary than a sampled discrepancy is a sample-specific comparison, not proof over a birth-time window. To claim a stable label over an input domain, independently enclose the observable and total error throughout that domain, including the boundary's motion. An exact boundary needs explicit ownership. A zero-duration boundary contact can alter pointwise constancy without changing duration fractions.

## Exact reporting fields

Every row uses this vocabulary; unknown quantities are `null`, never zero:

| Field | Required content |
|---|---|
| `caseId`, `observable`, `atUtc` | Stable vector ID; body longitude / angle / relative-to-cusp / aspect residual / speed; exact evaluation instant. |
| `comparison` | Candidate/reference identities and hashes; origin, frame, timescale, correction set, units and convention IDs; `matched:boolean`. |
| `discrepancy` | `signed`, `absolute`, `unit`; `evidenceKind:observed-at-point\|observed-finite-maximum\|validated-uniform-bound`; `domainId`; `directionAmbiguous:boolean`. |
| `rate` | `estimate`, `unitPerSecond`, `halfStepEstimate`, `stepSeconds`, `estimateDifference`, `method`, `enclosure:[lower,upper]\|null`, `enclosureEvidence:validated\|empirical\|none`, `domainId`. |
| `inputUncertainty` | Caller-supplied time-window endpoints; location domain; clock/ΔT hypothesis IDs; or `null`. No inferred distribution. |
| `budget` | Array of `{source, quantity, unit, lower, upper, evidenceKind, domainId, correlationGroup, reference}`. Sources distinguish ephemeris, frame/reduction, time conversion, ΔT/UT1, birth record, location and numerical rounding. |
| `budgetCombination` | `none\|worst-case-interval`; included/excluded source IDs and reason. No root-sum-square combination without a separately justified probabilistic model. |
| `boundary` | Definition and endpoint ownership; `signedMargin`, unit, evaluated labels in both models; `labelsDiffer`; `domainCovered:boolean`. Null if inapplicable. |
| `impact` | `status:measured-label-change\|local-linear-estimate\|validated-root-bound\|unstable\|unresolved\|not-applicable`; `equivalentInputSeconds`, `rootShiftBoundSeconds`, `measuredMatchedEventSeconds` separately nullable; assumptions and reason codes. |
| `coverage` | Evaluated domain, untested/unresolved regions, model scope, and `certificateId:null\|string`. |

The first release reports measured discrepancies, optional empirical rates and observed label changes. Certified bounds remain null unless a separate validated-bound provider supplies the required evidence. A rate whose validated enclosure contains zero is unstable. An empirical rate too close to its step-halving disagreement is unresolved for conversion. A configurable display threshold may suppress ill-conditioned estimates, but may never masquerade as a mathematical rate bound.

## Adversarial acceptance cases

1. **Circular wrap:** reference `359.999°`, candidate `0.001°` gives `+7.2 arcsec`, not `−1,295,992.8 arcsec`; sign labels differ with explicit boundary ownership.
2. **Ordinary linear case:** discrepancy `+1 arcsec`, exact rate `+2 arcsec/s` gives approximate local equivalent input change `0.5s`. A timing *bound* requires uniform discrepancy and matching-root evidence; otherwise null.
3. **Station:** positional discrepancy `1 arcsec`, longitude rate interval `[-0.01,+0.01] arcsec/s`: no finite timing conversion; station-time error cannot be inferred. No infinity or clamped denominator.
4. **Tangency:** `F(t)=t²`, perturbed `G(t)=t²−epsilon`: one touching root can become two crossings. Root pairing/completeness unresolved; `epsilon/rate` is prohibited at zero slope.
5. **Moving cusp:** body rate `1`, cusp rate `0.999 arcsec/s`: relative rate is `0.001`, not `1`. A supplied empirical enclosure spanning zero suppresses a claimed bound.
6. **Input dominates:** observable range under an explicit birth-time window is wider than the measured point discrepancy. Report both separately; do not call the engine inaccurate, average them, or turn their ratio into probability.
7. **Unsigned/directional ambiguity:** a 180° difference or unsigned discrepancy never produces a signed time correction.
8. **Convention mismatch:** geocentric/apparent vs topocentric/astrometric inputs fail comparison matching and produce `unresolved`; no numerical accuracy or product-impact ranking.
