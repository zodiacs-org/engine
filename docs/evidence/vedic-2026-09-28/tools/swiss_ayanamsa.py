#!/usr/bin/env python3
"""Compare the engine's ayanamsas with Swiss Ephemeris get_ayanamsa_ex_ut.

Swiss Ephemeris (pyswisseph) is used only as a measuring instrument. Its
values stay in memory; the output holds statistics of the differences only.

  python3 swiss_ayanamsa.py --python /path/to/venv/bin/python --ephe /path/to/ephe

The given Python must have pyswisseph; the tool runs each Swiss mode in its own
worker process, because Swiss Ephemeris caches state between sidereal modes.
The engine side runs engine-bridge.mjs on the built package (npm run build).

Flags: FLG_SWIEPH | FLG_NONUT for the mean ayanamsa, FLG_SWIEPH for the true
one, default sidereal bits (so Swiss applies its own corrections for
ayanamsas defined with older precession models).
"""
import argparse
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
MS_PER_DAY = 86_400_000
UNIX_JD = 2_440_587.5
GATE = 0.01  # arcseconds

SWISS_MODE = {
    "lahiri": "SIDM_LAHIRI",
    "fagan-bradley": "SIDM_FAGAN_BRADLEY",
    "krishnamurti": "SIDM_KRISHNAMURTI",
    "raman": "SIDM_RAMAN",
    "yukteswar": "SIDM_YUKTESHWAR",
    "true-chitra": "SIDM_TRUE_CITRA",
    "true-revati": "SIDM_TRUE_REVATI",
    "true-pushya": "SIDM_TRUE_PUSHYA",
    "galactic-center": "SIDM_GALCENT_0SAG",
}
# User-defined ayanamsas compared with SE_SIDM_USER (t0 in TT, value at t0).
USER = {
    "user-j1900": {"julianDateTT": 2_415_020.0, "value": 22.46},
    "user-b1950": {"julianDateTT": 2_433_282.5, "value": 23.15},
    "user-j2000": {"julianDateTT": 2_451_545.0, "value": 23.85},
}
# Anchor stars' sidereal longitudes, to find the instants when the star is near the Sun.
ANCHOR = {"true-chitra": 180.0, "true-revati": 359 + 50 / 60, "true-pushya": 106.0, "galactic-center": 240.0}
NEAR_SUN = 0.3  # degrees of longitude: the solar disk (0.27 deg) and a margin
# Diagnostics: a named Swiss mode's own constant at t0 (JD 2415020.0 TT, read at
# run time with SIDBIT_NO_PREC_OFFSET), given to userAyanamsa with the model
# Swiss corrects it for, to separate a definitional difference from the
# precession machinery. The constants are never written out.
DIAGNOSTIC = {
    "raman": ("SIDM_RAMAN", "newcomb"),
    "yukteswar": ("SIDM_YUKTESHWAR", "engine"),
    "krishnamurti": ("SIDM_KRISHNAMURTI", "newcomb"),
}


def grid():
    """Every 10 days from 1800-01-01 to 2200-12-31 UT, at a varying time of day."""
    start = round((2_378_496.5 - UNIX_JD) * MS_PER_DAY)   # 1800-01-01T00:00Z
    end = round((2_524_958.5 - UNIX_JD) * MS_PER_DAY)     # 2201-01-01T00:00Z
    seed, out, ms = 20260928, [], start
    while ms < end:
        seed = (seed * 1103515245 + 12345) % 2**31
        out.append(ms + seed % MS_PER_DAY)
        ms += 10 * MS_PER_DAY
    return out


def worker(args):
    import swisseph as swe
    swe.set_ephe_path(args.ephe)
    instants = json.load(sys.stdin)
    mode = getattr(swe, args.worker)
    if args.worker == "SIDM_USER":
        swe.set_sid_mode(mode, args.t0, args.value)
    elif args.constant:
        swe.set_sid_mode(mode | swe.SIDBIT_NO_PREC_OFFSET, 0, 0)
        json.dump({"constant": swe.get_ayanamsa_ex(2_415_020.0, swe.FLG_SWIEPH | swe.FLG_NONUT)[1]}, sys.stdout)
        return
    else:
        swe.set_sid_mode(mode, 0, 0)
    rows = []
    for ms in instants:
        jd = UNIX_JD + ms / MS_PER_DAY
        mean = swe.get_ayanamsa_ex_ut(jd, swe.FLG_SWIEPH | swe.FLG_NONUT)[1]
        true = swe.get_ayanamsa_ex_ut(jd, swe.FLG_SWIEPH)[1]
        row = [mean, true, swe.deltat_ex(jd, swe.FLG_SWIEPH) * 86_400]
        if args.stars:  # the anchor star without light deflection, for the near-Sun diagnostic
            row.append(swe.get_ayanamsa_ex_ut(jd, swe.FLG_SWIEPH | swe.FLG_NONUT | swe.FLG_NOGDEFL)[1])
        rows.append(row)
    json.dump({"version": swe.version, "rows": rows}, sys.stdout)


def run_worker(python, ephe, instants, mode, extra=()):
    cmd = [python, __file__, "--worker", mode, "--ephe", ephe, *extra]
    done = subprocess.run(cmd, input=json.dumps(instants), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def engine(definitions, instants, entry):
    request = {"kind": "ayanamsa", "definitions": definitions, "instants": instants, "sun": True}
    done = subprocess.run(["node", str(HERE / "engine-bridge.mjs"), entry], input=json.dumps(request),
                          capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def arcsec(a, b):
    """a − b in arcseconds, across the 0/360 seam."""
    return ((a - b + 180) % 360 - 180) * 3600


def stats(values):
    absolute = [abs(v) for v in values]
    return {"medianArcsec": round(statistics.median(values), 6), "maxAbsArcsec": round(max(absolute), 6)}


def compare(ours, theirs):
    mean = [arcsec(o[0], t[0]) for o, t in zip(ours, theirs)]
    true = [arcsec(o[1], t[1]) for o, t in zip(ours, theirs)]
    nutation = [o[2] * 3600 - arcsec(t[1], t[0]) for o, t in zip(ours, theirs)]
    delta_t = [o[3] - t[2] for o, t in zip(ours, theirs)]
    out = {"n": len(mean), "mean": stats(mean), "true": stats(true),
           "nutationDifference": stats(nutation),
           "deltaTDifferenceSeconds": {"median": round(statistics.median(delta_t), 3),
                                       "maxAbs": round(max(abs(v) for v in delta_t), 3)}}
    out["mean"]["passes"] = out["mean"]["maxAbsArcsec"] <= GATE
    return out


def near_sun(ours, theirs, sun, anchor):
    """Split the mean differences by the anchor star's distance in longitude from the Sun."""
    away, near, failures = [], [], []
    for o, t, s in zip(ours, theirs, sun):
        elongation = abs(arcsec(s, anchor + o[1])) / 3600
        difference = arcsec(o[0], t[0])
        (near if elongation < NEAR_SUN else away).append(difference)
        if abs(difference) > GATE:
            failures.append({"elongationDeg": elongation, "difference": difference,
                             "swissDeflection": arcsec(t[0], t[3])})
    out = {"thresholdDeg": NEAR_SUN, "away": {"n": len(away), **stats(away)}, "near": {"n": len(near)}}
    if near:
        out["near"].update(stats(near))
    out["beyondGate"] = {"n": len(failures)}
    if failures:
        # The size of Swiss's light deflection there, as a coarse range only (0.1″).
        out["beyondGate"].update({
            "maxElongationDeg": round(max(f["elongationDeg"] for f in failures), 4),
            "maxAbsDifferenceArcsec": round(max(abs(f["difference"]) for f in failures), 6),
            "swissDeflectionRangeArcsec": [round(min(abs(f["swissDeflection"]) for f in failures), 1),
                                           round(max(abs(f["swissDeflection"]) for f in failures), 1)]})
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--ephe", required=True)
    parser.add_argument("--entry", default=str(ROOT / "dist/index.js"))
    parser.add_argument("--output", default=str(HERE.parent / "results/ayanamsa-swiss.json"))
    parser.add_argument("--worker")
    parser.add_argument("--t0", type=float)
    parser.add_argument("--value", type=float)
    parser.add_argument("--constant", action="store_true")
    parser.add_argument("--stars", action="store_true")
    args = parser.parse_args()
    if args.worker:
        return worker(args)

    instants = grid()
    definitions = {name: name for name in SWISS_MODE}
    definitions.update({name: {"name": name, "epoch": {"julianDateTT": spec["julianDateTT"]}, "value": spec["value"]}
                        for name, spec in USER.items()})
    for name, (mode, model) in DIAGNOSTIC.items():
        constant = run_worker(args.python, args.ephe, [], mode, ["--constant"])["constant"]
        definitions[f"diagnostic-{name}"] = {"name": f"diagnostic-{name}", "epoch": {"julianDateTT": 2_415_020.0},
                                            "value": constant, "model": model}
    ours = engine(definitions, instants, args.entry)
    report = {
        "tool": "docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py",
        "engineVersion": ours["engineVersion"],
        "reference": {"function": "swe_get_ayanamsa_ex_ut (pyswisseph)",
                      "meanFlags": "FLG_SWIEPH | FLG_NONUT", "trueFlags": "FLG_SWIEPH",
                      "sidBits": "none (default)", "ephemeris": "sepl_18.se1, semo_18.se1"},
        "grid": {"from": "1800-01-01", "to": "2200-12-31", "stepDays": 10, "timeOfDay": "pseudo-random (LCG seed 20260928)",
                 "n": len(instants)},
        "gateArcsec": GATE,
        "units": "differences engine − Swiss; arcseconds unless named; nutationDifference is engine Δψ − Swiss (true − mean)",
        "ayanamsas": {},
        "userDefined": {},
        "diagnostics": {},
    }
    for name, mode in SWISS_MODE.items():
        theirs = run_worker(args.python, args.ephe, instants, mode, ["--stars"] if name in ANCHOR else [])
        report["swissVersion"] = theirs["version"]
        entry = {"swissMode": "SE_" + mode, **compare(ours["result"][name], theirs["rows"])}
        if name in ANCHOR:
            entry["nearSun"] = near_sun(ours["result"][name], theirs["rows"], ours["result"]["sun"], ANCHOR[name])
        report["ayanamsas"][name] = entry
    for name, spec in USER.items():
        theirs = run_worker(args.python, args.ephe, instants, "SIDM_USER",
                            ["--t0", repr(spec["julianDateTT"]), "--value", repr(spec["value"])])
        report["userDefined"][name] = {"swissMode": "SE_SIDM_USER", "t0TT": spec["julianDateTT"], "value": spec["value"],
                                       **compare(ours["result"][name], theirs["rows"])}
    for name, (mode, model) in DIAGNOSTIC.items():
        theirs = run_worker(args.python, args.ephe, instants, mode)
        report["diagnostics"][name] = {
            "what": f"SE_{mode}'s own constant at JD 2415020.0 TT given to userAyanamsa (model {model})",
            **compare(ours["result"][f"diagnostic-{name}"], theirs["rows"])}
    Path(args.output).write_text(json.dumps(report, indent=1) + "\n")
    summary = {k: [v["mean"]["maxAbsArcsec"], v["mean"]["passes"]] for k, v in report["ayanamsas"].items()}
    summary.update({k: [v["mean"]["maxAbsArcsec"], v["mean"]["passes"]] for k, v in report["userDefined"].items()})
    summary.update({"diagnostic-" + k: [v["mean"]["maxAbsArcsec"], v["mean"]["passes"]]
                    for k, v in report["diagnostics"].items()})
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
