# Product-impact sensitivity companion

`sensitivity.mjs` is a dependency-free pure-function module. It consumes measured longitude differences and **empirical** 60-second and 300-second derivative estimates. This fivefold step comparison is not the step-halving check discussed in the broader specification. It computes a local equivalent change in assumed input time; it does not estimate actual event-time error.

The supported convention status allows explicitly documented model differences within an otherwise aligned comparison. Its output describes the measured observable discrepancy, including those model differences; it does not isolate pure numerical error. Material origin/frame/observable mismatches remain unsupported.

```js
import {assessInputTimeSensitivity} from './sensitivity.mjs';
const result = assessInputTimeSensitivity({
  body: 'Moon',
  utc: '2000-01-01T00:00:00.000Z',
  longitudeDifferenceArcsec: 1, // synthetic example, candidate minus reference
  longitudeRateArcsecPerSecond60s: 0.5, // synthetic rate
  longitudeRateArcsecPerSecond300s: 0.49, // synthetic rate
  conventionStatus: 'aligned-with-documented-model-differences',
});
```

For accepted inputs, `equivalentInputTimeSeconds` contains:

- `estimate`: absolute discrepancy divided by the absolute 60-second rate estimate;
- `range`: the two ratios sorted ascending, using the larger and smaller absolute rates. **This is not an enclosure, confidence interval or physical bound.**

The result also contains copied body/date identifiers, status, reason, input diagnostics, the complete policy and warnings. The signed longitude difference must be finite and strictly less than `648000 arcsec` (180°) in absolute magnitude; an exact half circle is directionally ambiguous, and larger values are outside the required principal branch. Both rates must be finite, have the same nonzero sign, have absolute magnitude at least `1e-5 arcsec/s`, and differ by no more than 10% of the larger absolute magnitude. These fixed display gates are heuristics. A ratio can be unstable near a station even where input longitudes are accurate; the tool does not silently clamp the denominator. Equal sampled rates do not rule out unobserved curvature.

Statuses are `sampled-linearization`, `unstable-rate`, and `unsupported-conventions`. Failed conversions return `equivalentInputTimeSeconds:null`. No root or timing bound is returned. Unknown/nonfinite values remain null in diagnostic output.

An additive review flag records `sampledNeighborhoodHalfWidthSeconds:300` and `extrapolatesBeyondDerivativeSamples:true` when the estimate **or upper ratio** exceeds 300 seconds (`false` otherwise; `null` if no ratio is available). A flagged value is a **formal ratio, not a demonstrated input-time shift**: the derivative samples do not establish linear validity across that larger shift. The flag was added after reviewing the first measured dataset, whose ratios could extend far beyond the sampling neighborhood. It changes no calculation, acceptance threshold or original status; the predeclared rate gates remain unchanged. An unflagged result still carries no proof of linearity.

`compareObservedBoundaryMargin` compares only the magnitudes of a supplied pointwise margin and discrepancy. It never establishes a sign/house change, because crossing direction, boundary ownership and the two actual labels have not been supplied. It establishes no interval stability. Margins must already use the same circular branch and angular units as the discrepancy; the function does not normalize longitudes or calculate a moving cusp.

Run ten analytic acceptance groups:

```sh
node product-impact/test-sensitivity.mjs
node product-impact/test-sensitivity.mjs --output /tmp/product-impact-tests.json
```

No real measurements are embedded in this module or its tests. The enclosing accuracy audit supplies the measured rows. `SENSITIVITY-SPEC.md` describes the broader error-budget design; its certified-bound and matched-event capabilities are **not implemented here**.
