# Versions and deprecations

From 1.0.0, `@zodiacs/engine` follows [Semantic Versioning
2.0.0](https://semver.org/spec/v2.0.0.html): within a major version, a new
release does not remove or change incompatibly anything this page calls
public. A minor release adds; a patch release fixes. Release candidates
(`1.0.0-rc.1` and the like) promise nothing: anything in one may change before
the release it leads to.

## What is public

- **The entry points.** The twelve that `package.json` exports and the README
  documents: the root, `./calc`, `./crossings`, `./deltat`, `./geo`,
  `./houses`, `./receipt`, `./sky`, `./techniques`, `./timing`, `./vedic` and
  `./window`. `./internal` and `./internal/math` are private to Zodiacs.org
  and carry no promise (README, *Internal site entry points*).
- **Their declarations.** Every name each entry point exports, its type, a
  function's parameters and result, the shape of each result, the members of
  each string union (body names, flags, refusal reasons, frames, house
  systems) and the value of each constant its declaration fixes, except the
  constants that name a release or the data it carries, which change with
  them (`ENGINE_VERSION`, `EPHEMERIS`, `DELTA_T_TABLE` and the like), and the
  tables that list a union's members (`HOUSE_SYSTEMS`, `CALC_BODIES`,
  `AYANAMSAS` and the like), which gain a member when a minor release adds it
  to the union (below). `api/` holds
  them, one file per entry point, written from the built declarations by
  `scripts/api-report.mjs`. CI rebuilds the files and fails when they differ
  (`npm run api:check`), so no change to them reaches `main` unseen; a change
  is committed with the regenerated file and a CHANGELOG entry.
- **Documented behaviour.** What the README and `docs/` say a function does
  with its input: what it computes, under which conventions, which input it
  refuses and how. A value of the declared type that a function refuses (an
  unknown body, a date that does not exist, a latitude out of range) throws
  a `RangeError` (or, where an entry point names one, its own error class:
  `./receipt`'s `NatalEnvelopeError`); a well-formed request the engine does
  not compute returns a typed refusal where the entry point has them
  (`./calc`'s `CalcRefusal`, a crossing search's `refused`), or throws a
  named error where it says so (`./geo`'s `ZoneHistoryNotLoadedError`,
  `./window`'s `WindowBudgetError`). Which of these such an input meets is
  public. A value of a type the declaration does not allow (`null` for an
  array, a string for a number) is outside the promise: some functions throw
  a `TypeError` for it or return `NaN`, and a later release may refuse it
  with a `RangeError` instead. `./geo`'s GeoNames client rejects with a
  `TypeError` for data it cannot read and an `Error` for a failed request.
- **Records.** What a receipt or envelope holds, and which records the
  `./receipt` codec reads (below).

Not public: the text of an error message or of a refusal's `detail` (branch
on the class, the `reason` or the code, never on the wording); the names of
the chunk files under `dist/`; any field, export or behaviour the
declarations and documents do not name; and the order of entries in a result
where no order is documented.

Results are the engine's to make. Where a declaration says a result is
frozen, it is frozen at its top level: a `Date` or a chart inside it is not,
and changing one is not supported. An instant in a result is a `Date` or an
ISO 8601 string, as its declaration says, and the two do not change places
within a major version: records and the results built to be stored or
compared (`./receipt`'s envelopes, `./calc`'s results, `./vedic`'s values and
dasha periods, a chart's declinations, a zone's transitions) give strings,
and the rest `Date`s, the root `Chart` that `./calc`'s `chart()` carries
among them. Some values are accepted only as the engine made them, such as
`./vedic`'s `SiderealLongitude` and the root's aspect policies: a copy, even
through JSON, is refused, although the types do not say so.

### What a minor release may add

- New exports, new optional fields in an options object, new optional
  parameters, and new members of a union a function takes (a house system,
  a body, an ayanamsa): code written for the earlier release keeps working.
- New members of a union a result carries: a pattern kind, a flag, a refusal
  reason, a convention id, a time-scale basis. Code that switches on such a
  value should handle one it does not know, because a minor release may name
  a case that did not exist before. A member is never removed or renamed
  within a major version, and a value never changes its meaning.
- New fields in a result object. Code that compares whole results, or
  serializes them and expects the old keys only, should expect new ones.
- A result where an earlier release refused: a request refused with a typed
  refusal (`./calc`'s `out-of-range`, say) may be computed by a later minor
  release, and a refusal may gain a new `reason`. Code should not rely on a
  request staying refused.

### Experimental

A declaration whose documentation comment carries `@experimental`, which
`api/` shows above it, is outside this promise: a minor release may change or
remove it, and the CHANGELOG says so. A declaration leaves the experimental
tier by losing the tag in a minor release, and from then on it is public like
any other. 1.0 marks as experimental the parts whose conventions are still
being settled; each entry point's guide says which.

## Numbers

A calculation's result is a number with a stated accuracy, not a fixed
string of digits. A minor or patch release may change a value:

- when the engine computes it more accurately, or fixes a value that is
  wrong;
- when a data table it carries is updated: the IERS leap seconds and
  UT1 − UTC, the ΔT model's table, the time-zone database.

Every such change is listed in the CHANGELOG with its size. A value never
moves by more than its published bound because of a refactoring, and the
bounds `./calc` publishes are only ever tightened within a major version,
unless a bound is found to be wrong, in which case it is corrected and the
correction is listed. A receipt names the engine, the ephemeris and the
tables that computed it (`./receipt`), so a record keeps saying where its
numbers came from after the engine moves on.

What a value means is another matter. A convention, such as the frame a
longitude is given in, an ayanamsa's definition or a house system's rule at
the poles, changes only in a major release, or by adding a new name for the
new rule beside the old one.

## Records

Each 1.x release's receipt codec reads every record that it and every
earlier 1.x release writes, and every record that 1.0.0 reads: from the first
receipts of 0.1.1-rc.3, each under the conventions its engine recorded. A
minor release may start to write a new set of conventions or a new schema
version; every later 1.x release reads both, and an earlier one refuses the
new record, as it refuses any it does not know (`unsupported_feature`,
`unsupported_version`). No 1.x release stops reading a set or a version that
an earlier 1.x release wrote.

A schema id is a permanent, opaque name. `NATAL_ENVELOPE_SCHEMA`,
`NATAL_RECEIPT_SCHEMA` and `NATAL_DIAGNOSTIC_SCHEMA` keep the `draft-v1` they
have carried since 0.1.1-rc.3, byte for byte, because stored records carry
them: the word is part of the name and says nothing about stability. Within
one id, the conventions set a receipt names says which shape its fields have,
and a record's fields change only with a new conventions set; a chart may
gain a field in a minor release without any record changing
(`createNatalEnvelope` keeps the fields its set names). An id is never reused
for a different shape.

The other ids name values the engine makes and does not read back:
`./calc`'s `CALC_RECEIPT_SCHEMA` (a receipt's `request` can be passed back to
repeat a calculation, but no codec parses a calc receipt; 0.1.1-rc.16 and
0.1.1-rc.17 wrote `zodiacs.calc-receipt.draft-v1`, with requests in their own
vocabulary, and from 1.0.0-rc.1 the entry writes `zodiacs.calc-receipt.v1`),
`ASPECT_POLICY_SCHEMA` and `CONFIGURED_ASPECTS_SCHEMA` (a policy is accepted
only as `createAspectPolicy` made it) and `./window`'s `BIRTH_WINDOW_SCHEMA`.
Their shapes are their declarations', under the rules above, and their ids
are permanent like the rest.

## Deprecation

When something public is to go, it is deprecated first:

1. Its declaration is marked `@deprecated`, naming what replaces it, and the
   CHANGELOG lists it under *Deprecated* for the release that deprecates it.
2. It keeps working as documented for at least twelve months after that
   release.
3. It is removed only in a major release, and only after those twelve months.

Two exceptions. A result that is wrong is fixed, not deprecated: a fix is a
patch. And a security fix may change behaviour in a patch release when
nothing less would close the hole; the CHANGELOG says so.

## Runtimes

The package supports the Node.js release lines that its `engines` field
names, while Node.js maintains them, and runs in browsers through a bundler.
Dropping a line after Node.js ends its maintenance is a minor release,
announced in the CHANGELOG; dropping one that Node.js still maintains waits
for a major release. Node.js 20, which the `engines` field names, reached
its end of life on 2026-04-30, so this promise does not cover it: the package
runs and is tested on 20.19.0, and a 1.x minor release may drop the line. The
one dependency, astronomy-engine, is pinned to an exact version, and a
release that moves it says what moved with it.
