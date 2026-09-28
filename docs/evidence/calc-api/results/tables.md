# Tables

Written by tools/report.py from summary.json; do not edit by hand.

## Frame-transform consistency (preregistered checks)

| check | compares | tolerance | n | median | max | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| C1 | x, y, z against lon, lat, dist (angle) | 1e-06″ | 2560 | 5.21e-11″ | 3.11e-10″ | PASS |
| C1dist | x, y, z against lon, lat, dist (relative length) | 1e-12 | 2560 | 0.00e+00 | 4.37e-16 | PASS |
| C2 | ICRS against J2000.0 turned by the frame bias (bp06) | 1e-05″ | 320 | 2.33e-07″ | 2.73e-07″ | PASS |
| C3 | mean of date against J2000.0 precessed (bp06 rp) | 0.0001″ | 320 | 1.49e-07″ | 6.44e-07″ | PASS |
| C4 | true against mean of date nutated (numat, nut06a) | 0.005″ | 320 | 7.45e-02″ | 2.00e-01″ | FAIL |
| C5a | equator against ecliptic of date, ERFA's true obliquity | 0.005″ | 320 | 1.06e-02″ | 6.21e-02″ | FAIL |
| C5b | the same, the engine's own true obliquity | 1e-06″ | 320 | 7.44e-11″ | 3.30e-10″ | PASS |
| C6 | mean equator against mean ecliptic of date (obl06) | 1e-06″ | 320 | 7.04e-11″ | 4.07e-10″ | PASS |
| C7 | J2000.0 equator against J2000.0 ecliptic (84381.406″) | 1e-06″ | 320 | 7.33e-11″ | 3.29e-10″ | PASS |
| C8 | ICRS equator against ICRS ecliptic (84381.406″) | 1e-06″ | 320 | 6.72e-11″ | 4.20e-10″ | PASS |
| C9 | true of date against J2000.0, whole chain (pnm06a) | 0.005″ | 320 | 7.45e-02″ | 2.00e-01″ | FAIL |
| C10 | the true node, equator against ecliptic of date | 0.005″ | 32 | 9.16e-03″ | 3.66e-02″ | FAIL |

## Against Horizons, by body (all eight frames pooled)

Position: angle between directions, arcseconds, median / 95th percentile / maximum. Distance: largest relative difference. Speed: angular-rate difference, arcseconds a day, median / 95th / max.

### geocentric, apparent

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Moon | 256 | 1.761 / 6.88 / 8.288 | 1.33e-04 | 0.398 / 0.881 / 1.013 |
| Mercury | 256 | 3.05 / 8.379 / 9.323 | 3.54e-05 | 0.701 / 2.09 / 2.11 |
| Venus | 256 | 1.893 / 8.7 / 10.033 | 3.11e-05 | 0.115 / 0.545 / 0.637 |
| Mars | 256 | 1.341 / 5.845 / 6.578 | 5.71e-05 | 0.063 / 0.271 / 0.444 |
| Jupiter | 256 | 3.071 / 10.879 / 12.697 | 4.65e-05 | 0.023 / 0.049 / 0.082 |
| Saturn | 256 | 6.41 / 16.527 / 17.648 | 6.72e-05 | 0.018 / 0.033 / 0.049 |
| Uranus | 256 | 6.203 / 15.43 / 19.53 | 4.14e-05 | 8.78e-03 / 0.032 / 0.043 |
| Neptune | 256 | 11.18 / 19.445 / 20.126 | 4.17e-05 | 7.58e-03 / 0.034 / 0.051 |
| Pluto | 256 | 5.949 / 20.992 / 24.631 | 6.21e-05 | 3.76e-03 / 0.03 / 0.045 |

### geocentric, astrometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 0.978 / 2.68 / 2.944 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Moon | 256 | 1.76 / 6.17 / 7.586 | 3.55e-05 | 0.392 / 0.878 / 1.016 |
| Mercury | 256 | 3.049 / 8.379 / 9.323 | 3.54e-05 | 0.701 / 2.09 / 2.11 |
| Venus | 256 | 1.893 / 8.699 / 10.034 | 3.11e-05 | 0.115 / 0.545 / 0.637 |
| Mars | 256 | 1.34 / 5.842 / 6.578 | 5.71e-05 | 0.063 / 0.271 / 0.444 |
| Jupiter | 256 | 3.073 / 10.879 / 12.697 | 4.65e-05 | 0.023 / 0.049 / 0.082 |
| Saturn | 256 | 6.411 / 16.522 / 17.647 | 6.72e-05 | 0.018 / 0.033 / 0.049 |
| Uranus | 256 | 6.208 / 15.434 / 19.532 | 4.14e-05 | 8.84e-03 / 0.032 / 0.043 |
| Neptune | 256 | 11.169 / 19.461 / 20.106 | 4.17e-05 | 7.58e-03 / 0.035 / 0.051 |
| Pluto | 256 | 5.981 / 21.027 / 24.596 | 6.21e-05 | 3.49e-03 / 0.031 / 0.045 |

### geocentric, geometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Moon | 256 | 1.76 / 6.171 / 7.586 | 3.55e-05 | 0.367 / 0.827 / 0.975 |
| Mercury | 256 | 3.048 / 8.377 / 9.327 | 3.54e-05 | 0.7 / 2.091 / 2.109 |
| Venus | 256 | 1.893 / 8.699 / 10.032 | 3.11e-05 | 0.114 / 0.544 / 0.638 |
| Mars | 256 | 1.339 / 5.842 / 6.577 | 5.71e-05 | 0.064 / 0.271 / 0.444 |
| Jupiter | 256 | 3.073 / 10.879 / 12.697 | 4.65e-05 | 0.023 / 0.049 / 0.082 |
| Saturn | 256 | 6.41 / 16.522 / 17.648 | 6.72e-05 | 0.018 / 0.033 / 0.049 |
| Uranus | 256 | 6.208 / 15.434 / 19.532 | 4.14e-05 | 8.89e-03 / 0.032 / 0.043 |
| Neptune | 256 | 11.169 / 19.461 / 20.106 | 4.17e-05 | 7.59e-03 / 0.035 / 0.051 |
| Pluto | 256 | 5.981 / 21.028 / 24.596 | 6.21e-05 | 3.59e-03 / 0.031 / 0.045 |

### heliocentric, apparent

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Moon | 256 | 0.983 / 2.683 / 2.939 | 1.40e-05 | 0.121 / 0.166 / 0.18 |
| Mercury | 256 | 6.841 / 20.913 / 22.81 | 8.61e-05 | 1.905 / 4.679 / 5.382 |
| Venus | 256 | 2.404 / 5.983 / 6.682 | 1.14e-05 | 0.125 / 0.202 / 0.231 |
| Earth | 256 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Mars | 256 | 1.26 / 3.465 / 4.295 | 2.21e-05 | 0.033 / 0.072 / 0.087 |
| Jupiter | 256 | 3.326 / 11.586 / 12.778 | 3.91e-05 | 0.013 / 0.038 / 0.053 |
| Saturn | 256 | 6.451 / 16.725 / 17.999 | 6.48e-05 | 0.012 / 0.027 / 0.057 |
| Uranus | 256 | 6.266 / 14.548 / 18.62 | 4.19e-05 | 4.81e-03 / 0.03 / 0.042 |
| Neptune | 256 | 10.979 / 19.555 / 20.111 | 4.32e-05 | 2.50e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.976 / 21.423 / 24.322 | 5.99e-05 | 5.41e-04 / 0.03 / 0.044 |

### heliocentric, astrometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Moon | 256 | 0.983 / 2.683 / 2.939 | 1.40e-05 | 0.121 / 0.166 / 0.18 |
| Mercury | 256 | 6.841 / 20.913 / 22.81 | 8.61e-05 | 1.905 / 4.679 / 5.382 |
| Venus | 256 | 2.404 / 5.983 / 6.682 | 1.14e-05 | 0.125 / 0.202 / 0.231 |
| Earth | 256 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Mars | 256 | 1.26 / 3.465 / 4.295 | 2.21e-05 | 0.033 / 0.072 / 0.087 |
| Jupiter | 256 | 3.326 / 11.586 / 12.778 | 3.91e-05 | 0.013 / 0.038 / 0.053 |
| Saturn | 256 | 6.451 / 16.725 / 17.999 | 6.48e-05 | 0.012 / 0.027 / 0.057 |
| Uranus | 256 | 6.266 / 14.548 / 18.62 | 4.19e-05 | 4.81e-03 / 0.03 / 0.042 |
| Neptune | 256 | 10.979 / 19.554 / 20.111 | 4.32e-05 | 2.50e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.976 / 21.423 / 24.322 | 5.99e-05 | 5.39e-04 / 0.03 / 0.044 |

### heliocentric, geometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Moon | 256 | 0.983 / 2.683 / 2.939 | 1.40e-05 | 0.121 / 0.166 / 0.176 |
| Mercury | 256 | 6.839 / 20.912 / 22.806 | 8.61e-05 | 1.905 / 4.687 / 5.369 |
| Venus | 256 | 2.403 / 5.983 / 6.682 | 1.14e-05 | 0.124 / 0.202 / 0.228 |
| Earth | 256 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Mars | 256 | 1.26 / 3.464 / 4.295 | 2.21e-05 | 0.033 / 0.071 / 0.086 |
| Jupiter | 256 | 3.326 / 11.587 / 12.778 | 3.91e-05 | 0.013 / 0.038 / 0.053 |
| Saturn | 256 | 6.452 / 16.726 / 18 | 6.48e-05 | 0.012 / 0.027 / 0.057 |
| Uranus | 256 | 6.266 / 14.548 / 18.62 | 4.19e-05 | 4.79e-03 / 0.03 / 0.042 |
| Neptune | 256 | 10.979 / 19.555 / 20.112 | 4.32e-05 | 2.49e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.976 / 21.423 / 24.322 | 5.99e-05 | 7.11e-04 / 0.03 / 0.044 |

### barycentric, apparent

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 87.153 / 369 / 519 | 4.10e-03 | 1.142 / 6.851 / 12.714 |
| Moon | 256 | 1.005 / 2.741 / 2.921 | 1.33e-05 | 0.123 / 0.167 / 0.199 |
| Mercury | 256 | 7.331 / 17.013 / 22.897 | 7.70e-05 | 1.892 / 4.709 / 5.382 |
| Venus | 256 | 2.302 / 5.784 / 7.485 | 1.44e-05 | 0.129 / 0.208 / 0.233 |
| Earth | 256 | 1 / 2.746 / 2.929 | 1.32e-05 | 0.122 / 0.169 / 0.193 |
| Mars | 256 | 1.292 / 3.385 / 4.368 | 2.07e-05 | 0.034 / 0.073 / 0.089 |
| Jupiter | 256 | 3.305 / 11.583 / 12.761 | 3.95e-05 | 0.013 / 0.037 / 0.051 |
| Saturn | 256 | 6.468 / 16.788 / 18.064 | 6.49e-05 | 0.012 / 0.027 / 0.059 |
| Uranus | 256 | 6.259 / 14.54 / 18.622 | 4.20e-05 | 5.32e-03 / 0.03 / 0.043 |
| Neptune | 256 | 10.972 / 19.57 / 20.095 | 4.31e-05 | 2.59e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.999 / 21.39 / 24.322 | 6.02e-05 | 4.21e-04 / 0.03 / 0.043 |

### barycentric, astrometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 87.153 / 369 / 519 | 4.10e-03 | 1.142 / 6.851 / 12.714 |
| Moon | 256 | 1.005 / 2.741 / 2.921 | 1.33e-05 | 0.123 / 0.167 / 0.199 |
| Mercury | 256 | 7.331 / 17.013 / 22.897 | 7.70e-05 | 1.892 / 4.709 / 5.382 |
| Venus | 256 | 2.302 / 5.784 / 7.485 | 1.44e-05 | 0.129 / 0.208 / 0.233 |
| Earth | 256 | 1 / 2.746 / 2.929 | 1.32e-05 | 0.122 / 0.169 / 0.193 |
| Mars | 256 | 1.292 / 3.385 / 4.368 | 2.07e-05 | 0.034 / 0.073 / 0.089 |
| Jupiter | 256 | 3.305 / 11.583 / 12.761 | 3.95e-05 | 0.013 / 0.037 / 0.051 |
| Saturn | 256 | 6.468 / 16.788 / 18.064 | 6.49e-05 | 0.012 / 0.027 / 0.059 |
| Uranus | 256 | 6.259 / 14.54 / 18.622 | 4.20e-05 | 5.32e-03 / 0.03 / 0.043 |
| Neptune | 256 | 10.972 / 19.57 / 20.095 | 4.31e-05 | 2.59e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.999 / 21.39 / 24.322 | 6.02e-05 | 4.21e-04 / 0.03 / 0.043 |

### barycentric, geometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 256 | 87.153 / 369 / 519 | 4.10e-03 | 1.142 / 6.851 / 12.713 |
| Moon | 256 | 1.005 / 2.741 / 2.921 | 1.33e-05 | 0.124 / 0.165 / 0.195 |
| Mercury | 256 | 7.331 / 17.012 / 22.893 | 7.70e-05 | 1.893 / 4.716 / 5.37 |
| Venus | 256 | 2.302 / 5.784 / 7.485 | 1.44e-05 | 0.128 / 0.207 / 0.236 |
| Earth | 256 | 1 / 2.745 / 2.929 | 1.32e-05 | 0.122 / 0.167 / 0.189 |
| Mars | 256 | 1.292 / 3.385 / 4.368 | 2.07e-05 | 0.033 / 0.073 / 0.088 |
| Jupiter | 256 | 3.305 / 11.583 / 12.76 | 3.94e-05 | 0.013 / 0.037 / 0.051 |
| Saturn | 256 | 6.468 / 16.788 / 18.064 | 6.49e-05 | 0.012 / 0.027 / 0.059 |
| Uranus | 256 | 6.259 / 14.54 / 18.622 | 4.20e-05 | 5.27e-03 / 0.03 / 0.043 |
| Neptune | 256 | 10.972 / 19.57 / 20.096 | 4.31e-05 | 2.58e-03 / 0.034 / 0.043 |
| Pluto | 256 | 5.998 / 21.39 / 24.323 | 6.02e-05 | 6.28e-04 / 0.03 / 0.043 |

### topocentric, apparent

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 512 | 0.976 / 2.68 / 2.943 | 1.40e-05 | 0.122 / 0.167 / 0.2 |
| Moon | 512 | 1.764 / 6.171 / 7.7 | 3.52e-05 | 0.494 / 1.193 / 1.394 |
| Mars | 512 | 1.342 / 5.845 / 6.579 | 5.71e-05 | 0.076 / 0.269 / 0.451 |

### topocentric, astrometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 512 | 0.978 / 2.68 / 2.944 | 1.40e-05 | 0.121 / 0.167 / 0.175 |
| Moon | 512 | 1.763 / 6.17 / 7.701 | 3.52e-05 | 0.494 / 1.196 / 1.398 |
| Mars | 512 | 1.34 / 5.842 / 6.578 | 5.71e-05 | 0.063 / 0.269 / 0.442 |

### topocentric, geometric

| body | n | position ″ | distance, max | speed ″/day |
| --- | ---: | --- | ---: | --- |
| Sun | 512 | 0.978 / 2.68 / 2.943 | 1.40e-05 | 0.121 / 0.166 / 0.175 |
| Moon | 512 | 1.764 / 6.171 / 7.7 | 3.52e-05 | 0.51 / 1.169 / 1.449 |
| Mars | 512 | 1.339 / 5.842 / 6.577 | 5.71e-05 | 0.064 / 0.269 / 0.442 |

## Against Horizons, by frame (bodies pooled)

| center, correction | frame | n | position ″ | speed ″/day |
| --- | --- | ---: | --- | --- |
| geocentric, apparent | ecliptic-icrs | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.725 / 2.102 |
| geocentric, apparent | ecliptic-j2000 | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.725 / 2.102 |
| geocentric, apparent | ecliptic-mean-of-date | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.725 / 2.102 |
| geocentric, apparent | ecliptic-true-of-date | 320 | 2.987 / 15.529 / 24.478 | 0.042 / 0.742 / 2.11 |
| geocentric, apparent | equatorial-icrs | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.731 / 2.101 |
| geocentric, apparent | equatorial-j2000 | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.731 / 2.101 |
| geocentric, apparent | equatorial-mean-of-date | 320 | 2.996 / 15.464 / 24.631 | 0.031 / 0.73 / 2.101 |
| geocentric, apparent | equatorial-true-of-date | 320 | 2.989 / 15.535 / 24.481 | 0.043 / 0.735 / 2.11 |
| geocentric, astrometric | ecliptic-icrs | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.725 / 2.102 |
| geocentric, astrometric | ecliptic-j2000 | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.725 / 2.102 |
| geocentric, astrometric | ecliptic-mean-of-date | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.725 / 2.102 |
| geocentric, astrometric | ecliptic-true-of-date | 320 | 2.862 / 15.533 / 24.443 | 0.042 / 0.739 / 2.11 |
| geocentric, astrometric | equatorial-icrs | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.727 / 2.101 |
| geocentric, astrometric | equatorial-j2000 | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.727 / 2.101 |
| geocentric, astrometric | equatorial-mean-of-date | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.726 / 2.101 |
| geocentric, astrometric | equatorial-true-of-date | 320 | 2.859 / 15.539 / 24.446 | 0.043 / 0.729 / 2.11 |
| geocentric, geometric | ecliptic-icrs | 320 | 2.875 / 15.469 / 24.596 | 0.032 / 0.733 / 2.101 |
| geocentric, geometric | ecliptic-j2000 | 320 | 2.875 / 15.469 / 24.596 | 0.032 / 0.733 / 2.101 |
| geocentric, geometric | ecliptic-mean-of-date | 320 | 2.875 / 15.469 / 24.596 | 0.032 / 0.733 / 2.101 |
| geocentric, geometric | ecliptic-true-of-date | 320 | 2.862 / 15.533 / 24.443 | 0.042 / 0.745 / 2.109 |
| geocentric, geometric | equatorial-icrs | 320 | 2.875 / 15.469 / 24.596 | 0.032 / 0.728 / 2.1 |
| geocentric, geometric | equatorial-j2000 | 320 | 2.875 / 15.469 / 24.596 | 0.032 / 0.728 / 2.1 |
| geocentric, geometric | equatorial-mean-of-date | 320 | 2.875 / 15.469 / 24.596 | 0.031 / 0.727 / 2.1 |
| geocentric, geometric | equatorial-true-of-date | 320 | 2.859 / 15.539 / 24.446 | 0.043 / 0.731 / 2.109 |
| heliocentric, apparent | ecliptic-icrs | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, apparent | ecliptic-j2000 | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, apparent | ecliptic-mean-of-date | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, apparent | ecliptic-true-of-date | 320 | 3.006 / 16.433 / 24.169 | 0.036 / 1.903 / 5.319 |
| heliocentric, apparent | equatorial-icrs | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.874 / 5.378 |
| heliocentric, apparent | equatorial-j2000 | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.874 / 5.378 |
| heliocentric, apparent | equatorial-mean-of-date | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.866 / 5.382 |
| heliocentric, apparent | equatorial-true-of-date | 320 | 3.007 / 16.43 / 24.172 | 0.037 / 1.864 / 5.379 |
| heliocentric, astrometric | ecliptic-icrs | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, astrometric | ecliptic-j2000 | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, astrometric | ecliptic-mean-of-date | 320 | 2.946 / 16.384 / 24.322 | 0.018 / 1.9 / 5.315 |
| heliocentric, astrometric | ecliptic-true-of-date | 320 | 3.006 / 16.433 / 24.169 | 0.036 / 1.903 / 5.319 |
| heliocentric, astrometric | equatorial-icrs | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.874 / 5.378 |
| heliocentric, astrometric | equatorial-j2000 | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.874 / 5.378 |
| heliocentric, astrometric | equatorial-mean-of-date | 320 | 2.946 / 16.384 / 24.322 | 0.019 / 1.866 / 5.382 |
| heliocentric, astrometric | equatorial-true-of-date | 320 | 3.007 / 16.43 / 24.172 | 0.037 / 1.864 / 5.379 |
| heliocentric, geometric | ecliptic-icrs | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.898 / 5.303 |
| heliocentric, geometric | ecliptic-j2000 | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.898 / 5.303 |
| heliocentric, geometric | ecliptic-mean-of-date | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.898 / 5.303 |
| heliocentric, geometric | ecliptic-true-of-date | 320 | 3.006 / 16.433 / 24.169 | 0.036 / 1.901 / 5.307 |
| heliocentric, geometric | equatorial-icrs | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.882 / 5.366 |
| heliocentric, geometric | equatorial-j2000 | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.882 / 5.366 |
| heliocentric, geometric | equatorial-mean-of-date | 320 | 2.946 / 16.385 / 24.322 | 0.019 / 1.874 / 5.369 |
| heliocentric, geometric | equatorial-true-of-date | 320 | 3.007 / 16.43 / 24.172 | 0.037 / 1.872 / 5.367 |
| barycentric, apparent | ecliptic-icrs | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, apparent | ecliptic-j2000 | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, apparent | ecliptic-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, apparent | ecliptic-true-of-date | 352 | 3.694 / 75.833 / 519 | 0.042 / 2.352 / 12.714 |
| barycentric, apparent | equatorial-icrs | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.309 / 12.37 |
| barycentric, apparent | equatorial-j2000 | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.309 / 12.37 |
| barycentric, apparent | equatorial-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.308 / 12.376 |
| barycentric, apparent | equatorial-true-of-date | 352 | 3.694 / 75.833 / 519 | 0.042 / 2.308 / 12.376 |
| barycentric, astrometric | ecliptic-icrs | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, astrometric | ecliptic-j2000 | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, astrometric | ecliptic-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.339 / 12.714 |
| barycentric, astrometric | ecliptic-true-of-date | 352 | 3.694 / 75.833 / 519 | 0.042 / 2.352 / 12.714 |
| barycentric, astrometric | equatorial-icrs | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.309 / 12.37 |
| barycentric, astrometric | equatorial-j2000 | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.309 / 12.37 |
| barycentric, astrometric | equatorial-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.03 / 2.308 / 12.376 |
| barycentric, astrometric | equatorial-true-of-date | 352 | 3.694 / 75.833 / 519 | 0.042 / 2.308 / 12.376 |
| barycentric, geometric | ecliptic-icrs | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.338 / 12.713 |
| barycentric, geometric | ecliptic-j2000 | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.338 / 12.713 |
| barycentric, geometric | ecliptic-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.029 / 2.338 / 12.713 |
| barycentric, geometric | ecliptic-true-of-date | 352 | 3.694 / 75.833 / 519 | 0.042 / 2.35 / 12.713 |
| barycentric, geometric | equatorial-icrs | 352 | 3.644 / 75.787 / 519 | 0.031 / 2.308 / 12.37 |
| barycentric, geometric | equatorial-j2000 | 352 | 3.644 / 75.787 / 519 | 0.031 / 2.308 / 12.37 |
| barycentric, geometric | equatorial-mean-of-date | 352 | 3.644 / 75.787 / 519 | 0.031 / 2.308 / 12.376 |
| barycentric, geometric | equatorial-true-of-date | 352 | 3.693 / 75.832 / 519 | 0.042 / 2.308 / 12.376 |
| topocentric, apparent | ecliptic-icrs | 192 | 1.291 / 5.598 / 7.7 | 0.139 / 0.826 / 1.394 |
| topocentric, apparent | ecliptic-j2000 | 192 | 1.291 / 5.598 / 7.7 | 0.139 / 0.826 / 1.394 |
| topocentric, apparent | ecliptic-mean-of-date | 192 | 1.291 / 5.598 / 7.7 | 0.139 / 0.826 / 1.394 |
| topocentric, apparent | ecliptic-true-of-date | 192 | 1.319 / 5.668 / 7.64 | 0.136 / 0.821 / 1.354 |
| topocentric, apparent | equatorial-icrs | 192 | 1.291 / 5.598 / 7.7 | 0.136 / 0.988 / 1.385 |
| topocentric, apparent | equatorial-j2000 | 192 | 1.291 / 5.598 / 7.7 | 0.136 / 0.988 / 1.385 |
| topocentric, apparent | equatorial-mean-of-date | 192 | 1.291 / 5.598 / 7.7 | 0.136 / 0.982 / 1.372 |
| topocentric, apparent | equatorial-true-of-date | 192 | 1.321 / 5.67 / 7.636 | 0.137 / 0.953 / 1.383 |
| topocentric, astrometric | ecliptic-icrs | 192 | 1.289 / 5.597 / 7.701 | 0.133 / 0.825 / 1.398 |
| topocentric, astrometric | ecliptic-j2000 | 192 | 1.289 / 5.597 / 7.701 | 0.133 / 0.825 / 1.398 |
| topocentric, astrometric | ecliptic-mean-of-date | 192 | 1.289 / 5.597 / 7.701 | 0.133 / 0.825 / 1.398 |
| topocentric, astrometric | ecliptic-true-of-date | 192 | 1.323 / 5.667 / 7.641 | 0.135 / 0.821 / 1.357 |
| topocentric, astrometric | equatorial-icrs | 192 | 1.289 / 5.597 / 7.701 | 0.132 / 0.985 / 1.39 |
| topocentric, astrometric | equatorial-j2000 | 192 | 1.289 / 5.597 / 7.701 | 0.132 / 0.985 / 1.39 |
| topocentric, astrometric | equatorial-mean-of-date | 192 | 1.289 / 5.597 / 7.701 | 0.132 / 0.981 / 1.377 |
| topocentric, astrometric | equatorial-true-of-date | 192 | 1.325 / 5.668 / 7.637 | 0.132 / 0.953 / 1.387 |
| topocentric, geometric | ecliptic-icrs | 192 | 1.289 / 5.597 / 7.7 | 0.132 / 0.842 / 1.301 |
| topocentric, geometric | ecliptic-j2000 | 192 | 1.289 / 5.597 / 7.7 | 0.132 / 0.842 / 1.301 |
| topocentric, geometric | ecliptic-mean-of-date | 192 | 1.289 / 5.597 / 7.7 | 0.132 / 0.842 / 1.301 |
| topocentric, geometric | ecliptic-true-of-date | 192 | 1.323 / 5.667 / 7.64 | 0.135 / 0.833 / 1.26 |
| topocentric, geometric | equatorial-icrs | 192 | 1.289 / 5.597 / 7.7 | 0.131 / 0.986 / 1.449 |
| topocentric, geometric | equatorial-j2000 | 192 | 1.289 / 5.597 / 7.7 | 0.131 / 0.986 / 1.449 |
| topocentric, geometric | equatorial-mean-of-date | 192 | 1.289 / 5.597 / 7.7 | 0.132 / 0.986 / 1.436 |
| topocentric, geometric | equatorial-true-of-date | 192 | 1.325 / 5.668 / 7.636 | 0.135 / 0.954 / 1.447 |

## Per case: longitude and latitude components, two frames

Arcseconds, median / 95th / max: the longitude (right ascension) difference times the cosine of the latitude (declination), and the latitude (declination) difference, in the true ecliptic of date and the ICRS equator; summary.json has all eight frames. The geocentric apparent Moon is listed against Horizons's apparent (LTS) and geometric (NONE) Moon.

| center | correction | body | arbiter | frame | lon·cos lat ″ | lat ″ |
| --- | --- | --- | --- | --- | --- | --- |
| geo | geometric | Sun | NONE | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| geo | geometric | Sun | NONE | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| geo | geometric | Moon | NONE | ecliptic-true-of-date | 1.674 / 6.148 / 7.523 | 0.285 / 1.09 / 1.386 |
| geo | geometric | Moon | NONE | equatorial-icrs | 1.543 / 5.85 / 7.393 | 0.699 / 1.577 / 1.96 |
| geo | geometric | Mercury | NONE | ecliptic-true-of-date | 1.532 / 5.819 / 7.075 | 1.515 / 6.656 / 8.218 |
| geo | geometric | Mercury | NONE | equatorial-icrs | 1.569 / 6.034 / 7.708 | 1.632 / 6.054 / 8.325 |
| geo | geometric | Venus | NONE | ecliptic-true-of-date | 1.169 / 3.552 / 7.927 | 0.924 / 3.487 / 9.798 |
| geo | geometric | Venus | NONE | equatorial-icrs | 1.07 / 4.494 / 7.798 | 0.863 / 3.913 / 8.241 |
| geo | geometric | Mars | NONE | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.867 / 6.122 |
| geo | geometric | Mars | NONE | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.387 |
| geo | geometric | Jupiter | NONE | ecliptic-true-of-date | 1.808 / 4.353 / 4.502 | 1.849 / 8.323 / 12.632 |
| geo | geometric | Jupiter | NONE | equatorial-icrs | 2.082 / 4.046 / 4.756 | 1.75 / 8.763 / 12.349 |
| geo | geometric | Saturn | NONE | ecliptic-true-of-date | 2.035 / 8.08 / 9.252 | 5.815 / 14.501 / 15.771 |
| geo | geometric | Saturn | NONE | equatorial-icrs | 2.435 / 9.959 / 10.745 | 4.251 / 13.814 / 14.978 |
| geo | geometric | Uranus | NONE | ecliptic-true-of-date | 2.695 / 6.343 / 11.098 | 4.745 / 12.9 / 18.668 |
| geo | geometric | Uranus | NONE | equatorial-icrs | 2.372 / 7.781 / 10.732 | 4.836 / 12.023 / 19.093 |
| geo | geometric | Neptune | NONE | ecliptic-true-of-date | 9.541 / 17.674 / 18.243 | 3.641 / 10.056 / 10.947 |
| geo | geometric | Neptune | NONE | equatorial-icrs | 7.484 / 16.415 / 17.563 | 4.161 / 14.779 / 15.166 |
| geo | geometric | Pluto | NONE | ecliptic-true-of-date | 5.828 / 18.784 / 23.294 | 0.818 / 5.814 / 7.405 |
| geo | geometric | Pluto | NONE | equatorial-icrs | 5.621 / 19.107 / 24.559 | 1.846 / 4.287 / 4.561 |
| geo | astrometric | Sun | LT | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| geo | astrometric | Sun | LT | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| geo | astrometric | Moon | LT | ecliptic-true-of-date | 1.673 / 6.148 / 7.524 | 0.285 / 1.089 / 1.386 |
| geo | astrometric | Moon | LT | equatorial-icrs | 1.543 / 5.85 / 7.394 | 0.698 / 1.577 / 1.961 |
| geo | astrometric | Mercury | LT | ecliptic-true-of-date | 1.53 / 5.821 / 7.077 | 1.515 / 6.652 / 8.222 |
| geo | astrometric | Mercury | LT | equatorial-icrs | 1.565 / 6.036 / 7.71 | 1.628 / 6.05 / 8.327 |
| geo | astrometric | Venus | LT | ecliptic-true-of-date | 1.17 / 3.552 / 7.926 | 0.924 / 3.487 / 9.799 |
| geo | astrometric | Venus | LT | equatorial-icrs | 1.07 / 4.494 / 7.797 | 0.863 / 3.913 / 8.242 |
| geo | astrometric | Mars | LT | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.867 / 6.123 |
| geo | astrometric | Mars | LT | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.388 |
| geo | astrometric | Jupiter | LT | ecliptic-true-of-date | 1.807 / 4.353 / 4.502 | 1.849 / 8.323 / 12.632 |
| geo | astrometric | Jupiter | LT | equatorial-icrs | 2.082 / 4.046 / 4.757 | 1.75 / 8.762 / 12.349 |
| geo | astrometric | Saturn | LT | ecliptic-true-of-date | 2.034 / 8.079 / 9.252 | 5.814 / 14.501 / 15.771 |
| geo | astrometric | Saturn | LT | equatorial-icrs | 2.434 / 9.958 / 10.745 | 4.251 / 13.814 / 14.978 |
| geo | astrometric | Uranus | LT | ecliptic-true-of-date | 2.696 / 6.343 / 11.098 | 4.745 / 12.9 / 18.668 |
| geo | astrometric | Uranus | LT | equatorial-icrs | 2.372 / 7.782 / 10.732 | 4.836 / 12.024 / 19.094 |
| geo | astrometric | Neptune | LT | ecliptic-true-of-date | 9.541 / 17.674 / 18.244 | 3.641 / 10.056 / 10.947 |
| geo | astrometric | Neptune | LT | equatorial-icrs | 7.484 / 16.415 / 17.564 | 4.161 / 14.779 / 15.166 |
| geo | astrometric | Pluto | LT | ecliptic-true-of-date | 5.828 / 18.784 / 23.294 | 0.818 / 5.814 / 7.405 |
| geo | astrometric | Pluto | LT | equatorial-icrs | 5.622 / 19.107 / 24.559 | 1.846 / 4.287 / 4.561 |
| geo | apparent | Sun | LTS | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| geo | apparent | Sun | LTS | equatorial-icrs | 0.573 / 1.24 / 1.889 | 0.658 / 2.263 / 2.924 |
| geo | apparent | Moon | LTS | ecliptic-true-of-date | 1.548 / 6.849 / 8.227 | 0.278 / 1.151 / 1.446 |
| geo | apparent | Moon | LTS | equatorial-icrs | 1.544 / 6.539 / 8.069 | 0.551 / 1.818 / 2.143 |
| geo | apparent | Moon | NONE | ecliptic-true-of-date | 1.674 / 6.148 / 7.523 | 0.285 / 1.09 / 1.386 |
| geo | apparent | Moon | NONE | equatorial-icrs | 1.543 / 5.85 / 7.393 | 0.699 / 1.577 / 1.96 |
| geo | apparent | Mercury | LTS | ecliptic-true-of-date | 1.53 / 5.82 / 7.077 | 1.515 / 6.652 / 8.222 |
| geo | apparent | Mercury | LTS | equatorial-icrs | 1.566 / 6.036 / 7.71 | 1.628 / 6.05 / 8.326 |
| geo | apparent | Venus | LTS | ecliptic-true-of-date | 1.169 / 3.551 / 7.928 | 0.925 / 3.487 / 9.799 |
| geo | apparent | Venus | LTS | equatorial-icrs | 1.071 / 4.494 / 7.799 | 0.863 / 3.913 / 8.242 |
| geo | apparent | Mars | LTS | ecliptic-true-of-date | 0.812 / 3.913 / 5.365 | 1.006 / 4.867 / 6.122 |
| geo | apparent | Mars | LTS | equatorial-icrs | 0.953 / 4.641 / 4.973 | 0.819 / 4.058 / 6.388 |
| geo | apparent | Jupiter | LTS | ecliptic-true-of-date | 1.806 / 4.351 / 4.508 | 1.849 / 8.323 / 12.632 |
| geo | apparent | Jupiter | LTS | equatorial-icrs | 2.081 / 4.047 / 4.763 | 1.75 / 8.763 / 12.351 |
| geo | apparent | Saturn | LTS | ecliptic-true-of-date | 2.04 / 8.077 / 9.261 | 5.815 / 14.501 / 15.771 |
| geo | apparent | Saturn | LTS | equatorial-icrs | 2.434 / 9.956 / 10.753 | 4.252 / 13.813 / 14.979 |
| geo | apparent | Uranus | LTS | ecliptic-true-of-date | 2.695 / 6.342 / 11.085 | 4.745 / 12.9 / 18.669 |
| geo | apparent | Uranus | LTS | equatorial-icrs | 2.369 / 7.778 / 10.726 | 4.84 / 12.023 / 19.093 |
| geo | apparent | Neptune | LTS | ecliptic-true-of-date | 9.569 / 17.699 / 18.264 | 3.641 / 10.058 / 10.946 |
| geo | apparent | Neptune | LTS | equatorial-icrs | 7.502 / 16.414 / 17.59 | 4.154 / 14.777 / 15.176 |
| geo | apparent | Pluto | LTS | ecliptic-true-of-date | 5.826 / 18.763 / 23.331 | 0.818 / 5.816 / 7.404 |
| geo | apparent | Pluto | LTS | equatorial-icrs | 5.591 / 19.084 / 24.595 | 1.844 / 4.295 / 4.562 |
| helio | geometric | Moon | NONE | ecliptic-true-of-date | 0.506 / 1.078 / 1.901 | 0.545 / 2.534 / 2.857 |
| helio | geometric | Moon | NONE | equatorial-icrs | 0.564 / 1.256 / 1.892 | 0.661 / 2.261 / 2.919 |
| helio | geometric | Earth | NONE | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| helio | geometric | Earth | NONE | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| helio | geometric | Mercury | NONE | ecliptic-true-of-date | 3.797 / 14.786 / 20.884 | 3.93 / 10.922 / 22.371 |
| helio | geometric | Mercury | NONE | equatorial-icrs | 2.872 / 12.433 / 19.399 | 5.377 / 13.756 / 22.38 |
| helio | geometric | Venus | NONE | ecliptic-true-of-date | 1.362 / 4.859 / 6.537 | 1.417 / 3.117 / 3.975 |
| helio | geometric | Venus | NONE | equatorial-icrs | 1.521 / 4.757 / 6.559 | 0.978 / 3.228 / 3.773 |
| helio | geometric | Mars | NONE | ecliptic-true-of-date | 0.905 / 2.096 / 2.521 | 0.751 / 2.997 / 4.175 |
| helio | geometric | Mars | NONE | equatorial-icrs | 0.888 / 2.2 / 2.728 | 0.864 / 2.695 / 3.646 |
| helio | geometric | Jupiter | NONE | ecliptic-true-of-date | 2.031 / 4.213 / 4.978 | 1.981 / 8.486 / 12.686 |
| helio | geometric | Jupiter | NONE | equatorial-icrs | 2.425 / 4.173 / 4.848 | 1.55 / 8.463 / 12.587 |
| helio | geometric | Saturn | NONE | ecliptic-true-of-date | 2.147 / 7.754 / 9.513 | 5.695 / 14.758 / 16.282 |
| helio | geometric | Saturn | NONE | equatorial-icrs | 2.615 / 9.261 / 11.016 | 4.133 / 13.874 / 16.561 |
| helio | geometric | Uranus | NONE | ecliptic-true-of-date | 2.719 / 6.015 / 11.601 | 4.639 / 12.788 / 17.796 |
| helio | geometric | Uranus | NONE | equatorial-icrs | 2.393 / 7.771 / 10.174 | 4.795 / 12.072 / 18.235 |
| helio | geometric | Neptune | NONE | ecliptic-true-of-date | 9.407 / 17.434 / 18.202 | 3.605 / 9.839 / 11.026 |
| helio | geometric | Neptune | NONE | equatorial-icrs | 7.473 / 16.491 / 17.172 | 4.111 / 14.674 / 14.832 |
| helio | geometric | Pluto | NONE | ecliptic-true-of-date | 5.828 / 18.765 / 23 | 0.847 / 5.932 / 7.426 |
| helio | geometric | Pluto | NONE | equatorial-icrs | 5.696 / 19.115 / 24.266 | 1.899 / 4.421 / 4.604 |
| helio | astrometric | Moon | LT | ecliptic-true-of-date | 0.506 / 1.079 / 1.901 | 0.545 / 2.535 / 2.856 |
| helio | astrometric | Moon | LT | equatorial-icrs | 0.564 / 1.255 / 1.892 | 0.661 / 2.261 / 2.919 |
| helio | astrometric | Earth | LT | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| helio | astrometric | Earth | LT | equatorial-icrs | 0.573 / 1.24 / 1.889 | 0.658 / 2.263 / 2.924 |
| helio | astrometric | Mercury | LT | ecliptic-true-of-date | 3.799 / 14.784 / 20.885 | 3.933 / 10.92 / 22.375 |
| helio | astrometric | Mercury | LT | equatorial-icrs | 2.875 / 12.431 / 19.401 | 5.377 / 13.752 / 22.384 |
| helio | astrometric | Venus | LT | ecliptic-true-of-date | 1.362 / 4.859 / 6.537 | 1.417 / 3.118 / 3.975 |
| helio | astrometric | Venus | LT | equatorial-icrs | 1.521 / 4.757 / 6.559 | 0.978 / 3.228 / 3.773 |
| helio | astrometric | Mars | LT | ecliptic-true-of-date | 0.905 / 2.096 / 2.521 | 0.751 / 2.997 / 4.175 |
| helio | astrometric | Mars | LT | equatorial-icrs | 0.888 / 2.2 / 2.728 | 0.864 / 2.695 / 3.646 |
| helio | astrometric | Jupiter | LT | ecliptic-true-of-date | 2.031 / 4.213 / 4.978 | 1.981 / 8.486 / 12.686 |
| helio | astrometric | Jupiter | LT | equatorial-icrs | 2.425 / 4.173 / 4.848 | 1.55 / 8.463 / 12.587 |
| helio | astrometric | Saturn | LT | ecliptic-true-of-date | 2.146 / 7.754 / 9.513 | 5.696 / 14.758 / 16.282 |
| helio | astrometric | Saturn | LT | equatorial-icrs | 2.615 / 9.26 / 11.015 | 4.133 / 13.873 / 16.561 |
| helio | astrometric | Uranus | LT | ecliptic-true-of-date | 2.72 / 6.015 / 11.601 | 4.639 / 12.788 / 17.796 |
| helio | astrometric | Uranus | LT | equatorial-icrs | 2.393 / 7.771 / 10.174 | 4.795 / 12.073 / 18.235 |
| helio | astrometric | Neptune | LT | ecliptic-true-of-date | 9.407 / 17.435 / 18.201 | 3.605 / 9.839 / 11.026 |
| helio | astrometric | Neptune | LT | equatorial-icrs | 7.472 / 16.491 / 17.172 | 4.111 / 14.674 / 14.832 |
| helio | astrometric | Pluto | LT | ecliptic-true-of-date | 5.828 / 18.765 / 23 | 0.847 / 5.932 / 7.426 |
| helio | astrometric | Pluto | LT | equatorial-icrs | 5.696 / 19.115 / 24.266 | 1.899 / 4.421 / 4.604 |
| helio | apparent | Moon | LTS | ecliptic-true-of-date | 0.506 / 1.079 / 1.901 | 0.545 / 2.535 / 2.856 |
| helio | apparent | Moon | LTS | equatorial-icrs | 0.564 / 1.255 / 1.892 | 0.661 / 2.261 / 2.919 |
| helio | apparent | Earth | LTS | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| helio | apparent | Earth | LTS | equatorial-icrs | 0.573 / 1.24 / 1.889 | 0.658 / 2.263 / 2.924 |
| helio | apparent | Mercury | LTS | ecliptic-true-of-date | 3.799 / 14.784 / 20.885 | 3.933 / 10.92 / 22.375 |
| helio | apparent | Mercury | LTS | equatorial-icrs | 2.875 / 12.431 / 19.401 | 5.377 / 13.752 / 22.384 |
| helio | apparent | Venus | LTS | ecliptic-true-of-date | 1.362 / 4.859 / 6.537 | 1.417 / 3.118 / 3.975 |
| helio | apparent | Venus | LTS | equatorial-icrs | 1.521 / 4.757 / 6.559 | 0.978 / 3.228 / 3.773 |
| helio | apparent | Mars | LTS | ecliptic-true-of-date | 0.905 / 2.096 / 2.521 | 0.751 / 2.997 / 4.175 |
| helio | apparent | Mars | LTS | equatorial-icrs | 0.888 / 2.2 / 2.727 | 0.864 / 2.695 / 3.646 |
| helio | apparent | Jupiter | LTS | ecliptic-true-of-date | 2.031 / 4.213 / 4.978 | 1.981 / 8.486 / 12.686 |
| helio | apparent | Jupiter | LTS | equatorial-icrs | 2.425 / 4.173 / 4.848 | 1.55 / 8.463 / 12.587 |
| helio | apparent | Saturn | LTS | ecliptic-true-of-date | 2.146 / 7.753 / 9.513 | 5.696 / 14.758 / 16.282 |
| helio | apparent | Saturn | LTS | equatorial-icrs | 2.615 / 9.26 / 11.015 | 4.133 / 13.873 / 16.561 |
| helio | apparent | Uranus | LTS | ecliptic-true-of-date | 2.72 / 6.015 / 11.601 | 4.639 / 12.788 / 17.796 |
| helio | apparent | Uranus | LTS | equatorial-icrs | 2.393 / 7.771 / 10.174 | 4.795 / 12.073 / 18.235 |
| helio | apparent | Neptune | LTS | ecliptic-true-of-date | 9.407 / 17.435 / 18.201 | 3.605 / 9.839 / 11.026 |
| helio | apparent | Neptune | LTS | equatorial-icrs | 7.472 / 16.491 / 17.172 | 4.111 / 14.674 / 14.832 |
| helio | apparent | Pluto | LTS | ecliptic-true-of-date | 5.828 / 18.765 / 23 | 0.847 / 5.932 / 7.426 |
| helio | apparent | Pluto | LTS | equatorial-icrs | 5.696 / 19.115 / 24.266 | 1.899 / 4.421 / 4.604 |
| bary | geometric | Sun | NONE | ecliptic-true-of-date | 86.075 / 340 / 500 | 11.045 / 42.218 / 139 |
| bary | geometric | Sun | NONE | equatorial-icrs | 75.677 / 339 / 462 | 17.712 / 79.564 / 237 |
| bary | geometric | Moon | NONE | ecliptic-true-of-date | 0.601 / 1.376 / 1.775 | 0.511 / 2.412 / 2.672 |
| bary | geometric | Moon | NONE | equatorial-icrs | 0.716 / 1.34 / 1.755 | 0.595 / 2.442 / 2.916 |
| bary | geometric | Earth | NONE | ecliptic-true-of-date | 0.601 / 1.374 / 1.772 | 0.513 / 2.413 / 2.674 |
| bary | geometric | Earth | NONE | equatorial-icrs | 0.718 / 1.331 / 1.752 | 0.596 / 2.443 / 2.923 |
| bary | geometric | Mercury | NONE | ecliptic-true-of-date | 3.366 / 14.332 / 16.983 | 3.847 / 10.692 / 22.777 |
| bary | geometric | Mercury | NONE | equatorial-icrs | 3.114 / 12.354 / 15.793 | 5.597 / 13.048 / 22.801 |
| bary | geometric | Venus | NONE | ecliptic-true-of-date | 1.242 / 5.109 / 7.35 | 1.513 / 3.074 / 3.897 |
| bary | geometric | Venus | NONE | equatorial-icrs | 1.536 / 5.112 / 7.371 | 1.116 / 2.94 / 3.567 |
| bary | geometric | Mars | NONE | ecliptic-true-of-date | 0.859 / 2.624 / 3.119 | 0.782 / 3.055 / 4.281 |
| bary | geometric | Mars | NONE | equatorial-icrs | 0.824 / 2.558 / 3.034 | 0.946 / 2.938 / 3.79 |
| bary | geometric | Jupiter | NONE | ecliptic-true-of-date | 2.207 / 4.261 / 5.175 | 1.978 / 8.492 / 12.687 |
| bary | geometric | Jupiter | NONE | equatorial-icrs | 2.281 / 4.214 / 5.028 | 1.584 / 8.532 / 12.597 |
| bary | geometric | Saturn | NONE | ecliptic-true-of-date | 2.153 / 7.821 / 9.588 | 5.699 / 14.768 / 16.288 |
| bary | geometric | Saturn | NONE | equatorial-icrs | 2.563 / 9.326 / 11.085 | 4.144 / 13.871 / 16.573 |
| bary | geometric | Uranus | NONE | ecliptic-true-of-date | 2.783 / 6.02 / 11.633 | 4.637 / 12.786 / 17.799 |
| bary | geometric | Uranus | NONE | equatorial-icrs | 2.376 / 7.796 / 10.159 | 4.805 / 12.06 / 18.238 |
| bary | geometric | Neptune | NONE | ecliptic-true-of-date | 9.39 / 17.469 / 18.185 | 3.603 / 9.84 / 11.027 |
| bary | geometric | Neptune | NONE | equatorial-icrs | 7.465 / 16.477 / 17.195 | 4.099 / 14.672 / 14.837 |
| bary | geometric | Pluto | NONE | ecliptic-true-of-date | 5.842 / 18.749 / 23.001 | 0.849 / 5.931 / 7.425 |
| bary | geometric | Pluto | NONE | equatorial-icrs | 5.695 / 19.098 / 24.267 | 1.893 / 4.422 / 4.604 |
| bary | astrometric | Sun | LT | ecliptic-true-of-date | 86.075 / 340 / 500 | 11.045 / 42.218 / 139 |
| bary | astrometric | Sun | LT | equatorial-icrs | 75.677 / 339 / 462 | 17.712 / 79.564 / 237 |
| bary | astrometric | Moon | LT | ecliptic-true-of-date | 0.6 / 1.376 / 1.775 | 0.511 / 2.413 / 2.672 |
| bary | astrometric | Moon | LT | equatorial-icrs | 0.715 / 1.34 / 1.754 | 0.595 / 2.442 / 2.916 |
| bary | astrometric | Earth | LT | ecliptic-true-of-date | 0.6 / 1.374 / 1.772 | 0.512 / 2.413 / 2.674 |
| bary | astrometric | Earth | LT | equatorial-icrs | 0.718 / 1.331 / 1.752 | 0.596 / 2.443 / 2.923 |
| bary | astrometric | Mercury | LT | ecliptic-true-of-date | 3.366 / 14.332 / 16.984 | 3.847 / 10.69 / 22.781 |
| bary | astrometric | Mercury | LT | equatorial-icrs | 3.115 / 12.356 / 15.796 | 5.602 / 13.044 / 22.805 |
| bary | astrometric | Venus | LT | ecliptic-true-of-date | 1.242 / 5.109 / 7.35 | 1.513 / 3.074 / 3.897 |
| bary | astrometric | Venus | LT | equatorial-icrs | 1.536 / 5.112 / 7.371 | 1.116 / 2.94 / 3.567 |
| bary | astrometric | Mars | LT | ecliptic-true-of-date | 0.859 / 2.624 / 3.119 | 0.782 / 3.055 / 4.282 |
| bary | astrometric | Mars | LT | equatorial-icrs | 0.824 / 2.558 / 3.034 | 0.945 / 2.939 / 3.791 |
| bary | astrometric | Jupiter | LT | ecliptic-true-of-date | 2.207 / 4.261 / 5.175 | 1.978 / 8.491 / 12.687 |
| bary | astrometric | Jupiter | LT | equatorial-icrs | 2.281 / 4.214 / 5.028 | 1.584 / 8.532 / 12.597 |
| bary | astrometric | Saturn | LT | ecliptic-true-of-date | 2.152 / 7.821 / 9.588 | 5.699 / 14.768 / 16.288 |
| bary | astrometric | Saturn | LT | equatorial-icrs | 2.563 / 9.325 / 11.085 | 4.144 / 13.871 / 16.573 |
| bary | astrometric | Uranus | LT | ecliptic-true-of-date | 2.784 / 6.02 / 11.633 | 4.637 / 12.786 / 17.8 |
| bary | astrometric | Uranus | LT | equatorial-icrs | 2.377 / 7.796 / 10.16 | 4.805 / 12.06 / 18.238 |
| bary | astrometric | Neptune | LT | ecliptic-true-of-date | 9.39 / 17.469 / 18.185 | 3.603 / 9.84 / 11.027 |
| bary | astrometric | Neptune | LT | equatorial-icrs | 7.466 / 16.477 / 17.195 | 4.099 / 14.672 / 14.837 |
| bary | astrometric | Pluto | LT | ecliptic-true-of-date | 5.842 / 18.749 / 23.001 | 0.849 / 5.931 / 7.425 |
| bary | astrometric | Pluto | LT | equatorial-icrs | 5.695 / 19.098 / 24.267 | 1.893 / 4.422 / 4.604 |
| bary | apparent | Sun | LT | ecliptic-true-of-date | 86.075 / 340 / 500 | 11.045 / 42.218 / 139 |
| bary | apparent | Sun | LT | equatorial-icrs | 75.677 / 339 / 462 | 17.712 / 79.564 / 237 |
| bary | apparent | Moon | LT | ecliptic-true-of-date | 0.6 / 1.376 / 1.775 | 0.511 / 2.413 / 2.672 |
| bary | apparent | Moon | LT | equatorial-icrs | 0.715 / 1.34 / 1.754 | 0.595 / 2.442 / 2.916 |
| bary | apparent | Earth | LT | ecliptic-true-of-date | 0.6 / 1.374 / 1.772 | 0.512 / 2.413 / 2.674 |
| bary | apparent | Earth | LT | equatorial-icrs | 0.718 / 1.331 / 1.752 | 0.596 / 2.443 / 2.923 |
| bary | apparent | Mercury | LT | ecliptic-true-of-date | 3.366 / 14.332 / 16.984 | 3.847 / 10.69 / 22.781 |
| bary | apparent | Mercury | LT | equatorial-icrs | 3.115 / 12.356 / 15.796 | 5.602 / 13.044 / 22.805 |
| bary | apparent | Venus | LT | ecliptic-true-of-date | 1.242 / 5.109 / 7.35 | 1.513 / 3.074 / 3.897 |
| bary | apparent | Venus | LT | equatorial-icrs | 1.536 / 5.112 / 7.371 | 1.116 / 2.94 / 3.567 |
| bary | apparent | Mars | LT | ecliptic-true-of-date | 0.859 / 2.624 / 3.119 | 0.782 / 3.055 / 4.282 |
| bary | apparent | Mars | LT | equatorial-icrs | 0.824 / 2.558 / 3.034 | 0.945 / 2.939 / 3.791 |
| bary | apparent | Jupiter | LT | ecliptic-true-of-date | 2.207 / 4.261 / 5.175 | 1.978 / 8.491 / 12.687 |
| bary | apparent | Jupiter | LT | equatorial-icrs | 2.281 / 4.214 / 5.028 | 1.584 / 8.532 / 12.597 |
| bary | apparent | Saturn | LT | ecliptic-true-of-date | 2.152 / 7.821 / 9.588 | 5.699 / 14.768 / 16.288 |
| bary | apparent | Saturn | LT | equatorial-icrs | 2.563 / 9.325 / 11.085 | 4.144 / 13.871 / 16.573 |
| bary | apparent | Uranus | LT | ecliptic-true-of-date | 2.784 / 6.02 / 11.633 | 4.637 / 12.786 / 17.8 |
| bary | apparent | Uranus | LT | equatorial-icrs | 2.377 / 7.796 / 10.16 | 4.805 / 12.06 / 18.238 |
| bary | apparent | Neptune | LT | ecliptic-true-of-date | 9.39 / 17.469 / 18.185 | 3.603 / 9.84 / 11.027 |
| bary | apparent | Neptune | LT | equatorial-icrs | 7.466 / 16.477 / 17.195 | 4.099 / 14.672 / 14.837 |
| bary | apparent | Pluto | LT | ecliptic-true-of-date | 5.842 / 18.749 / 23.001 | 0.849 / 5.931 / 7.425 |
| bary | apparent | Pluto | LT | equatorial-icrs | 5.695 / 19.098 / 24.267 | 1.893 / 4.422 / 4.604 |
| topo1 | geometric | Sun | NONE | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| topo1 | geometric | Sun | NONE | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| topo1 | geometric | Moon | NONE | ecliptic-true-of-date | 1.678 / 6.193 / 7.636 | 0.304 / 1.151 / 1.373 |
| topo1 | geometric | Moon | NONE | equatorial-icrs | 1.477 / 5.909 / 7.528 | 0.745 / 1.551 / 1.895 |
| topo1 | geometric | Mars | NONE | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.866 / 6.122 |
| topo1 | geometric | Mars | NONE | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.387 |
| topo1 | apparent | Sun | LTS | ecliptic-true-of-date | 0.499 / 1.084 / 1.895 | 0.544 / 2.535 / 2.857 |
| topo1 | apparent | Sun | LTS | equatorial-icrs | 0.572 / 1.241 / 1.885 | 0.659 / 2.263 / 2.923 |
| topo1 | apparent | Moon | LTS | ecliptic-true-of-date | 1.678 / 6.193 / 7.636 | 0.305 / 1.151 / 1.373 |
| topo1 | apparent | Moon | LTS | equatorial-icrs | 1.477 / 5.91 / 7.528 | 0.745 / 1.551 / 1.895 |
| topo1 | apparent | Mars | LTS | ecliptic-true-of-date | 0.818 / 3.916 / 5.366 | 1.006 / 4.866 / 6.121 |
| topo1 | apparent | Mars | LTS | equatorial-icrs | 0.949 / 4.639 / 4.977 | 0.82 / 4.057 / 6.388 |
| topo1 | astrometric | Sun | LT | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| topo1 | astrometric | Sun | LT | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| topo1 | astrometric | Moon | LT | ecliptic-true-of-date | 1.678 / 6.193 / 7.636 | 0.305 / 1.15 / 1.372 |
| topo1 | astrometric | Moon | LT | equatorial-icrs | 1.477 / 5.909 / 7.529 | 0.745 / 1.551 / 1.896 |
| topo1 | astrometric | Mars | LT | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.867 / 6.123 |
| topo1 | astrometric | Mars | LT | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.388 |
| topo2 | geometric | Sun | NONE | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| topo2 | geometric | Sun | NONE | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| topo2 | geometric | Moon | NONE | ecliptic-true-of-date | 1.674 / 6.158 / 7.476 | 0.273 / 1.095 / 1.464 |
| topo2 | geometric | Moon | NONE | equatorial-icrs | 1.552 / 5.864 / 7.349 | 0.655 / 1.601 / 1.962 |
| topo2 | geometric | Mars | NONE | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.867 / 6.122 |
| topo2 | geometric | Mars | NONE | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.387 |
| topo2 | apparent | Sun | LTS | ecliptic-true-of-date | 0.499 / 1.083 / 1.896 | 0.546 / 2.536 / 2.856 |
| topo2 | apparent | Sun | LTS | equatorial-icrs | 0.574 / 1.241 / 1.887 | 0.659 / 2.264 / 2.923 |
| topo2 | apparent | Moon | LTS | ecliptic-true-of-date | 1.674 / 6.158 / 7.476 | 0.273 / 1.095 / 1.464 |
| topo2 | apparent | Moon | LTS | equatorial-icrs | 1.551 / 5.864 / 7.349 | 0.655 / 1.601 / 1.962 |
| topo2 | apparent | Mars | LTS | ecliptic-true-of-date | 0.817 / 3.917 / 5.362 | 1.004 / 4.867 / 6.119 |
| topo2 | apparent | Mars | LTS | equatorial-icrs | 0.956 / 4.641 / 4.978 | 0.82 / 4.058 / 6.385 |
| topo2 | astrometric | Sun | LT | ecliptic-true-of-date | 0.497 / 1.081 / 1.899 | 0.545 / 2.535 / 2.858 |
| topo2 | astrometric | Sun | LT | equatorial-icrs | 0.573 / 1.24 / 1.89 | 0.659 / 2.263 / 2.924 |
| topo2 | astrometric | Moon | LT | ecliptic-true-of-date | 1.674 / 6.158 / 7.477 | 0.273 / 1.095 / 1.463 |
| topo2 | astrometric | Moon | LT | equatorial-icrs | 1.552 / 5.864 / 7.35 | 0.654 / 1.601 / 1.963 |
| topo2 | astrometric | Mars | LT | ecliptic-true-of-date | 0.81 / 3.912 / 5.363 | 1.005 / 4.867 / 6.123 |
| topo2 | astrometric | Mars | LT | equatorial-icrs | 0.95 / 4.638 / 4.969 | 0.818 / 4.058 / 6.388 |

## The lunar points

| point | arbiter | frame | position ″ | speed ″/day |
| --- | --- | --- | --- | --- |
| North Node | osculating node of Horizons NONE 301 | ecliptic-true-of-date | 6.626 / 13.659 / 15.808 | — |
| North Node | osculating node of Horizons NONE 301 | ecliptic-mean-of-date | 6.588 / 13.571 / 15.961 | — |
| North Node | osculating node of Horizons NONE 301 | ecliptic-j2000 | 6.588 / 13.571 / 15.961 | — |
| North Node | osculating node of Horizons NONE 301 | ecliptic-icrs | 6.588 / 13.571 / 15.961 | — |
| North Node | osculating node of Horizons NONE 301 | equatorial-true-of-date | 6.626 / 13.659 / 15.808 | — |
| North Node | osculating node of Horizons NONE 301 | equatorial-mean-of-date | 6.588 / 13.571 / 15.961 | — |
| North Node | osculating node of Horizons NONE 301 | equatorial-j2000 | 6.588 / 13.571 / 15.961 | — |
| North Node | osculating node of Horizons NONE 301 | equatorial-icrs | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | ecliptic-true-of-date | 6.626 / 13.659 / 15.808 | — |
| South Node | osculating node of Horizons NONE 301 | ecliptic-mean-of-date | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | ecliptic-j2000 | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | ecliptic-icrs | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | equatorial-true-of-date | 6.626 / 13.659 / 15.808 | — |
| South Node | osculating node of Horizons NONE 301 | equatorial-mean-of-date | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | equatorial-j2000 | 6.588 / 13.571 / 15.961 | — |
| South Node | osculating node of Horizons NONE 301 | equatorial-icrs | 6.588 / 13.571 / 15.961 | — |
| Mean Node | ERFA fundamental arguments | ecliptic-true-of-date | 0.067 / 0.157 / 0.199 | 0.014 / 0.043 / 0.044 |
| Mean Node | ERFA fundamental arguments | ecliptic-mean-of-date | 3.49e-10 / 9.32e-10 / 1.15e-09 | — |
| Mean Node | ERFA fundamental arguments | ecliptic-j2000 | 1.51e-07 / 4.14e-07 / 4.97e-07 | — |
| Mean Node | ERFA fundamental arguments | ecliptic-icrs | 2.42e-07 / 5.77e-07 / 6.86e-07 | — |
| Mean Node | ERFA fundamental arguments | equatorial-true-of-date | 0.071 / 0.157 / 0.199 | — |
| Mean Node | ERFA fundamental arguments | equatorial-mean-of-date | 2.57e-10 / 8.40e-10 / 1.14e-09 | — |
| Mean Node | ERFA fundamental arguments | equatorial-j2000 | 1.51e-07 / 4.14e-07 / 4.97e-07 | — |
| Mean Node | ERFA fundamental arguments | equatorial-icrs | 2.42e-07 / 5.78e-07 / 6.86e-07 | — |
| Mean South Node | ERFA fundamental arguments | ecliptic-true-of-date | 0.067 / 0.157 / 0.199 | 0.014 / 0.043 / 0.044 |
| Mean South Node | ERFA fundamental arguments | ecliptic-mean-of-date | 3.40e-10 / 8.70e-10 / 1.10e-09 | — |
| Mean South Node | ERFA fundamental arguments | ecliptic-j2000 | 1.51e-07 / 4.14e-07 / 4.97e-07 | — |
| Mean South Node | ERFA fundamental arguments | ecliptic-icrs | 2.42e-07 / 5.77e-07 / 6.86e-07 | — |
| Mean South Node | ERFA fundamental arguments | equatorial-true-of-date | 0.071 / 0.157 / 0.199 | — |
| Mean South Node | ERFA fundamental arguments | equatorial-mean-of-date | 2.70e-10 / 7.37e-10 / 1.17e-09 | — |
| Mean South Node | ERFA fundamental arguments | equatorial-j2000 | 1.51e-07 / 4.14e-07 / 4.97e-07 | — |
| Mean South Node | ERFA fundamental arguments | equatorial-icrs | 2.42e-07 / 5.77e-07 / 6.86e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | ecliptic-true-of-date | 0.067 / 0.156 / 0.199 | 0.014 / 0.042 / 0.043 |
| Black Moon Lilith | ERFA fundamental arguments | ecliptic-mean-of-date | 7.21e-08 / 2.12e-07 / 3.62e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | ecliptic-j2000 | 1.60e-07 / 4.61e-07 / 5.63e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | ecliptic-icrs | 2.78e-07 / 4.20e-07 / 4.66e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | equatorial-true-of-date | 0.071 / 0.156 / 0.199 | — |
| Black Moon Lilith | ERFA fundamental arguments | equatorial-mean-of-date | 7.23e-08 / 2.12e-07 / 3.62e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | equatorial-j2000 | 1.60e-07 / 4.61e-07 / 5.63e-07 | — |
| Black Moon Lilith | ERFA fundamental arguments | equatorial-icrs | 2.78e-07 / 4.20e-07 / 4.66e-07 | — |

## The central difference's own error (Richardson, engine only)

| center | correction | body | largest estimate, lon rate · cos lat ″/day | lat rate ″/day |
| --- | --- | --- | ---: | ---: |
| geo | apparent | Sun | 7.78e-06 | 1.03e-08 |
| geo | apparent | Moon | 1.32e-04 | 5.24e-05 |
| geo | apparent | Mercury | 1.52e-05 | 2.27e-06 |
| geo | apparent | Venus | 1.86e-05 | 1.34e-06 |
| geo | apparent | Mars | 9.34e-06 | 1.95e-07 |
| geo | apparent | Jupiter | 3.19e-06 | 1.78e-08 |
| geo | apparent | Saturn | 1.41e-06 | 2.23e-08 |
| geo | apparent | Uranus | 9.04e-07 | 8.46e-09 |
| geo | apparent | Neptune | 4.43e-07 | 1.70e-08 |
| geo | apparent | Pluto | 1.33e-07 | 4.40e-08 |
| topo1 | apparent | Sun | 5.00e-04 | 9.91e-05 |
| topo1 | apparent | Moon | 9.41e-02 | 4.55e-02 |
| topo1 | apparent | Mars | 3.54e-04 | 1.37e-04 |
| geo | astrometric | Sun | 1.17e-05 | 1.13e-08 |
| geo | astrometric | Moon | 3.25e-03 | 2.96e-04 |
| geo | astrometric | Mercury | 1.12e-05 | 2.44e-06 |
| geo | astrometric | Venus | 4.24e-05 | 8.85e-07 |
| geo | astrometric | Mars | 1.04e-05 | 4.03e-07 |
| geo | astrometric | Jupiter | 2.32e-06 | 2.37e-08 |
| geo | astrometric | Saturn | 9.21e-07 | 2.07e-08 |
| geo | astrometric | Uranus | 3.75e-07 | 9.13e-09 |
| geo | astrometric | Neptune | 1.53e-07 | 1.14e-08 |
| geo | astrometric | Pluto | 1.19e-07 | 1.71e-08 |

The engine's geocentric Moon without its light time: 0.667″ to 0.731″, median 0.706″, over the 32 instants.

Pluto's analytic speed against the derivative of its position (fourth-order central difference, h = 0.01 day), geocentric, heliocentric and barycentric, J2000.0 and ICRS frames: at most 9.68e-04″/day (geocentric, ecliptic-icrs, JD 2392631.056397 TT).

The topocentric positions moved by UT1 − UTC, which the ΔT pins leave out after 1962: at most 0.070″ with the IERS values (Moon, JD 2451545 TT, UT1 − UTC = 0.355 s), and 0.019″ for 0.1 s after 2026.

## The bounds rule's output (src/calc-bounds.ts, which leaves out the barycentric Sun)

| center/correction/body | position ″ | distance, relative | speed ″/day |
| --- | ---: | ---: | ---: |
| barycentric/apparent/Earth | 3 | 1.4e-05 | 0.2 |
| barycentric/apparent/Jupiter | 13 | 4e-05 | 0.051 |
| barycentric/apparent/Mars | 4.4 | 2.1e-05 | 0.089 |
| barycentric/apparent/Mercury | 23 | 7.7e-05 | 5.4 |
| barycentric/apparent/Moon | 3 | 1.4e-05 | 0.2 |
| barycentric/apparent/Neptune | 21 | 4.4e-05 | 0.044 |
| barycentric/apparent/Pluto | 25 | 6.1e-05 | 0.044 |
| barycentric/apparent/Saturn | 19 | 6.5e-05 | 0.059 |
| barycentric/apparent/Sun | 520 | 0.0042 | 13 |
| barycentric/apparent/Uranus | 19 | 4.3e-05 | 0.043 |
| barycentric/apparent/Venus | 7.5 | 1.5e-05 | 0.24 |
| barycentric/astrometric/Earth | 3 | 1.4e-05 | 0.2 |
| barycentric/astrometric/Jupiter | 13 | 4e-05 | 0.051 |
| barycentric/astrometric/Mars | 4.4 | 2.1e-05 | 0.089 |
| barycentric/astrometric/Mercury | 23 | 7.7e-05 | 5.4 |
| barycentric/astrometric/Moon | 3 | 1.4e-05 | 0.2 |
| barycentric/astrometric/Neptune | 21 | 4.4e-05 | 0.044 |
| barycentric/astrometric/Pluto | 25 | 6.1e-05 | 0.044 |
| barycentric/astrometric/Saturn | 19 | 6.5e-05 | 0.059 |
| barycentric/astrometric/Sun | 520 | 0.0042 | 13 |
| barycentric/astrometric/Uranus | 19 | 4.3e-05 | 0.043 |
| barycentric/astrometric/Venus | 7.5 | 1.5e-05 | 0.24 |
| barycentric/geometric/Earth | 3 | 1.4e-05 | 0.19 |
| barycentric/geometric/Jupiter | 13 | 4e-05 | 0.051 |
| barycentric/geometric/Mars | 4.4 | 2.1e-05 | 0.089 |
| barycentric/geometric/Mercury | 23 | 7.7e-05 | 5.4 |
| barycentric/geometric/Moon | 3 | 1.4e-05 | 0.2 |
| barycentric/geometric/Neptune | 21 | 4.4e-05 | 0.044 |
| barycentric/geometric/Pluto | 25 | 6.1e-05 | 0.044 |
| barycentric/geometric/Saturn | 19 | 6.5e-05 | 0.059 |
| barycentric/geometric/Sun | 520 | 0.0042 | 13 |
| barycentric/geometric/Uranus | 19 | 4.3e-05 | 0.043 |
| barycentric/geometric/Venus | 7.5 | 1.5e-05 | 0.24 |
| geocentric/apparent/Black Moon Lilith | 0.2 | — | 0.044 |
| geocentric/apparent/Jupiter | 13 | 4.7e-05 | 0.082 |
| geocentric/apparent/Mars | 6.6 | 5.8e-05 | 0.45 |
| geocentric/apparent/Mean Node | 0.2 | — | 0.044 |
| geocentric/apparent/Mean South Node | 0.2 | — | 0.044 |
| geocentric/apparent/Mercury | 9.4 | 3.6e-05 | 2.2 |
| geocentric/apparent/Moon | 8.3 | 0.00014 | 1.1 |
| geocentric/apparent/Neptune | 21 | 4.2e-05 | 0.051 |
| geocentric/apparent/North Node | 16 | — | — |
| geocentric/apparent/Pluto | 25 | 6.3e-05 | 0.045 |
| geocentric/apparent/Saturn | 18 | 6.8e-05 | 0.05 |
| geocentric/apparent/South Node | 16 | — | — |
| geocentric/apparent/Sun | 3 | 1.5e-05 | 0.18 |
| geocentric/apparent/Uranus | 20 | 4.2e-05 | 0.044 |
| geocentric/apparent/Venus | 11 | 3.2e-05 | 0.64 |
| geocentric/astrometric/Jupiter | 13 | 4.7e-05 | 0.082 |
| geocentric/astrometric/Mars | 6.6 | 5.8e-05 | 0.45 |
| geocentric/astrometric/Mercury | 9.4 | 3.6e-05 | 2.2 |
| geocentric/astrometric/Moon | 7.6 | 3.6e-05 | 1.1 |
| geocentric/astrometric/Neptune | 21 | 4.2e-05 | 0.051 |
| geocentric/astrometric/Pluto | 25 | 6.3e-05 | 0.046 |
| geocentric/astrometric/Saturn | 18 | 6.8e-05 | 0.05 |
| geocentric/astrometric/Sun | 3 | 1.5e-05 | 0.18 |
| geocentric/astrometric/Uranus | 20 | 4.2e-05 | 0.044 |
| geocentric/astrometric/Venus | 11 | 3.2e-05 | 0.64 |
| geocentric/geometric/Jupiter | 13 | 4.7e-05 | 0.082 |
| geocentric/geometric/Mars | 6.6 | 5.8e-05 | 0.45 |
| geocentric/geometric/Mercury | 9.4 | 3.6e-05 | 2.2 |
| geocentric/geometric/Moon | 7.6 | 3.6e-05 | 0.98 |
| geocentric/geometric/Neptune | 21 | 4.2e-05 | 0.051 |
| geocentric/geometric/Pluto | 25 | 6.3e-05 | 0.046 |
| geocentric/geometric/Saturn | 18 | 6.8e-05 | 0.049 |
| geocentric/geometric/Sun | 3 | 1.5e-05 | 0.18 |
| geocentric/geometric/Uranus | 20 | 4.2e-05 | 0.044 |
| geocentric/geometric/Venus | 11 | 3.2e-05 | 0.64 |
| heliocentric/apparent/Earth | 3 | 1.5e-05 | 0.18 |
| heliocentric/apparent/Jupiter | 13 | 4e-05 | 0.053 |
| heliocentric/apparent/Mars | 4.3 | 2.3e-05 | 0.088 |
| heliocentric/apparent/Mercury | 23 | 8.7e-05 | 5.4 |
| heliocentric/apparent/Moon | 3 | 1.5e-05 | 0.18 |
| heliocentric/apparent/Neptune | 21 | 4.4e-05 | 0.044 |
| heliocentric/apparent/Pluto | 25 | 6e-05 | 0.044 |
| heliocentric/apparent/Saturn | 18 | 6.5e-05 | 0.058 |
| heliocentric/apparent/Uranus | 19 | 4.2e-05 | 0.043 |
| heliocentric/apparent/Venus | 6.7 | 1.2e-05 | 0.24 |
| heliocentric/astrometric/Earth | 3 | 1.5e-05 | 0.18 |
| heliocentric/astrometric/Jupiter | 13 | 4e-05 | 0.053 |
| heliocentric/astrometric/Mars | 4.3 | 2.3e-05 | 0.088 |
| heliocentric/astrometric/Mercury | 23 | 8.7e-05 | 5.4 |
| heliocentric/astrometric/Moon | 3 | 1.5e-05 | 0.18 |
| heliocentric/astrometric/Neptune | 21 | 4.4e-05 | 0.044 |
| heliocentric/astrometric/Pluto | 25 | 6e-05 | 0.044 |
| heliocentric/astrometric/Saturn | 18 | 6.5e-05 | 0.058 |
| heliocentric/astrometric/Uranus | 19 | 4.2e-05 | 0.043 |
| heliocentric/astrometric/Venus | 6.7 | 1.2e-05 | 0.24 |
| heliocentric/geometric/Earth | 3 | 1.5e-05 | 0.18 |
| heliocentric/geometric/Jupiter | 13 | 4e-05 | 0.054 |
| heliocentric/geometric/Mars | 4.3 | 2.3e-05 | 0.087 |
| heliocentric/geometric/Mercury | 23 | 8.7e-05 | 5.4 |
| heliocentric/geometric/Moon | 3 | 1.5e-05 | 0.18 |
| heliocentric/geometric/Neptune | 21 | 4.4e-05 | 0.044 |
| heliocentric/geometric/Pluto | 25 | 6e-05 | 0.044 |
| heliocentric/geometric/Saturn | 18 | 6.5e-05 | 0.058 |
| heliocentric/geometric/Uranus | 19 | 4.2e-05 | 0.043 |
| heliocentric/geometric/Venus | 6.7 | 1.2e-05 | 0.23 |
| topocentric/apparent/Mars | 6.6 | 5.8e-05 | 0.46 |
| topocentric/apparent/Moon | 7.8 | 3.6e-05 | 1.4 |
| topocentric/apparent/Sun | 3 | 1.5e-05 | 0.21 |
| topocentric/astrometric/Mars | 6.6 | 5.8e-05 | 0.45 |
| topocentric/astrometric/Moon | 7.8 | 3.6e-05 | 1.4 |
| topocentric/astrometric/Sun | 3 | 1.5e-05 | 0.18 |
| topocentric/geometric/Mars | 6.6 | 5.8e-05 | 0.45 |
| topocentric/geometric/Moon | 7.8 | 3.6e-05 | 1.5 |
| topocentric/geometric/Sun | 3 | 1.5e-05 | 0.18 |
