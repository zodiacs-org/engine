# 1.0.0-rc.2 checks, 2026-10-06 to 2026-10-07

1.0.0-rc.2 is the second candidate for 1.0.0, on 1.0.0-rc.1 as main has it
at `c6b5490` (the merge of zodiacs-org/engine#30). It changes no API and no
value: it lets a bundler leave out the tables a program does not read, and it
does what 1.0.0-rc.1's record left for the next candidate. It is fifteen
commits on that base:

1. `ebdc499`, *Let bundlers leave out the frozen tables a program does not
   read*;
2. `a077768`, *Act on the review of ebdc499* (*Reviews*);
3. `c586dc4`, *Keep RELEASING_UNIT_DAYS's documentation as 1.0.0-rc.1's*;
4. `09fb9ef`, *Act on the second review of the table check* (*Reviews*);
5. `b94836c`, *Check 1.0's additions in the packed consumer*;
6. `b82c2bd`, *Act on the third review of the table check* (*Reviews*);
7. `710ab8a`, *Act on the fourth review of the table check* (*Reviews*);
8. `2a14665`, *Act on the fifth review of the table check* (*Reviews*);
9. `44dea9e`, *Act on the sixth review of the table check* (*Reviews*);
10. `9890acd`, *Act on the seventh review of the table check* (*Reviews*);
11. `a195873`, *Act on the eighth review of the table check* (*Reviews*);
12. `5a872a3`, *Act on the ninth review of the table check* (*Reviews*);
13. `6da2de4`, *Act on the tenth review of the table check* (*Reviews*);
14. `ff8f116`, *Act on the eleventh review of the table check* (*Reviews*);
15. the source commit of this candidate, which brought this directory: the
    version, the generated records that carry it, the CHANGELOG, with its
    step for TypeScript, the README, the size notes beside the budgets and
    these checks.

Every figure below is read from a file in this directory or in the one it
names, but the reviews' findings, which are their reports'. Local paths in
the outputs are shortened to `<checkout>`, `<scratch>`, `<tmp>` and, for the
directory of the Node binary, `<bin>`.

## Why

1.0.0-rc.1 froze the exported tables where they are declared,
`export const ELEMENTS = Object.freeze([...])`. A bundler keeps such a call,
and the other calls a table is built with, in a program that never reads the
table, because a call might have effects. zodiacs.org gates the gzip size of
the chunks its chart page loads from the engine, 33,380.4 bytes, and with
1.0.0-rc.1 they measured 33,398, where rc.17's measured 33,128 (the site
repository's adoption of this candidate records the measurements). Part of
the growth was tables the site never reads, `ELEMENTS` and `MODALITIES` among
them. Raising a budget is the owner's decision, and the tables' cost could be
removed instead.

## The change

A table, in `scripts/pure-tables.mjs`, is a variable a module declares at
its top level, or its default export, whose initializer, when the module
loads, calls `Object.freeze`, calls or constructs a function of the same
module that makes a table, or builds a `Set` or `Map` from data, itself or
in a callback it runs. The rule has three parts:

- each call and `new` a table's initializer makes when the module loads is
  marked `/*#__PURE__*/`, and the initializer holds nothing else that a
  bundler takes for an effect: no spread but of an array literal into an
  array, no operator, no property read; a class in it is held to the same
  rule in the parts that run when the class is defined;
- nothing else a module keeps when it loads reads a table: a declaration
  that reads one, its module's or one it imports, by name, as a default or
  through a namespace, directly or through a name that does, is held to the
  same rule, and no other statement, a namespace's among them, or class kept
  when its module loads, reads one or makes one;
- no call whose value is discarded carries the mark, and no marked call
  may freeze a value that exists before it, with a freeze of its own, in a
  function it calls or constructs, or in one it runs from what it is given:
  a bundler would drop the call and its effect with it. The check takes a
  value for new only where it sees the value made, a literal, a new array
  or object, a parameter given one, a `const` bound to one, an element of
  one, and any other for one that may exist before the call; the header of
  `scripts/pure-tables.mjs` states the rule in full.

The commits bring `src/` and the check to it:

- `ebdc499` marks the freezes, the freezes of entries and the `map`,
  `Array.from` and `Object.keys` calls that build tables, as the older tables
  of `./timing`, `./sky` and `./techniques` were already marked, and the two
  generators that write `src/time-scale-data.ts` and
  `src/tzdb/tzdb-2025c.ts` write the marks;
- `a077768` builds the receipt's four later convention sets, each a spread of
  the set before, in a function called in place, and marks that call, so the
  object literal, its key order and its type are as before; writes
  `RELEASING_UNIT_DAYS`' quotients as numbers, each the double the division
  gives; and marks `DEFAULT_ASPECT_POLICY = createAspectPolicy()` and the six
  `Set`s built from data;
- `c586dc4` moves the reason for those numbers out of the table's
  documentation, so that every declaration file is 1.0.0-rc.1's;
- `09fb9ef` has the time-scale generator write the six bounds
  `src/time-scale.ts` computed from `UT1_DATA` and `LEAP_SECOND_LIST` when it
  loaded into `src/time-scale-data.ts` as numbers, `UT1_FROM_MS` and the
  others, each the value its expression gave; marks the five values
  `src/window.ts` computes from tables when it loads, two of them built in
  functions called in place; and holds whatever reads a table to the rule;
- `b82c2bd` closes the gaps the third review found in the check, none of
  which `src/` has: forms the bundlers keep that it let through, and reads
  it reported where a local of the same name hides the table;
- `710ab8a` closes those the fourth review found, none of which `src/` has
  either: a marked call of a function that makes a table could freeze a
  value that exists before it; a callback a function of the module stores
  was taken to run; decorators, a `var` in a block, a `switch`'s `const`,
  labels and anonymous default exports were read wrongly. The export smoke
  test checks that only `./calc` and `./vedic` reach the modules the rule
  leaves out;
- `2a14665` closes those the fifth review found, none of which `src/` has
  either: a marked call could still freeze a value that exists before it
  through a function written in place, a parameter's default, a callback
  it runs, or the second of two callbacks passed to one function; and a
  table made in a callback when its module loads, a `new` of a function
  that makes one, a `for (var ...)` at the top level and an enum member
  named by a string were read wrongly;
- `44dea9e` changes how the check judges what a marked call may freeze, after
  the sixth review found some thirty more forms, none of which `src/` has,
  where following a value to its source let a mark through: it now judges a
  value new where it sees it made, and one that may exist before the call
  where it does not, resolves names by scope, and reads callees through
  commas, aliases, names given as callbacks, tagged templates and
  parameters' defaults;
- `9890acd` acts on the seventh review, which found some twenty more forms,
  none of which `src/` has, several of them ones `2a14665` refused, a crash
  and a slowdown. The check no longer claims to find every such freeze: its
  header calls it an aid to the reader a mark needs, not a proof, and says
  what it does not read. It reads besides what code puts into a value, a
  generator's body, parameters' defaults, a class's static parts,
  `(0, Object.freeze)` and `Object["freeze"]`, a `let` of the module, a part
  a value may inherit and a local function's recursion;
- `a195873` acts on the eighth review, which found the record still claiming
  more than the check does, a few forms in valid TypeScript inside code the
  check reads, and a regression in JavaScript that TypeScript refuses. The
  check reads besides a destructured part a value may inherit, a write into
  what a call or an operator gives that reads a name, a decorator given by
  name and Object.freeze that a conditional or an operator may give. Its
  list of what it does not read says that it is not the whole of it, and
  adds a function an iteration method gives the function it calls as `this`.
  A test pins a value such a function may be given, which one of `44dea9e`'s
  surviving mutants let through;
- `5a872a3` acts on the ninth review, which found that three things
  `a195873` says the check reads it read only in the forms its tests use: a
  decorator given by name, Object.freeze that a conditional or an operator
  may give, and a local function with overload signatures. The check reads
  each in more of the forms code takes, a part under a well-known symbol,
  destructured, and a decorated class expression besides, and in part what
  else a callee or a callback that may be Object.freeze may be;
- `6da2de4` acts on the tenth review, which found that `5a872a3` did not
  read what else a callee or a callback that may be Object.freeze may be
  where it is a name of the module that its code assigns, or a function the
  check reads that runs what the call gives it, and asked for marks it then
  accepted. The check reads both now, and besides Object.freeze as a
  parameter's default, a function that `=` assigns, a const bound to a
  parameter, a static block of a class expression and the last of a
  function's declarations. It says that it reads what else a callee may be
  for a call's callee and a callback only, since it does not for a `new` or
  a tag;
- `ff8f116` acts on the eleventh review, which found that `6da2de4` read a
  `var` of the module declared twice as its last declaration binds it, and
  so asked for and then accepted a mark that `5a872a3` refused. With the
  review's own trial fixes, the check takes a name of the module that a
  `var` gives a value more than once, or declares in a loop's head, for one
  the code assigns, reads a function written in place and called through
  what `=` assigns it, and remembers whether a name is assigned.

That is 78 marks more in 21 files of `src/`, 109 in all. With the marks
taken out, 16 of the 21 files are 1.0.0-rc.1's byte for byte; the other five
are `src/receipt.ts` and `src/window.ts`, with their functions called in
place, `src/timing/releasing.ts`, with its numbers, and `src/time-scale.ts`
and `src/time-scale-data.ts`, with the bounds.

A mark says that the call may be dropped when its result is not used, so it
is sound only where the call does nothing else a program could see. Every
marked call builds a fresh array, object, `Set` or `Map`, or freezes one, or
computes a number; `createAspectPolicy` also remembers the policy it returns
in a `WeakSet` of its module's own, which nothing can ask about once the
policy is gone, cannot throw on its default input, and, testing a rule's
type with a regular expression, sets `RegExp`'s legacy statics as any such
test does; so does the `map` that builds `GREGORIAN_ADOPTION`, through
`parseCalendarDate`'s `exec`, and a program that leaves either call out
does not. No marked call freezes an object that is reachable otherwise.
Two callbacks of marked calls freeze: in `src/geo/calendar.ts` the `map`
that builds `GREGORIAN_ADOPTION` freezes the objects and arrays it makes,
and in `src/time-scale-data.ts` the one that builds `LEAP_SECOND_LIST`'s
changes freezes each row of the array literal it is called on, which
nothing else holds. `results/marks-read.txt` reads each of the 110 marked
calls, of 109 marks, with what it freezes or makes (`tools/marks-read.mjs`).
The check refuses, in every module, a mark on a call whose value is
discarded, and one it finds may freeze a value that exists before it; in
`src/` it finds none. It is an aid to that reading, not a proof: it does not
read every form of code (*What is not established*).

The check runs in the tests on `src/` (`scripts/pure-tables.test.mjs`), and
in the export smoke test on the build, attributing each statement of a built
file to its module by the `// src/...` comment esbuild writes before it, and
following tables through the files' imports and exports. Its 28 tests kill
177 of the 182 mutants run on `ff8f116`'s code: 163 of the 167 run on
`6da2de4`'s code, as written, the other 4 rewritten for code `ff8f116`
changes, and 15 written for `ff8f116`'s. One, which asks of every argument
of a call whether the call runs it, only the timing test kills, which it
fails after about 150 s. Of the five that survive, two forget what
assignedIn has found, which changes only the time. Among the reviews' 696
cases and the 4,000 programs of the tenth review's fuzz, the other three
change only the verdicts of two forms the eleventh review wrote to show what
the first two of them do: one takes a name destructured from inside
Object.freeze for Object.freeze, though a call of such a name throws or
freezes nothing; one takes a name that a parameter destructures for one that
may be Object.freeze where the parameter's default is Object.freeze, and so
refuses marks the check accepts on a call that gives the parameter an
object, whose functions it does not read; and one takes a function the check
does not read, beside Object.freeze as a callee, to call nothing it is
given, where the check takes such a call to freeze a value that may exist
before it anyway. Of the 109 written for `44dea9e`'s code, 78 still apply as
written, and they kill 77: the one that survives, which takes a name for
Object.freeze wherever its declaration gives it that value, refuses besides
a mark on a call that runs `using lock = Object.freeze`, which throws when
it runs, before anything is frozen; and the one that asks of a destructured
parameter whether a function calls it only the timing test kills, which it
fails after about 30 s. Of the earlier rounds' that still apply, 3 of
`2a14665`'s 49 and 5 of its 10, 29 of the 84 written for `710ab8a`'s code
and 6 of the fifth review's 25, they kill all but one of the fifth review's,
which follows a class member's computed name to its class, where the check's
walk stops either way. Of the fourth review's 75 they kill 49, and 25 no
longer apply; the one that survives drops the sort of a directory's names,
which this file system lists sorted anyway. The earlier rounds' figures are
in `09fb9ef`'s, `b82c2bd`'s, `710ab8a`'s, `2a14665`'s, `44dea9e`'s,
`9890acd`'s, `a195873`'s, `5a872a3`'s and `6da2de4`'s messages; `9890acd`'s
corrects `44dea9e`'s, `a195873`'s corrects `9890acd`'s, `5a872a3`'s corrects
`a195873`'s, `6da2de4`'s corrects `5a872a3`'s, and `ff8f116`'s corrects
`6da2de4`'s. The modules that only `./calc` and `./vedic` load are left out
of the rule (`UNMARKED_SOURCE`), as 1.0.0-rc.1 had them: their marks, 16
bytes each in the built files, would add at least 288 bytes to `./calc`'s
graph and 432 to `./vedic`'s, which have 239 and 249 left, and a budget is
raised only with the owner's approval.

## What 1.0.0-rc.1's record left for this candidate

1.0.0-rc.1's record (`../1.0.0-rc.1-20261006/README.md`, *For 1.0.0*) left
four things for the next candidate. This one does them:

- **The CHANGELOG's step for TypeScript.** 1.0.0-rc.1's *Migration* now
  says to declare what a caller keeps of the constants its *Types only*
  bullet lists as their `string` or `number`, not rc.17's literals, and what
  it keeps of a birth window's result as readonly (`readonly WindowChange[]`,
  `readonly WindowUnresolved[]`): what the packed consumer's own TypeScript
  needed on 1.0.0-rc.1's carrier. This candidate's entry says so.
- **The packed consumer reaches 1.0's additions**, in `b94836c`. Its check
  that `resolveLocalToUtc` throws for Stockholm before the zone's history is
  loaded now requires a `ZoneHistoryNotLoadedError`, where it matched the
  message only. A new section, `oneZeroAdditions`, checks on the packed
  archive that `calc` refuses a caller's ayanamsa from an epoch beyond
  `EPHEMERIS_SPAN` with `epoch-out-of-range`; that the root's ten exported
  tables and calc's three are frozen arrays, with `SIGNS`' and `ASPECTS`'
  entries, and `SIGN_NAMES` the same array as `SIGN_SLUGS`; and that
  `SIDEREAL_TIME_RATE` is a number and the deprecated `SIDEREAL_RATE` the
  same one. Its TypeScript consumer reads `SIDEREAL_TIME_RATE`. `710ab8a`
  adds, after the fourth review, that `calc` computes an ayanamsa whose
  epoch is inside the span but before 1800, which rc.17 refused; that the
  refusal beyond carries `EPHEMERIS_SPAN` itself; that `signForLongitude`
  and `matchAspect` return the frozen tables' own entries; and the
  TypeScript consumer reads `SIDEREAL_RATE` too.
  `tools/consumer-additions.mjs` makes these 22 checks one by one
  (`results/consumer-additions.jsonl`): each fails on rc.17's archive and
  passes on 1.0.0-rc.1's and on the pack of this tree. rc.17 takes an
  epoch's scale in upper case and 1.0 in lower case, so the tool writes it
  as each package takes it, and the epoch checks fail on rc.17 for what it
  refuses, not for how the scale is spelled. A table is checked to
  be an array as well as frozen, because `Object.isFrozen` calls a missing
  export, `undefined`, frozen: without that, `SIGN_SLUGS`, which rc.17 does
  not export, passed on rc.17.
- **The gates on the tree** run every job of the three workflows before the
  archive is packed, the pack and the packed consumer on a pack of the tree
  included, as `CONTRIBUTING.md` asks since 1.0.0-rc.1's record (*Gates on
  the tree*).
- **The carrier's gates** (`carrier/carrier-gates.sh`) shorten the
  directory of the Node binary to `<bin>`, name each log for its commit,
  `<job>-<commit>-<node version>.log`, and run without `NODE_OPTIONS`, which
  CI does not set. `gates.sh`, `tree-jobs.sh` and `carrier/pack-source.sh`
  run without it too, and the first two shorten `<bin>` as well.

## What did not change

- **Values.** `../1.0.0-rc.1-20261006/tools/values.mjs`, unchanged, ran its
  battery of 6,417 calls over the twelve entry points on the carried
  1.0.0-rc.1 archive, unpacked, and on this tree's build, each in its own
  process. The two runs are the same bytes (`results/values-compare.txt`):
  the battery writes the engine's version as a placeholder, and nothing else
  differs, the convention sets' keys and their order among the rest.
- **The API.** `npm run api:check` finds the twelve entry points'
  declarations as `api/` has them, and every declaration file of the build is
  1.0.0-rc.1's byte for byte (`results/declarations.txt`).
- **Conformance.** `conformance/results/` changes in the engine's version
  alone: the 500 verdicts are 1.0.0-rc.1's.
- **The calc round trip.** `src/fixtures/calc-roundtrip.json`, rebuilt by
  `scripts/build-calc-roundtrip.mjs`, changes in the version it records.

## Which tables a bundler leaves out

Alone. `tools/tables-dropped.mjs` takes each table the rule finds in a
build and writes a module that holds its declaration with, verbatim, every
declaration of its own module it reads, and theirs in turn; each other name
it reads is imported from a module the bundlers are told is outside, which
they cannot see into. It bundles a program that imports the module and reads
nothing, and the same with the table's declaration taken out: the table is
left out when the two bundles are the same, but for the import from outside
and the module's file name (`results/tables-dropped-*.jsonl`). The tables it
finds in each build, and how many of them each bundler keeps:

| Build | Tables the rule checks | Kept: esbuild | esbuild, minified | Rollup 4.63.4 | Rolldown 1.1.4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| rc.17 | 55 | 31 | 30 | 8 | 30 |
| 1.0.0-rc.1 | 66 | 43 | 42 | 11 | 42 |
| 1.0.0-rc.2 | 66 | 0 | 0 | 0 | 0 |

Of the 15 tables of the modules the rule leaves out, esbuild keeps all 15,
plain and minified, Rollup 7 and Rolldown 15, on 1.0.0-rc.1 and on this
candidate alike (rc.17 had 12, kept by 12, 12, 5 and 12).

In a program. A table is kept, too, by whatever else a program keeps that
reads it. `tools/tables-in-context.mjs` copies a build's files into a
directory with no `package.json`, so that the bundlers take each file to have
effects. For each entry point of the package's exports map it bundles a
program that imports it and reads nothing, with esbuild unminified and Rollup
and Rolldown at their defaults: once as built, and once for each table the
rule finds in a file the entry point loads, with the table's initializer
written `void 0`. The program keeps the table when the two bundles differ,
whatever form the bundler gave it: a declaration, a bare statement or a value
written where it is read (`results/tables-in-context-*.jsonl`). The tables
the rule checks that some such program keeps:

| Build | Tables the rule checks | Kept somewhere: esbuild | Rollup | Rolldown |
| --- | ---: | ---: | ---: | ---: |
| rc.17 | 55 | 31 | 14 | 30 |
| 1.0.0-rc.1 | 66 | 43 | 20 | 42 |
| `c586dc4` | 66 | 7 | 7 | 7 |
| 1.0.0-rc.2 | 66 | 3 | 3 | 3 |

At `c586dc4`, before `09fb9ef`, the six bounds of `src/time-scale.ts` kept
`UT1_DATA` and `LEAP_SECOND_LIST` in every program that loads its chunk, and
`src/window.ts` kept `REFERENCE_SPAN`, `WINDOW_RATE_BOUNDS` and `ASPECTS` in
the program that loads it. On this candidate the three left are kept only by
what the modules the rule leaves out read when they load: `REFERENCE_SPAN` in
the programs that load `./calc` or `./vedic`, and `SIGNS` and `SIGN_SLUGS` in
the one that loads `./vedic`, under all three bundlers. Of the 15 tables of
those modules, the programs keep all 15 under esbuild and Rolldown, and 11
under Rollup, on 1.0.0-rc.1 and on this candidate alike. Rollup's 7 of them
bundled alone are another count: in programs it keeps five that it leaves out
alone, where what their own modules keep reads them, and leaves out
`CALC_FRAMES2`, which it keeps alone.

`tools/bundler-probe.mjs` shows the forms behind these counts on 29 small
tables (`results/bundler-probe.txt`), with Rolldown at its default, which
leaves out what it finds unused but does not minify, minified and through
Vite. esbuild keeps a marked freeze of a spread of a table, of a quotient, of
a property read or of a template with a substitution, and, unminified, of a
spread of an object literal, and a marked call that spreads even an array
literal into its arguments. Rollup keeps the spread of a table and the
property read, and Rolldown none of these. All of them keep an unmarked
`Array.from` or `Set` of a table's entries, a table frozen by an `if`
statement, and a table that a value computed when its module loads reads;
and an unmarked `map`, Rollup only where its callback reads a property or
its array is imported from a module Rollup is told is outside, which it
cannot see into: it leaves out the same `map` over an array of the module.
esbuild and Rolldown keep an unmarked freeze, a marked freeze of an entry
frozen unmarked, a table frozen by a statement of its own, and a freeze in a
class's static field or block. A marked call that builds the value, a
function called in place among them, is left out by all. A marked freeze
whose value is discarded after `&&`, in a conditional or on the right of a
comma is dropped by all, and the table is not frozen; in a `for` loop's
update, by all but esbuild.

`tools/globals-probe.mjs` bundles, for each of the 22 globals the rule lets
a table name, a program that does not read a marked table holding it:
esbuild, plain and minified, Rollup, and Rolldown, at its default and
minified, all leave the table out. A name the module does not declare, which
may be a global with a getter, keeps the table under esbuild and Rollup. It
does the same for each of the 15 well-known symbols as a table's computed
key, and for a class beside a table with a method of that key that reads it:
all five leave the table out, where esbuild keeps both for a symbol that is
not well-known (`results/globals-probe.txt`). `tools/check-gaps-probe.mjs`
shows what the bundlers do with forms of each kind the third to eleventh
reviews found the check let through, and with forms of what it still does
not read (`results/check-gaps-probe.txt`, *Reviews*, *What is not
established*).

## What a program carries

`tools/bundles.mjs` bundles six small programs against rc.17, 1.0.0-rc.1,
`c586dc4` and this tree, with esbuild, minified, for the browser
(`results/bundles.jsonl`), and reports each bundle's gzip size and which of
five things it holds: the tables `ELEMENTS` and `MODALITIES`, and
`createAspectPolicy`, the code that builds the default aspect policy when the
root loads, none of which any program reads; and `UT1_DATA` and
`LEAP_SECOND_LIST`, which the programs that compute a chart read and
`outsideReferenceSpan` does not:

| Program | rc.17 | 1.0.0-rc.1 | 1.0.0-rc.2 |
| --- | ---: | ---: | ---: |
| `normalizeLongitude` (root) | 3,936, the policy | 4,169, the two tables and the policy | 137, none |
| `signForLongitude` (root) | 3,996, the policy | 4,229, the two tables and the policy | 507, none |
| `natalChart` (root) | 36,736, the policy | 37,000, the two tables and the policy | 35,132, none |
| `computeChart` (`./internal`) | 33,522, none | 33,786, the two tables | 33,478, none |
| `createNatalEnvelope` (`./receipt`) | 14,912, none | 15,204, the two tables | 15,080, none |
| `outsideReferenceSpan` (root) | 7,412, the policy and the time-scale tables | 7,475, the policy and the time-scale tables | 180, none |

Bytes gzipped at level 9, and what each holds of the three that no program
reads, and, for `outsideReferenceSpan`, of the time-scale tables, which the
other programs read. At `c586dc4` the program that calls only
`outsideReferenceSpan` was 3,501 bytes and held both time-scale tables; the
others were as on this candidate, within 10 bytes.

## Sizes and budgets

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.0.0-rc.1
archive and this tree, with the budgets of this tree:

| Entry | 1.0.0-rc.1 | 1.0.0-rc.2 | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: |
| `.` | 105,365 (35,327) | 105,980 (35,394) | 108,500 | 2.37 % |
| `./calc` | 144,694 (47,419) | 145,261 (47,488) | 145,500 | 0.16 % |
| `./crossings` | 9,942 (2,964) | 9,942 (2,964) | 10,000 | 0.58 % |
| `./deltat` | 5,200 (2,028) | 5,232 (2,045) | 5,500 | 5.12 % |
| `./geo` | 35,375 (13,081) | 35,439 (13,087) | 35,500 | 0.17 % |
| `./houses` | 13,678 (3,521) | 13,678 (3,521) | 15,000 | 9.66 % |
| `./internal` | 65,720 (22,782) | 66,287 (22,843) | 68,000 | 2.58 % |
| `./internal/math` | 18,695 (4,989) | 19,175 (5,016) | 20,000 | 4.3 % |
| `./receipt` | 68,825 (22,869) | 69,496 (22,935) | 70,000 | 0.72 % |
| `./sky` | 93,566 (31,664) | 94,149 (31,733) | 97,000 | 3.02 % |
| `./techniques` | 155,046 (51,127) | 155,805 (51,204) | 160,000 | 2.69 % |
| `./timing` | 124,737 (40,182) | 125,356 (40,269) | 129,000 | 2.9 % |
| `./vedic` | 127,184 (42,698) | 127,751 (42,760) | 128,000 | 0.19 % |
| `./window` | 103,559 (34,368) | 104,242 (34,448) | 105,000 | 0.72 % |

Bytes, with the sum of the graph's files each gzipped at level 9 in
parentheses; headroom is the budget over the 1.0.0-rc.2 size, as a
percentage of the size, rounded down. Each graph grows by what it loads of
the marks, 16 bytes each in the built files, and of the six functions called
in place, less 105 bytes where it loads the time scale, whose bounds are now
numbers: nothing in `./crossings` and `./houses`, 615 bytes in the root's,
the most, 759, in `./techniques`'s. No budget is raised; the tightest are
`./calc` (0.16 per cent), `./geo` (0.17), `./vedic` (0.19) and
`./crossings` (0.58). These are the unminified files' bytes: a consumer's
minified bundle drops the marks with the tables nothing reads (*What a
program carries*).

The package is 989,528 bytes unpacked in 74 files, 7,442 more than
1.0.0-rc.1's 982,086: 615 bytes of the root's JavaScript and 544 of the
JavaScript that only the opt-in entry points load, and 6,283 of documents,
the CHANGELOG's entry and step for TypeScript and the README's lines; the
declarations and the manifest are the same size. That leaves 10,472 bytes
under the cap of 1,000,000.

## Gates on the tree

`gates.sh`, 1.0.0-rc.1's writing here, ran CI's engine job on the tree of the
source commit before it was made, once on each Node version, without
`NODE_OPTIONS` (`gates.log`, and the suite's output in
`full-tests-<version>.log`):

| Node (npm) | Typecheck | Tests | Build, export smoke, API check, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,853 passed in 86 files | pass |
| 20.19.0 (10.8.2) | pass | 3,852 passed, 1 skipped, in 86 files | pass |
| 24.21.0 (11.19.0) | pass | 3,852 passed, 1 skipped, in 86 files | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c, as on 1.0.0-rc.1. The 28 tests more than 1.0.0-rc.1's are
`scripts/pure-tables.test.mjs`'s. `npm run package:contents` reports 74
files and 989,528 bytes unpacked on each, and `npm run api:check` that the
twelve entry points match `api/`. TypeDoc builds the reference of the twelve
entry points with 0 errors and the 2 warnings 1.0.0-rc.1's had
(`typedoc.log`).

Then `tree-jobs.sh` ran on the same tree the jobs `gates.sh` does not, as
CONTRIBUTING.md asks before an archive is packed (`tree-jobs.log`), without
`NODE_OPTIONS`: it packed the tree (SHA-256
`4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002`, 287,011
bytes), ran the packed-consumer check on that pack on Node 20.19.0, 22.7.0,
22.22.2 and 24.21.0, its 34 sections and its TypeScript passing on each, and
ran the conformance job's self-test, vector validation, verdict check and
report check and the atlas job's check and self-test. All passed. The
archive check reads commits, so it runs on the commits themselves.

## Birth data

`history-check.txt` is the output of the search for people's birth data that
must not be published, run on the fifteen commits and the tree with patterns
kept outside the repository. It found none.

## Reviews

Each commit that changed `src/` or the check had an independent review, in
which the reviewer rebuilt the tree, ran its gates and probed the bundlers
on a copy of their own, but the last, `ff8f116`. The commit after each acts
on what its review found; `ff8f116` takes the eleventh review's own trial
fixes, which that review ran on its 734 programs, and was checked with its
harness and the earlier reviews', without a review of its own:

- **The first review, of `ebdc499`,** found each mark sound and no value
  changed. It found three groups of tables, in modules the rule covers, that
  the bundlers still kept and the check let through: the receipt's
  convention sets, built with a spread of the set before;
  `RELEASING_UNIT_DAYS`' quotients; and the default aspect policy, built by
  an unmarked function of its module. `a077768` acts on it, and its tests
  killed the review's ten surviving mutants of the check.
- **The second review, of `a077768`,** found its marks sound and nothing
  changed in behaviour. It found four faults: the check had lost its rule
  against a freeze outside a declaration; it allowed a spread of an object
  literal, which esbuild keeps; it let through what else a module keeps that
  reads a table, the six bounds of `src/time-scale.ts` and five values of
  `src/window.ts` among them; and the probe of tables bundled alone
  undercounted 1.0.0-rc.1, because it stood in for a function of the
  table's module with one that does nothing. `09fb9ef` acts on them.
- **The third review, of `09fb9ef`,** found its code correct, its six
  constants equal to the expressions they replace, and the values, the
  declarations and the gates as before. Its findings:
  - `tools/tables-in-context.mjs` undercounted Rollup and Rolldown. They
    drop an unused declaration's name but keep its initializer, and Rolldown
    inlines a declaration read once. The tool now compares each program's
    bundle with and without each table.
  - `tools/bundler-probe.mjs` ran Rolldown unminified, where Rolldown's
    default drops more; it runs Rolldown at its default now.
  - The record gave Rollup's count for tables bundled alone, 7 of the 15
    the rule leaves out, as if it held in programs, which keep 11.
  - The export smoke test's closing line put the exception in modules, not
    in programs that load `./calc` or `./vedic`.
  - The check had gaps that `src/` does not have, and rules its tests did
    not pin. `b82c2bd` acts on them. `tools/check-gaps-probe.mjs` shows what
    the bundlers do with each gap (`results/check-gaps-probe.txt`), and
    `tools/globals-probe.mjs` that they leave out a table naming any of the
    globals the rule allows (`results/globals-probe.txt`).
- **The fourth review, of `b94836c` and `b82c2bd` and of the tools,** found
  nothing that blocks the package: both commits do what they say, and every
  figure it was asked to check re-derives, the counts of tables kept in
  programs among them. Its findings:
  - Two statements in `b82c2bd`'s message are untrue. One of the three
    mutants it says cannot change a result does change one. Two of the
    breaches it lists as missed, an unmarked call in a spread or in a tagged
    template's substitution, the check already reported. And the freeze in a
    nested block was probed in a block of the module's own, which the check
    also reported; in a block under an `if`, all three bundlers keep the
    table.
  - The other findings were latent. A marked call of a function that makes
    a table could freeze a value that exists before it, and the check asked
    for that mark. A callback that a function of the module stores was
    taken to run. Scopes, decorators, ambient declarations and anonymous
    default exports were read wrongly. The export smoke test did not check
    the exemption's premise. And the packed consumer missed `./calc`'s
    epochs inside the span.
  - `710ab8a` acts on them. Its message said the probe confirmed each gap,
    but the probe had no case for the stored callback until `2a14665`. The
    reads the check reported wrongly, a `switch`'s `const`, an enum member
    and a label, are pinned by its tests.
- **The fifth review, of `710ab8a` and the tools,** found that it does what
  its message says for every form it names, that it changes nothing in
  `src/` or the build, and that every figure it was asked to check
  re-derives. Its findings:
  - The commit's central claim did not hold. A marked call could still
    freeze a value that exists before it through a function written in
    place, a parameter's default, a callback it runs, or the second of two
    callbacks passed to one function. All five bundler configurations drop
    each of these and leave the value unfrozen.
  - The check was silent where bundlers keep a table: one made in a
    callback when its module loads, one made by a `new` of a function that
    makes it, and one a `for (var ...)` at the top level reads.
  - `710ab8a`'s message was wrong about Rollup, which keeps an unmarked
    `map` over an array imported from a module it is told is outside
    (`tools/bundler-probe.mjs`, AB and AC). The fourth review's probe had
    imported one that Rollup bundles.
  - For the fourth review's `var` in a block, and for the `for (var ...)`,
    esbuild's "left out" is a miscompilation: its bundle prints `undefined`
    where the program prints the table (`tools/check-gaps-probe.mjs`).
  - Smaller points: getters were taken for new values; a caller's local
    functions were read in a callee's place; the messages claimed more
    than the check knows; a misplaced mark in a table was reported as in
    none; the export smoke test reads static imports only; the packed
    consumer could pass vacuously; a tool's header misled; and lines of
    this record were stale.
  - `2a14665` acts on them. What the check still does not read is under *What
    is not established*.
- **The sixth review, of `2a14665` and the tools,** found that it closes
  every form the fifth review found, changes nothing in `src/` or the
  build, and that its figures re-derive. Its findings:
  - The central claim still did not hold. In some thirty forms inside the
    kinds of code the check said it read, it accepted a mark on a call that
    may freeze a value that exists before it, or asked for one: a part of a
    new value, a name it did not trace, a callback given by name, reduce's
    accumulator, a callback parameter's default. All five bundler
    configurations leave the value unfrozen.
  - A regression: TypeScript's `this` parameter shifted every parameter
    index.
  - The memo could settle a "no" while another answer was pending, and
    tables made through a callback given by name, a const bound to a
    function, a comma, a tagged template or a parameter's default went
    unseen.
  - `2a14665`'s message counted one mutant too few, one that changes
    nothing, and said esbuild miscompiles `for (var T ...)`, which holds
    for `for (var T; ;)` only; the probe's stored-callback case for the
    fourth review was a form the check never asked to mark.
  - `44dea9e` acts on them by replacing the check's judgement of what a marked
    call may freeze with a stricter rule (*The change*). The probe shows
    what the bundlers do with forms of each kind the review found.
- **The seventh review, of `44dea9e` and the tools,** found the package
  fine and the figures re-derived, and read every marked call in `src/` that
  is not a freeze of a literal: each freezes only values it makes. Its
  findings:
  - What the commit said of the check did not hold. In ordinary forms
    inside the code the check said it read, it accepted a mark on a call
    that freezes a value its module holds, and all five bundler
    configurations drop the call: an object or array filled after it is
    made, a default reached through an argument that is `undefined`, a
    local function's recursion, a generator a spread runs, a class's static
    field, a `var` of a function's name, a `let` of the module bound to a
    function, `(0, Object.freeze)`, a Map's keys, a spread into
    `Array.from`, a parameter's default and `[].constructor`. `2a14665`
    refused several of these.
  - The check crashed on a function that passes itself to `forEach`, and
    its time grew about as the cube of a call chain's length.
  - `44dea9e`'s message counted a mutant twice, said that no mutant tested
    the elements a callback is given, and that all five configurations drop
    each of the sixth review's forms, which holds for 29 of 32; the probe's
    header claimed each form.
  - `9890acd` acts on them, and narrows what the check claims (*The
    change*). The probe has forms of each kind, with what the bundlers do.
- **The eighth review, of `9890acd` and the record,** found the package
  unaffected and every figure re-derived, the crash and the slowdown fixed,
  and every form the seventh review found refused but those the header
  lists as not read. It read the 110 marked calls in `src/` again, with the
  functions they call: each freezes only values it makes, though this
  record's line for `createAspectPolicy` named the wrong ones. Its findings:
  - `9890acd`'s one surviving mutant does change a result, with two marked
    calls of local functions that call each other; its message said it
    could not.
  - In valid TypeScript inside code the check reads, it accepted marks on
    calls that freeze a value the module holds, which all five
    configurations then drop: a part a value inherits, destructured; a
    write into what a call or a conditional gives; and a decorator given by
    name.
  - The probe had no form of a write by a function a value is given to,
    and its `new` form was reported as unmarked rather than accepted; the
    depth this record gave was too high; and `9890acd` stopped reading a
    local function that a `var` without a value shares, in JavaScript only.
  - The header's list of what the check does not read left out a function a
    call returns, one held in an array, one a conditional chooses,
    Object reached through another name, and a function the code assigns
    another.
  - `a195873` acts on them (*The change*). The probe has a form of each.
- **The ninth review, of `a195873` and the record,** found the package
  unaffected, every figure re-derived but the depth, and every form the
  eighth review found refused. Its findings:
  - Three things `a195873` says the check reads it read only in the forms
    its tests use: a decorator given by name, of a class defined when its
    module loads or naming a parameter; Object.freeze that a conditional may
    give, through a name or an assignment; and a local function with
    overload signatures, which the header said it reads as one the code
    declares. All five configurations drop the marks it accepted, and
    esbuild and Rolldown keep the tables it did not find.
  - The check asked for a mark on a call whose callee may be Object.freeze
    or a function that freezes a value of the module, and then accepted the
    mark.
  - It accepted a mark on a call that freezes a part under a well-known
    symbol, destructured, or a decorated class expression, whose decorator
    may give a value that exists before the call.
  - The header's list of what the check does not read left out a write
    through what a function returns; its sentence on the marks it asks for
    left out a decorator that gives `addInitializer` a function; the depth
    this record gave was wrong again; and the test's forms were not all
    valid TypeScript, as `a195873`'s message said.
  - Of `44dea9e`'s mutants, the one that asks of a destructured parameter
    whether a function calls it changes no verdict but takes 4.3 s on a
    chain of 100 functions that pass a callback through one, which a timing
    test now reads.
  - `5a872a3` acts on them (*The change*). The probe has a form of each.
- **The tenth review, of `5a872a3` and the record,** found the package
  unaffected and every figure re-derived. Its findings:
  - `5a872a3`'s new claim, that where a callee or a callback may be
    Object.freeze or something else the check reads what else it may be, did
    not hold for a name of the module that its code assigns, a function the
    check reads that runs what it is given, or a `new` or a tagged template.
    In the first two the check asked for a mark and then accepted it, which
    all five configurations drop; its fuzz of such choices found 94 such
    marks.
  - The record's "wherever it reads code" did not hold for Object.freeze as
    a parameter's default, chosen there or destructured with one, or for a
    decorator that names a parameter through a comma.
  - The check did not find a table that a static block of a class expression
    in a top-level const makes, or one made through a parameter whose
    default is Object.freeze; it read the first of two declarations of a
    local function, where JavaScript runs the last; and it did not follow
    `=` in a callee, or a const bound to a parameter.
  - `6da2de4` acts on them (*The change*). The probe has a form of each, and
    labels those the check still does not read, a `new` or a tag of such a
    choice and a function held in an array, "still not read".
- **The eleventh review, of `6da2de4` and the record,** found the package
  unaffected and every figure re-derived but two timings. Its findings:
  - A mark on a call of a `var` of the module, made before a second `var` of
    its name binds it to Object.freeze, which `6da2de4` asked for and then
    accepted and `5a872a3` refused; and a `var` that a second declaration or
    a loop's head binds again, which both read as declared. All five
    configurations drop the calls.
  - `6da2de4`'s statements that the check reads what a function it reads
    runs of what a call gives it, and a function written in place through
    what `=` assigns, did not hold for one that runs it through `...` or
    `arguments`, or for a function written in place and called through what
    `=` assigns it, whose table the check did not find.
  - The record's table of gates read `5a872a3`'s tree; the depth it gave was
    too sharp; and assignedIn, which `6da2de4` asks more often, took 1.7 s
    on a chain of 400 local `let`s.
  - `ff8f116` acts on them (*The change*). The probe has a form of each, and
    labels those the check still does not read, a function run through
    `...` or `arguments` and the first of two `var`s, "still not read".

## What is not established

- The tables that only `./calc` and `./vedic` load are not marked, and a
  program that loads either entry carries those it does not read, as on
  1.0.0-rc.1, and what those modules read of the others when they load:
  `REFERENCE_SPAN`, `SIGNS` and `SIGN_SLUGS` (*Which tables a bundler leaves
  out*). Marking them as the rule asks would take more than marks: the
  spreads of `CALC_BODIES` and `CALC_FRAMES` keep them too.
- The rule covers tables and what reads them. A module-scope value of
  another kind is kept as before when a bundler cannot tell that building it
  has no effect, such as the constants several modules compute from
  `Math.PI`, and the pairs `./window` builds in a loop when it loads.
- The check is an aid to reading a mark, not a proof. It reads one module at
  a time, and not all of it. The rule does not find a table built by a
  function of another module, or in a callback that such a function runs, or
  that a function runs through a parameter it gathers with `...`. Among what
  it does not read: a function of another module, a class's constructor, an
  object's methods, a callback in an object literal, a function run through
  `call`, `apply` or `bind`, one a call returns, one held in an array or an
  object, one reached through a local `var` or a `let` that is assigned, one
  a conditional or an operator chooses, but beside Object.freeze as a call's
  callee or a callback, a local function declaration that an assignment or a
  `var` of its name replaces, a function of the module that a later `var` of
  its name replaces, one passed to any function but an array's iteration
  method or one it reads, a string's `replace` among them, or to one it
  reads that runs it through a parameter it gathers with `...` or
  destructures, or through `arguments`, and one an iteration method gives
  the function it calls as `this`; Object.freeze reached through another
  name for Object, such as `globalThis.Object`, or as the default of a name
  destructured at the top of a module, by a `var` or in a catch clause; a
  write into a value through another name, through what a function returns,
  or by a function the value is given to; and, where a key is not written as
  a name or a string, whether a property read reads an inherited part. It
  reads a function of the module as it is declared, the last declaration
  where `var`s declare it more than once, though its code may assign the
  name another later, but beside Object.freeze, where it takes such a name,
  or one a `var` gives a value more than once or declares in a loop's head,
  to hold anything. What a value may inherit is what the built-ins of the
  Node that runs it have, so a verdict may differ between versions of Node.
  For a form of each of these but `apply` and `bind`,
  `tools/check-gaps-probe.mjs` shows the bundlers keeping the table or
  leaving the value unfrozen ("still not read"). Each marked call in `src/`
  is read by hand (`results/marks-read.txt`).
- The check takes a `new`, and what a method in `FRESH_METHODS` returns, for
  a new value, though a constructor can return an object that exists before
  it, and so can a method of one of those names, as the probe shows for one
  named `with`. It takes a method named as an array's iteration method to
  run the function it is given, whatever it is called on, so it asks for a
  mark on a call of an object's own `map` that stores the function, which
  the bundlers then drop (the probe); and it asks for, and then accepts, a
  mark on a call of a function whose decorator makes a table and gives
  `addInitializer` a function that freezes a value of the module, which the
  bundlers drop (the probe). Where it cannot see a value made, it takes it
  for one that may exist before the call, which refuses some sound marks: a
  freeze of `Object.assign({}, ...)`, of a value a local function's code
  declares around it, of a parameter gathered with `...`, of a `var`, of a
  local class or enum, of a `let` assigned only new values or of a catch
  binding; a deep freeze of a `new` or of a new Map's keys; a call of a
  generator whose body does not run; a default given through `&&`; a value
  written into by `Object.defineProperty`; a call whose callee may be
  Object.freeze or a function the check does not read, such as a parameter;
  and a call of a name of the module or a `let` that may be Object.freeze
  and that the code assigns, or that a `var` of the module gives a value
  more than once, or of a parameter, or a name a parameter, a const, a `let`
  or a loop destructures, whose default is Object.freeze, though the call
  freezes only a new value. It takes a table that such a call makes for a
  breach that no mark mends.
- Code some hundreds of calls deep may exhaust the stack the check runs on.
  Run in a fresh process sixteen times at each depth, a chain of functions
  that each pass a callback on passes every time at 463 calls deep and
  crashes every time from 466 at `ff8f116`; at 464 and 465 it crashed in 29
  of 32 runs, and near those depths a run may go either way.
- Three bundlers were tried, esbuild, Rollup and Rolldown (through Vite and
  on its own); webpack was not.
- 1.0.0-rc.2 is not published, and nothing here publishes it. The site's
  adoption of it is reviewed in the site repository.

## Reproduction

From the engine's root, after `npm run build`:

```sh
node scripts/pure-tables.mjs
node docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs <1.0.0-rc.1 archive, unpacked> > rc1.jsonl
node docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs . > rc2.jsonl
cmp rc1.jsonl rc2.jsonl
node docs/evidence/1.0.0-rc.2-20261006/tools/tables-dropped.mjs . <Rollup package> <Rolldown package> [<an archive, unpacked>]
node docs/evidence/1.0.0-rc.2-20261006/tools/tables-in-context.mjs . <Rollup package> <Rolldown package> [<an archive, unpacked>]
node docs/evidence/1.0.0-rc.2-20261006/tools/bundles.mjs . rc.17=<rc.17 archive, unpacked> 1.0.0-rc.1=<1.0.0-rc.1 archive, unpacked> 1.0.0-rc.2=.
node docs/evidence/1.0.0-rc.2-20261006/tools/bundler-probe.mjs . [<Rolldown package> [<Vite package> [<Rollup package>]]]
node docs/evidence/1.0.0-rc.2-20261006/tools/globals-probe.mjs . <Rollup package> <Rolldown package>
node docs/evidence/1.0.0-rc.2-20261006/tools/check-gaps-probe.mjs . <Rollup package> <Rolldown package>
node docs/evidence/rc16-20260930/sizes.mjs 1.0.0-rc.1=<1.0.0-rc.1 archive, unpacked> 1.0.0-rc.2=. > sizes.json
node docs/evidence/1.0.0-rc.2-20261006/tools/consumer-additions.mjs <an archive, unpacked> node_modules/astronomy-engine
```

An unpacked archive needs astronomy-engine where Node finds it, for instance
a `node_modules` link to the checkout's; `consumer-additions.mjs` makes its
own.
