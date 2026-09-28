# Zodiacs Verify v0.1 contract and ownership

This is an isolated, private, dependency-free Node >=20 ESM package. Never edit engine files or older handoffs. Frozen baseline: zodiacs-org/engine f5f33892a95cd0d6cd4a11a80e66f802b11bccfa, engine 0.1.1-rc.10. The adapter is version-specific; future builds must be explicitly qualified.

## Shared core (root owns src/core.mjs)

Exports: canonicalize(value), digest(value) -> `sha256:<hex>`; seal(payload) -> payload with id; verifySeal(value) -> boolean; assert(condition, message); finite(number, label); instant(string) -> epoch ms; normalize(degrees); angularDistance(a,b); SIGNS (capitalized English names); signOf(lon). canonicalize rejects non-JSON values, nonfinite numbers, sparse arrays and nonplain objects. seal forbids a preexisting id. UTC instants require full ISO datetime with seconds, optional 1-3 fraction digits, explicit Z/offset and valid calendar fields; normalized outputs use ISO UTC.

Chart receipt payload: `{schema:'zodiacs.verify.chart.v1', subjectId, context:{utc,latitude:null|number,longitude:null|number,timeKnowledge:'exact'|'reference',requestedHouseSystem,effectiveHouseSystem:null|string}, model:{engine,engineVersion,artifact:{digest,scope},conventions:{zodiac,origin,frame,corrections,timeScale,deltaT}}, facts:[{id,kind:'longitude'|'sign'|'house'|'aspect',entity,value,unit?,scope:'instant'}],warnings:[]}`. Seal to produce id. Fact IDs unique. Longitude degrees [0,360); sign is SIGNS member; house 1..12; aspect boolean (entity encodes pair/angle/orb). Model conventions are required strings except deltaT may be a plain object. All fields are explicit. The seal proves payload integrity, not astronomical correctness, origin or authenticity.

Exports createChartReceipt(payload) and validateChartReceipt(receipt) (throws, returns receipt). Request subject IDs are opaque local identifiers, not names or birth records. No persistence or network by default.

## Adapter (engine_review owns src/engine-adapter.mjs and tests/engine-adapter.test.mjs)

Exports async loadZodiacsAdapter(enginePath) -> `{model, calculate(request), sample(ms,request)}`. calculate takes `{subjectId,utc,latitude?,longitude?,timeKnowledge:'exact'|'reference',houseSystem,deltaT?}` and returns sealed chart receipt. sample returns `{longitudes:{Sun:...,Moon:...,...,Ascendant?:...,Midheaven?:...},warnings:[]}` for the uncertainty module. Use public APIs only. Validate and fail on unsupported versions, settings, dropped/fallback houses. Do not assert source ancestry from a version. Hash installed engine JS plus resolved dependency files, record scope. Never infer absolute precision from hashes.

## Uncertainty (uncertainty_spec owns src/uncertainty.mjs and tests/uncertainty.test.mjs)

Export async analyzeUncertainty({subjectId,model,intervals:[{from,to}],features:[{id,kind:'sign',body}|{id,kind:'aspect',a,b,angle,orb}],sample,bounds?,maxSamples?,resolutionMs?}). sample is async ms => `{longitudes:{[body]:number},warnings:[]}`. Intervals closed, resolved UTC, union preserved, max bounded span. bounds OPTIONAL: externally asserted Lipschitz rates per body in degrees/day, absolute position error bounds in degrees, with identifier/source and domain; observed engine speeds are NOT conservative derivative bounds. Production engine adapter supplies NO bounds. Report is sealed `{schema:'zodiacs.verify.uncertainty.v1',subjectId,model,intervals,features,results:[{featureId,status:'stable'|'variable'|'unresolved',values,coverage:'bounded'|'sampled',...}],complete:boolean,...}`. Stable requires certified-by-algorithm full interval coverage CONDITIONAL on caller's documented bounds. Sampled results alone cannot produce stable, even identical samples. Variable means witnesses differ; unresolved means insufficient assurance. Include call budget, witnesses, unresolved ranges and explicit limits; do not imply bounds independently verified. Validation exported validateUncertaintyReport(report) throws. Claims only accept bounded stable interval conclusions when caller explicitly trusts the bounds source.

## Claims (historical_time owns src/claims.mjs and tests/claims.test.mjs)

Export verifyClaims({receipts:[],uncertaintyReports:[],claims:[],rules:[],trustedReceiptIds:[],trustedReportIds:[],trustedBoundIds:[],trustedRuleIds:[]}) -> `{schema:'zodiacs.verify.claim-check.v1',allSupported,results:[{claimId,status:'supported'|'rejected'|'unresolved',reasons:[]}],limitations:[]}`.

Fact claim: `{id,kind:'fact',subjectId,receiptId,factId,expected,scope:'instant'}`. Require trusted receipt id, valid seal/schema, matching subject, fact, exact typed equality and scope; reference-time receipt cannot support rising/house claims. No tolerance inferred. Interval claim: `{id,kind:'interval',subjectId,reportId,featureId,expected,scope:'interval'}`; require trusted report/bounds, validated report, stable bounded result. Interpretation claim: `{id,kind:'interpretation',subjectId,ruleId,basedOn:[claimId],text}`; rule `{id,tradition,source:{title,locator},statement,epistemicStatus:'traditional'|'editorial'|'hypothesis'}` with explicit trust. Require supported prerequisites same subject, acyclic references; return support only for provenance and dependencies, never scientific truth or semantic entailment of free text. Reject duplicate IDs, unknown kinds, missing trust, cycles; invalid inputs must never silently support. Whole-prose NLP and scientific validation are out of scope. Rule trust establishes reviewed provenance only. Document this clearly.

## Comparison (root owns src/compare.mjs)

Compare validated chart receipts. Fail closed across different subjects; categorize input, convention and provider differences; angular wrapping; identical IDs require identical semantics. Don't attribute causal numeric error without matched conventions. Missing facts distinct from matching facts. Accuracy threshold comes from caller, no claim of Swiss equivalence.

## Root owns integration

src/index.mjs, src/cli.mjs, package.json, examples, docs, integration tests, reports and packaging. All agents may read all files; edit only assigned files. Send interface changes before making them. Tests use node:test and analytic synthetic fixtures labelled as such; real-engine integration remains diagnostic. No fabricated real astronomical reference fixtures.

## Protocol-neutral AI tool session

`createVerifySession(adapter,{rules:[],maxEvidenceEntries:64})` supplies immutable JSON-schema tool descriptions and `execute(name,args)` / `clear()` methods. Names: calculate_chart, analyze_uncertainty, compare_charts, verify_claims. The first two use the same CLI inputs except caller-supplied bounds/model are forbidden. compare_charts takes retained leftReceiptId/rightReceiptId and optional comparison options. verify_claims takes only claims; no rule/evidence/trust injection. A combined FIFO retains at most 1..256 receipts/reports. The host supplies the reviewed rules at session construction, whose values are snapshotted. Returned evidence is detached from internal storage. Clear prevents pending operations from repopulating a cleared session. This binding supplies no transport, authentication, user isolation beyond separate instances, or physical accuracy guarantee.
