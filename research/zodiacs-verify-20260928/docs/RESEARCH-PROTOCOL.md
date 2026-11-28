# Birth-time rectification: design for preregistration

**Status: design only.** No study has been registered or run, no participants or records have been collected, and no recruitment, storage, rectification service, or demonstrated efficacy is delivered by this preview. The numerical claim checker is not an empirical validation of astrology.

## Question and reference

Can a frozen rectification procedure recover a withheld recorded birth time from an approximate time window and dated life events more accurately than prespecified baselines? This evaluates recovery of recorded times in the recruited population, not proof of astrological causation or general predictive validity.

Use consenting adults with independently documented birth times. A data custodian records source quality, precision, known rounding, timezone resolution, and any uncertainty. A record is a reference with limits, not guaranteed physical truth. Collect each participant's recalled window before revealing the documented time to investigators. Prespecify how windows excluding the reference are handled and report their frequency rather than silently removing failures.

## Freeze before evaluation

Before enrollment or access to evaluation outcomes, publish a dated preregistration that fixes eligibility, recruitment, sample size justified by a power or precision analysis, stopping rule, splits, primary metric, success criterion, exclusions, handling of missing or uncertain events, and all secondary analyses. Specify engine artifact, numerical conventions, rules, event categories, search window construction, candidate spacing, tie-breaking, budget, and abstention policy. This document supplies none of those choices as already registered facts.

Separate development, calibration, and final held-out participants; group related participants to prevent leakage. Keep final reference times with an independent custodian. Freeze code and model versions before opening the final set. Any LLM extraction of event dates or categories must use a fixed procedure blinded to reference time, identity, existing charts, and hints that reveal it. Audit leakage and extraction errors. Do not use public celebrity biographies as a blinded test without a defensible contamination assessment.

## Baselines, controls, and metrics

Give every method the same admissible window and information budget. Compare with its midpoint, uniform candidate selection, and an empirical time prior learned only from development data. Prespecify shuffled-event controls that break the participant-to-event association while preserving chosen age, calendar, and event-count constraints; also evaluate an event-free ablation. Record random seeds and permutation procedures before the final run.

Use absolute UTC time error to the documented reference interval as the primary outcome, with the interval's precision retained. Report error distributions, abstentions, and coverage for prespecified tolerances. For ranked outputs, define the primary selected candidate and any secondary top-k metric in advance. If probabilities or intervals are produced, assess calibration and coverage on held-out data; normalized scores or gaps between candidates are not probabilities. Report uncertainty intervals for comparisons, all tested methods, multiplicity handling, and both successful and unsuccessful cases. Keep later method revisions in a separately labeled exploratory analysis.

## Consent and data minimization

Before any future recruitment, arrange appropriate ethics review and explicit informed consent covering purpose, sensitive event categories, access, retention, withdrawal limits, and optional external AI processing. Participation must not require disclosing unnecessary medical, sexual, financial, or third-party details. Prefer coarse event categories and the least precise dates compatible with the registered analysis.

Use opaque study IDs; separate contact and consent records from analysis data. Restrict access to original birth documents, redact unrelated information, encrypt retained data, and define deletion dates. External model providers receive no identifiable records without specific authorization and approved handling. Publish aggregate results and reproducible synthetic examples; release participant-level data only under a separately consented, reviewed plan. The protocol does not authorize collecting or transmitting anyone's data.

## Reporting limits

Publish the frozen protocol, version and configuration manifest, deviations, participant flow, complete registered results, and limitations even for null findings. Record-quality and recruitment bias limit generalization. A positive result requires independent replication; a null result must not be disguised by selecting attractive anecdotes. No participant should receive a rectified time as a verified replacement for their record on the basis of this proposed study.
