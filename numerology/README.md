# Numerology development project

A private TypeScript library and planned JSON CLI, adjacent to
`@zodiacs/engine` and isolated from its npm package. Code and documentation
here use the repository's [MIT license](../LICENSE). This project currently
implements integer reduction only. [PLAN.md](PLAN.md) tracks the remaining
name systems, civil-date calculations, transliteration, profiles, and CLI.

Numerology results describe symbolic conventions and provide reflection
prompts. The tests check arithmetic and declared behavior. They do not test
whether numerology predicts personality or events. The meanings in
`src/meanings.ts` are original text authored for this project.

From this directory, with Node matching `package.json`:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

The TypeScript compiler is pinned in the local lockfile. Build output goes
to `.build/`, which is ignored; generated data should go to `.generated/`.
No root build or root dependency installation is needed. No engine module
is imported to perform digit arithmetic.

After `npm run build`, a source-checkout consumer can use:

```js
import { reduceInteger } from "./.build/index.js";

const result = reduceInteger("49");
console.log(JSON.stringify(result));
```

## Integer reduction

`reduceInteger(input, { masterNumbers })` accepts a nonnegative safe integer
number, a nonnegative bigint, or a nonempty ASCII decimal digit string.
Use strings or bigint for integers beyond the safe-number range. Fractions,
signs, whitespace, exponent notation, non-ASCII digits, and implicit object
coercion are rejected. Leading zeroes are removed in the receipt, and numeric
negative zero becomes zero. The receipt records the canonical integer rather
than the caller's original spelling or input type.

`masterNumbers` defaults to `"preserve"`: stop at a single digit or at a
master number, including one reached after an intermediate sum. `"reduce"`
continues to a single digit. The master values are 11, 22, and 33; debt
values are 13, 14, 16, and 19. The fixture cases in
[reductions.json](test/fixtures/reductions.json) enforce these choices in
both policies. Other policy values and unknown option keys are rejected.

Each result contains `value`, `meaning`, `karmicDebts`, and `receipt`. The
receipt has a schema identifier, canonical input, selected policy, each
step's input/digits/output, and its stop reason. Decimal integers are strings
in receipts, so JSON serialization preserves their exact value. Every result
layer is frozen and each call allocates a fresh result.

The synthetic integer example above visits 49, then 13, then 4. Its
karmic-debt annotation points to stage 1: the output of the first sum.
Stage 0 means the initial compound. Debt annotations apply only to visited
values; the digits `13` inside `130` do not qualify. The full receipt and
these examples are enforced in [reduction.test.mjs](test/reduction.test.mjs)
and the handwritten fixtures. An annotation is a symbolic label and does
not assert that someone owes a debt or has a particular past.

Input is limited to 1024 supplied decimal digits, counting leading zeroes
before normalization, to bound receipt allocation. The allocation-bound
test in `reduction.test.mjs` checks the accepted boundary and rejection
beyond it for strings and bigint. Options are ordinary in-process objects;
the API does not sandbox executable getters or proxies supplied by a caller.

## Arithmetic evidence

The golden fixtures are handwritten arithmetic controls. Tests independently
replay receipts with bigint division and remainder and check reduction with
the digital-root formula. The exhaustive property checks cover all integers
from 0 through 9999 under both policies; the seeded controls cover long decimal
inputs beyond safe-number precision. See the named exhaustive and seeded
tests in `test/reduction.test.mjs` for their exact scope and reproducible
generator. These checks establish implementation behavior, not external
agreement with a numerology author or evidence of predictive accuracy.
