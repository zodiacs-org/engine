#!/usr/bin/env python3
"""Exact rational oracle for configured aspects and declination parallels.

Usage:
  python3 exact-oracle.py --entry /abs/package/dist/index.js \
      --archive /abs/zodiacs-engine-<version>.tgz --output report.json \
      [--expect-mismatches]

Every expectation is computed here with fractions.Fraction on the exact values
of the binary64 inputs, following the README's documented rules; Node only
runs the package. Decisions (membership, type, angle, limit, motion, order)
must match exactly, and each reported orb must equal float(exact orb), which
Python rounds to nearest with ties to even. --expect-mismatches inverts the
exit status, for a negative control on an earlier archive.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
from fractions import Fraction as Q
import hashlib
import json
from pathlib import Path
import random
import subprocess
import tarfile

NAMED = dict(conjunction=0, semisextile=30, semisquare=45, sextile=60, quintile=72, square=90,
             trine=120, sesquiquadrate=135, biquintile=144, quincunx=150, opposition=180)
DEFAULT_RULES = [dict(type="conjunction", orb=8, luminaryOrb=10), dict(type="sextile", orb=4, luminaryOrb=5),
                 dict(type="square", orb=7, luminaryOrb=8), dict(type="trine", orb=7, luminaryOrb=8),
                 dict(type="opposition", orb=8, luminaryOrb=10)]
PHYSICAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
MOTIONS = ("applying", "separating", "stationary")
LUMINARIES = {"Sun", "Moon"}

BRIDGE = r"""
import { pathToFileURL } from 'node:url';
const api = await import(pathToFileURL(process.argv[1]).href);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const out = JSON.parse(input).map((c) => {
  try {
    if (c.kind === 'aspects') {
      const r = api.findConfiguredAspects(c.positions, api.createAspectPolicy(c.policy));
      return { aspects: r.aspects.map((x) => ({ ...x })) };
    }
    const r = api.declinationsForBodies(c.bodies, c.obliquity, c.policy);
    return { rows: r.rows.map((x) => ({ body: x.body, dec: x.dec })), aspects: r.aspects.map((x) => ({ ...x })) };
  } catch (e) { return { error: `${e?.name}: ${e?.message}` }; }
});
process.stdout.write(JSON.stringify({ version: api.ENGINE_VERSION, out }));
"""


def sign(x):
    return (x > 0) - (x < 0)


def limits(value):
    return {m: value for m in MOTIONS} if not isinstance(value, dict) else {m: value[m] for m in MOTIONS}


def resolve(policy):
    rules = []
    for rule in policy.get("aspects", DEFAULT_RULES):
        rules.append(dict(type=rule["type"], angle=rule.get("angle", NAMED.get(rule["type"])), orb=limits(rule["orb"]),
                          lum=limits(rule["luminaryOrb"]) if "luminaryOrb" in rule else None))
    return dict(rules=rules, bodies=policy.get("bodies", PHYSICAL),
                caps={k: limits(v) for k, v in policy.get("bodyOrbs", {}).items()},
                threshold=Q(policy.get("stationaryRelativeSpeed", 1e-9)))


def expected_aspects(case):
    p = resolve(case["policy"])
    rows = [r for r in case["positions"] if r["body"] in set(p["bodies"])]
    found = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b = rows[i], rows[j]
            s = Q(a["lon"]) - Q(b["lon"])
            s = s - 360 if s > 180 else s + 360 if s <= -180 else s   # (-180, 180]
            dist = abs(s)
            rel = Q(a["speed"]) - Q(b["speed"])
            stationary = rel == 0 or abs(rel) < p["threshold"]
            lum = a["body"] in LUMINARIES or b["body"] in LUMINARIES
            best = None
            for rule in p["rules"]:
                dev = dist - Q(rule["angle"])
                orb = abs(dev)
                if stationary:
                    motion = "stationary"
                elif dev == 0:
                    motion = "separating"
                else:
                    rate = 1 if dist == 0 else -1 if dist == 180 else sign(s) * sign(rel)
                    motion = "applying" if sign(dev) * rate < 0 else "separating"
                lim = rule["lum"] if (lum and rule["lum"]) else rule["orb"]
                caps = [lim[motion]] + [p["caps"][n][motion] for n in (a["body"], b["body"]) if n in p["caps"]]
                maximum = min(caps)
                if orb <= Q(maximum) and (best is None or orb < best["exact"]):
                    best = dict(a=a["body"], b=b["body"], type=rule["type"], angle=rule["angle"], exact=orb,
                                maximumOrb=maximum, motion=motion)
            if best:
                found.append(best)
    found.sort(key=lambda x: x["exact"])   # stable: input pair order on exact ties
    return found


def compare_aspects(got, want):
    if len(got) != len(want):
        return "membership"
    for g, w in zip(got, want):
        if (g["a"], g["b"], g["type"]) != (w["a"], w["b"], w["type"]):
            return "order-or-type"
        if g["angle"] != w["angle"] or g["maximumOrb"] != w["maximumOrb"]:
            return "limit"
        if g["motion"] != w["motion"] or g["applying"] != (w["motion"] == "applying"):
            return "motion"
        if g["orb"] != float(w["exact"]):
            return "orb-not-exact-rounded"
    return None


def expected_parallels(rows, policy):
    found = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b = rows[i], rows[j]
            par, con = abs(Q(a["dec"]) - Q(b["dec"])), abs(Q(a["dec"]) + Q(b["dec"]))
            maximum = policy["luminaryOrb"] if {a["body"], b["body"]} & LUMINARIES else policy["orb"]
            orb = min(par, con)
            if orb <= Q(maximum):
                found.append(dict(a=a["body"], b=b["body"], type="parallel" if par <= con else "contraparallel",
                                  exact=orb, maximumOrb=maximum))
    found.sort(key=lambda x: x["exact"])
    return found


def compare_parallels(got, want):
    if len(got) != len(want):
        return "membership"
    for g, w in zip(got, want):
        if (g["a"], g["b"], g["type"], g["maximumOrb"]) != (w["a"], w["b"], w["type"], w["maximumOrb"]):
            return "order-or-type"
        if g["orb"] != float(w["exact"]):
            return "orb-not-exact-rounded"
    return None


def hundredths(value):
    return value / 100   # the double nearest the decimal value


def fixtures():
    rng = random.Random(20260928)
    cases = []

    def aspect(family, positions, policy, wrapped):
        cases.append(dict(kind="aspects", family=family, wrapped=wrapped, positions=positions, policy=policy))

    angles = [(t, a * 100) for t, a in NAMED.items()] + [("custom", v) for v in (10, 2250, 5143, 10010, 17990)]
    speeds = [(0, 0, None), (1, 0, None), (-1, 0.5, None), (0.7, 0.1, 0.6), (0.3, 0.2, 0.1)]
    # 1. Decimal boundaries: a = b ± (angle ± orb), b ≠ 0, wrapped and unwrapped, both row orders.
    for kind, angle in angles:
        for orb in (0, 10, 30, 100, 110, 250, 730, 800):
            for _ in range(6):
                base = rng.randint(1, 35999)
                for orb_sign in (1, -1):
                    sep = angle + orb_sign * orb
                    if not 0 <= sep <= 18000:
                        continue
                    for direction in (1, -1):
                        other = (base + direction * sep) % 36000
                        wrapped = abs(other - base) > 18000
                        va, vb, threshold = speeds[rng.randrange(len(speeds))]
                        rule = dict(type=kind, orb=hundredths(orb))
                        if kind == "custom":
                            rule["angle"] = hundredths(angle)
                        policy = dict(bodies=["A", "B"], aspects=[rule])
                        if threshold is not None:
                            policy["stationaryRelativeSpeed"] = threshold
                        rows = [dict(body="A", lon=hundredths(other), speed=va), dict(body="B", lon=hundredths(base), speed=vb)]
                        aspect("decimal-boundary", rows, policy, wrapped)
                        aspect("decimal-boundary", rows[::-1], policy, wrapped)
    # 2. The rc.11 review's zero-orb family: exact decimal angles on a 0.01° grid.
    for _ in range(20000):
        kind = rng.choice(list(NAMED))
        base = rng.randint(0, 35999)
        other = (base + NAMED[kind] * 100 * rng.choice([1, -1])) % 36000
        rows = [dict(body="A", lon=hundredths(other), speed=0.0), dict(body="B", lon=hundredths(base), speed=0.0)]
        aspect("zero-orb-0.01-grid", rows, dict(bodies=["A", "B"], aspects=[dict(type=kind, orb=0)]),
               abs(other - base) > 18000)
    # 3. The rc.11 review's inclusive-boundary family: orbs 0.0–10.0 at exact decimal separations.
    while sum(1 for c in cases if c["family"] == "boundary-0.1-orbs") < 20000:
        kind = rng.choice(list(NAMED))
        orb = rng.randint(0, 100) * 10
        sep = NAMED[kind] * 100 + orb * rng.choice([-1, 1])
        if not 0 <= sep <= 18000:
            continue
        base = rng.randint(0, 35999)
        other = (base + sep * rng.choice([-1, 1])) % 36000
        rows = [dict(body="A", lon=hundredths(other), speed=0.0), dict(body="B", lon=hundredths(base), speed=0.0)]
        aspect("boundary-0.1-orbs", rows, dict(bodies=["A", "B"], aspects=[dict(type=kind, orb=hundredths(orb))]),
               abs(other - base) > 18000)
    # 4. Several bodies, rules, luminary orbs and caps on the default and custom policies.
    names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Chiron"]
    for _ in range(3000):
        bodies = [n for n in names if rng.random() < 0.7] or ["Sun", "Moon"]
        anchor = rng.randint(1, 35999)
        rows = [dict(body=n, lon=hundredths((anchor + rng.choice([1, -1]) * (rng.choice(angles)[1] + rng.choice([-1, 1]) * rng.choice([0, 10, 100, 730, 800]))) % 36000),
                     speed=hundredths(rng.randint(-60, 140))) for n in bodies]
        if rng.random() < 0.3:
            policy = dict(bodies=[n for n in bodies if n in PHYSICAL]) if rng.random() < 0.5 else {}
        else:
            rules = [dict(type=t, orb=hundredths(rng.choice([0, 10, 100, 730, 800])),
                          **({"luminaryOrb": hundredths(rng.choice([100, 800, 1000]))} if rng.random() < 0.4 else {}))
                     for t in NAMED if rng.random() < 0.4]
            policy = dict(bodies=bodies, aspects=rules, stationaryRelativeSpeed=rng.choice([1e-9, 0.1, 0.0]),
                          bodyOrbs={n: hundredths(rng.choice([50, 300, 700])) for n in bodies if rng.random() < 0.2})
        aspect("multi-body", rows, policy, any(abs(x["lon"] - y["lon"]) > 180 for x in rows for y in rows))
    # 5. Declinations: zero obliquity makes dec the latitude; boundaries |x ∓ y| = orb, both orders.
    for x in (1, 10, 30, 40, 70, 120, 730, 1230, 2220, 2344, 4578, 8900):
        for orb in (0, 10, 50, 100, 150, 220, 330):
            for sx in (1, -1):
                for kind in (1, -1):
                    for direction in (1, -1):
                        first, second = sx * x, kind * sx * x + direction * orb
                        if abs(second) > 9000:
                            continue
                        for a, b in (("Mars", "Saturn"), ("Sun", "Saturn")):
                            bodies = [dict(body=a, lon=359, lat=hundredths(first)), dict(body=b, lon=1.5, lat=hundredths(second))]
                            policy = dict(orb=hundredths(orb), luminaryOrb=hundredths(orb))
                            for order in (bodies, bodies[::-1]):
                                cases.append(dict(kind="declinations", family="declination-boundary", bodies=order, obliquity=0, policy=policy))
    for _ in range(2000):
        bodies = [dict(body=n, lon=hundredths(rng.randint(0, 35999)), lat=hundredths(rng.randint(-800, 800)))
                  for n in ["Sun", "Moon", "Mars", "Venus", "North Node", "South Node", "P"][:rng.randint(2, 7)]]
        cases.append(dict(kind="declinations", family="declination-rotated", bodies=bodies, obliquity=23.4392911,
                          policy=dict(orb=hundredths(rng.randint(0, 300)), luminaryOrb=hundredths(rng.randint(0, 300)))))
    # 6. The review reproductions.
    for positions, policy in (
        ([dict(body="A", lon=188.86, speed=0), dict(body="B", lon=98.86, speed=0)], dict(bodies=["A", "B"], aspects=[dict(type="square", orb=0)])),
        ([dict(body="Jupiter", lon=6.3, speed=0), dict(body="Sun", lon=314, speed=0)], dict(bodies=["Jupiter", "Sun"], aspects=[dict(type="semisquare", orb=7.3)])),
        ([dict(body="Mars", lon=7.6999999999999895, speed=1), dict(body="Saturn", lon=359.7, speed=0)], {}),
    ):
        aspect("review-reproductions", positions, policy, True)
    for x, y in ((12.3, 13.3), (7.3, 8.3), (0.1, 1.1), (-0.4, 0.6), (22.2, -23.2)):
        cases.append(dict(kind="declinations", family="review-reproductions", obliquity=0, policy=dict(orb=1, luminaryOrb=1.5),
                          bodies=[dict(body="A", lon=0, lat=x), dict(body="B", lon=10, lat=y)]))
    return cases


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive_binding(entry, archive):
    package_root = entry.parent.parent
    expected = {}
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle.getmembers():
            if member.isfile() and (member.name.startswith("package/dist/") or member.name == "package/package.json"):
                expected[member.name.removeprefix("package/")] = digest(bundle.extractfile(member).read())
    actual = {str(p.relative_to(package_root)): digest(p.read_bytes()) for p in sorted(entry.parent.rglob("*")) if p.is_file()}
    actual["package.json"] = digest((package_root / "package.json").read_bytes())
    if not expected or expected != actual:
        raise SystemExit("The invoked package's metadata and dist files do not match the archive")
    return dict(archiveSha256=digest(archive.read_bytes()), archiveBytes=archive.stat().st_size)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expect-mismatches", action="store_true")
    args = parser.parse_args()
    entry, archive = args.entry.resolve(), args.archive.resolve()
    binding = archive_binding(entry, archive)
    cases = fixtures()
    payload = json.dumps(cases, separators=(",", ":"), allow_nan=False).encode()
    completed = subprocess.run(["node", "--input-type=module", "--eval", BRIDGE, str(entry)],
                               input=payload, capture_output=True, check=True, timeout=600)
    observed = json.loads(completed.stdout)
    if archive_binding(entry, archive) != binding:
        raise SystemExit("The archive or invoked files changed during execution")
    families, kinds, examples = Counter(), Counter(), []
    mismatched = Counter()
    wrapped = Counter()
    for case, result in zip(cases, observed["out"], strict=True):
        families[case["family"]] += 1
        if case["kind"] == "aspects":
            wrapped[(case["family"], case["wrapped"])] += 1
            why = f"error {result['error']}" if "error" in result else compare_aspects(result["aspects"], expected_aspects(case))
        else:
            why = f"error {result['error']}" if "error" in result else compare_parallels(result["aspects"], expected_parallels(result["rows"], case["policy"]))
            if why is None and case["obliquity"] == 0 and any(r["dec"] != b["lat"] for r, b in zip(result["rows"], case["bodies"])):
                why = "zero-obliquity declination is not the latitude"
        if why is not None:
            mismatched[case["family"]] += 1
            kinds[f"{case['family']}: {why}"] += 1
            if len(examples) < 12:
                examples.append(dict(family=case["family"], why=why, case={k: v for k, v in case.items() if k not in ("family",)},
                                     engine=result))
    total_mismatches = sum(mismatched.values())
    passed = total_mismatches > 0 if args.expect_mismatches else total_mismatches == 0
    report = dict(schema="zodiacs.exact-aspect-oracle.v1", timestamp=datetime.now(timezone.utc).isoformat(),
                  engineVersion=observed["version"], expectation="mismatches" if args.expect_mismatches else "none",
                  passed=passed, archive=str(archive), binding=binding, runtime=subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
                  scriptSha256=digest(Path(__file__).read_bytes()), fixturesSha256=digest(payload),
                  cases=len(cases), mismatches=total_mismatches,
                  families={f: dict(cases=n, mismatches=mismatched[f]) for f, n in sorted(families.items())},
                  wrappedSplit={f"{f} {'wrapped' if w else 'unwrapped'}": n for (f, w), n in sorted(wrapped.items())},
                  mismatchKinds=dict(sorted(kinds.items())), examples=examples,
                  method="fractions.Fraction on the exact binary64 inputs; reported orbs compared with float(exact), correctly rounded half-even")
    args.output.write_text(json.dumps(report, indent=1, allow_nan=False) + "\n")
    print(json.dumps({k: report[k] for k in ("engineVersion", "expectation", "passed", "cases", "mismatches", "families")}, indent=1))
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
