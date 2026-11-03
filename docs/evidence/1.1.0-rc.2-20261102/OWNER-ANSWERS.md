# 1.1.0-rc.2: the answers to the cut's owner questions

On 2026-11-03 the owner delegated the answers to the cut's owner questions,
OQ1 to OQ14 in the five preregistrations beside this file, to the
programme's coding agent. They are recorded here, after commit P and before
any formal run, as each preregistration's amendments section requires.

One kind of question is not answered under that delegation: one that would
count the programme's own work as accepted on a reading the programme
proposed after seeing results. zodiacs.org's `DECISIONS-2026-10-05.md` §4
already ruled that a general delegation does not change who decides those,
"so that the party whose work is measured does not make it". OQ5 and OQ10's
Q5 are of that kind and stay with the owner.

| OQ | Answer |
| --- | --- |
| OQ1 | The cut's scope as listed: the four P2.E units through `./lite`, F-53 through `./time` with the frame of date, the nine F-89 fixes, P1.M3c and P2.B.vargas. P2.B.kp waits for Krishnamurti's own text with pages. |
| OQ2 | Yes: `./lite` and `./time` join as public entries, fifteen in all, and the frame functions are public, not `@experimental`. |
| OQ3 | The ceilings: the package cap 1,100,000 bytes; `./calc` 156,000; `./vedic` 143,000; `./lite` 29,000; `./time` 42,400. The CHANGELOG stays whole. (a) `./lite`'s declarations by re-export. (b) The pure-table exemption stays, its reason rewritten. (c) Each budget written is its ceiling; its comment gives the measured graph and the headroom. |
| OQ4 | Yes to each convention: the sect by the Sun's altitude as the named option `sectReading`, with no default convention and `sectOf` unchanged; declinations with the site's mean obliquity of date passed in; the package's Sun exemption; the dignities as R6 reads them. |
| OQ5 | **Not answered: with the owner.** The readings chosen after the scoping runs are not ratified. The formal runs go ahead; the units they decide can be `validated`, not `accepted`, and F-53 is recorded "fixed and deployed; readings awaiting ratification", until the owner ratifies. |
| OQ6 | Yes: pyerfa 2.0.1.5 with numpy 2.4.6, and pyswisseph 2.10.3.2, from PyPI with recorded hashes, in a scratch environment outside every repository; a standalone Python 3.11 there if the system Python cannot run them. Only aggregates are committed, never Swiss output. |
| OQ7 | Yes: P1.M3c and P2.B.vargas count once production serves the vendored rc.2, with no site code, as P2.D.frames did with rc.16; P1.M3c adds the registry entry. |
| OQ8 | The site's rc.2 adoption branch is pushed without a pull request until zodiacs-org/site#862 is merged or closed. |
| OQ9 | (c): the Vertex and East Point figures of the engine's own conformance suite, whose arbiter is ERFA, regenerated for rc.2 and checked by E10, as commit 48e4e76 applied them. The claim on a Swiss figure retires. |
| OQ10 | Q2: the F-89 fixes close F-89 only; P1.14 stays partial. Q3: F-90's corpus values are replaced by an independent ΔT in a later conformance change; nothing in rc.2. Q4: a one-time allowance to relabel the rc.1 footer sentence under the site's `public/sdk/engine/`, site work after rc.2. **Q5: not answered, with the owner.** |
| OQ11 | Check 16 of the People pilot's validator is retargeted to the package. The freeze covers the pilot's released copy and its table, which the check still reads; the validator itself is not frozen. |
| OQ12 | The site's CLAUDE.md line naming the generated time-basis module is removed in the site's adoption pull request, which names the change. |
| OQ13 | No IERS or ΔT table refresh in rc.2. |
| OQ14 | The private search for engine pushes leaves out the whole `docs/evidence/calc-sidereal-2026-10-05/` folder, neither listing nor reading its members. Before each push the folder's tree id at the pushed head must equal its id at a253973, so the folder holds nothing new. Each search report states this limitation. |
