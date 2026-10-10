# Handoff for the continuing core-engine build

Continue the assigned position-provider work. This runner adds an isolated measurement/review tool and does not replace the core task or alter its existing release gates.

1. Read the earlier `accuracy-audit-20260928/NEXT-BUILD.md` and this package README. Preserve the frozen rc.10 installation for paired comparisons.
2. Build and stage a new candidate in a separate standalone installed package, with all runtime dependencies beneath that root. Do not overwrite the baseline or another agent's worktree.
3. Run `inspect`. Review the actual candidate source and record its convention declaration. A new version string or the old source review is not sufficient. If the provider changes the Moon to apparent coordinates, uses a different reference frame, or interprets the benchmark clock differently, extend and review the comparison contract before attempting a like-for-like claim.
4. Run `plan` before executing the candidate in this qualification harness. Retain the printed expected digest independently. Do not tune the already frozen thresholds or omit cases in response to the outcome.
5. Run the plan and inspect the JSON/Markdown report. Missing coverage, failed clocks, API differences, regressions and reference-target misses are distinct checks. Some reference differences can reflect convention or center mismatches, so investigate rather than attributing every residual to the provider.
6. Review the numerical results, new holdout coverage and relevant product-level tests. Even an all-pass report is finite evidence under a declared profile, not a certified astronomical error bound.
7. Qualify the new Verify adapter deliberately against the new bytes, source conventions and relevant evidence. This runner does not edit `zodiacs-verify-20260928/src/engine-adapter.mjs`, bypass its pinned inventory, or grant release authority.

Only this new research directory is added. Its references remain in the earlier handoff. No root source, dependency, workflow, production adapter, release gate, site deployment or npm publication is part of this work.

## Paste into Opus

> Continue the existing core-engine/provider task. The draft research PR now also contains `research/engine-qualification-20260928/`. Use its README workflow to inspect, declare, freeze and evaluate your new trusted local candidate against the exact rc.10 baseline. Keep the installations separate and preserve the comparison denominator. Treat the 210 existing JPL rows as known regression coverage, not a blind holdout. Inspect all compatibility, residual, regression and convention results. The one-arcsecond goal and timing/size checks are research defaults, not newly authorized release gates. Passing the runner never edits Verify trust or automatically qualifies the new adapter; perform that review separately. Leave the existing core worktree and release authority intact until the concrete integration is reviewed.
