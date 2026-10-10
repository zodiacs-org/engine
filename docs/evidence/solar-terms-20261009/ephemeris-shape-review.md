# Ephemeris identity correction: executed source proof

[Fresh review of #38](https://github.com/zodiacs-org/engine/pull/38#discussion_r4237522805) found the original string-only EPHEMERIS contract incompatible with the carried engine's frozen name/version record. The earlier head and passing synthetic string-provider results remain historical; that review blocked merge.

Corrected source `e47c214593579c19d5de87aa4ad833e0b97b76bb` accepts both a nonempty string and a plain own enumerable `{name, version}` data record, normalizing the latter to `name@version`. It refuses malformed/accessor identities before provider calls and rechecks a mutable provider's identity before each inventory. Results retain a string snapshot.

[Native source/consumer 38050192231](https://github.com/zodiacs-org/engine/actions/runs/38050192231) passes on Node 22.22.2 and 24.21.0:

- Eleven source controls, including frozen structured identity, invalid name/version shapes, getters and late mutations.
- Installed string and structured providers give identical term inventories for years 1, 99, 1850, 2000, 2026, 2049 and 9998. The separately defined linear-Sun expectations retain the original 12 ms quantized-bisection gate; measured maxima are 9 / 9 / 9 / 3 / 8 / 8 / 8 ms. A 100-sample budget refuses the whole inventory.
- TypeScript 5.8.3, strict ES2022-only declarations: positive structured-provider compatibility and nine rejection controls.
- Actual private pack: **5302 bytes**, SHA-256 `c628760fec5dd526528d094d962b6e6db5f04e7580657708a5aa90179c2b1161`, exactly LICENSE / README.md / index.d.mts / index.mjs / package.json. It remains private and unregistered.

The compact consumer JSON files contain the exact JSON payload printed by the native producer and extracted from decoded stdout, with a trailing newline. They are not presented as ZIP-extracted copies of the original pretty-printed reports. Decoded job logs and their byte identities are retained. Artifact identifiers/digests are GitHub API metadata; no artifact ZIP extraction/CRC verification is claimed here. `ephemeris-shape-proof.json` records these distinctions.

All six required corrected-source PR workflows pass, including [CI 38050194749](https://github.com/zodiacs-org/engine/actions/runs/38050194749) with all nine jobs/every archive rebuild/packed consumers, Conformance 38050194748, Atlas 38050194778, Python 38050194752, CodeQL 38050194787 and the private solar job 38050194767. A fresh final evidence carrier and review, merge and complete post-merge gates remain required as of this record.

These controls use synthetic identity records and a linear angular oracle. The consumer still extracts/evaluates only the two declared packed crossing modules. No actual ephemeris, independent astronomical accuracy, proven completeness, stable cut, public package delivery or acceptance increase is claimed. The original core archive remains **287011 bytes**, SHA-256 `4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002`.
