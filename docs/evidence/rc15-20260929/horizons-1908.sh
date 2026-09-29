#!/bin/sh
# JPL Horizons observer ecliptic longitude and latitude (QUANTITIES 31,
# geocentric) of the Sun, Moon and Mars for src/engine.test.ts, at a synthetic
# instant, 1908-02-11 09:23 UT, which replaces a real person's birth there.
# A second query, of that birth, is dropped: the repository does not carry it.
#
#   sh horizons-1908.sh > horizons-1908.txt
set -eu
query() {
  curl -sS -G "https://ssd.jpl.nasa.gov/api/horizons.api" \
    --data-urlencode "format=text" \
    --data-urlencode "COMMAND='$1'" \
    --data-urlencode "OBJ_DATA='NO'" \
    --data-urlencode "MAKE_EPHEM='YES'" \
    --data-urlencode "EPHEM_TYPE='OBSERVER'" \
    --data-urlencode "CENTER='500@399'" \
    --data-urlencode "START_TIME='$2'" \
    --data-urlencode "STOP_TIME='$3'" \
    --data-urlencode "STEP_SIZE='1m'" \
    --data-urlencode "QUANTITIES='31'" |
    awk '/Target body name|Start time|\$\$SOE/{print} /\$\$SOE/{rows=1; next} /\$\$EOE/{rows=0; print} rows{print}'
}
for body in 10 301 499; do query "$body" "1908-02-11 09:23" "1908-02-11 09:24"; done
