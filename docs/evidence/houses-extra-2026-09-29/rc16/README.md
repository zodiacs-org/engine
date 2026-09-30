# The houses gates rerun on 0.1.1-rc.16's build

The tools of `../README.md`'s *Rerun*, unchanged, run on the integrated
0.1.1-rc.16 candidate after the engine took the full IAU 2000B nutation (the
build of `704cadc`, whose houses and timing entries later commits do not
change), with Node.js v22.22.2, Python 3.11.15 and pyswisseph 2.10.03 as an
instrument, statistics only. `run.log` is the run's output; the branch's
results stay in `../results/`.

| Gate | This run |
| --- | --- |
| P, house positions against `swe_house_pos` | `swiss.json` byte for byte the branch's: the same verdicts |
| A, co-ascendants against `ascmc[4..7]` | the same file: pass |
| S, speeds against `swe_houses_armc_ex2` | the same file: the same verdicts |
| F, speeds against a central difference of the engine's own cusps | `finite-difference.json` byte for byte the branch's: pass |
| R, planetary returns against JPL Horizons and USNO | `returns.json`: pass, every body (below) |
| stations over 1800–2200 | `stations.json` byte for byte the branch's |
| B, the root's graph, the budgets and existing behaviour | **failed** (the branch's run passed): the root's graph is 103,537 bytes, where it was to stay at rc.15's 95,273 with its files byte-identical; `./timing` is 123,039 bytes, over its 120,000-byte budget; the package is 923,282 bytes, over the 700,000-byte cap; 13 of rc.15's test files change and released functions' results move with the nutation. `./houses`, 13,606 bytes of its 15,000, holds. rc.16 raised `./timing`'s budget to 129,000 and the cap to 950,000 after these sizes were measured; that does not make B pass (`docs/evidence/rc16-20260930/`, *Sizes and budgets*) |

P, A, S and F take their sidereal times, latitudes and obliquities from the
grids of `../tools/grids.mjs`, not from the ephemeris, so the nutation cannot
move them; their files are the branch's to the byte. The stations' quarter-day
scan moves by less than its resolution.

Gate R, the largest difference from Horizons's instant, as time and as the
body's motion over it, and the natal longitude less Horizons's:

| Body | \|t − t_H\| | as motion | τ | natal − Horizons | the branch's |
| --- | ---: | ---: | ---: | ---: | --- |
| Sun | 19.1 s | 0.804″ | 6″ | −0.124″ | 19.9 s, 0.840″, −0.114″ |
| Moon | 1.3 s | 0.705″ | 8″ | −0.251″ | 1.6 s, 0.815″, −0.154″ |
| Mercury | 48.2 s | 2.413″ | 45″ | 4.235″ | 50.7 s, 2.541″, 4.399″ |
| Venus | 229.7 s | 6.197″ | 45″ | −0.649″ | 223.2 s, 5.958″, −0.528″ |
| Mars | 1,015.0 s | 11.796″ | 45″ | −0.575″ | 1,013.4 s, 11.778″, −0.551″ |
| Jupiter | 466.6 s | 3.055″ | 45″ | −2.805″ | 438.0 s, 2.868″, −2.734″ |
| Saturn | 1,582.0 s | 5.637″ | 45″ | −4.358″ | 1,626.8 s, 5.708″, −4.405″ |
| Uranus | 548.2 s | 1.206″ | 45″ | 0.907″ | 542.1 s, 1.192″, 0.858″ |
| Neptune | 2,438.0 s | 3.153″ | 45″ | −1.619″ | 2,409.5 s, 3.194″, −1.607″ |
| Pluto | 25,675.9 s | 22.600″ | 45″ | 17.571″ | 25,650.9 s, 22.578″, 17.525″ |

USNO, the March equinoxes of 2001 to 2004: −20.7, −8.6, 12.8 and −49.7 s
against 210 s (the branch's: −22.3, −14.2, 11 and −49.4 s). Pass.
