# Synthetic TT chart campaign

Status: complete. Completed synthetic charts: 32; requested: 32.

Exact command argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/s3-pilot.json","report"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `cde8bad8925659ec9bde2c77e531b3ac8eff0e703b6250048a25cb7ca0c34517`.
Engine build SHA-256: `227ac0feb3066f6cbbd6bd0efad7886bf06e463fe419f1162114c02acff0064b`.
Executable tooling SHA-256: `5547af775220fc5ff713aa6d073cb634b61abd26e5d9f862dc1f859b809709f2`.

Sampling interval in epoch milliseconds: [-5364662400000, 7258118400000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

Swiss instrument: available. External optional test instrument; JPL remains the positional accuracy reference.
Swiss returned-flag responses: SWIEPH 128; Moshier fallback 0; other backend fallback 0.
Flag-response counts use engine-minus-Swiss longitude channels only, so latitude channels and Swiss-minus-JPL comparisons do not duplicate them. Longitude verdict totals include inactive-group and unsupported-center outcomes and are not instrument request counts. Per-channel flags and fallback/error/unsupported verdicts remain in the tables and receipt.

Reference groups:

| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Engine/Swiss residuals | Swiss/JPL residuals | Reason |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| DE440 | available | [-5364662400000, 7258118400000) | 384 | 256 | 256 | 256 | Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval. |
| DE441 | empty | none | 0 | 0 | 0 | 0 | The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested. |

Residual counts sum coordinate comparisons, not charts. Empty groups have no requested interval or measured coverage. Unavailable exact centers have no numerical errors or maxima.

Engine minus JPL residuals:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.DE440.Jupiter.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 32 | 32 | 0 | 0 | 0 | 0 | 10000 | -145.68901885813102 | 1408.1061734301038 | 1746.9410889505148 | 1740.8555017714036 | 4304.708474427462 |
| JPL.DE440.Mercury.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.44087172395033414 | 1.5983508174258114 | 2.1112805211726418 | 2.0647366810574375 | 4.838084225235306 |
| JPL.DE440.Mercury.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.3667554813191032 | 1.7908709783100107 | 2.3977114820047714 | 2.3694958889729922 | 6.433374695279781 |
| JPL.DE440.Moon.distance | km | 32 | 32 | 0 | 0 | 0 | 0 | 10000 | -10.199526091726511 | 10.199526091726511 | 10.381124577077113 | 1.9332395063686696 | 13.309240528440569 |
| JPL.DE440.Moon.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.0349240970361403 | 0.4544926399526833 | 0.5959996932563397 | 0.5949755808500559 | 1.5270911910459262 |
| JPL.DE440.Moon.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 1.1582009850258146 | 1.8611379858441524 | 2.5365884288460645 | 2.25673466221463 | 6.089174734279368 |
| JPL.DE440.Neptune.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 32 | 32 | 0 | 0 | 0 | 0 | 10000 | -71.87062602303922 | 537.6502341460437 | 645.8323624989031 | 641.8208890071832 | 1332.0852794647217 |
| JPL.DE440.Sun.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.1997323712586741 | 0.749167188594424 | 0.9861026745179048 | 0.9656632252305936 | 2.3489763841060367 |
| JPL.DE440.Sun.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.11442311097340503 | 0.47078843393961733 | 0.5943296670394861 | 0.58321102938682 | 1.4438470783261437 |
| JPL.DE440.Uranus.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 32 | 32 | 0 | 0 | 0 | 0 | 10000 | 31.980490688001773 | 863.650784824742 | 1235.642766711675 | 1235.228843227941 | 3114.198329091072 |
| JPL.DE440.Venus.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.1452565447658558 | 1.0764186013764205 | 1.4795756302597436 | 1.472428124514471 | 3.1586263191012875 |
| JPL.DE440.Venus.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.40807703449985405 | 2.1701214363943677 | 4.213797311671391 | 4.193991048841526 | 20.168555048257986 |
| JPL.DE441.Jupiter.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | 0 | 0 | 0 | 0 | 32 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Separate JPL convention differences:

These residuals compare the relativistic aberration direction with the Newtonian CN+S direction for the same reference states and frame. They are not engine errors, a complete model correction or an independent truth comparison. They are never subtracted from aggregate engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Convention.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.000001086731187850687 | 0.000003000047580671572 | 0.000004113872209980209 | 0.00000396773989638939 | 0.000009232513953350008 |
| Convention.DE440.Mercury.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.000028039970345616894 | 0.00025447851186299886 | 0.0002789642811578335 | 0.00027755149112358176 | 0.0003955464308091905 |
| Convention.DE440.Moon.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Moon.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 4.470559712293035e-11 | 2.669965449788248e-10 | 3.4493177964086567e-10 | 3.420224293699127e-10 | 7.403138527011487e-10 |
| Convention.DE440.Sun.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.0000020964989744243208 | 0.000011171121627739922 | 0.000012436746998513067 | 0.00001225876698348009 | 0.0000173290118254954 |
| Convention.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.0000039289040677098486 | 0.000009009042758675867 | 0.000015316596769200693 | 0.00001480411596202293 | 0.000041022318342243125 |
| Convention.DE440.Venus.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.000025845309892247308 | 0.00033589502379527403 | 0.0003784271195173931 | 0.00037754351370776463 | 0.000525224459124729 |
| Convention.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus Swiss instrument residuals:

These are comparisons with a second instrument, separate from engine accuracy versus JPL. Only SWIEPH returned flags contribute numerical residuals.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Swiss.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mercury.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.4441487343487701 | 1.595336454490298 | 2.1104001074486463 | 2.0631336639431876 | 4.839214561645377 |
| Swiss.DE440.Mercury.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.3676326246406292 | 1.7891966163815554 | 2.3993831706457915 | 2.37105163437621 | 6.434398272457997 |
| Swiss.DE440.Moon.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.03598054650992971 | 0.4863367521397974 | 0.6290783352017622 | 0.6280485268616329 | 1.5789280247897608 |
| Swiss.DE440.Moon.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 1.851121904099351 | 2.0783974725924637 | 2.920857378769962 | 2.2593706033492 | 6.832618223987197 |
| Swiss.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.19970379015824316 | 0.7491951807138353 | 0.9861277725184163 | 0.9656947654039375 | 2.3499051867630087 |
| Swiss.DE440.Sun.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.11391376769901013 | 0.47111784970671894 | 0.5945469137953744 | 0.583532078151853 | 1.4441994268509006 |
| Swiss.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.14492811249579823 | 1.0763085326604436 | 1.4797788494966824 | 1.472664688795834 | 3.160479302045971 |
| Swiss.DE440.Venus.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.40133536686790544 | 2.1768731510311445 | 4.214757281986215 | 4.195605900148014 | 20.168103942967264 |
| Swiss.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Swiss instrument minus JPL residuals:

These compare the same Swiss positions with the selected JPL reference and frame. Model and convention differences can contribute; no Swiss difference is subtracted from engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SwissJPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mercury.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.0032770103984360727 | 0.0034950273867861287 | 0.011142438863157147 | 0.010649654767537611 | 0.04637838546965867 |
| SwissJPL.DE440.Mercury.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.0008771433151311125 | 0.008335101569895143 | 0.015794275095268994 | 0.015769899980334536 | 0.0527160980084318 |
| SwissJPL.DE440.Moon.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.001056449473789411 | 0.03799519525461009 | 0.04312562704576708 | 0.043112685170375635 | 0.06454035762626376 |
| SwissJPL.DE440.Moon.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.6929209191183006 | 0.6929209191183006 | 0.6934124866712539 | 0.026105105245170176 | 0.7451733331890864 |
| SwissJPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.000028581100430849593 | 0.00031308116125760345 | 0.00040134362285308337 | 0.0004003246486328311 | 0.0009288026569720907 |
| SwissJPL.DE440.Sun.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.0005093432520128505 | 0.0008118439764823182 | 0.0012036386489970678 | 0.0010905574028855429 | 0.0033783298590606137 |
| SwissJPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | 0.00032843227005764294 | 0.00141690892421888 | 0.0022302475444362455 | 0.002205932082691733 | 0.0069955646739394695 |
| SwissJPL.DE440.Venus.lon | arcseconds | 32 | 32 | 0 | 0 | 0 | 0 | 60 | -0.006741667619158953 | 0.013230233056504836 | 0.021808656547434954 | 0.020740477769732337 | 0.06817845928139832 |
| SwissJPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Other comparison channels:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 32 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus JPL absolute-error percentiles:

Median, p99 and p99.9 select exact nearest ranks ceil(n*p) among absolute residuals. The histogram locates each rank exactly; only its value is approximated.
Each inclusive [lower, upper] interval encloses that order statistic in the channel unit. No midpoint or interpolated value is claimed. Maximum absolute residuals above are exact sample maxima.
The fixed histogram has an exact zero bucket, an underflow bucket below 2^-40, 16 equal subdivisions per power-of-two interval from 2^-40 to 2^40, and an overflow bucket starting at 2^40.
Regular bucket width is at most lower/16. Underflow and overflow have no relative-width guarantee; overflow is bounded by the exact observed maximum. Histogram storage is bounded independently of chart count.
Channels without a histogram, including historical statistics, have unavailable percentiles. Empty groups have unavailable percentiles and maxima.

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| JPL.DE440.Jupiter.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 4304.708474427462 | [4096, 4304.708474427462] | [4096, 4304.708474427462] | [1216, 1280] |
| JPL.DE440.Mercury.lat | arcseconds | 4.838084225235306 | [4.75, 4.838084225235306] | [4.75, 4.838084225235306] | [1.125, 1.1875] |
| JPL.DE440.Mercury.lon | arcseconds | 6.433374695279781 | [6.25, 6.433374695279781] | [6.25, 6.433374695279781] | [1.5, 1.5625] |
| JPL.DE440.Moon.distance | km | 13.309240528440569 | [13, 13.309240528440569] | [13, 13.309240528440569] | [10, 10.5] |
| JPL.DE440.Moon.lat | arcseconds | 1.5270911910459262 | [1.5, 1.5270911910459262] | [1.5, 1.5270911910459262] | [0.359375, 0.375] |
| JPL.DE440.Moon.lon | arcseconds | 6.089174734279368 | [6, 6.089174734279368] | [6, 6.089174734279368] | [1, 1.0625] |
| JPL.DE440.Neptune.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 1332.0852794647217 | [1280, 1332.0852794647217] | [1280, 1332.0852794647217] | [432, 448] |
| JPL.DE440.Sun.lat | arcseconds | 2.3489763841060367 | [2.25, 2.3489763841060367] | [2.25, 2.3489763841060367] | [0.53125, 0.5625] |
| JPL.DE440.Sun.lon | arcseconds | 1.4438470783261437 | [1.4375, 1.4438470783261437] | [1.4375, 1.4438470783261437] | [0.328125, 0.34375] |
| JPL.DE440.Uranus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 3114.198329091072 | [3072, 3114.198329091072] | [3072, 3114.198329091072] | [416, 432] |
| JPL.DE440.Venus.lat | arcseconds | 3.1586263191012875 | [3.125, 3.1586263191012875] | [3.125, 3.1586263191012875] | [0.71875, 0.75] |
| JPL.DE440.Venus.lon | arcseconds | 20.168555048257986 | [20, 20.168555048257986] | [20, 20.168555048257986] | [1, 1.0625] |
| JPL.DE441.Jupiter.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Separate convention-difference absolute percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| Convention.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 0.000009232513953350008 | [0.000009059906005859375, 0.000009232513953350008] | [0.000009059906005859375, 0.000009232513953350008] | [0.0000017285346984863281, 0.0000017881393432617188] |
| Convention.DE440.Mercury.lon | arcseconds | 0.0003955464308091905 | [0.0003814697265625, 0.0003955464308091905] | [0.0003814697265625, 0.0003955464308091905] | [0.000274658203125, 0.0002899169921875] |
| Convention.DE440.Moon.lat | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Moon.lon | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 7.403138527011487e-10 | [7.275957614183426e-10, 7.403138527011487e-10] | [7.275957614183426e-10, 7.403138527011487e-10] | [1.8917489796876907e-10, 1.964508555829525e-10] |
| Convention.DE440.Sun.lon | arcseconds | 0.0000173290118254954 | [0.0000171661376953125, 0.0000173290118254954] | [0.0000171661376953125, 0.0000173290118254954] | [0.000012874603271484375, 0.0000133514404296875] |
| Convention.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 0.000041022318342243125 | [0.0000400543212890625, 0.000041022318342243125] | [0.0000400543212890625, 0.000041022318342243125] | [0.0000014901161193847656, 0.0000015497207641601562] |
| Convention.DE440.Venus.lon | arcseconds | 0.000525224459124729 | [0.000518798828125, 0.000525224459124729] | [0.000518798828125, 0.000525224459124729] | [0.0004119873046875, 0.00042724609375] |
| Convention.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Engine minus Swiss instrument absolute-error percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| Swiss.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mercury.lat | arcseconds | 4.839214561645377 | [4.75, 4.839214561645377] | [4.75, 4.839214561645377] | [1.0625, 1.125] |
| Swiss.DE440.Mercury.lon | arcseconds | 6.434398272457997 | [6.25, 6.434398272457997] | [6.25, 6.434398272457997] | [1.5, 1.5625] |
| Swiss.DE440.Moon.lat | arcseconds | 1.5789280247897608 | [1.5625, 1.5789280247897608] | [1.5625, 1.5789280247897608] | [0.375, 0.390625] |
| Swiss.DE440.Moon.lon | arcseconds | 6.832618223987197 | [6.75, 6.832618223987197] | [6.75, 6.832618223987197] | [1.3125, 1.375] |
| Swiss.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 2.3499051867630087 | [2.25, 2.3499051867630087] | [2.25, 2.3499051867630087] | [0.53125, 0.5625] |
| Swiss.DE440.Sun.lon | arcseconds | 1.4441994268509006 | [1.4375, 1.4441994268509006] | [1.4375, 1.4441994268509006] | [0.328125, 0.34375] |
| Swiss.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 3.160479302045971 | [3.125, 3.160479302045971] | [3.125, 3.160479302045971] | [0.71875, 0.75] |
| Swiss.DE440.Venus.lon | arcseconds | 20.168103942967264 | [20, 20.168103942967264] | [20, 20.168103942967264] | [1, 1.0625] |
| Swiss.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Swiss instrument minus JPL absolute-error percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| SwissJPL.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mercury.lat | arcseconds | 0.04637838546965867 | [0.044921875, 0.04637838546965867] | [0.044921875, 0.04637838546965867] | [0.0002288818359375, 0.00023651123046875] |
| SwissJPL.DE440.Mercury.lon | arcseconds | 0.0527160980084318 | [0.05078125, 0.0527160980084318] | [0.05078125, 0.0527160980084318] | [0.003662109375, 0.0037841796875] |
| SwissJPL.DE440.Moon.lat | arcseconds | 0.06454035762626376 | [0.0625, 0.06454035762626376] | [0.0625, 0.06454035762626376] | [0.04296875, 0.044921875] |
| SwissJPL.DE440.Moon.lon | arcseconds | 0.7451733331890864 | [0.71875, 0.7451733331890864] | [0.71875, 0.7451733331890864] | [0.6875, 0.71875] |
| SwissJPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 0.0009288026569720907 | [0.00091552734375, 0.0009288026569720907] | [0.00091552734375, 0.0009288026569720907] | [0.0001983642578125, 0.00020599365234375] |
| SwissJPL.DE440.Sun.lon | arcseconds | 0.0033783298590606137 | [0.0032958984375, 0.0033783298590606137] | [0.0032958984375, 0.0033783298590606137] | [0.0003509521484375, 0.0003662109375] |
| SwissJPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 0.0069955646739394695 | [0.0068359375, 0.0069955646739394695] | [0.0068359375, 0.0069955646739394695] | [0.00067138671875, 0.000701904296875] |
| SwissJPL.DE440.Venus.lon | arcseconds | 0.06817845928139832 | [0.06640625, 0.06817845928139832] | [0.06640625, 0.06817845928139832] | [0.004638671875, 0.0048828125] |
| SwissJPL.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Other comparison channel absolute percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| JPL.housesNodesAngles | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | unavailable | unavailable | unavailable | unavailable |

Exclusions:

- Reproduction: node crosscheck/tools/campaign.mjs crosscheck/runtime/s3-pilot.json all, then report. Specification: {"name":"phase2-swiss-pilot","profile":"phase2","kernel":"de440","seed":"synthetic-phase2-swiss-pilot-v1","total":32,"shards":2}. Preserve external Swiss environment selectors if enabled.
- Only exact Sun/Moon/Mercury/Venus centers compared; no other planets, houses, nodes, angles, speeds or topocentric checks. No UTC/UT1 validation.
- Full DE440 covers the entire requested TT span; DE441 has no selected interval or measurements. Inactive group and missing exact-center verdicts are unsupported, never zero-error observations.
- JPL residuals use Moon NONE and other exact centers CN+REL without deflection. They retain backdated-observer aberration, light-time, frame and periodic TT/TDB model differences. Convention channels isolate CN+REL minus CN+S on the same independent states, not total model error.
- Distances use binary64 TT Julian dates in calc, which can round relative to natalChart millisecond inputs; JPL uses TT seconds converted to TDB. Distance maxima are in km and angular maxima in arcseconds.
- Swiss and SwissJPL channels use the same synthetic chart, TT Julian date and one adapter response per compared body. Swiss is a second instrument, not the accuracy arbiter. The receipt records version, adapter/binding hashes, ephemeris SHA-256 identities and returned-flag counts.
- Swiss apparent places include its deflection model and lunar apparent corrections, unlike JPL without deflection and geometric Moon. Frame and TT Julian-date rounding differences also remain in these separate instrument comparisons.
- Swiss.positions is the legacy unavailable channel; per-body Swiss channels carry measurements only when configured. Non-SWIEPH responses, including Moshier fallback, error and unsupported verdicts contain no residuals.
- Sample maxima are not unsampled bounds; no throughput guarantee. Command records report invocation; reproduction command above runs all shards from scratch with identical inputs.

Reference identities: `{"ERFA":{"nutationSha256":"a5246d525e987eb587bbe786b2846160e01be85b5d12af573870b89235695f49"},"EngineBuild":{"dependencySha256":"2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c","nodeExecutableSha256":"fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48","outputSha256":"5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2","sourceSha256":"749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635"},"JPL":{"name":"de440.bsp","sha256":"a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5","source":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp"},"ReferencePlan":{"bodies":{"Jupiter":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","status":"unavailable","target":599},"Mars":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","status":"unavailable","target":499},"Mercury":{"center":399,"status":"available","target":199},"Moon":{"center":399,"status":"available","target":301},"Neptune":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","status":"unavailable","target":899},"Pluto":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","status":"unavailable","target":999},"Saturn":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","status":"unavailable","target":699},"Sun":{"center":399,"status":"available","target":10},"Uranus":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution.","status":"unavailable","target":799},"Venus":{"center":399,"status":"available","target":299}},"groups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"kernel":"de440.bsp","reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"kernelCoverage":{"format":"LTL-IEEE","segments":[{"center":0,"endTdbSeconds":20514081600,"endWord":2217924,"frame":1,"startTdbSeconds":-14200747200,"startWord":8065,"target":1,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":3021512,"frame":1,"startTdbSeconds":-14200747200,"startWord":2217925,"target":2,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4051108,"frame":1,"startTdbSeconds":-14200747200,"startWord":3021513,"target":3,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4490572,"frame":1,"startTdbSeconds":-14200747200,"startWord":4051109,"target":4,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4817032,"frame":1,"startTdbSeconds":-14200747200,"startWord":4490573,"target":5,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5105824,"frame":1,"startTdbSeconds":-14200747200,"startWord":4817033,"target":6,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5356948,"frame":1,"startTdbSeconds":-14200747200,"startWord":5105825,"target":7,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5608072,"frame":1,"startTdbSeconds":-14200747200,"startWord":5356949,"target":8,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5859196,"frame":1,"startTdbSeconds":-14200747200,"startWord":5608073,"target":9,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":6738120,"frame":1,"startTdbSeconds":-14200747200,"startWord":5859197,"target":10,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":10856492,"frame":1,"startTdbSeconds":-14200747200,"startWord":6738121,"target":301,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":14974864,"frame":1,"startTdbSeconds":-14200747200,"startWord":10856493,"target":399,"type":2},{"center":1,"endTdbSeconds":20514081600,"endWord":14974876,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974865,"target":199,"type":2},{"center":2,"endTdbSeconds":20514081600,"endWord":14974888,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974877,"target":299,"type":2}]},"paddingSeconds":86400,"sampling":{"bounds":"half-open","endExclusive":"2200-01-01T00:00:00.000Z","endMs":7258118400000,"endTdbSeconds":6311390399.999828,"start":"1800-01-01T00:00:00.000Z","startMs":-5364662400000,"startTdbSeconds":-6311390399.999973,"timeScale":"TT"},"selection":"Full DE440 inside its padded supported interval; DE441 outside, part 2 before part 1"},"Swiss":{"adapterSha256":"278e146f5c576493622d71dfd957bf88c988aa16730cd910fd73003961912542","binding":"pyswisseph 20230604","bindingSha256":"865fc01ea4ce1233415a1fc6f384b372f3356ac2c137ef266b9de87df67176e2","engineVersion":"2.10.03","ephemerisFiles":{"seas_18.se1":"a2cd8fc33807c78ca9a700c91c2e042258b12fc4796519e00781440b5ad8b2e2","semo_18.se1":"1ca07bd67c24374d77226180c20a4f9996cba013697894810518e7eb582ca4f7","sepl_18.se1":"ca1393ceab3a44fbc895887cf789c68819ae6a1cbc9b22225872dbe4ccd99a66"}}}`.
Conventions: `{"Swiss":"Optional external apparent geocentric true-of-date instrument; SWIEPH responses only. Swiss channels: engine minus Swiss; SwissJPL channels: Swiss minus JPL, in arcseconds. Same chart and a single adapter response per exact body.","SwissConventionDifference":"Swiss apparent places include its deflection model and lunar apparent corrections; JPL has no deflection and uses geometric Moon. Frame, ephemeris and TT Julian-date rounding differences remain. Instrument comparisons are separate from JPL accuracy and convention channels; never subtract aggregate maxima.","conventionDifference":"Convention channels: CN+REL minus CN+S direction using the same JPL kernel, TT/TDB and frame; Moon zero. Separate model sensitivity, not engine error or a correction to aggregate maxima.","correction":"JPL Moon NONE; Sun Mercury Venus CN+REL with no deflection; Earth center 399; NAIF periodic TT/TDB","distance":"Engine calc apparent geocentric light path in au converted to km minus JPL converged light path; geometric Moon. calc uses binary64 JD = TT days since J2000 + 2451545; chart uses original millisecond instant.","frame":"IAU2006 bias/precession and unadjusted IAU2000B true ecliptic/equinox of date","input":"Synthetic TT; uniform sphere; random house systems; half-open 1800-01-01 to 2200-01-01","limitations":"Engine backdated-observer aberration, light-time, frame and truncated TT/TDB differences remain in residuals. No solar deflection or moving-body ray integration; convention delta isolates only the selected aberration models.","referenceGroups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"residual":"JPL channels: engine minus relativistic JPL direction in arcseconds; distance in km","tolerance":"60 arcseconds and 10000 km screening only; fixed before pilot, not accuracy bounds","unavailableBodies":{"Jupiter":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","Mars":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","Neptune":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","Pluto":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","Saturn":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","Uranus":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution."}}`.
