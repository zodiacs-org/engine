# Evidence for the queued release corrections

Main at inspection: `709bc813e2ee9de948ef0dcd008c76bf086fe7d4`.

## Publication

Registry: https://registry.npmjs.org/@zodiacs/engine

The following commands used the public npm registry and fresh local caches.
Timestamps are UTC. The output shown is standard output.

```text
2026-11-18T10:01:38Z
$ npm view @zodiacs/engine dist-tags
{ latest: '1.1.0', next: '2.0.0-rc.3' }
2026-11-18T10:01:39Z
$ npm view @zodiacs/engine@2.0.0-rc.3 dist.shasum
7e1e9216a174114f09346d0d8bb019e772ae26c0
2026-11-18T10:01:42Z
$ npm view @zodiacs/engine time --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s)["2.0.0-rc.3"]))'
2026-11-17T20:52:39.950Z
```

[The release.yml run](https://github.com/zodiacs-org/engine/actions/runs/44171616606)
started on 2026-11-17 at 20:39:35 UTC on the commit above. The run, the
carried archive verification job and the Publish to npm job all succeeded.

## Source lines and import-graph attribution

`git show REV:README.md | nl -ba` and `git show REV:CHANGELOG.md | nl -ba`
with `REV` set to the full commit above give these excerpts:

```text
README.md
19  **2.0.0-rc.3**, the third candidate for 2.0.0, a major release
20  (CHANGELOG.md). It is a draft for the owner's review and is not published to
21  npm. Over 2.0.0-rc.2, a candidate never tagged or published, it refuses

CHANGELOG.md
56  - **`@zodiacs/engine/core`** (pull request 121, ZOD-292). Adds
64    the root is unchanged. Raises the package's total cap for the entry's
```

The `Why` column in the same changelog's size table explicitly credits
pull request 121 with 109 bytes in these rows:

| Line | Entry | Attribution |
| --- | --- | --- |
| 147 | `.` | 121 (109) |
| 148 | `./calc` | 121 (109) |
| 151 | `./internal` | 121 (109) |
| 153 | `./sky` | 121 (109) |
| 156 | `./timing` | 121 (109) |
| 157 | `./vedic` | 121 (109) |
| 158 | `./window` | 121 (109) |

Line 154 also lists pull request 121 for `./techniques`, without an
individual byte count. The description of
[pull request 121](https://github.com/zodiacs-org/engine/pull/121) reports
that every existing `.d.ts` was byte-identical and that the root's results,
names and types were unchanged. It attributes the 109-byte increase to
the shared ephemeris chunk and records the same increase for `./techniques`
in its own comparison.
