# Source inventory and review boundary

Read through the authenticated GitHub connector on 2026-09-27. Short commit `f5f33892` was the explicitly assigned frozen target; the root toolkit records its full SHA and source acquisition evidence.

| Source | Observation used here |
|---|---|
| `zodiacs-org/engine/src/index.ts` at `f5f33892` | Public exports include `natalChart`, `houseOf`, `signForLongitude`, `separation`, `ENGINE_VERSION`, `EPHEMERIS`. |
| `src/types.ts` at `f5f33892`, blob `287027d48be5fc09ed95e72641712fd539bc7947` | `BirthInput` takes a resolved UTC instant; optional coordinates and `deltaT`; tropical body longitudes; ΔT receipt; 13 house-system names; `timeKnown:false` suppresses houses/angles. |
| `src/api.ts` at `f5f33892`, blob `6cef2895da1d12b064a1d95ead5123260b2edf02` | `natalChart` handles pinned ΔT. `positions(date)` has no ΔT argument, so the preview uses `natalChart` consistently. |
| `src/signs.ts` at `f5f33892`, blob `b0c503894b97fea073955ec1d8f4453ad0651b02` | `signForLongitude` returns a `SignDefinition`; the comparable zodiac string is `.slug`. The real-engine smoke run caught and corrected an initial adapter mismatch here. |
| `src/geo/timezone.ts` at `f5f33892`, blob `b7dc84c1a4001ac4270151467dbc802d1e2d18c7` | Local resolver takes HH:MM only, uses host Intl timezone data, chooses earlier folds and shifts gaps forward; no enumeration API or pinned tzdb. Longitude is not used for local-to-UTC conversion in this file. |
| `src/houses.ts` at `f5f33892`, blob `47d3bc17a0307e9b3ffa2a954ca535e281a71e91` | Placidus/Koch can return whole-sign fallback; `houseOf` convention is lower-inclusive/upper-exclusive cusp intervals, with special behavior for zero-span cusps. A preview must expose actual system and may not call fallback a requested-system result. |
| `zodiacs-org/site/docs/platform/ENGINE-AND-PLATFORM-BRIEF.md`, blob `9cd3a915fcf79cf89680dc1e55dc966c192c80fd` | B2 requests birth-window partitions, initial finite sampling and later proof. This specification refines the meaning of finite sampling, DST disjoint domains, and unsupported/unresolved cells. The brief's claim that a research interval runtime exists was not independently verified in this track. |

Canonical source links:

- https://github.com/zodiacs-org/engine/blob/f5f33892/src/index.ts
- https://github.com/zodiacs-org/engine/blob/f5f33892/src/types.ts
- https://github.com/zodiacs-org/engine/blob/f5f33892/src/api.ts
- https://github.com/zodiacs-org/engine/blob/f5f33892/src/geo/timezone.ts
- https://github.com/zodiacs-org/engine/blob/f5f33892/src/houses.ts
- https://github.com/zodiacs-org/site/blob/main/docs/platform/ENGINE-AND-PLATFORM-BRIEF.md

Local-wall examples use **synthetic, explicit clock rules** for their expected UTC domains unless individually marked as a real-zone structural case. They are not a historical atlas or a claim about historical local clocks. The historical-time companion track supplies that research separately.
