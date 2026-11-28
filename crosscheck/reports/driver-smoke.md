# Synthetic TT chart campaign

Status: complete. Completed synthetic charts: 8; requested: 8.

Exact command argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/m10-driver-smoke.json","report"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `05cb78449c6481574b42406e8b027bb3e97e23ffe3426360f71d433a4828c550`.
Engine build SHA-256: `5dfa45c707d282732253f73b2064c773f419c6548b8eefec48a86b70fa6239f8`.
Executable tooling SHA-256: `d3218e69e85140c81479301b81a3ff8c4fd6ab0944d7aac6ebc65ebc33ec469e`.

Sampling interval in epoch milliseconds: [-631152000000, 2524608000000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.Mercury.lat | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | 0.45773350337343643 | 0.9476933978913138 | 1.1720385618774007 | 1.0789598835995369 | 2.3067150531094427 |
| JPL.Mercury.lon | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | -2.0595344050605036 | 2.3526012812737918 | 2.68736886051288 | 1.7263456857843889 | 4.479339221461487 |
| JPL.Moon.lat | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | -0.06559845031615386 | 0.2702099006211295 | 0.3347231464439046 | 0.32823227763494967 | 0.5859553849653754 |
| JPL.Moon.lon | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | -1.0072029108087577 | 1.2945953957867573 | 1.5430469595652918 | 1.1689893993882312 | 2.490721894332637 |
| JPL.Sun.lat | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | 0.08617446270269487 | 0.3285109876811959 | 0.410901623279498 | 0.4017637439984205 | 0.7676641880050885 |
| JPL.Sun.lon | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | 0.029663683656622197 | 0.49193806606524504 | 0.5186374117323933 | 0.5177884034240203 | 0.8297287478399085 |
| JPL.Venus.lat | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | 0.6282079116512036 | 1.5860954199763095 | 1.9452547817617756 | 1.8410244391929964 | 3.8029250281294225 |
| JPL.Venus.lon | arcseconds | 8 | 8 | 0 | 0 | 0 | 0 | 60 | 0.3877568605659576 | 1.460684580176519 | 1.7907980970269777 | 1.748314171251688 | 3.7059549205537223 |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 8 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.otherBodies | arcseconds | 0 | 0 | 0 | 0 | 8 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 8 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Exclusions:

- Reproduction: node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json all, then report. Specification: {"name":"driver-smoke","kernel":"de440s","seed":"crosscheck-m10-driver-v1","total":8,"shards":3}. Preserve external Swiss environment selectors if enabled.
- Only exact Sun/Moon/Mercury/Venus centers compared; no other planets, houses, nodes, angles, speeds or topocentric checks. No UTC/UT1 validation.
- JPL residuals include model differences: CN+S Newtonian aberration, no deflection, periodic TT/TDB and unadjusted IAU2000B frames. Sampling interval is TT despite ISO Z labels.
- Swiss.positions is the legacy unavailable channel; optional per-body Swiss channels carry actual measurements. Fallback/error/unsupported verdicts contain no residuals.
- Sample maxima are not unsampled bounds; no throughput guarantee. Command records report invocation; reproduction command above runs all shards from scratch with identical inputs.

Reference identities: `{"ERFA":{"nutationSha256":"a5246d525e987eb587bbe786b2846160e01be85b5d12af573870b89235695f49"},"EngineBuild":{"dependencySha256":"2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c","nodeExecutableSha256":"fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48","outputSha256":"5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2","sourceSha256":"749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635"},"JPL":{"name":"de440s.bsp","sha256":"c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2","source":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp"},"Swiss":{"status":"unavailable"}}`.
Conventions: `{"Swiss":"unavailable","correction":"JPL Moon NONE; other exact centers CN+S; no deflection; NAIF periodic TT/TDB","frame":"IAU2006 precession/unadjusted IAU2000B true ecliptic/equinox of date","input":"synthetic TT; uniform sphere; random house systems","tolerance":"60 arcseconds screening only; engine minus reference; no accuracy bound"}`.
