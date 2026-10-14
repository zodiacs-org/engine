# Primary directions workbench

This private source project is being built alongside `@zodiacs/engine`.
It is not part of the engine's npm package. Code and authored documentation
here follow the repository's [MIT license](../LICENSE); using the engine
retains the engine's own [data and attribution terms](../LICENSING.md).

The current implementation validates explicit convention choices. Directional
arcs, timing conversions, chart adaptation and the `directions hit` and
`directions scan` commands are still planned in [PLAN.md](PLAN.md). An accepted
convention is not a computed hit or a claim that a particular contact exists.

```ts
import { createDirectionConvention } from "./src/index.js";

const convention = createDirectionConvention({
  system: "placidus-semiarc",
  mode: "zodiacal",
  motion: "direct",
  latitude: "zero-both",
  key: "ptolemy"
});
```

`parseDirectionConvention(unknown)` applies the same validation to decoded
JSON. Every base field is required. Unknown fields, unsupported strings and
incompatible mode/latitude pairs throw `RangeError`. The result is a new,
frozen object; the caller's object is unchanged. These functions are pure
and import no ephemeris or engine module.

| Field | Accepted choices | Meaning |
| --- | --- | --- |
| `system` | `placidus-semiarc` | Planned temporal-hour geometry; no house-system substitution. |
| `mode` | `zodiacal`, `mundane` | Ecliptic contact points or proportional semi-arc placement, respectively. |
| `motion` | `direct`, `converse` | Ordinary diurnal construction, or the role exchange described in the source register. |
| `converseConstruction` | `placidus-role-swap` | Required for converse, forbidden for direct; exchanges the moving and fixed roles. |
| `latitude` | `zero-both`, `retain-both` | Ecliptic latitude treatment for both significator and promissor. |
| `key` | `ptolemy`, `naibod`, `solar-equatorial-birth-day` | Separate planned mappings from an equatorial arc to age. |

The initial contract admits `zodiacal` only with `zero-both` and `mundane`
only with `retain-both`. These are explicit project subsets, not claims that
all authors use those pairings. Additional latitude and converse constructions
need named options and independent evidence before they can be admitted.
`converse` does not silently negate a direct arc. Historical restrictions on
the available contacts still need validation in the future hit API.

[SOURCES.md](SOURCES.md) states what each traditional source supports and
where it differs. [evidence/README.md](evidence/README.md) sets the numerical
evidence requirements. No solver may infer a house system, latitude policy,
motion, key, aspect branch or polar fallback from missing input.

Use a Node 22 runtime. From the repository root, install and run only the
project's tools:

```sh
npm ci --prefix directions --cache directions/.cache/npm --ignore-scripts
npm --prefix directions run typecheck
npm --prefix directions test
npm --prefix directions run check:isolation
```

The local dependency lock pins the tools. Tests have the suffix `.check.ts`
and an explicit Vitest config, so root Vitest's default discovery does not
collect them. Typechecking emits nothing. Caches, generated reports and any
future local build output stay in ignored directories inside this project.

The isolation check uses npm's dry-run file list with lifecycle scripts
disabled. It also checks project file sizes and documentation punctuation.
It does not replace the engine's full package gate, which needs an existing
engine build. Do not build or modify root `dist/` during this work.

The later engine adapter will import public exports by relative source path.
It will preserve engine positions, houses, angles, time basis and obliquity.
The sphere solver will consume snapshots separately from the adapter, because
engine ephemeris calls manage a shared delta-T provider. Solar arc and secondary
progressions are separate comparisons, never substitutes for primary rotation.
