# Experimental birth-window computation contract, v0.1

Status: implementation-ready companion proposal, with a finite evaluator. Target: `@zodiacs/engine` `0.1.1-rc.10`, commit `f5f33892`. No proposed name here reserves or changes a production API.

## 1. The question being computed

Let `D` be the allowed input set, not merely two endpoint charts. A point in `D` contains a resolved instant, a location, a historical clock hypothesis if relevant, and a selected calculation model. For a discrete feature `f`, report its observed values and whether its value is constant over all of `D`.

Discrete features in v0: tropical body sign; Ascendant/MC/Descendant/IC sign; a body's house; and presence of one explicitly named angular aspect within a stated orb. Element/modality can later be derived from sign results. Varga, KP and dasha features are deliberately not implemented against rc.10 because they have no corresponding public API in the inspected package.

**Existence and universality are different obligations.** Two valid input witnesses with different values prove that `f` is variable within the chosen model. A million equal samples do not prove that `f` is constant between them. A variable result may still have unknown additional values or unresolved transition locations.

## 2. Domain and interval rules

The wire schema requires explicit endpoint inclusion. A singleton is legal only if both ends are closed. Empty or reversed intervals are rejected. UTC timestamps use `YYYY-MM-DDTHH:mm:ss.sssZ`; the finite preview works on the integer-millisecond lattice supported by JavaScript `Date`. The future certified computation covers continuous real time over the declared time scale, not just that lattice. A certificate must name which of these domains it proves.

UTC domain branches form a **set union**. Overlapping branches may carry different historical/model provenance, but duplicate instants must not acquire extra weight in a uniform-UTC prior. Preserve source branch identities for explanation even after normalizing physical intervals. Adjacent intervals merge only when doing so does not erase a missing endpoint or different assumptions. A missing isolated endpoint has zero duration yet can alter a universal discrete-feature claim.

Do not unwrap angles with linear min/max. A longitude range around 0° is circular: 359.9° to 0.1° is not a range spanning the other 359.8°. Sign cells are `[30k,30(k+1))` modulo 360°. Equality belongs to the following sign. House cusp equality follows the chosen house implementation; zero-width or geometrically degenerate houses are an unresolved/unsupported model condition until a published convention is explicitly selected.

An uncertain coordinate box represents every point in its latitude/longitude rectangle. West greater than east means an explicitly declared antimeridian crossing; a full-world longitude range needs its own representation, not a zero-width box. City labels and map centroids are not uncertainty estimates. The schema requires numeric bounds; do not invent a radius from geocoding precision. Time and place may be correlated (e.g. LMT); the normalized domain must retain that dependence instead of substituting an unjustified Cartesian product.

## 3. Local clocks are a separate normalization stage

For a local wall-time interval `W` and a versioned clock map `c_h(t, location)`, compute the preimage `D_h = {t : c_h(t, location) in W}`. Enumerate clock transitions, intersect each monotonic rule segment with `W`, and union the resulting UTC intervals. Do not resolve only the two endpoints and connect them.

Required policies are explicit:

- **Fold:** retain every matching instant by default. An explicit earlier/later selection is allowed but must be recorded as a caller assumption. A fold branch has no implicit 50/50 probability.
- **Gap:** return the nonexistent wall-time subset. Default reject stops the request. `exclude-and-report` permits the valid subset but the result remains incomplete for the user's original statement. Never silently shift the clock reading forward. A user-selected repair is a new request with the original preserved.
- **Historical clocks:** each hypothesis names source, version, validity geography/dates, offset convention, and unresolved evidence. National mean time, railway time and birthplace LMT are different hypotheses. `lmt` in rc.10 only indicates a sub-minute offset; it is not proof of birthplace LMT.
- **Calendar:** require proleptic Gregorian in the current profile. Julian or civil cutover dates remain unresolved until an independent calendar normalization layer is implemented. Do not pass a Julian date as Gregorian.
- **Leap seconds/time scale:** current profile accepts UTC civil timestamps without `:60`. A leap-second-spanning certified time model needs a versioned UTC↔TAI/UT1/TT map. The JS Date preview must reject `:60`; it must not claim physical elapsed-time completeness over leap seconds.

The current engine's `resolveLocalToUtc` chooses the earlier fold and shifts a gap. It is useful for compatibility checks but **cannot be the normalization oracle for this feature**. The preview accepts resolved UTC domains only. Real IANA normalization must record tzdb release and build options (including backzone); host Intl can be a diagnostic comparator, not a versioned certificate.

## 4. Separate uncertainty axes

1. **Input uncertainty:** allowed birth time, location, recording roundoff, and clock hypothesis.
2. **Convention sensitivity:** house system, zodiac/ayanamsa, aspect definition, and named point convention. Different house systems are parallel model branches, not noisy draws from one truth.
3. **Astronomical/model uncertainty:** ΔT/UT1 history, ephemeris approximation, frame transformation, and numerical rounding.
4. **Interpretation validity:** outside this calculation contract; a stable sign is not proof of a personality claim.

The first release is tropical and apparent geocentric, matching rc.10. A fixed ΔT runs through `natalChart({utc, deltaT, ...})`, not `positions(utc)`. A ΔT interval requires evaluation/enclosures across that axis; evaluating only its endpoints is insufficient without monotonicity proof. Agreement between two ephemerides is evidence, not a physical error bound. A certificate must declare whether it establishes the implemented mathematical model, its floating-point execution, or physical ephemeris bounds. Only the first two are plausible initially.

House-system branches use the actual returned house system. If the engine substitutes whole-sign for requested Placidus/Koch, the strict preview records an unavailable requested-system house result and reports the fallback. A later opt-in fallback mode may compute a separately labeled result; it must not merge it into "Placidus stable".

## 5. Experimental request/result shape

JSON Schemas in `schemas/` are the structural contract. Cross-field numeric and temporal validation is mandatory beyond JSON Schema: timestamp validity/order, nonempty windows, parameter order, model capability, no duplicate feature IDs, finite values, prior normalization and proof coverage.

`request` contains schema version, evaluation mode, UTC union or unresolved local-wall window, location domain, explicit house systems and ΔT mode, requested features, budget, and `prior`. `model.engineCommit` is a full 40-character source commit assertion or `null` when ancestry is unknown. The result retains it as `assertedEngineCommit`; a version string or entry-module hash does not establish source ancestry. Candidate runners must not copy the baseline's commit assertion unless their complete frozen distribution/dependency identity matches, or the caller explicitly supplies that source claim. A missing prior is invalid; `{"kind":"none"}` explicitly requests no probabilities.

`result` contains the request hash, provenance, coverage, sample/evaluation counts, and one feature result per feature/model branch. Status vocabulary:

| Status | Required meaning |
|---|---|
| `certified-constant` | A checked certificate covers every permitted point, no missing/undefined domain, and proves one feature value under the named model. Never emitted by the preview. |
| `observed-constant` | All valid finite witnesses agree. Does not claim anything between witnesses. |
| `variable` | At least two valid witnesses with different values, or a checked certificate with distinct nonempty cells. Further unseen values remain possible unless coverage is certified. |
| `unresolved` | No valid value or available proof establishes a usable feature conclusion; include reasons/regions. |
| `unavailable` | Feature undefined or unsupported throughout evaluated inputs, e.g. houses with no location. |

Every result separately records `complete`, meaning the requested domain and all required model capabilities have been fully handled. For finite non-singleton domains, `complete:false` is mandatory even if every second was sampled. `finiteDomainEvaluated` may be true when all chosen samples were computed. Undefined/fallback evaluations remain in `issues`; never drop them from the denominator to improve a result. `variable` with incomplete coverage is valid and useful; it is not a complete list of possible values.

Witnesses contain input instant and location, requested/actual system, value and engine flags. Sample results have `transitionBrackets` only as **observation brackets**, not unique-root intervals. Different endpoint values imply some change under suitable continuity, but do not imply one change. Equal endpoints do not rule out a pair of changes or a zero-duration contact. The finite preview emits no transition partition or estimated switch timestamp.

## 6. Finite implementation shipped here

`src/preview.mjs` accepts a frozen ESM module path and uses only inspected public exports. It deterministically selects both included interval endpoints and interior grid points no farther apart than `maxStepMs`, except for intentionally excluded endpoints; records requested and realized step, budgets before allocation, deduplicates union instants and evaluates every house-system branch. It supports point location or absent location, engine/pinned ΔT, and `prior:none` only. Continuous boxes, local times, priors and ΔT intervals are explicitly rejected until their normalization/integration implementations exist.

Feature computation:

- body sign: the public body's `sign`, checked against `signForLongitude(lon).slug`;
- angle sign: `signForLongitude(chart.angles[key]).slug`;
- body house: `houseOf(body.lon, chart.houses.cusps)` only if actual system equals requested, all cusps are finite and geometrically nondegenerate under the selected convention;
- aspect present: `abs(separation(lonA,lonB)-angleDegrees) <= orbDegrees`, with a closed orb boundary. This is an explicit Boolean definition, independent of the engine's default aspect-orb choices. Exact equality matters for pointwise constancy, even when it has measure zero.

The preview records a maximum finite-grid gap; it does not describe that gap as a certified resolution for all transitions. One-second sampling can miss a subsecond excursion. Unknown-time input is represented by a day domain; it is not a noon instant with `timeKnown:false`. With absent location, body features remain available and angle/house features are unavailable. In the preview, inputs with a point location use `timeKnown:true` at each candidate instant because each is a hypothesis, not a known birth time.

## 7. Certified implementation (future, concrete work package)

For each normalized domain component/model branch:

1. Split at clock-rule discontinuities, known formula branch boundaries, coordinate singularities, house fallback boundaries, and ΔT piece boundaries. Keep closed-boundary ownership explicit.
2. Create a feature dependency graph. Cache shared ephemeris/angle enclosures per cell; do not recompute an entire chart per feature if lower-level validated quantities are available.
3. Enclose each continuous quantity with outward-rounded interval or validated Taylor arithmetic, including ephemeris evaluation and coordinate transformations. Ordinary double samples and empirical maximum-speed estimates do not establish bounds.
4. For sign boundaries isolate roots of an appropriately unwrapped longitude minus `30k`; bound unwrap validity per cell. For houses isolate body-minus-cusp zeroes only on validated, ordered cusp cells. For aspect presence isolate `separation-target±orb`, partitioning conjunction/opposition/circular branch points first. For tangencies, retain a boundary point even without a sign change.
5. Exclude cells only when an enclosure proves no boundary contact. A monotonicity argument needs an interval derivative bound excluding zero. Use interval Newton/Krawczyk or another checked enclosure to prove existence/uniqueness where applicable; pure sign bisection establishes neither completeness nor tangency exclusion.
6. Continue subdivision to requested tolerance. Root clusters, singularities, exhausted budgets and unsupported coefficient spans become explicit unresolved cells. A tolerance is an output bracket size, not permission to drop unresolved slivers.
7. Produce a complete partition of `D` into constant open cells plus boundary cells/points and unresolved cells. Feature vectors can share one partition. An exact irrational root need not be printed as a decimal; keep a certified isolating bracket and boundary ownership relation. Do not assign all bracket interior to one sign.
8. The certificate checker verifies domain coverage, disjointness/endpoint ownership, bound provenance, each root/exclusion proof and every feature label. It should be small, separate from the search heuristic, and independently implemented or reviewed. Save arithmetic backend version, precision, operation rounding mode, coefficient hashes, clock dataset hash and proof-format version.

Coordinate rectangles and ΔT intervals make this a multidimensional partition. Return regions/enclosures rather than pretending a single transition time exists. Correlated time/location LMT domains require a parameterized relation. No exhaustive multidimensional claim is permitted from corners alone.

## 8. Priors, percentages and rounded records

Default: no prior and no percentage. A duration fraction is not automatically a probability. A named uniform-UTC prior uses Lebesgue measure on the **deduplicated** UTC union. A uniform-wall-reading prior with ambiguous clock branches needs conditional branch weights, since one wall reading may map to two physical instants. Neither interpretation is a default substitute for the other.

A hospital record rounded to five minutes is a likelihood/recording model, not an established prior on actual birth time. Specify nearest/floor/ceiling rounding and ties, then combine with a declared birth-time prior if probability is requested. A nearest-five-minute record may produce a `[record−150s, record+150s)` support under a declared ties-up convention; it does not establish equal likelihood across that support.

With certified cells and an explicit probability measure, compute masses by integrating the stated density. Root brackets contribute probability intervals, not point estimates; unresolved mass is separately reported. Atoms in a prior give singleton boundaries nonzero probability. For house/model variants report conditional results separately unless the caller supplies explicit weights and a defensible interpretation. Finite sample proportions may be exported as sample counts only, never as posterior probabilities.

## 9. Independent oracles and acceptance

Use three complementary levels; none is sufficient alone:

- **Analytic contract cases**: synthetic longitude/angle/predicate functions with exact roots and pathological excursions. These exercise partitioning, circular geometry, endpoint ownership, tangency, uncertainty axes, union deduplication and budget handling without asking the engine to validate itself. `fixtures/acceptance.json` contains these expectations.
- **External physical numerical references**: frozen JPL/ERFA/SOFA-based comparisons with matched timescale, coordinate origin, frame, precession/nutation, aberration and light-time choices. Reference engine agreement measures numerical accuracy; it does not certify the interval algorithm. Swiss can be a comparator, not the only arbiter, consistent with B1.
- **Independent interval/proof checks and dense cross-checks**: compare certified roots to a separate high-precision implementation; generate adversarial synthetic functions and randomized real windows. The B2 proposal's 1,000 windows at 1-second samples is a useful falsification gate, not proof of zero missed continuum events. Preregister range/seed/grid/adaptive-refinement rule before comparing engines. Publish missed/extra events and every unresolved region.

Release gates:

1. Prototype: schema examples pass structural and semantic validation; analytic preview checks pass; real-engine evidence is labeled sampled and retains engine/clock/source hashes.
2. Product preview: local normalization has independent tzdb transition corpus; all domain omissions exposed; no unsupported feature labels; every UI sentence is generated from status semantics. Allowed copy: "Moon was in one sign at all 1,801 sampled instants; between-sample changes were not ruled out." Prefer shorter copy with disclosure on expansion.
3. Certified release: independent certificate checker rejects missing cells, forged enclosures and endpoint holes; proves synthetic tangency and wrap cases; all preregistered real windows pass numerical differential checks; unresolved cases remain visible. Allowed copy: "Moon stays in [sign] across your allowed times, under [model]." This statement additionally needs model-error disclosure where the physical position could cross a boundary.

## 10. Integration and ownership

Keep the companion package private/unpublished initially. Opus's core implementation owns numerical changes. Integrate in this order: resolved-UTC finite evaluator → separate pinned local-clock normalizer → empirical boundary discovery → validated evaluator and certificate checker → optional priors and multidimensional inputs. Keep the wire format experimental until product and proof requirements converge.

A later adapter can accept a new engine version without editing core. Baseline reports and the acceptance oracle must be immutable per toolkit version; fixes create an explicit fixture revision. Birth inputs stay local by default; result sharing is opt-in and should omit exact birth details unless the user chooses them. Synthetic fixtures in this folder contain no real person's birth record.
