# Candidate entries on other unmerged branches (read only): 1.1.0-rc.4, 1.1.0-rc.5 and 1.1.0-rc.7 (ZOD-152, R2)

Each entry exists only in the `CHANGELOG.md` of its own branch. None is on `main`, and none is published (no npm version, tag or GitHub release). Line numbers are the branch's. Branch heads when read: `admin/engine-1.1.0-rc.4` `95f00e9` (pull request 89, closed unmerged), `admin/engine-1.1.0-rc.5` `a09110e` (pull request 90, closed unmerged), `admin/engine-1.1.0-rc.7` `406240c` (pull request 95, open draft; it builds on pull request 91 and uses the sweep of pull request 92 / ZOD-65, whose branch `255b615` was only read). Nothing was pushed, commented or changed.

29 rows: supported 15, not supported 2, unchecked 12.

| Release | Rows | Supported | Not supported | Unchecked |
| --- | ---: | ---: | ---: | ---: |
| 1.1.0-rc.4 | 10 | 4 | 1 | 5 |
| 1.1.0-rc.5 | 11 | 6 | 1 | 4 |
| 1.1.0-rc.7 | 8 | 5 | 0 | 3 |

### 1.1.0-rc.4

Heading as written: `## 1.1.0-rc.4 (unreleased candidate)` (line 3).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| B-1.1.0-rc.4-01 | 3 | "## 1.1.0-rc.4 (unreleased candidate)" | supported | npm, tags and releases as for rc.6; pull request 89 CLOSED, draft, unmerged; head `95f00e9` | Unpublished and withdrawn. |
| B-1.1.0-rc.4-02 | 5 to 8 | "The fourth candidate for 1.1.0, on 1.1.0-rc.3 (main at `bc0b5a7`)" | supported | branch history | Match. |
| B-1.1.0-rc.4-03 | 10 to 27 | the bare-date refusal and its scope | unchecked | `src/public-input.test.ts` exists on the branch and has `timeKnown` cases | Not run. By pull request 91's text the refusal is held for 2.0.0 and is in no later candidate. |
| B-1.1.0-rc.4-04a | 28 to 38 | the New York example | supported | as rc.5 row 04a | Supported through rc.6's run; not run on the rc.4 archive. |
| B-1.1.0-rc.4-04b | 28 to 38 | "The option changes nothing for a time the clock showed once" | not supported | rc.4 branch `src/geo/timezone.ts:372`: `policy: { fold, gap: "shift-forward" }` | Same fault as rc.5: the record says `"later"` for a time that was not repeated. |
| B-1.1.0-rc.4-05 | 39 to 46 | receipts and the rc.3 reader | unchecked | evidence file exists on the branch | Not opened. |
| B-1.1.0-rc.4-06 | 47 to 51 | `api/` changes | unchecked | paths exist | Not opened. |
| B-1.1.0-rc.4-07 | 52 to 53 | `lunarReturn` still refuses | unchecked | none | Not run. |
| B-1.1.0-rc.4-08a | 54 to 63 | sizes: geo 35,574; package 1,149,810 in 94 files, 6,992 more than 1,142,818; entry 3,962, README 935, declarations 1,098, JavaScript 997; cap to 1,152,000 | supported | rc.4 branch `sizes.json` (35,574; 1,149,810; 94); unpacked archive recomputed 1,149,810 in 94 files; CHANGELOG +3,962, README +935, `.d.ts` +1,098 (remainder 997); `TOTAL_CAP = 1_152_000` on the branch | Exact match. |
| B-1.1.0-rc.4-08b | 54 to 63 | "Both rises are part of the draft the owner asked for on 2026-11-11" | unchecked | none | Not looked up. |

### 1.1.0-rc.5

Heading as written: `## 1.1.0-rc.5 (unreleased candidate)` (line 3).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| B-1.1.0-rc.5-01 | 3 | "## 1.1.0-rc.5 (unreleased candidate)" | supported | npm, tags and releases as for rc.6; pull request 90 CLOSED, draft, unmerged; head `a09110e` | Unpublished and superseded. |
| B-1.1.0-rc.5-02 | 5 to 7 | "after 1.1.0-rc.3 (main at `bc0b5a7`)" | supported | branch history; npm | Match. |
| B-1.1.0-rc.5-03 | 9 to 14 | rc.4 "was not merged, and no 1.1.0-rc.4 archive is carried here" | supported | #89 closed unmerged; the rc.5 branch's `archives.json` (19 entries) ends with 1.1.0-rc.5 and has no rc.4 | Match. Owner decision not looked up. |
| B-1.1.0-rc.5-04a | 16 to 26 | the New York example and the flags | supported | not re-run on rc.5; the same code path as rc.6 apart from the `policy` line (diff `444666f`), and rc.6's archive reproduces it | Supported through rc.6's run and the one-line diff; not run on the rc.5 archive itself. |
| B-1.1.0-rc.5-04b | 16 to 26 | "The option changes nothing for a time the clock showed once" | not supported | rc.5 branch `src/geo/timezone.ts:372`: `policy: { fold, gap: "shift-forward" }`; fix in `444666f`; pull request 91's text | For an ordinary or skipped time asked for `"later"`, the resolved instant is the same but the record kept for a receipt says `"later"`, which earlier engines refuse. The sentence is true of the result and false of the record. This is the fault that led to rc.6. |
| B-1.1.0-rc.5-05a | 27 to 34 | "`localResolution.policy.fold` records the pass asked for" | supported | same code line | True of rc.5, and the source of 04b. |
| B-1.1.0-rc.5-05b | 27 to 34 | the codec's checks; 1.1.0-rc.3 refuses `"later"` (`later-receipt-on-rc3.json`) | unchecked | the file exists on the rc.5 branch | Not opened. |
| B-1.1.0-rc.5-06 | 35 to 39 | `api/` changes | unchecked | paths exist on the branch | Not opened. |
| B-1.1.0-rc.5-07 | 40 to 41 | `lunarReturn` still refuses | unchecked | none | Not run. |
| B-1.1.0-rc.5-08a | 42 to 50 | sizes: geo 35,574, budget to 35,600; package 1,147,669 in 94 files, 4,851 more than 1,142,818; entry 2,932, README 339, declarations 944, JavaScript 636; cap to 1,150,000 | supported | rc.5 branch `sizes.json` (geo 35,574; total 1,147,669; 94 files); unpacked rc.5 archive recomputed 1,147,669 in 94 files; CHANGELOG +2,932, README +339, `.d.ts` +944 against rc.3 (remainder 636); `"./geo": 35_600`, `TOTAL_CAP = 1_150_000` on the branch | Exact match. |
| B-1.1.0-rc.5-08b | 42 to 50 | "The owner approved both rises on 2026-11-11." | unchecked | none | Not looked up. |

### 1.1.0-rc.7

Heading as written: `## 1.1.0-rc.7 (unreleased candidate)` (line 3).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| B-1.1.0-rc.7-01 | 3 | "## 1.1.0-rc.7 (unreleased candidate)" | supported | npm, tags and releases as for rc.6; pull request 95 OPEN, draft; head `406240c` | Unpublished. |
| B-1.1.0-rc.7-02 | 5 to 7 | "after 1.1.0-rc.6, which it contains" | supported | `git merge-base --is-ancestor origin/admin/engine-1.1.0-rc.6 origin/admin/engine-1.1.0-rc.7` succeeds; the rc.7 branch's `artifacts/` carries both the rc.6 and rc.7 archives | Match. rc.6 itself is unmerged, so rc.7 rests on an unreviewed draft. |
| B-1.1.0-rc.7-03a | 9 to 27 | "146,097 daily comparisons"; position limits old to new for the Sun (3.0 to 3.4) and Pluto (25 to 30) | supported | rc.7 branch `docs/evidence/de440-sweep-20261111/README.md` lines 23 and 33 (146,097 instants), table lines 38 and 47: Sun 2.39 / 3.34 / 3.0 / 3.4; Pluto 29.19 / 29.86 / 25 / 30 | Match for the two rows read. The same folder is on pull request 92's branch (read only). |
| B-1.1.0-rc.7-03b | 9 to 27 | the other nine bodies' old and new limits; "on other days the engine went past ten of the eleven apparent position limits"; "none falls"; `basis` wording | unchecked | the README table exists; rows 39 to 46 not printed here | Not read row by row. `src/calc-bounds.ts` differs from main by 41 insertions and 39 deletions on the branch. |
| B-1.1.0-rc.7-04 | 28 to 32 | "Pluto's largest is 29.86 arcseconds (29.19 in ecliptic longitude), on the last day" | supported | same README lines 47 and 72 to 75: "29.19″ (Pluto, on the last day, 2199-12-31)", "(29.86″, Pluto)" | Match. "The true node's is 33" not read. |
| B-1.1.0-rc.7-05 | 33 to 37 | "The 72 rows the sweep did not take ..."; topocentric limits 3.0, 7.8, 6.6 | unchecked | figures appear in the README | Rows not counted. |
| B-1.1.0-rc.7-06 | 38 to 39 | "No position changes." | unchecked | `docs/evidence/1.1.0-rc.7-20261111/` exists on the branch | Comparison not opened. |
| B-1.1.0-rc.7-07 | 40 to 45 | sizes: 1,152,017 bytes in 94 files, 3,690 more than rc.6's 1,148,327; entry 2,888, README 379, LICENSING.md and NOTICE 365, JavaScript 58; cap to 1,155,000 | supported | rc.7 branch `sizes.json` (1,152,017; 94); unpacked archive recomputed 1,152,017 in 94 files; CHANGELOG +2,888, README +379, LICENSING.md plus NOTICE +365 against the rc.6 archive (remainder 58); `TOTAL_CAP = 1_155_000` on the branch | Exact match. "a rise the owner decides" is a pending decision. |
