# Offline CLI preparation: retained first failures

Private source `7281a6da240bef416e0cd3818d022ed8247c9a0f` was tested by [37924295890](https://github.com/zodiacs-org/engine/actions/runs/37924295890). Linux and Windows passed on Node 22.22.2 and 24. macOS failed on both, jobs 113799419780 and 113799419646, with empty CLI stdout followed by the consumer's JSON parse failure. No consumer report was produced for either failed job; these are failed results.

The CLI compared its invocation's absolute path with Node's canonical module URL. On macOS, temporary paths can resolve through a symlink, so this comparison skipped main entirely. The corrected entry check compares real paths. The consumer now asserts successful output before decoding it and invokes an explicitly symlinked installed package on every platform. All original numerical tolerances, conformance baseline and package publication holds remain unchanged. New passing results require a fresh complete matrix and required engine checks.

The original full CI [37924295889](https://github.com/zodiacs-org/engine/actions/runs/37924295889) passed all nine jobs; that does not override the failed CLI consumers.

## Retained Windows Node 22 failure on the symlink correction

[37925440836](https://github.com/zodiacs-org/engine/actions/runs/37925440836), source `0a74413a22b31ef31038b29203de8173d2c86503`, passed both Linux and macOS runtimes and Windows Node 24, each with 28 checks. Windows Node 22.22.2 job 113803141079 reached the conformance command but produced no JSON; the consumer failed decoding at line 143. Its earlier calculation, replay, formatting, input and explicit symlink checks did not fail. The cause is not established, and no passing report is asserted for this job.

The conformance runner now exposes only fixed error codes for manifest/integrity/suite and adapter spawn/identity/order/protocol/exit/incomplete/time/output-limit phases. Adapter stderr and input values remain suppressed. The consumer checks the command's expected nonzero verdict-report status and output before JSON decoding. This source change diagnoses the failing phase while keeping every vector, comparator, tolerance and network-denial requirement unchanged; a fresh full matrix is required.

## Narrowed validation failure and exact Git-byte preparation

Source `30ea757847ebef2230c5e3da60d472a78cb92807`, [37925889438](https://github.com/zodiacs-org/engine/actions/runs/37925889438), Windows Node 22.22.2 job 113804598982, now reports fixed `conformance-suite-invalid` before the adapter runs. Linux/macOS still pass 28 checks; no passing Windows Node 22 report is asserted.

The preparation workflow's previous `git checkout --force` with an inline autocrlf setting can leave already-checked-out files untouched. Since the original validators require the cited inputs' exact hashes, the corrected preparation explicitly reads only tracked `tools/cli/`, `conformance/` and root `LICENSE` Git blobs at HEAD and writes any differing bytes without text conversion. It records changed path/byte/hash metadata and verifies all selected bytes; it never traverses the engine evidence tree. The bundle build also runs the original suite validation before private packing. The source-checkout receipt in each final consumer report will identify whether line-ending conversion occurred. This targets a byte-preparation hypothesis; the observed receipt is required before attributing the failure to it. No arbiter inputs, expected values, tolerance or original validator is edited.

Windows Node 24 job 113804599220 in the same run also failed with `conformance-suite-invalid`. Both Windows failures are retained. All nine original CI jobs, both original conformance jobs, atlas, Python package and CodeQL jobs passed on that source; this does not override either failed CLI consumer.

## Actual first complete portable producer

Source head `9fe28bfca863bf687e64ac636c17e0382dbca9be`, integration `7ac083684841db3a3fcc825301e4e26e2c1049d4`, tree `4206bc23d40e30c55b3917d477c29025138fe240`, [37926452863](https://github.com/zodiacs-org/engine/actions/runs/37926452863), passed **28 actual consumer checks on all six platform/runtime combinations**. Full CI 37926452862 (nine jobs), Conformance 37926452868 (two jobs), Atlas 37926592186, Python package 37926452859 and CodeQL 37926452860 passed. Integration parents are unchanged main `d8aa5f057b18e7d573e4cf002fd48d7c0ef1cd7b` and the named head.

The Windows before/after receipt shows all 67 selected checkout files changed. All eighteen cited L1 inputs regain their original vector-declared hashes after restoration. Linux/macOS files already match Git. This directly establishes checkout byte conversion in this producer and verifies the exact-byte correction; previous failed runs lack their own before-byte receipts.

All six runs report **500 vectors: 267 pass / 192 fail / 41 unsupported / 0 errors**, matching the separately executed original adapter and committed Node 22.22.2 baseline. Node 24 also has zero differences from that baseline in these runs. These are actual regression/interoperability passes, not full independent accuracy acceptance. The command still exits 1 for the retained failed/unsupported tolerances.

Both POSIX private packs are 584409 bytes, SHA-256 `8421fb700bbe632d6f9fe6295c92c44423d662fa874704f627ff5acbb4debb8a`; Windows packs are 584399 bytes, `467d2f4f06fe3ade6e9fb12f390b3f1ae40fe9eeb97421bbb84a9f79f59e8fa7`. All 43 listed files have the same paths and sizes; the listed executable mode is 0755 on POSIX and 0644 on Windows. Byte-identical cross-platform archives are not claimed. The installed engine remains the unchanged 287011-byte carried rc.2 archive.

These six byte/hash-verified final reports are retained under `producer-37926452863/`; payload bytes are unchanged from the producer exports:
- `win32-node24.json`: 35148 bytes, SHA-256 `51d5f8ff45ab55d6ab91285866d48b2ac330f11c199a48f4eb3266d91997db28`, job 113806444744
- `darwin-node24.json`: 13685 bytes, SHA-256 `e25aeb8a0049f4dc73f1d81fe96b873909f45d7f9770d7688e18e08c37ad7a4a`, job 113806445107
- `win32-node22.json`: 35148 bytes, SHA-256 `6781687a7b98866e40cdb83e410adf370e69820220639ed958271703f615be4f`, job 113806445122
- `darwin-node22.json`: 13685 bytes, SHA-256 `e0830e31881d20003f8f85a9762241cc3947b899b86fbc171ed9923577add1b0`, job 113806445165
- `linux-node22.json`: 13682 bytes, SHA-256 `0e006399da8c163dbbf36f6dcf34b0c129eb1b1c6a299eccebf7ca384a2c990d`, job 113806445197
- `linux-node24.json`: 13682 bytes, SHA-256 `06c2b06c462cef8802f5a3a96867174a35a5d2899f3d4eec316a558939f725ee`, job 113806445198

The next consumer revision additionally invokes the actual installed `zodiacs --help` command through offline npm exec with the network-denial guard. Earlier 28-check reports do not cover that npm launcher. New exports are stored under producer-run directories to preserve each source-bound result. The evidence paths now trigger the complete consumer workflow for final carriers. Fresh producer and final full checks remain required before merge. No publication, P3.7 acceptance, private clearance or engine archive/version change occurs.

## Actual installed-launcher producer

Head `d4dc8c6c68b67df415d8c02eed6b3c005c96f922`, integration `94b0fc984c00d9a274a9ba24107176f72bd2b718`, tree `86ef5a77830179fb6be1a4339808188b0a676314`, [37927100501](https://github.com/zodiacs-org/engine/actions/runs/37927100501), passed **29 actual checks on all six platform/runtime combinations**, including the installed `zodiacs --help` command through offline npm exec under network denial. All original CI 37927100326 (nine jobs), Conformance 37927100272, Atlas 37927100346, Python package 37927100284 and CodeQL 37927100406 gates passed. Integration parents bind the producer to unchanged main and the named head.

The unchanged package identities and all 500 conformance verdicts match the first portable producer. Node 24 has zero differences from the committed baseline in these runs. Six final exports are byte/hash verified and retained, alongside the prior 28-check records:
- `producer-37927100501/linux-node22.json`: 13793 bytes, SHA-256 `334ddfd5d4a3e2044023c24f840c0c42fb8251ed8d254d9f58f09abb6a4ba4b7`, job 113808558322
- `producer-37927100501/darwin-node24.json`: 13796 bytes, SHA-256 `73c42168e4a22514da91de876b18257be8513045f81bab20148a28c29a8bb74c`, job 113808558567
- `producer-37927100501/linux-node24.json`: 13793 bytes, SHA-256 `e2d6b81079fb72a2937585afd0bfccb40e9c4bb623e79db19dc5ed6014561afa`, job 113808558609
- `producer-37927100501/win32-node24.json`: 35259 bytes, SHA-256 `0dbfa3c480a5c4eb9265366e57767e88460fbe9c95e26ebab647cc9bce3ba9f6`, job 113808558630
- `producer-37927100501/darwin-node22.json`: 13796 bytes, SHA-256 `8c2a379a04fdee31b779c6c9628fe9504baa911d0fdc7a220c8cffd41297e68e`, job 113808558712
- `producer-37927100501/win32-node22.json`: 35259 bytes, SHA-256 `b1c7c7fbfb9e5cd372d600a590f1b18dbbfe0565b1528afa995fbd134c7d235c`, job 113808558776

This records-only final carrier still requires fresh complete engine and six-consumer verification before merge. Its executable/package code, original vectors/tolerances and carried engine archive remain unchanged. Final consumer outputs must reproduce the same checks, conformance verdict digest and platform package identity; producer identity and checkout before-byte diagnostics are separately recorded. Stable release, private clearance, registry installation/publication and P3.7 acceptance remain unfinished.
