#!/usr/bin/env python3
"""For each sign change the engine finds for Neptune and Pluto (results/engine.json),
find the same sign change on NASA JPL Horizons and report the difference in time.

Horizons: OBSERVER table, geocentric (500@399), QUANTITIES 31 (apparent ecliptic
longitude and latitude of date), targets 8 and 9 (system barycentres), TIME_TYPE TT,
so that neither side's UT1 or Delta T enters: the engine's instant is compared as TT.

usage: python3 horizons_check.py results/engine.json results/horizons.json
Standard library only. Responses are not kept; each one's SHA-256 is recorded.
"""
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
TARGET = {"Neptune": "8", "Pluto": "9"}


def fetch(target, jd0, jd1, step):
    params = {
        "format": "text", "COMMAND": f"'{target}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
        "START_TIME": f"'JD {jd0:.6f}'", "STOP_TIME": f"'JD {jd1:.6f}'", "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'31'", "TIME_TYPE": "'TT'", "CAL_FORMAT": "'JD'", "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                body = response.read()
            text = body.decode("utf-8")
            if "$$SOE" in text:
                break
        except Exception as error:  # network trouble: wait and retry
            text = str(error)
        time.sleep(3 + 3 * attempt)
    else:
        raise RuntimeError(f"Horizons gave no table: {text[:300]}")
    if "{source: DE441}" not in text:
        raise RuntimeError("not DE441")
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        rows.append((float(parts[0]), float(parts[3])))
    return rows, url, hashlib.sha256(body).hexdigest()


def wrapped(lon, boundary):
    return (lon - boundary + 180.0) % 360.0 - 180.0


def crossings(rows, boundary):
    found = []
    for (t0, l0), (t1, l1) in zip(rows, rows[1:]):
        d0, d1 = wrapped(l0, boundary), wrapped(l1, boundary)
        if abs(d0) > 90 or abs(d1) > 90:
            continue
        if (d0 < 0 <= d1) or (d0 >= 0 > d1):
            found.append({"jdTT": t0 + (t1 - t0) * (0 - d0) / (d1 - d0), "retrograde": d1 < d0,
                          "bracket": [[t0, l0], [t1, l1]]})
    return found


def main():
    engine = json.load(open(sys.argv[1]))
    out = {"what": "NASA JPL Horizons (DE441) minus the engine, time of each sign change, TT",
           "engine": engine["engine"], "ephemeris": engine["ephemeris"], "api": API,
           "retrieved": time.strftime("%Y-%m-%d", time.gmtime()), "bodies": {}}
    for body, rows in engine["bodies"].items():
        results = []
        for row in rows:
            t, boundary = row["jdTT"], row["boundary"]
            stage = "3 days either side, 10 min"
            table, url, digest = fetch(TARGET[body], t - 3, t + 3, "10m")
            found = [c for c in crossings(table, boundary) if c["retrograde"] == row["retrograde"]]
            in_window = len(crossings(table, boundary))
            if not found:
                stage = "45 days either side, 1 h, then 2 h either side, 1 min"
                wide, url, digest = fetch(TARGET[body], t - 45, t + 45, "1h")
                coarse = [c for c in crossings(wide, boundary) if c["retrograde"] == row["retrograde"]]
                in_window = len(crossings(wide, boundary))
                found = []
                for c in coarse:
                    fine, url, digest = fetch(TARGET[body], c["jdTT"] - 2 / 24, c["jdTT"] + 2 / 24, "1m")
                    found += [f for f in crossings(fine, boundary) if f["retrograde"] == row["retrograde"]]
            entry = {"boundary": boundary, "retrograde": row["retrograde"], "engineAt": row["at"],
                     "engineJdTT": t, "search": stage, "nasaCrossingsOfThisBoundaryInWindow": in_window,
                     "lastRequest": url, "lastResponseSha256": digest}
            if found:
                best = min(found, key=lambda c: abs(c["jdTT"] - t))
                entry.update({"nasaJdTT": best["jdTT"], "bracket": best["bracket"],
                              "nasaMinusEngineHours": (best["jdTT"] - t) * 24})
            else:
                entry["nasaJdTT"] = None
            results.append(entry)
            print(body, row["at"], entry.get("nasaMinusEngineHours"), file=sys.stderr, flush=True)
            time.sleep(0.4)
        out["bodies"][body] = results
    json.dump(out, open(sys.argv[2], "w"), indent=1)


if __name__ == "__main__":
    main()
