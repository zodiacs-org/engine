### 2.0.0-rc.3: zodiacs-engine-2.0.0-rc.3.tgz, 2,781,676 bytes, SHA-256 d465137931f5d28910443ca7ef01610606e9f708704364c61811d2936dc4ec55

Pack chunk dist/chunk-UXY4RU57.js: 3,320,824 raw, 2,394,383 gzip -9, 2,243,066 brotli 11 (3,319,552 characters of base64).

| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| a | esbuild | 1 | 3,418,817 | 2,440,383 | 2,281,947 | yes | 3,418,817 | jpl-de440 |
| a | rollup | 1 | 3,417,321 | 2,437,292 | 2,280,271 | yes | 3,417,321 | jpl-de440 |
| a | vite | 1 | 3,416,191 | 2,438,771 | 2,280,100 | yes | 3,416,191 | jpl-de440 |
| a | webpack | 1 | 3,416,259 | 2,436,723 | 2,279,842 | yes | 3,416,259 | jpl-de440 |
| b | esbuild | 1 | 3,418,978 | 2,440,436 | 2,281,633 | yes | 3,418,978 | astronomy-engine |
| b | rollup | 1 | 3,417,417 | 2,437,330 | 2,280,330 | yes | 3,417,417 | astronomy-engine |
| b | vite | 1 | 3,416,352 | 2,438,837 | 2,280,206 | yes | 3,416,352 | astronomy-engine |
| b | webpack | 1 | 3,416,351 | 2,436,757 | 2,279,929 | yes | 3,416,351 | astronomy-engine |
| c | esbuild | 1 | 4,872 | 2,176 | 1,984 | no | 4,872 | ran |
| c | rollup | 1 | 4,779 | 2,114 | 1,904 | no | 4,779 | ran |
| c | vite | 1 | 4,768 | 2,104 | 1,910 | no | 4,768 | ran |
| c | webpack | 1 | 4,873 | 2,131 | 1,915 | no | 4,873 | ran |
| d | esbuild | 1 | 11,478 | 6,626 | 5,786 | no | 11,478 | ran |
| d | rollup | 1 | 10,847 | 6,255 | 5,485 | no | 10,847 | ran |
| d | vite | 1 | 11,372 | 6,534 | 5,700 | no | 11,372 | ran |
| d | webpack | 1 | 11,226 | 6,403 | 5,607 | no | 11,226 | ran |
| e | esbuild | 2 | 3,446,796 | 2,450,765 | 2,291,576 | split: the pack is in a chunk loaded on click | 745 | jpl-de440 |
| e | rollup | 2 | 3,418,593 | 2,439,717 | 2,280,563 | split: the pack is in a chunk loaded on click | 777 | jpl-de440 |
| e | vite | 2 | 3,418,192 | 2,439,762 | 2,280,950 | split: the pack is in a chunk loaded on click | 2,455 | jpl-de440 |
| e | webpack | 2 | 3,418,480 | 2,439,505 | 2,280,753 | split: the pack is in a chunk loaded on click | 2,534 | jpl-de440 |
| a-namespace | esbuild | 1 | 3,418,827 | 2,440,388 | 2,281,951 | yes | 3,418,827 | jpl-de440 |
| a-namespace | rollup | 1 | 3,417,331 | 2,437,298 | 2,280,303 | yes | 3,417,331 | jpl-de440 |
| a-namespace | vite | 1 | 3,416,201 | 2,438,777 | 2,280,133 | yes | 3,416,201 | jpl-de440 |
| a-namespace | webpack | 1 | 3,416,279 | 2,436,739 | 2,280,236 | yes | 3,416,279 | jpl-de440 |
| a-core | esbuild | 1 | 80,192 | 36,161 | 30,554 | no | 80,192 | astronomy-engine |
| a-core | rollup | 1 | 78,068 | 34,863 | 29,204 | no | 78,068 | astronomy-engine |
| a-core | vite | 1 | 77,647 | 34,558 | 29,278 | no | 77,647 | astronomy-engine |
| a-core | webpack | 1 | 77,042 | 34,187 | 28,800 | no | 77,042 | astronomy-engine |

Node cold import of `@zodiacs/engine`: import median 55.75 ms (42.9 to 78.53, 10 runs); first natalChart after it median 94.81 ms (71.46 to 117.07, 10 runs) on jpl-de440; whole process median 217.67 ms (170.83 to 250.58, 10 runs).
Node cold import of `@zodiacs/engine/core`: import median 15.59 ms (14.22 to 19.7, 10 runs); first natalChart after it median 61.06 ms (52.85 to 68.5, 10 runs) on astronomy-engine; whole process median 130.92 ms (117.33 to 141.56, 10 runs).

Checks: 41, 0 failed.
- pass: 2.0.0-rc.3 a esbuild: the pack chunk's bytes in the output within 1 per cent of the archive's dist/chunk-UXY4RU57.js (3320824): 3320151 bytes, 0.020 per cent off
