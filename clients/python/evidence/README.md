# Python client review evidence — 9 October 2026

These eight actual [source and fresh wheel-consumer reports](validation.json)
were produced at head afc04002191afd97e57ed143c29dd686cdcf8eba,
checkout 6fe37df31b93424c7c1f01eed184180262978f66,
[Python run 37906475374](https://github.com/zodiacs-org/engine/actions/runs/37906475374).
Every source and installed consumer passes 17 runtime tests, without skips:
all seven endpoint fixtures, all nine documented HTTP failures, bad envelopes,
redirect refusal, cancellation, native header/body timeouts and consecutive-call
cookie separation. Strict positive contracts pass and eight negative
request controls fail exactly at their marked lines, both at source and in
the installed fresh wheel consumer.

Actual Python versions: 3.11.17, 3.12.15, 3.13.16 and 3.14.8; httpx 0.28.1.
Each producer's wheel is 11,322 bytes, with its own recorded SHA-256.
These initial wheels have different archive timestamps; no byte-identical
cross-runtime wheel claim is made for this producer. Final packaging pins
SOURCE_DATE_EPOCH to the checkout commit time and exports only the current
matrix's pair of reports, so older committed reports cannot impersonate it.

The TypeScript negative-branch fix passes source and fresh private packed
consumers on Node 20/22/24 in
[run 37906475288](https://github.com/zodiacs-org/engine/actions/runs/37906475288).
Its six actual reports replace their prior latest report paths; the previous
producer records remain in Git history. The complete core
[CI 37906475219](https://github.com/zodiacs-org/engine/actions/runs/37906475219),
archive rebuild, four packed engine consumers, conformance, atlas, Python
package and CodeQL all pass. The final evidence carrier requires its own
unchanged full suite before a merge commit.

Byte lengths and SHA-256 were verified on every export before committing.
The clients are private preparations; packing them is not publication.
No core packed source/version/archive/dependency changes, private clearance,
registry publication, P3.4 acceptance or independent accuracy are claimed.
