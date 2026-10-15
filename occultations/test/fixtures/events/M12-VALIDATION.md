# M12 evaluation protocol

Recorded before the first astronomical evaluation of the held-out partition.
The implementation preceding M12 is source commit
`bf10fb7`. M12 adds a separately solved topocentric angular minimum, using
the same engine/adapters and squared-chord derivative construction as the
geocentric appulse search. Its numerical policies and analytic/development
tests are fixed before opening the held-out astronomical comparison.

Evaluate every case and every check in both frozen partitions. Use the exact
maximum errors, source clocks, station variants and outline longitudes from
`EVENTS.md`, `development.json` and `held-out.json`. A missing, refused,
unresolved or nonfinite result fails; it cannot be omitted from the report.
The evaluator must require complete check-key coverage and fail on any
individual excess. Keep the first evaluation's failures even if a subsequent
implementation correction makes a rerun pass. Identify such a correction
explicitly; a rerun is no longer a fresh held-out evaluation.

Candidate retention additionally applies the existing `CANDIDATES.md`
containment rule to both partitions, including each published local contact
and local closest-approach time. This adds no timing allowance. Local angular
minimum is independently searched and is never an average of contact times.
Outline comparisons must preserve north/south and full/overlap identity at
each exact source meridian. No contact, outline or minimum convention is
selected by its residual.

The report retains each actual value, source value, absolute residual,
unchanged maximum, verdict and source locator. Grouped maxima distinguish
contact times, local minima, disk durations, coordinate conjunctions, coarse
outreach appulses, position angles, refracted altitude and outline latitude.
The scope of a maximum is the named finite set of cases, not every instant
between its earliest and latest dates. Source precision and uncertainty are
different from either an acceptance limit or a measured residual.

Supplemental contact sensitivities use angular limb clearance at one second
before and after the computed contact. Their central difference gives
arcseconds per second; its reciprocal converts a hypothetical angular error
to seconds. Moon range gives the corresponding transverse conversion from
kilometres to seconds. This diagnostic is not a validated derivative-error
bound or an assigned physical uncertainty. A zero or nonfinite speed leaves
the sensitivity unavailable. Catalogue error, limb relief, site datum and
correction uncertainties remain unknown; no total physical seconds bound is
invented. Analytic tests enforce the conversions and null handling.

Generated reports and bundled evaluation scripts stay in `.generated/`.
Authored tests and scripts remain committed. Documentation may state rounded
upper residuals only when tests enforce those ceilings against the same
independent source cases; any ceilings chosen after evaluation are labelled
presentation/regression checks and do not replace the frozen acceptance gates.
The final validation record also names unvalidated quantities and unavailable
root build gates. Scope checks must continue to exclude this folder from the
engine's npm package and detect any authored change outside this folder.
