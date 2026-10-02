# JSR workflow preparation

This local engine branch prepares a JSR workflow PR. It has not been published to GitHub, activated, dispatched or published to JSR. The existing npm archive is unchanged.

The proposed workflow is manual, defaults to verification only, refuses another repository or branch, and fixes the package at `@zodiacs/engine` `0.1.1-rc.16`. Its verification job has only contents-read permission. The separate, conditional publication job has contents-read and short-lived OIDC permission; it runs no npm installation or package lifecycle script. It does not create a registry scope, token, GitHub environment or account grant. The existing JSR repository link and the actor's actual publication eligibility still require verification before the specific first-run approval.

The 103-file package is the previously independently reviewed staging, pinned by a per-file digest inventory. The original 69 npm files remain unchanged. Fourteen wrappers and nineteen declaration copies are reproduced from the exact carried archive. All license/notice bytes remain original. JSR will rewrite dependency specifiers and create its own compatibility package; these local checks do not prove the future registry output.

Verification stages twice, checks both inventories, rejects an extra-file sentinel, checks all fourteen Node and Deno wrapper bindings, separately typechecks the public declarations, and validates the actual dry-run file list. The normalized runtime-only SBOM must match the exact bytes already independently schema-reviewed. It does not inventory the publishing toolchain or all embedded datasets.

A clean staging directory was insufficient for Deno's dependency graph resolution. The corrected proposal carries eight digest-pinned astronomy-engine files as an auxiliary verification dependency, outside the publication inventory. The publication job checks them before graph analysis. The actual dry run confirms exactly 103 files, excluding that dependency tree. These dependencies are parsed by the publisher, not imported as executable engine code in the OIDC job. Earlier local missing-dependency failures remain in validation records.

## Local checks completed

- Exact 103-file stage and clean inventory pass
- Extra-file and missing-dry-run-file controls are rejected
- All 14 Node and 14 Deno wrapper export/binding checks pass
- Separate Deno typecheck passes under the explicit configuration and local dependency tree
- Pinned Deno 2.6.7 dry run passes and lists exactly 103 publication files
- SBOM SHA-256 matches the reviewed `24e72652c771c863f5e8a82d45dd0d27910861dc1f991c5a8916dd5c893f2009`
- YAML structure, manual/default-false controls, separate permissions, pinned action SHAs and helper syntax are checked

The official Deno downloader was not rerun locally; tests reused the already hash-verified official binary. No actual GitHub job or OIDC exchange has run. The global npm pin is prospective behavior in the isolated verification runner, not a local system change.

The SBOM publication-workflow field names the historical npm run at `6807f632`; its archive-source field names `ddbbaa0b`. It is not provenance for this proposed workflow or the future transformed JSR registry graph.

## Remaining

Independent workflow/security review; any corrections and their tests; integration into an engine branch without changing packed files; the required private birth-pattern scan on that exact range and tree; engine CI and archive binding; scope/actor/OIDC eligibility verification; specific section 6 first-JSR approval; and actual published graph, Node/Deno consumers and provenance verification. Do not count P3.1c before those checks.

Official publishing and dependency-manifest behavior: https://jsr.io/docs/publishing-packages
