#!/usr/bin/env python3
"""Three pinned test values beside ERFA (pyerfa, IAU 2006/2000A).

  python3 test-expectations.py "$WORK/test-expectations.json" > results/test-expectations.json

Reads what test-expectations.mjs wrote and computes, with no Swiss Ephemeris:

- the Mercury station of 2026-02-26: the extremum of Mercury's longitude on
  ERFA's true ecliptic and equinox of date, Rz(-dpsi) Rx(epsA) P with bp06's
  P, obl06 and nut06a, from the same astronomy-engine vectors both engines
  rotate; and the same fit to each engine's own longitudes, which checks the
  fit against the test's golden-section search;
- the ascendant of the polar-fallback receipt chart, read as UT1, on ERFA's
  gst06a and true obliquity (obl06 plus nut06a's deps), UT1 and TT as the
  engine's chart reads them;
- the polar limit 90° - true obliquity at the Placidus case's instant, on
  that chart's clock.
"""
import json
import math
import sys
from datetime import datetime, timedelta, timezone

import erfa
import numpy as np

AS2R = math.pi / 648_000
J2000 = 2_451_545.0
EPOCH = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


def iso(ms):
    return (EPOCH + timedelta(milliseconds=ms - 946_728_000_000)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def station(ms, longitudes):
    """Time of the extremum of a cubic fitted to (ms, longitude), ms."""
    t = (np.array(ms) - ms[len(ms) // 2]) / 86_400_000
    lon = np.unwrap(np.radians(longitudes))
    c3, c2, c1, c0 = np.polyfit(t, lon, 3)
    roots = np.roots([3 * c3, 2 * c2, c1])
    root = min((r.real for r in roots if abs(r.imag) < 1e-12), key=abs)
    return ms[len(ms) // 2] + root * 86_400_000


def ascendant(ramc, eps, phi):
    """The ecliptic point on the eastern horizon, degrees: of the two
    intersections the textbook formula gives, the one whose hour angle is
    east of the meridian (sin H < 0), as the engine selects it."""
    lam = math.atan2(math.cos(ramc), -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps)))
    alpha = math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))
    if math.sin(ramc - alpha) > 0:
        lam += math.pi
    return math.degrees(lam) % 360


def main():
    data = json.load(open(sys.argv[1]))
    out = {"pyerfa": erfa.__version__, "erfa": erfa.version.erfa_version}

    m = data["mercury"]
    erfa_lon = []
    for tt, v in zip(m["ttDays"], m["vectors"]):
        dpsi, _ = erfa.nut06a(J2000, tt)
        _, rp, _ = erfa.bp06(J2000, tt)
        r = erfa.rz(-dpsi, erfa.rx(erfa.obl06(J2000, tt), rp))
        e = r @ np.array(v)
        erfa_lon.append(math.degrees(math.atan2(e[1], e[0])))
    stations = {name: station(m["utcMs"], lons) for name, lons in (("erfa2000A", erfa_lon), ("rc15", m["rc15"]), ("build", m["build"]))}
    out["mercuryStation"] = {
        "method": "cubic fitted to longitudes every 5 s, 05:47:10Z to 07:47:10Z UTC; TT = UTC + 69.184 s",
        "utc": {name: iso(round(value)) for name, value in stations.items()},
        "rc15MinusErfaSeconds": round((stations["rc15"] - stations["erfa2000A"]) / 1000, 3),
        "buildMinusErfaSeconds": round((stations["build"] - stations["erfa2000A"]) / 1000, 3),
    }

    for key, chart in data["charts"].items():
        birth = chart["birth"]
        row = {"birth": birth}
        for name in ("rc15", "build"):
            clock = chart[name]
            t = datetime.fromisoformat(birth["utc"].replace("Z", "+00:00"))
            jd = erfa.dtf2d("UTC", t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond / 1e6)
            ut1 = jd[0] + jd[1] - J2000 + (0 if birth.get("timeScale") == "ut1" else clock["ut1MinusUtc"] / 86_400)
            tt = ut1 + clock["deltaT"] / 86_400
            _, deps = erfa.nut06a(J2000, tt)
            eps = erfa.obl06(J2000, tt) + deps
            gast = erfa.gst06a(J2000, ut1, J2000, tt)
            if key == "receipt":
                ramc = gast + math.radians(birth["longitude"])
                asc = ascendant(ramc, eps, math.radians(birth["latitude"]))
                row[name] = {
                    "engineAsc": clock["asc"],
                    "erfaAsc": asc,
                    "engineMinusErfaArcsec": round(((clock["asc"] - asc + 180) % 360 - 180) * 3600, 5),
                }
            else:
                limit = 90 - math.degrees(eps)
                row[name] = {
                    "engineTrueObliquity": clock["trueObliquity"],
                    "erfaTrueObliquity": math.degrees(eps),
                    "engineMinusErfaArcsec": round((clock["trueObliquity"] - math.degrees(eps)) * 3600, 6),
                    "latitudeBelowErfaLimitArcsec": round((limit - birth["latitude"]) * 3600, 6),
                    "latitudeBelowEngineLimitArcsec": round((90 - clock["trueObliquity"] - birth["latitude"]) * 3600, 6),
                    "houses": clock["houses"],
                }
        out[key] = row
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
