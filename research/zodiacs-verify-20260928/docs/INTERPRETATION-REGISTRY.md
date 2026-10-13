# Interpretation registry

This preview checks reviewed rule provenance and explicit claim dependencies. It does not validate astrology, determine whether prose follows from a rule, or discover factual assertions hidden in prose. The executable contract is [CONTRACT.md](../CONTRACT.md).

## Rule schema

`verifyClaims` accepts `rules` as an array of objects with exactly these fields:

| Field | Required value |
| --- | --- |
| `id` | Nonempty, unique string identifying a specific rule version. |
| `tradition` | Nonempty string naming the attributed tradition or editorial origin. |
| `source` | Object with exactly two nonempty strings: `title` and `locator`. |
| `statement` | Nonempty string describing the rule. |
| `epistemicStatus` | `traditional`, `editorial`, or `hypothesis`. |

A locator should identify the relevant passage, edition, or local document section. Its presence is not evidence that the source exists or supports the statement: source checking belongs to the caller's review process. The status labels describe attribution, not evidence grades or probabilities.

## Review and trust

Before adding an ID to `trustedRuleIds`, a reviewer should check the source and attribution, the statement's scope, and its epistemic label. Record the reviewed rule content and reviewer decision outside the rule object; this schema does not accept extra review fields. Pin the exact reviewed registry file or its digest in the calling application. Rule IDs are labels, not content hashes: changing a rule while retaining a trusted ID is not detected by the trust list. Issue a new versioned ID for changed content and review it again.

An interpretation claim has exactly `id`, `kind: "interpretation"`, `subjectId`, `ruleId`, `basedOn`, and `text`. `basedOn` contains a nonempty list of distinct claim IDs. Each prerequisite must be supported, refer to the same subject, and participate in an acyclic dependency graph. The rule must be supplied, schema-valid, and explicitly trusted. Trust is never inferred from a title, tradition, ID, or inclusion in an example file.

`supported` means only that these provenance and dependency conditions pass. It does not establish scientific truth, predictive validity, or semantic entailment of `text`. A chart seal establishes payload integrity, not accuracy or authenticity. An interval prerequisite additionally needs bounded coverage and explicit trust in its contributing assumptions; identical samples alone do not establish stability.

## Demonstration rule

[examples/rules.json](../examples/rules.json) contains one Zodiacs editorial demonstration, `editorial:reflection:v1`. Its statement is: “Offer an optional reflection prompt only after the referenced chart claim is supported”. The source is this document, titled **Zodiacs Verify demonstration rule**, with locator `docs/INTERPRETATION-REGISTRY.md#demonstration-rule` and tradition **Zodiacs editorial demonstration**.

This is an invented editorial workflow example, not a traditional teaching or tested psychological intervention. The demo does not prescribe a personality trait, event prediction, or specific prompt. The caller must deliberately review and trust its ID; generated reflection text still requires its own review. No historical source or empirical efficacy is asserted.
