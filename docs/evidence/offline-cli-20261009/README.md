# Offline CLI preparation: retained first failures

Private source `7281a6da240bef416e0cd3818d022ed8247c9a0f` was tested by [37924295890](https://github.com/zodiacs-org/engine/actions/runs/37924295890). Linux and Windows passed on Node 22.22.2 and 24. macOS failed on both, jobs 113799419780 and 113799419646, with empty CLI stdout followed by the consumer's JSON parse failure. No consumer report was produced for either failed job; these are failed results.

The CLI compared its invocation's absolute path with Node's canonical module URL. On macOS, temporary paths can resolve through a symlink, so this comparison skipped main entirely. The corrected entry check compares real paths. The consumer now asserts successful output before decoding it and invokes an explicitly symlinked installed package on every platform. All original numerical tolerances, conformance baseline and package publication holds remain unchanged. New passing results require a fresh complete matrix and required engine checks.

The original full CI [37924295889](https://github.com/zodiacs-org/engine/actions/runs/37924295889) passed all nine jobs; that does not override the failed CLI consumers.
