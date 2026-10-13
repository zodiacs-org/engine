# Original meaning seed

`seed.json` is the authored input for the [generator pipeline](../GENERATION.md). Its prose
was composed individually by OpenAI Codex during repository development, without
copying an external interpretation source. The `authored` provenance branch
records direct seed authoring outside that pipeline; it does not mean a human
wrote or reviewed the text. Every entry names the AI assistance and claims no
human review. Pipeline outputs must use `generated` provenance and remain in the
ignored `evals/generated/` directory, even if later edited.

The code, metadata and original prose use the repository's [MIT license](../../LICENSE).
Keep the entry attribution and license when reusing a seed entry. The metadata
records authorship and rights claims; passing validation does not prove them.

The factors are separate examples, not a jointly realizable chart or a person's
birth record. Placement names, aspect policy and house systems follow the local
engine's vocabulary. Sign dignity labels follow the convention implemented in
`src/techniques/dignities.ts`: Mercury in Virgo has both domicile and exaltation,
Venus in Scorpio has detriment, and Mars in Cancer has fall. These labels are
classification examples, not independent evidence of astronomical accuracy.
The schema and dataset check do not compute those classifications.

The meanings invite reflection rather than assigning personality traits or
predicting events. A seed meaning is neither a factual scoring expectation nor
evidence for an interpretation's validity. An evaluator must obtain chart facts
from the engine, under recorded conventions, separately from this prose.

To review or extend the seed:

1. Read the exact factor tuple, including its house system, aspect policy or
   dignity system. Check classifications against the local engine's declared
   definitions separately from judging the prose. Preserve each applicable
   dignity label; a missing label does not establish peregrine status.
2. Read the meaning for originality, relevance to that factor and explicitly
   symbolic scope. Avoid deterministic personality claims and predictions.
   Do not import external interpretation text or uncertain rights metadata.
3. Record actual authorship, AI assistance and any human review accurately in
   the authored provenance note. Preserve attribution and confirm that the
   contribution can carry the existing MIT label. A validator cannot do that
   review. Do not copy the current seed's authorship wording onto another
   contributor's work.
4. Give a new original entry a distinct id, retaining the schema's language and
   tradition. Check for the same canonical factor elsewhere, including reversed
   aspect pairs. Preserve required category and sign-dignity coverage. Keep this
   committed set small; generated variants remain ignored.
5. For an intentional seed change, update the seed-specific expectations in
   [dataset.checks.mjs](../tests/dataset.checks.mjs) to describe the actual set.
   Those tests pin its current size and AI authorship wording; the general seed
   validator checks authored provenance and coverage without authenticating them.
   Retain the malformed-input and provenance checks, then run:

```sh
npm --prefix evals run validate:seed
npm --prefix evals test
```

Pipeline entries keep `generated` provenance even after editing or review and
are never promoted to the committed seed by changing that label. The current
generated-entry schema permits only `reviewStatus: "unreviewed"`; it has no
reviewed state. Keep any local review record separately under ignored `scratch/`,
identifying the entry and exact dataset digest, reviewer and findings. Such a
record does not change schema acceptance or grant rights to the text.

`tests/dataset.checks.mjs` enforces this seed's authored metadata, category
coverage and size. Seed mode also rejects duplicate factors, including reversed
aspect pairs. House systems are part of factor identity: a placement computed
after polar fallback must use the actual house system rather than the requested
one. General dataset mode allows meaning variants and resolves their sources
within the same dataset.
