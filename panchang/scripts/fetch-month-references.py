"""Independent NASA/USNO facts and ERFA reductions, never engine output.

Run with pyerfa 2.0.1.5 and numpy installed. Proposed extracts and raw
responses go to ignored generated/; review before copying the small fixture.
"""
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request

import erfa

sys.dont_write_bytecode = True
PROJECT = Path(__file__).resolve().parents[1]
GENERATED = PROJECT / "generated"
GENERATED.mkdir(exist_ok=True)
TOOL = PROJECT.parent / "docs/evidence/vedic-2026-09-28/tools/reference_values.py"
spec = importlib.util.spec_from_file_location("independent_reference", TOOL)
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)


def fetch(url, filename):
    raw = urllib.request.urlopen(url, timeout=45).read()
    (GENERATED / filename).write_bytes(raw)
    return json.loads(raw), {"url": url, "responseSHA256": hashlib.sha256(raw).hexdigest()}


url = "https://aa.usno.navy.mil/api/moon/phases/date?date=1982-12-01&nump=12"
phases, provenance = fetch(url, "usno-1983-phases.json")
if phases.get("error") or phases.get("numphases") != 12:
    raise ValueError("Unexpected USNO phase response")
rows = []
for phase in phases["phasedata"]:
    if phase["phase"] != "New Moon" or phase["year"] != 1983:
        continue
    date = f'{phase["year"]:04}-{phase["month"]:02}-{phase["day"]:02}'
    start = dt.datetime.fromisoformat(f'{date}T{phase["time"]}')
    parameters = {"format": "json", "COMMAND": "'10'", "OBJ_DATA": "'NO'",
                  "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
                  "START_TIME": f"'{start:%Y-%m-%d %H:%M}'",
                  "STOP_TIME": f"'{start + dt.timedelta(minutes=1):%Y-%m-%d %H:%M}'",
                  "STEP_SIZE": "'1 m'", "QUANTITIES": "'31'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'"}
    horizon, origin = fetch("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(parameters),
                            f"horizons-sun-{date}.json")
    result = horizon.get("result", "")
    if horizon.get("error") or "{source: DE441}" not in result or "GEOCENTRIC" not in result:
        raise ValueError("Unexpected Horizons response")
    lines = result.split("$$SOE\n")[1].split("$$EOE")[0].strip().splitlines()
    longitude = float(lines[0].split(",")[3])
    # USNO's UT minute labels are treated as UTC here; the minute comparison
    # threshold includes their rounding and the subsecond UT1 distinction.
    a, b = erfa.dtf2d("UTC", start.year, start.month, start.day, start.hour, start.minute, 0)
    tai = erfa.utctai(a, b)
    tt = erfa.taitt(*tai)
    epoch, mean, model = ref.EPOCHS["lahiri"]
    ayanamsa = ref.epoch_ayanamsa(mean, epoch, model, sum(tt)) + erfa.nut00b(*tt)[0] / ref.AS2R / 3600
    sidereal = (longitude - ayanamsa) % 360
    rows.append({"newMoonUT": f'{start:%Y-%m-%dT%H:%M}:00Z', "sunTropicalDegrees": longitude,
                 "lahiriTrueDegreesERFA": ayanamsa, "sunSiderealDegreesReference": sidereal,
                 "solarSign": int(sidereal // 30), "horizons": {**origin, **horizon["signature"]}})

fixture = {"retrieved": dt.date.today().isoformat(), "sourceScale": "USNO UT minute labels treated as UTC",
           "phaseAcceptanceSeconds": 60, "longitudeAcceptanceDegrees": 0.01,
           "ayanamsaAcceptanceArcseconds": 0.01,
           "licenseBasis": "US Government numerical facts; ERFA numerical results only; see SOURCES.md",
           "usno": {**provenance, "apiVersion": phases["apiversion"]},
           "referenceTool": str(TOOL.relative_to(PROJECT.parent)), "pyerfa": erfa.__version__,
           "rows": rows}
if len(rows) != 2 or [row["solarSign"] for row in rows] != [8, 10]:
    raise ValueError("References do not demonstrate the intended two-ingress lunation")
(GENERATED / "kshaya-month-reference.json").write_text(json.dumps(fixture, indent=2) + "\n")
print("Wrote independent kshaya references in panchang/generated/ for review.")
