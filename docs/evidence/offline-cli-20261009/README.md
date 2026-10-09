# Offline CLI preparation: retained first failures

Private source `7281a6da240bef416e0cd3818d022ed8247c9a0f` was tested by [37924295890](https://github.com/zodiacs-org/engine/actions/runs/37924295890). Linux and Windows passed on Node 22.22.2 and 24. macOS failed on both, jobs 113799419780 and 113799419646, with empty CLI stdout followed by the consumer's JSON parse failure. No consumer report was produced for either failed job; these are failed results.

The CLI compared its invocation's absolute path with Node's canonical module URL. On macOS, temporary paths can resolve through a symlink, so this comparison skipped main entirely. The corrected entry check compares real paths. The consumer now asserts successful output before decoding it and invokes an explicitly symlinked installed package on every platform. All original numerical tolerances, conformance baseline and package publication holds remain unchanged. New passing results require a fresh complete matrix and required engine checks.

The original full CI [37924295889](https://github.com/zodiacs-org/engine/actions/runs/37924295889) passed all nine jobs; that does not override the failed CLI consumers.

## Retained Windows Node 22 failure on the symlink correction

[37925440836](https://github.com/zodiacs-org/engine/actions/runs/37925440836), source `0a74413a22b31ef31038b29203de8173d2c86503`, passed both Linux and macOS runtimes and Windows Node 24, each with 28 checks. Windows Node 22.22.2 job 113803141079 reached the conformance command but produced no JSON; the consumer failed decoding at line 143. Its earlier calculation, replay, formatting, input and explicit symlink checks did not fail. The cause is not established, and no passing report is asserted for this job.

The conformance runner now exposes only fixed error codes for manifest/integrity/suite and adapter spawn/identity/order/protocol/exit/incomplete/time/output-limit phases. Adapter stderr and input values remain suppressed. The consumer checks the command's expected nonzero verdict-report status and output before JSON decoding. This source change diagnoses the failing phase while keeping every vector, comparator, tolerance and network-denial requirement unchanged; a fresh full matrix is required.
