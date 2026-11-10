# Campaign progress resource evidence

Completed synthetic charts: 3072; requested: 1000000. Status: partial.

Campaign SHA-256: `e0134608ca96bdeb2ff4ff701c2936657f32d8f45fa838e4c3783c2e73b97be2`.
Specification SHA-256: `dbbafb9687c227ea4ef8cb098eba92b62e4c811fe318f9b93e91cd487c9f600e`.
Specification: `{"kernel":"de440","name":"phase2-million-tt","profile":"phase2","seed":"synthetic-phase2-million-v1","shards":3,"total":1000000}`.
Final per-shard completed prefixes: `[1024,1024,1024]`.

| Invocation | Processed | Elapsed ns | Node user CPU us | Node system CPU us | Node maximum RSS KiB | Disk bytes before | Disk bytes after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 830007009 | 720751 | 287600 | 108620 | 155657695 | 155799487 |
| 2 | 3 | 991023102 | 986329 | 280120 | 110452 | 155800412 | 155808812 |
| 3 | 3069 | 133131747551 | 173656266 | 25883625 | 154668 | 155809368 | 155919340 |

Invocation 1 wrapper argument vector: `["node","crosscheck/tools/progress.mjs","crosscheck/runtime/p5-million.json","all","0"]`.
Invocation 1 driver argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/p5-million.json","all","0"]`.
Working directory relative to repository root: `.`.
Checkpoint prefixes: `[null,null,null]` to `[0,0,0]`.

Invocation 2 wrapper argument vector: `["node","crosscheck/tools/progress.mjs","crosscheck/runtime/p5-million.json","all","1"]`.
Invocation 2 driver argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/p5-million.json","all","1"]`.
Working directory relative to repository root: `.`.
Checkpoint prefixes: `[0,0,0]` to `[1,1,1]`.

Invocation 3 wrapper argument vector: `["node","crosscheck/tools/progress.mjs","crosscheck/runtime/p5-million.json","all","1023"]`.
Invocation 3 driver argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/p5-million.json","all","1023"]`.
Working directory relative to repository root: `.`.
Checkpoint prefixes: `[1,1,1]` to `[1024,1024,1024]`.

- Elapsed durations cover measured campaign driver calls, including the optional external adapter and verified reference/build startup. They exclude resource snapshot scans and ledger/report rendering.
- CPU deltas and maximum RSS describe only the Node wrapper process. They exclude child adapter CPU and memory. Maximum RSS is the process high-water mark since wrapper startup, not an invocation delta or total-process peak.
- Disk snapshots count logical file bytes under crosscheck/runtime and crosscheck/cache, including kernels. The after snapshot precedes writing that invocation to the resource ledger.
- Commands record the node program name, exact supplied program arguments and working directory relative to the repository root. Environment selectors are required for an enabled external instrument and are never copied into this receipt.
- Completed indices are checkpoint residue-class prefixes, not continuous coverage. A requested target is not a completed measurement. No throughput guarantee or unsampled accuracy bound is implied.
