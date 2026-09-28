# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue: by email
to admin@zodiacs.org, or through the **Report a vulnerability** button on
this repository's Security tab where GitHub shows it.

Include:

- the version: the release candidate, with its archive's SHA-256 if you
  installed a packed archive, or the commit you built;
- where the problem is: the entry point and function, or the file and line;
- how to reproduce it: the smallest input or script that shows it, and what
  happens when you run it;
- what someone could do with it, as far as you can tell.

If the problem involves birth details, use invented ones in the report.

Please do not publish the details until a fixed release candidate is
available or we have agreed a date with you.

## Scope

- **The package**, `@zodiacs/engine`: its source in `src/` and every entry
  point it ships, the internal ones included.
- **Its build and release scripts**: the npm scripts in `package.json`, the
  scripts in `scripts/`, the workflows in `.github/workflows/`, and the
  packed archives in `artifacts/` with their SHA-256 receipts.
- **The conformance harness**: `conformance/harness/`, the adapters in
  `conformance/adapters/` and the generators in `conformance/arbiters/`.

Examples of what to report: data from outside the program (a receipt passed
to `parseNatalEnvelope`, a GeoNames index or shard, a date string) that makes
a call hang, exhaust memory, get past the receipt parser's documented size and
depth limits, or change objects outside the call; an archive whose bytes do
not match its receipt; a workflow that exposes a token or runs code from a
pull request it should not trust.

These are not vulnerabilities in themselves:

- the behaviour of code the caller supplies, such as getters, proxies or a
  custom `fetch`, which the documentation treats as trusted;
- a receipt that parses but whose positions or provenance are false: a valid
  envelope is a structurally checked claim, not an attestation;
- a computed value that is wrong. Report it with the "Wrong result" issue
  form.

The zodiacs.org website is covered by the security policy of
[zodiacs-org/site](https://github.com/zodiacs-org/site); the same email
address applies. Problems in astronomy-engine itself belong to
[its repository](https://github.com/cosinekitty/astronomy); tell us as well
if this package is affected.

## Supported versions

Only the latest release candidate is supported, and fixes ship in a new
candidate. Earlier candidates are not patched: their archives in
`artifacts/` are immutable.
