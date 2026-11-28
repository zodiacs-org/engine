# JPL inertial reduction validation

Reference reduction validation, not an engine error report or random chart campaign.

Command: `node crosscheck/tools/validate-jpl.mjs` on v22.23.3.
Kernel SHA-256: `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`.
Exact tooling and public input hashes, selection rules, tolerances and TT span are in [jpl-reduction.json](jpl-reduction.json).

This compares the independently authored SPK reduction with committed JPL Horizons DE441 responses. Differences include DE440 versus DE441, the truncated NAIF TT/TDB model, and CN versus Horizons LT semantics. Limits are acceptance checks fixed in lib/horizons.mjs before the comparison, not an engine accuracy claim.

This historical validation evaluates inertial reduction only. True-of-date frames and relativistic correction implementations were subsequently validated in [frame-validation.md](frame-validation.md); engine charts were measured separately in [bounded-sample.md](bounded-sample.md) and [driver-smoke.md](driver-smoke.md). Swiss transport is implemented, but no live Swiss comparison was run. The aggregate receipt retains the measurement commands, runtime and tooling identities; this markdown includes current project context.

| Correction / NAIF target | Compared | Angular max (arcsec) | Range max (km) | Failed angle / range |
| --- | ---: | ---: | ---: | ---: |
| CN+S/10 | 6 | 0.000017061123648371362 | 0.00018659234046936035 | 0 / 0 |
| CN+S/199 | 6 | 0.0004077619734118405 | 0.0007030963897705078 | 0 / 0 |
| CN+S/299 | 6 | 0.0005140770643792939 | 0.0001906752586364746 | 0 / 0 |
| CN+S/301 | 6 | 0.008104403905455155 | 0.0009174738661386073 | 0 / 0 |
| CN+S/4 | 6 | 0.0005241927328084289 | 0.0001348257064819336 | 0 / 0 |
| CN+S/5 | 6 | 0.0005182306341397922 | 0.0002779960632324219 | 0 / 0 |
| CN+S/6 | 6 | 0.00045626933173994154 | 0.0001914501190185547 | 0 / 0 |
| CN+S/7 | 6 | 0.0004905367820521079 | 0.00016117095947265625 | 0 / 0 |
| CN+S/8 | 6 | 0.00046806418585196443 | 0.00029087066650390625 | 0 / 0 |
| CN+S/9 | 6 | 0.000510061906568465 | 0.00020313262939453125 | 0 / 0 |
| CN/10 | 6 | 5.066896385043711e-7 | 0.00018662214279174805 | 0 / 0 |
| CN/199 | 6 | 3.6993508645323166e-7 | 0.0007031410932540894 | 0 / 0 |
| CN/299 | 6 | 7.712362019007088e-7 | 0.0001907050609588623 | 0 / 0 |
| CN/301 | 6 | 0.008402225038365787 | 0.00091747404076159 | 0 / 0 |
| CN/4 | 6 | 4.5127666736939327e-7 | 0.00013491511344909668 | 0 / 0 |
| CN/5 | 6 | 4.5908043188675484e-8 | 0.0002779960632324219 | 0 / 0 |
| CN/6 | 6 | 2.955755256679884e-8 | 0.0001926422119140625 | 0 / 0 |
| CN/7 | 6 | 1.6214428636122524e-8 | 0.00016069412231445312 | 0 / 0 |
| CN/8 | 6 | 1.353770060549799e-8 | 0.0002918243408203125 | 0 / 0 |
| CN/9 | 6 | 6.741077619057875e-9 | 0.00020503997802734375 | 0 / 0 |
| NONE/10 | 3 | 2.3961630662035234e-7 | 0.00018668174743652344 | 0 / 0 |
| NONE/199 | 3 | 1.7738726330843482e-7 | 0.00018930435180664062 | 0 / 0 |
| NONE/299 | 3 | 1.447468339385555e-7 | 0.00019061565399169922 | 0 / 0 |
| NONE/301 | 3 | 0.008403017842794847 | 0.0009179548360407352 | 0 / 0 |
| NONE/4 | 3 | 2.666451428031121e-7 | 0.00016391277313232422 | 0 / 0 |
| NONE/5 | 3 | 4.907487612576632e-8 | 0.00012230873107910156 | 0 / 0 |
| NONE/6 | 3 | 1.4199402534118075e-8 | 0.0001914501190185547 | 0 / 0 |
| NONE/7 | 3 | 1.0940536777560067e-8 | 0.0001621246337890625 | 0 / 0 |
| NONE/8 | 3 | 8.807018468540723e-9 | 0.000164031982421875 | 0 / 0 |
| NONE/9 | 3 | 5.280620008461967e-9 | 0.00014209747314453125 | 0 / 0 |
