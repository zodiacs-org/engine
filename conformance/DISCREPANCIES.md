# Discrepancies

How to report a vector you believe is wrong, what happens to the report, and
every decision made so far.

## Reporting

Open an issue in [zodiacs-org/engine](https://github.com/zodiacs-org/engine/issues/new?template=conformance-discrepancy.yml)
with the **Conformance discrepancy** form. It asks for:

- the vector id (for example `L2-CSP-0012`) and the suite version;
- what you believe the expected value, tolerance or arbiter should be;
- your evidence: an independent computation (with the software and version
  you ran), a primary source, or an error in a generator script;
- if an engine's output is involved, that engine, its version and its flags.

Reports about an engine's result, rather than about a vector, go to that
engine's own tracker. For this repository's engine, use the ordinary issue
form.

## What happens

Every report gets one of these dispositions, recorded in the log below with
the date, the reasoning and the suite version it takes effect in:

- **confirmed**: the vector is wrong. It is withdrawn, and a corrected vector
  with a new id is released in the next suite version. A vector is never
  edited in place.
- **clarified**: the vector stands, and the wording of `SPEC.md`, an
  arbiter's description or a generator is corrected.
- **rejected**: the vector stands, with the reason.

A confirmed error in an arbiter's method is checked against every vector
that arbiter decided, not only the one reported.

## Log

| date | report | vectors | disposition | suite version | reasoning |
| --- | --- | --- | --- | --- | --- |
| 2026-09-28 | pre-release independent review | L2-POL-0004 | confirmed | 0.1.0, before release | Placidus at −72° has one ordered solution for every cusp, so its cusps exist. Withdrawn before release and replaced by L2-POL-0011, a case where the construction fails. |
| 2026-09-28 | pre-release independent review | L2-POL-0001–0003, 0005–0011 | clarified | 0.1.0, before release | The status was set by a latitude rule that was this engine's own policy and had been matched to Swiss Ephemeris. It is now set by each system's construction: no solution for some cusp, or cusps out of order. The arbiter text gives each vector's failure. |
| 2026-09-28 | pre-release independent review | L1-POS-0001–0240 | clarified | 0.1.0, before release | The arbiter text now says the instants were first chosen as UT plus Swiss's ΔT (the input is the TT itself) and that the frame model was first identified by comparison with Swiss. Its acceptance rests on an independent DE440s reduction; no value changed. |
| 2026-09-28 | pre-release independent review | L3-TZ-0001–0020 | clarified | 0.1.0, before release | These test tzdb's `backzone` history, which its maintainers call less reliable. They are tagged `backzone-history`, counted separately, and the arbiter quotes the caveat; no value changed. |
| 2026-09-28 | pre-release independent review | L3-TZ-0045 | clarified | 0.1.0, before release | The value is tzdb 2025c's. The note now says later releases (2026d) changed Morocco's rules. |
| 2026-09-28 | pre-release independent review | SPEC.md, README.md, results notes | clarified | 0.1.0, before release | Several changes: definitions added (UTC offsets, barycentres, vertex and east point, JDN, ΔT); a contradiction about missing tolerances removed; the median computed as the middle value; misstatements in the notes corrected (Swiss's sidereal time, the sign of the engine's TT − UTC residual, the Sun's largest residual); the licence line fixed. |
| 2026-09-28 | pre-release independent review | adapters/zodiacs-engine.mjs | clarified | 0.1.0, before release | The adapter had computed the later offset of a repeated local time itself. The engine gives only the earlier one, so those five vectors are now reported unsupported. |
