# Descriptive chart factors

`analyzeFactors` turns supplied chart geometry into the existing angularity
and angle-ruler analyses, plus a short list of descriptions. It accepts a
cast event chart or the minimal `AngularityGeometry` shape, and forwards
`angleOrbDegrees` to `analyzeAngularity`. It calculates no new astronomical
positions, houses, dignity tables, or scores. Ingress and lunation searches
attach the same list to every returned event.

The list carries `label: "traditional conventions, not predictions"` and
`convention: "descriptive-factors;no-ranking-or-score"`. It describes
geometry and conventional table assignments. It does not infer effects on
people, places, governments, weather, or future events. Ordering is for
stable presentation and carries no priority or strength.

## Selection and wording

A house-system difference appears first as a `house-system-fallback`
factor, identifying requested and actual houses. Angular house descriptions
always use actual cusps. This is a description of the supplied fields;
for engine-cast charts the original chart retains the calculation flags and
provenance that explain a polar fallback.

An `angular-planet` factor appears for each planet selected by
`angularity.angularPlanets`, in the classical planet order of that analysis.
It describes angular-house membership, proximity to named angles, or both.
A planet that is near an angle but outside an angular house receives only
the proximity wording. Every matching angle is named in analysis order.
The configured orb, measured distances, actual house, and original longitude
remain in the supporting analysis; the prose does not round numerical
distances into claims about orb membership.

An `angle-ruler` factor follows for each angle in the angle-ruler analysis
order. It names the angle's sign and domicile ruler, then the ruler's own
sign, essential dignities, and debilities. The text distinguishes the chart
sect's triplicity, Egyptian term, and Chaldean face. Simultaneous dignities
and debilities all remain visible. Peregrine is explained as no essential
dignity, including when a debility is present. Repeated rulers retain their
separate angle descriptions. Ruler factors still appear when no classical
planet is angular.

The underlying conventions and their classical sources are recorded in
[angularity.md](angularity.md) and [angle-rulers.md](angle-rulers.md).
This layer adds description templates and selection order, with no further
historical doctrine or predictive interpretation.

## Traceability

Every item has an `id`, `kind`, `text`, and `source`. Planet factors also
name `planet`; ruler factors name `angle` and `ruler`. The `source` is a
JSON pointer relative to the containing `ChartFactorAnalysis` or ingress or
lunation event, rather than relative to `factors` itself:

| Kind | Source | Supporting fields |
| --- | --- | --- |
| `house-system-fallback` | `/angularity/houses` | Requested and actual systems |
| `angular-planet` | `/angularity/planets/{index}` | Planet, angular-house flag, actual house, and near-angle rows |
| `angle-ruler` | `/angleRulers/rulers/{index}` | Angle sign, ruler, and its complete essential condition including sect |

Ids use `angular-planet:{planet}`, `angle-ruler:{angle}`, or
`house-system-fallback`. Source indices describe positions in the same
returned result. Use the id for identity, since an orb or geometry change
can change which factors are selected. The list and supporting analyses are
deeply frozen and detached from caller-owned geometry. JSON serialization
preserves their shape and pointers.

The input validation belongs to the existing analysis helpers. Supplied
sect, prose, and sign annotations do not override computed conditions.
Validation does not authenticate a supplied chart as a real sky. A standalone
factor analysis is not an astronomical receipt; callers should retain the
cast chart's flags and provenance alongside it.

## Checks

[../test/factors.test.ts](../test/factors.test.ts) uses invented geometry
with equal cusps and hand-derived house membership, angle distances, and the
dignity table lookups already documented for angle rulers. It checks exact
wording for angular-house and proximity cases; no-angular-planet lists;
sect-dependent conditions; simultaneous dignities and debilities; repeated
rulers; the peregrine explanation; source resolution; deterministic order;
input detachment; immutability; and validation. These are convention and
presentation checks, not independent evidence of physical accuracy.

Separate integration checks cast charts at invented places, check actual
polar fallback houses, and compare factors attached to ingress and lunation
events with the standalone API. They verify wiring to engine-backed analyses,
without extending the independent timing claims recorded for event searches.
The session record is [evidence/m9/checks.txt](evidence/m9/checks.txt).
