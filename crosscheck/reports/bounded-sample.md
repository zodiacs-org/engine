# Bounded synthetic TT chart comparison against DE440s

Status: complete. Completed synthetic charts: 64; requested: 64.

Exact command argument vector: `["node","crosscheck/tools/sample.mjs"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `b6b227643b5e7ff609086040891c71adbe7570e30b394589ef5fc5493a92e8af`.
Engine build SHA-256: `7bb3015f58201140e8c3cbc7cbc588da2b75d2b7b2a0805e7c53e9ab9132c09d`.
Executable tooling SHA-256: `353b3be612597ae3a827bdefd63f1a0ecb48086f5a26980cbcd6751e7829d40f`.

Sampling interval in epoch milliseconds: [-631152000000, 2524608000000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.Mercury.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.1185097759701693 | 1.2358511454828442 | 1.497529783339358 | 1.492833173863685 | 3.4505201013877773 |
| JPL.Mercury.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.5259355862259341 | 2.0721749266803258 | 2.6651533421985834 | 2.6127445524913955 | 7.934126491829829 |
| JPL.Moon.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.0018000852806437234 | 0.2592366549404642 | 0.3273649896231609 | 0.32736004051190276 | 0.8647867337622017 |
| JPL.Moon.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.6976297480498772 | 0.9746944748272313 | 1.1968706910995768 | 0.9725287583660667 | 2.6913360786693374 |
| JPL.Sun.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.059556098859704046 | 0.40212909786083145 | 0.46951306985015934 | 0.4657205104445517 | 1.0134098444863304 |
| JPL.Sun.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.17153591233682874 | 0.4863938747240226 | 0.6114423188008897 | 0.5868876723866167 | 1.8303541600516837 |
| JPL.Venus.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.22642305828367337 | 1.423843209832703 | 2.034851178495979 | 2.0222146071334626 | 5.919833074204028 |
| JPL.Venus.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.6586779863905434 | 1.607858757063596 | 2.506094261580032 | 2.4179850616099476 | 11.577683830830665 |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.otherBodies | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Exclusions:

- Swiss unavailable: no user-provided external binding or ephemerides; unsupported counts are not measurements.
- DE440s is the compact DE440 kernel; no DE441 comparison was run in this campaign.
- Only Sun, Moon, Mercury and Venus exact centers compared. Other planets omitted; system barycenters never substitute for planet centers.
- Houses, nodes, angles, speeds and topocentric positions are not compared. Synthetic coordinates and house systems only exercise natalChart.
- TT inputs bypass UTC/UT1 conversion comparison. Sampling interval is interpreted as TT despite ISO Z labels.
- CN+S uses converged light-time and SPICE Newtonian stellar aberration; engine light-time/aberration algorithms differ. Residuals include these model differences and frame differences.
- Moon is geometric without aberration or light-time. No solar deflection. Truncated TT/TDB model and IAU2000B frame limitations apply.
- Screening threshold is not a certified accuracy bound. No million-chart throughput or unsampled error bound is established.

Reference identities: `{"ERFA":{"nutationSha256":"a5246d525e987eb587bbe786b2846160e01be85b5d12af573870b89235695f49","tag":"v2.0.1"},"EngineBuild":{"dependency":{"name":"astronomy-engine","sha256":"2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c","version":"2.1.19"},"nodeExecutableSha256":"fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48","outputSha256":"5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2","sourceCommit":"6de8d0f855edac05a0d298abbe1d923db03ad5dd","sourceSha256":"749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635"},"JPL":{"name":"de440s.bsp","sha256":"c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2","source":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp"},"Swiss":{"reason":"No user-provided external installation or ephemeris directory","status":"unavailable"}}`.
Conventions: `{"center":"Earth center 399","correction":"Moon NONE; Sun Mercury Venus CN+S; no deflection","frame":"IAU2006-bias-precession/IAU2000B-unadjusted true ecliptic/equinox of date","input":"synthetic ISO interpreted as TT; coordinates uniform sphere; houses sampled uniformly","residual":"engine minus JPL; signed shortest longitude and latitude differences in arcseconds","time":"NAIF-DELTET-periodic/naif0012 TT-to-TDB","tolerance":"60 arcseconds screening threshold fixed before sample; not an accuracy guarantee"}`.
