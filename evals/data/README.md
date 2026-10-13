# Original meaning seed

`seed.json` is the authored input for the planned generator pipeline. Its prose
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

To review or extend the seed, read each meaning against its exact factor and
convention, confirm that its wording is original, record its actual authorship
and rights, and keep the claim explicitly symbolic. Do not import a text whose
license or provenance is uncertain. Assign a distinct id to each entry, preserve
both of Mercury's supported dignity labels, and run:

```sh
npm --prefix evals run validate:seed
npm --prefix evals test
```

`tests/dataset.checks.mjs` enforces this seed's authored metadata, category
coverage and size. Seed mode also rejects duplicate factors, including reversed
aspect pairs. House systems are part of factor identity: a placement computed
after polar fallback must use the actual house system rather than the requested
one. General dataset mode allows meaning variants and resolves their sources
within the same dataset.
