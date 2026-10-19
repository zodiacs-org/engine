# Synthetic TT chart campaign

Status: partial. Completed synthetic charts: 3072; requested: 1000000.

Exact command argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/p5-million.json","snapshot"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `e0134608ca96bdeb2ff4ff701c2936657f32d8f45fa838e4c3783c2e73b97be2`.
Engine build SHA-256: `227ac0feb3066f6cbbd6bd0efad7886bf06e463fe419f1162114c02acff0064b`.
Executable tooling SHA-256: `9cc02af073d1cdef5df63acc9a672880bdd80a28783ac856115cd276dd454d08`.

Sampling interval in epoch milliseconds: [-5364662400000, 7258118400000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

Swiss instrument: available. External optional test instrument; JPL remains the positional accuracy reference.
Swiss returned-flag responses: SWIEPH 12288; Moshier fallback 0; other backend fallback 0.
Flag-response counts use engine-minus-Swiss longitude channels only, so latitude channels and Swiss-minus-JPL comparisons do not duplicate them. Longitude verdict totals include inactive-group and unsupported-center outcomes and are not instrument request counts. Per-channel flags and fallback/error/unsupported verdicts remain in the tables and receipt.

Reference groups:

| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Engine/Swiss residuals | Swiss/JPL residuals | Reason |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| DE440 | available | [-5364662400000, 7258118400000) | 36864 | 24576 | 24576 | 24576 | Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval. |
| DE441 | empty | none | 0 | 0 | 0 | 0 | The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested. |

Residual counts sum coordinate comparisons, not charts. Empty groups have no requested interval or measured coverage. Unavailable exact centers have no numerical errors or maxima.

Engine minus JPL residuals:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.DE440.Jupiter.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 3072 | 3072 | 0 | 0 | 0 | 0 | 10000 | 24.613174467367053 | 1495.135333046511 | 1881.434299130154 | 1881.273295825466 | 7107.727558255196 |
| JPL.DE440.Mercury.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.04530076157109389 | 1.9756203457561483 | 2.7183567415315815 | 2.7179792521708617 | 12.838480306286115 |
| JPL.DE440.Mercury.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.11452914917522405 | 2.189801727358054 | 2.8832352374944654 | 2.880959650657912 | 12.532396399365098 |
| JPL.DE440.Moon.distance | km | 3072 | 3072 | 0 | 0 | 0 | 0 | 10000 | -10.531547931931948 | 10.531547931931945 | 10.651515585176432 | 1.5941400248022268 | 15.576994510774966 |
| JPL.DE440.Moon.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.026860779465968647 | 0.4287367941211307 | 0.5739119736394951 | 0.573283047031099 | 2.025891078403941 |
| JPL.DE440.Moon.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 1.3447378854464909 | 1.9467781523698324 | 2.752269345798265 | 2.401388467380009 | 10.432922880681872 |
| JPL.DE440.Neptune.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 3072 | 3072 | 0 | 0 | 0 | 0 | 10000 | -3.9889794272603503 | 612.2520591830447 | 757.6395082395743 | 757.6290071589347 | 2358.4254642128944 |
| JPL.DE440.Sun.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.006357708637260406 | 0.8294359340364547 | 1.0273541843315062 | 1.0273345120282582 | 3.1255848852742876 |
| JPL.DE440.Sun.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.12130536784913393 | 0.5005079011400237 | 0.62523765766156 | 0.6133572664353955 | 2.0413350498984073 |
| JPL.DE440.Uranus.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 3072 | 3072 | 0 | 0 | 0 | 0 | 10000 | 166.8231714787811 | 1064.9127482359206 | 1328.455293507261 | 1317.9391094831449 | 4187.626041337848 |
| JPL.DE440.Venus.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.039585076400745184 | 1.4854052784752756 | 2.2003134113595846 | 2.1999573018436513 | 13.607265722266604 |
| JPL.DE440.Venus.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.08779119223549783 | 1.691198206057587 | 2.7518884277091393 | 2.7504877067759 | 17.62186392475087 |
| JPL.DE441.Jupiter.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | 0 | 0 | 0 | 0 | 3072 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Separate JPL convention differences:

These residuals compare the relativistic aberration direction with the Newtonian CN+S direction for the same reference states and frame. They are not engine errors, a complete model correction or an independent truth comparison. They are never subtracted from aggregate engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Convention.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -7.668182726940973e-7 | 0.0000025296165490506146 | 0.0000036153876066229435 | 0.0000035331313707227497 | 0.000010330765043420342 |
| Convention.DE440.Mercury.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.000006262159990555462 | 0.00024034067416245364 | 0.0002659727010962337 | 0.0002658989715675469 | 0.0004133473339607008 |
| Convention.DE440.Moon.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Moon.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -2.564670501010012e-12 | 2.6099137372978225e-10 | 3.2918635594924644e-10 | 3.2917636520316164e-10 | 9.36037282840002e-10 |
| Convention.DE440.Sun.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -3.5974236922697824e-7 | 0.000010680264672657813 | 0.000011890828438200096 | 0.000011885385411272631 | 0.000018199534679297358 |
| Convention.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -4.6742811194583254e-8 | 0.000009423836829229343 | 0.000014233981980103718 | 0.000014233905230804336 | 0.000042188121796016276 |
| Convention.DE440.Venus.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.000014010341420345195 | 0.00037911245636124136 | 0.00040839214764759976 | 0.0004081517568178581 | 0.0005275704097584821 |
| Convention.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus Swiss instrument residuals:

These are comparisons with a second instrument, separate from engine accuracy versus JPL. Only SWIEPH returned flags contribute numerical residuals.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Swiss.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mercury.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.0442297376135658 | 1.9762404831609433 | 2.7187125371641314 | 2.718352734661943 | 12.840008064123154 |
| Swiss.DE440.Mercury.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.11396570351210959 | 2.1896476961305082 | 2.883252994250615 | 2.8809997652339585 | 12.531448316894966 |
| Swiss.DE440.Moon.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.029067921952925204 | 0.4531243547333645 | 0.6034583677480786 | 0.6027578763637305 | 2.0870885231189185 |
| Swiss.DE440.Moon.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 2.042419051203735 | 2.273510714724553 | 3.150202709466349 | 2.3983956158251227 | 11.171191123253266 |
| Swiss.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.00634819184845844 | 0.8294626569838593 | 1.0274050644836619 | 1.0273854520027688 | 3.1252470506146026 |
| Swiss.DE440.Sun.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.12106594531716873 | 0.5005296497909151 | 0.6252458769381185 | 0.6134129469717582 | 2.04121053484414 |
| Swiss.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.040608055041007146 | 1.4845674111049174 | 2.2002756023891616 | 2.1999008414778096 | 13.605925131565755 |
| Swiss.DE440.Venus.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.08793643217164764 | 1.6917344434223607 | 2.752386885981197 | 2.7509817800229417 | 17.621603378938744 |
| Swiss.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Swiss instrument minus JPL residuals:

These compare the same Swiss positions with the selected JPL reference and frame. Model and convention differences can contribute; no Swiss difference is subtracted from engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SwissJPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mercury.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.0010710239575281483 | 0.003909385025258564 | 0.016454329251828846 | 0.01641943539863631 | 0.3587650375724394 |
| SwissJPL.DE440.Mercury.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.0005634456651128607 | 0.009190356497620747 | 0.020027956732713206 | 0.020020029467258477 | 0.4750620973595687 |
| SwissJPL.DE440.Moon.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.002207142486956625 | 0.04021560707015173 | 0.04476657974060854 | 0.04471213687260467 | 0.06961926195286905 |
| SwissJPL.DE440.Moon.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.6976811657599746 | 0.6976811657599745 | 0.698235352212836 | 0.02781363017633805 | 0.7620072649288545 |
| SwissJPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.000009516788801962062 | 0.000345342752996645 | 0.0004736882843059357 | 0.00047359267458397164 | 0.0018924931246078322 |
| SwissJPL.DE440.Sun.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.00023942253056624387 | 0.0007976117603473759 | 0.00107313122662677 | 0.0010460819668738832 | 0.005235748372456328 |
| SwissJPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | -0.00102297864026197 | 0.0039658780470463815 | 0.02906893917377077 | 0.02905093353732292 | 1.1439315982863074 |
| SwissJPL.DE440.Venus.lon | arcseconds | 3072 | 3072 | 0 | 0 | 0 | 0 | 60 | 0.0001452399360165154 | 0.010617436374644962 | 0.028681629520717126 | 0.02868126178055384 | 0.7520443514522412 |
| SwissJPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Other comparison channels:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 3072 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

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
| JPL.DE440.Mercury.distance | km | 7107.727558255196 | [6144, 6400] | [4864, 5120] | [1216, 1280] |
| JPL.DE440.Mercury.lat | arcseconds | 12.838480306286115 | [11.5, 12] | [8.5, 9] | [1.375, 1.4375] |
| JPL.DE440.Mercury.lon | arcseconds | 12.532396399365098 | [11.5, 12] | [8.5, 9] | [1.6875, 1.75] |
| JPL.DE440.Moon.distance | km | 15.576994510774966 | [14.5, 15] | [14, 14.5] | [10.5, 11] |
| JPL.DE440.Moon.lat | arcseconds | 2.025891078403941 | [1.9375, 2] | [1.625, 1.6875] | [0.3125, 0.328125] |
| JPL.DE440.Moon.lon | arcseconds | 10.432922880681872 | [9, 9.5] | [7.5, 7.75] | [1.1875, 1.25] |
| JPL.DE440.Neptune.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 2358.4254642128944 | [2176, 2304] | [1856, 1920] | [512, 544] |
| JPL.DE440.Sun.lat | arcseconds | 3.1255848852742876 | [2.875, 3] | [2.5, 2.625] | [0.6875, 0.71875] |
| JPL.DE440.Sun.lon | arcseconds | 2.0413350498984073 | [1.9375, 2] | [1.625, 1.6875] | [0.40625, 0.421875] |
| JPL.DE440.Uranus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 4187.626041337848 | [3968, 4096] | [3328, 3456] | [896, 928] |
| JPL.DE440.Venus.lat | arcseconds | 13.607265722266604 | [11.5, 12] | [7.5, 7.75] | [0.96875, 1] |
| JPL.DE440.Venus.lon | arcseconds | 17.62186392475087 | [15.5, 16] | [11, 11.5] | [1, 1.0625] |
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
| Convention.DE440.Mercury.lat | arcseconds | 0.000010330765043420342 | [0.000010013580322265625, 0.000010330765043420342] | [0.0000095367431640625, 0.000010013580322265625] | [0.0000016093254089355469, 0.0000016689300537109375] |
| Convention.DE440.Mercury.lon | arcseconds | 0.0004133473339607008 | [0.0004119873046875, 0.0004133473339607008] | [0.000396728515625, 0.0004119873046875] | [0.0002593994140625, 0.000274658203125] |
| Convention.DE440.Moon.lat | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Moon.lon | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 9.36037282840002e-10 | [8.440110832452774e-10, 8.731149137020111e-10] | [7.566995918750763e-10, 7.8580342233181e-10] | [2.1827872842550278e-10, 2.255546860396862e-10] |
| Convention.DE440.Sun.lon | arcseconds | 0.000018199534679297358 | [0.0000171661376953125, 0.00001811981201171875] | [0.0000171661376953125, 0.00001811981201171875] | [0.000011444091796875, 0.000011920928955078125] |
| Convention.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 0.000042188121796016276 | [0.0000400543212890625, 0.000041961669921875] | [0.00003814697265625, 0.0000400543212890625] | [0.00000476837158203125, 0.0000050067901611328125] |
| Convention.DE440.Venus.lon | arcseconds | 0.0005275704097584821 | [0.000518798828125, 0.0005275704097584821] | [0.000518798828125, 0.0005275704097584821] | [0.0004425048828125, 0.000457763671875] |
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
| Swiss.DE440.Mercury.lat | arcseconds | 12.840008064123154 | [11.5, 12] | [8.5, 9] | [1.375, 1.4375] |
| Swiss.DE440.Mercury.lon | arcseconds | 12.531448316894966 | [11.5, 12] | [8.5, 9] | [1.6875, 1.75] |
| Swiss.DE440.Moon.lat | arcseconds | 2.0870885231189185 | [2, 2.0870885231189185] | [1.6875, 1.75] | [0.328125, 0.34375] |
| Swiss.DE440.Moon.lon | arcseconds | 11.171191123253266 | [9.5, 10] | [8, 8.5] | [1.375, 1.4375] |
| Swiss.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 3.1252470506146026 | [2.875, 3] | [2.5, 2.625] | [0.6875, 0.71875] |
| Swiss.DE440.Sun.lon | arcseconds | 2.04121053484414 | [1.9375, 2] | [1.625, 1.6875] | [0.40625, 0.421875] |
| Swiss.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 13.605925131565755 | [11.5, 12] | [7.5, 7.75] | [0.96875, 1] |
| Swiss.DE440.Venus.lon | arcseconds | 17.621603378938744 | [15.5, 16] | [11, 11.5] | [1, 1.0625] |
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
| SwissJPL.DE440.Mercury.lat | arcseconds | 0.3587650375724394 | [0.2109375, 0.21875] | [0.0703125, 0.07421875] | [0.00054931640625, 0.000579833984375] |
| SwissJPL.DE440.Mercury.lon | arcseconds | 0.4750620973595687 | [0.203125, 0.2109375] | [0.06640625, 0.0703125] | [0.00439453125, 0.004638671875] |
| SwissJPL.DE440.Moon.lat | arcseconds | 0.06961926195286905 | [0.06640625, 0.06961926195286905] | [0.06640625, 0.06961926195286905] | [0.04296875, 0.044921875] |
| SwissJPL.DE440.Moon.lon | arcseconds | 0.7620072649288545 | [0.75, 0.7620072649288545] | [0.75, 0.7620072649288545] | [0.6875, 0.71875] |
| SwissJPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 0.0018924931246078322 | [0.001708984375, 0.00177001953125] | [0.00140380859375, 0.00146484375] | [0.000244140625, 0.0002593994140625] |
| SwissJPL.DE440.Sun.lon | arcseconds | 0.005235748372456328 | [0.004150390625, 0.00439453125] | [0.003173828125, 0.0032958984375] | [0.000579833984375, 0.0006103515625] |
| SwissJPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 1.1439315982863074 | [0.25, 0.265625] | [0.08984375, 0.09375] | [0.00048828125, 0.000518798828125] |
| SwissJPL.DE440.Venus.lon | arcseconds | 0.7520443514522412 | [0.2109375, 0.21875] | [0.08203125, 0.0859375] | [0.004150390625, 0.00439453125] |
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

- Partial reproduction from empty checkpoints: node crosscheck/tools/campaign.mjs crosscheck/runtime/p5-million.json all 0, then run each shard with MAX_CASES equal to its completed count in this receipt, then snapshot. Specification: {"name":"phase2-million-tt","profile":"phase2","kernel":"de440","seed":"synthetic-phase2-million-v1","total":1000000,"shards":3}. Preserve external Swiss environment selectors if enabled.
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
