# Conventions, sources, and remaining limitations

This workbench calculates astronomical event charts and describes selected
traditional factors. Its factor lists are labelled
`traditional conventions, not predictions`. It adds no ranking, strength
score, judgment about future events, or evidence of predictive validity.
All example places and test geometry are invented. Published astronomical
event tables are independent timing references, never birth records.

## Calculation choices and their sources

| Area | Implemented choice | Source and committed checks |
| --- | --- | --- |
| Chart casting | Engine tropical geocentric positions, angles, houses, default aspects, and receipt metadata | [chart.ts](../src/chart.ts), [chart.test.ts](../test/chart.test.ts), engine [README](../../README.md) and [LICENSING](../../LICENSING.md) |
| Cardinal ingresses | Sun longitude crossings at Aries, Cancer, Libra, and Capricorn boundaries | [ingresses.md](ingresses.md), [ingresses.test.ts](../test/ingresses.test.ts), [independent season references](ingress-references.md) |
| Lunations | Directed Moon-minus-Sun longitude conjunctions and oppositions | [lunations.md](lunations.md), [lunations.test.ts](../test/lunations.test.ts), [independent phase references](lunation-references.md) |
| Angularity | Classical planets in angular houses or within an explicit ecliptic longitude orb of an angle | [angularity.md](angularity.md), [angularity.test.ts](../test/angularity.test.ts) |
| Rulers and dignities | Traditional domicile rulers, engine sect convention, Dorothean triplicity, Egyptian terms, and Chaldean faces | [angle-rulers.md](angle-rulers.md), [angle-rulers.test.ts](../test/angle-rulers.test.ts), engine [dignity tables](../../src/techniques/dignities.ts) |
| Factor prose | Stable descriptions with pointers to supporting geometry and conditions | [factors.md](factors.md), [factors.test.ts](../test/factors.test.ts) |
| Optional eclipses | Supplied UTC instants, source labels and metadata; delegated events minima when available | [eclipses.md](eclipses.md), [adapter tests](../test/eclipses.test.ts), [bridge tests](../test/events-bridge.test.ts) |

The dignity references are the works of Ptolemy, Dorotheus, al-Biruni, and
William Lilly identified with editions and locators in
[angle-rulers.md](angle-rulers.md) and the engine's
[techniques source audit](../../docs/techniques.md#essential-dignities).
This project imports those tables rather than copying them or adding a
new transcription. Angular-house selection and the configurable longitude
orb are explicit project conventions. They do not measure a body's
topocentric altitude or distance from the physical horizon.

Code and documentation follow the repository's MIT licence. Engine data
retains the source terms and attribution in [LICENSING.md](../../LICENSING.md)
and [NOTICE](../../NOTICE). The USNO fixture manifests and reference guides
record the official source URLs, retrieval records, response digests,
redistribution terms, definitions, and clock qualifications. No Swiss
Ephemeris code, data, or per-case result supplies a fixture or expectation.

## What validation establishes

Independent timing comparisons use the committed USNO seasons and primary
Moon-phase responses for the selected years 1950, 2000, and 2024, through
[ingress-references.test.ts](../test/ingress-references.test.ts) and
[lunation-references.test.ts](../test/lunation-references.test.ts).
Their comparison gates, derivations, and exact selection are documented in
the linked reference guides. They are coarse published-time comparisons,
with minute labels and unconverted source-clock qualifications, rather than
subminute error bounds. These selected years do not establish agreement
throughout the intervening years or independently validate chart factors.
Final-session observations are retained in
[evidence/m13/checks.txt](evidence/m13/checks.txt).

Hand-derived synthetic functions test search boundaries, ties, and budgets.
Hand-looked-up synthetic longitudes test the conventional dignity assignments.
Tests comparing charts or reports to the same engine establish integration
and metadata preservation. CLI comparisons to library results establish the
command boundary. None of these comparisons becomes an independent
astronomical reference. Prior engine outputs are never reused as timing
expectations. Routine tests read local fixtures and require no paid API.

## Remaining limitations

- Search completion means the sampled engine searches finished within
  budget. It is not an exhaustive physical event proof. Finite root
  refinement and integer-Date resolution can change the last digits and
  near-edge membership when a window changes. Adjacent astronomical windows
  need not partition like the exact synthetic cases.
- Search instants and charts inherit the engine's frame, ephemeris, time
  basis, coverage limits, and discontinuities. Accepted calendar input is
  broader than independently checked astronomical coverage. Inspect each
  chart's time basis and flags; outside the observed time tables, input
  labels may be read on a modeled basis. Time-scale overrides and pinned
  delta T are not workbench search options.
- Exact geographic poles are refused. Other degenerate or near-tangent
  angle configurations retain the engine's exclusions and limitations.
  Placidus or Koch fallback preserves requested and actual houses;
  angular-house descriptions always use the actual cusps.
- Sect is the engine's longitude-based convention, without an altitude,
  twilight, refraction, or visibility calculation. Essential dignity is a
  table assignment at the ruler's own longitude. It is not a combined
  accidental-strength assessment or a traditional judgment procedure.
- The events bridge delegates numerical minima of its supplied spherical
  shadow model. Those are not limb contacts, greatest eclipse, or local
  circumstances. There is no independent eclipse timing fixture here.
  Sampling and boundary limitations remain those of the events source;
  source completeness is carried separately from chart provenance.
- Optional adapters and engine identity fields are structurally checked
  claims. They do not authenticate an astronomical source or release
  artifact. Adapter code is supplied and trusted by the embedding program.
- Budgets count search evaluations and exclude chart casting and factor
  analysis. A report may calculate a successful component before another
  component refuses, then discard its events. Budgets are not wall-clock
  time limits. Large completed outputs remain the caller's responsibility.
- The library API is pure with respect to application IO and caller-owned
  data. Engine calculations still install their delta T function in the
  ephemeris dependency as described in the engine README. Frozen result
  snapshots do not remove that inherited runtime state.

The scope excludes electional and birth-window search or scoring, calendar
and ICS export, relocation grids, horary, and an HTTP chart API. This is a
private checkout workbench, without standalone npm distribution or a new
public engine entry point.

## Repeatable verification and package isolation

Run the commands in [usage.md](usage.md) for typechecking, the full mundane
Vitest suite, executable examples, the local CLI build, and scope audits.
The optional [events integration checker](../scripts/check-events-integration.mjs)
additionally requires the local `origin/infra/events` ref. It reads git
objects and materializes source only under ignored `mundane/generated/`.
It compares delegated source output for integration, with no eclipse
accuracy claim and no edits to another worktree.

[check-scope.mjs](../scripts/check-scope.mjs) enforces session changes inside
`mundane/`, the file-size requirement, no em dash in documentation, ignored output
and dependency directories, and whitespace cleanliness. It also bundles the
library in memory for a browser target, rejecting Node builtins and imports
of the CLI or events loader. This is an import-isolation check, not a full
browser compatibility suite. The file audit covers nonignored workbench
files and generated regular files, excluding installed third-party packages
and without following generated links into engine source.

[check-package-isolation.mjs](../scripts/check-package-isolation.mjs) inspects
npm's dry-run manifest with scripts disabled and requires mundane files to
be absent. It writes no archive and does not build the engine. The full
root `package:contents` gate also requires an engine `dist/` tree. This task
forbids writing that tree; its missing-build outcome is recorded separately
in the final evidence rather than described as a passing full package gate.
Engine release archives, published files, root build inputs, and git metadata
remain unchanged by this workbench session.
