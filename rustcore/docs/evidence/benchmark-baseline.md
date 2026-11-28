# Benchmark baseline

Generated from [benchmark-baseline.json](benchmark-baseline.json) by
`scripts/benchmark.mjs`. Values below are microseconds per API call, displayed
with three significant digits; the JSON retains the measured precision.

Native columns are Criterion median estimates and bootstrap confidence intervals.
Node columns are medians of batch durations divided by call counts. TS/WASM is
the ratio of those Node medians; greater than one means WASM took less time.
The native and Node measurements use different harnesses and are not speed ratios.

| Workload | Native median [95% interval] us | Node TS median us | Node WASM median us | TS/WASM |
| --- | ---: | ---: | ---: | ---: |
| positions/warm | 204 [178, 471] | 1.20e+3 | 521 | 2.29 |
| positions/cold | 8.50e+3 [6.16e+3, 1.08e+4] | 1.66e+4 | 5.36e+3 | 3.09 |
| houses/whole | 0.288 [0.219, 0.323] | 1.07 | 2.13 | 0.500 |
| houses/placidus | 21.2 [16.4, 28.1] | 15.7 | 20.8 | 0.758 |
| houses/koch | 0.607 [0.565, 0.659] | 1.02 | 2.00 | 0.512 |
| houses/porphyry | 0.160 [0.136, 0.170] | 0.394 | 1.76 | 0.224 |
| houses/regiomontanus | 0.693 [0.499, 0.969] | 1.60 | 2.62 | 0.609 |
| houses/campanus | 0.536 [0.450, 0.702] | 1.50 | 2.60 | 0.577 |
| houses/topocentric | 0.442 [0.411, 0.510] | 1.36 | 2.16 | 0.631 |
| houses/alcabitius | 0.433 [0.367, 0.601] | 1.15 | 2.33 | 0.494 |
| houses/equal | 0.0955 [0.0873, 0.140] | 1.09 | 1.59 | 0.686 |
| houses/equal-mc | 0.0796 [0.0743, 0.0883] | 1.14 | 1.65 | 0.690 |
| houses/vehlow | 0.141 [0.111, 0.166] | 1.09 | 1.67 | 0.652 |
| houses/meridian | 0.467 [0.444, 0.559] | 1.83 | 2.04 | 0.897 |
| houses/morinus | 0.550 [0.481, 0.637] | 2.33 | 2.10 | 1.11 |
| time/utc | 0.0719 [0.0596, 0.0779] | 0.228 | 9.00 | 0.0253 |
| frame/ecliptic_of_date | 1.18 [1.14, 1.22] | 2.02 | 1.34 | 1.51 |
| aspects/legacy | 2.11 [1.88, 2.51] | 5.82 | 6.71 | 0.868 |
| aspects/configured_default | 31.5 [30.2, 36.4] | 159 | 72.4 | 2.20 |
| aspects/configured_all | 56.0 [48.6, 63.8] | 322 | 103 | 3.12 |
| aspects/configured_custom | 29.5 [26.8, 33.5] | 149 | 69.1 | 2.16 |

Machine and toolchain details, workload inputs, source hashes, dispersion and
sample counts are in the linked JSON. See [BENCHMARKS.md](../../BENCHMARKS.md)
for timing boundaries, cache state and the limits of this run.
