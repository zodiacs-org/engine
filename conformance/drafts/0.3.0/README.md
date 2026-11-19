# 0.3.0: the design of level L4

Level L4, event times, is released in suite 0.3.0 as
[`vectors/0.3.0/L4-events.json`](../../vectors/0.3.0/L4-events.json).
Its format, kinds and tolerance rule are in [SPEC.md](../../SPEC.md), its
results with the other levels' in [RESULTS.md](../../RESULTS.md), and its
generator is [`arbiters/l4/build.py`](../../arbiters/l4/build.py).

[DESIGN.md](DESIGN.md) is kept here as it was committed, alone and before the
generator, the vectors or any engine run, so that its commit time shows the
kinds, the instants, the method and the tolerance rule were fixed before any
engine was measured against them. Its status line and its references to the
draft runner describe the draft it was written for: the draft vector file,
runner, report and results that stood beside it were removed when the level
was released, and the harness (`harness/run.mjs`, `harness/validate.mjs`,
`harness/report.mjs`, `harness/selftest.mjs`) carries their checks. Their
last state is in the history of this folder.
