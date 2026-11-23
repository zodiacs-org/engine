#!/usr/bin/env python3
"""Summarise results/horizons.json as results/summary.md.
usage: python3 summarise.py results/horizons.json > results/summary.md"""
import json
import sys

data = json.load(open(sys.argv[1]))
print("# Sign changes: NASA JPL Horizons (DE441) minus the engine\n")
print(f"Engine {data['engine']}, {data['ephemeris']['name']} {data['ephemeris']['version']}; Horizons queried {data['retrieved']}.")
print("Times compared in TT. Hours, NASA minus engine.\n")
print("| body | sign changes the engine finds | matched on Horizons | not matched | median of the size | 95th percentile | largest | at (engine's instant) | sign changes within 1 minute |")
print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |")
for body, rows in data["bodies"].items():
    hit = [r for r in rows if r.get("nasaJdTT") is not None]
    sizes = sorted(abs(r["nasaMinusEngineHours"]) for r in hit)
    worst = max(hit, key=lambda r: abs(r["nasaMinusEngineHours"]))
    p95 = sizes[min(len(sizes) - 1, int(round(0.95 * (len(sizes) - 1))))]
    print(f"| {body} | {len(rows)} | {len(hit)} | {len(rows) - len(hit)} | {sizes[len(sizes) // 2]:.2f} | {p95:.2f} | {sizes[-1]:.2f} | {worst['engineAt']} ({worst['nasaMinusEngineHours']:+.2f}) | {sum(1 for s in sizes if s * 60 <= 1)} |")
print("\n## By century, largest size in hours\n")
print("| body | 1800s | 1900s | 2000s | 2100s |")
print("| --- | ---: | ---: | ---: | ---: |")
for body, rows in data["bodies"].items():
    cells = []
    for century in ("18", "19", "20", "21"):
        v = [abs(r["nasaMinusEngineHours"]) for r in rows if r.get("nasaJdTT") is not None and r["engineAt"].startswith(century)]
        cells.append(f"{max(v):.2f} (of {len(v)})" if v else "none")
    print(f"| {body} | " + " | ".join(cells) + " |")
print("\n## Sign changes found only after widening the search, or not matched\n")
print("| body | engine's instant | boundary | retrograde | NASA minus engine, hours | NASA crossings of the boundary in the window |")
print("| --- | --- | ---: | --- | ---: | ---: |")
for body, rows in data["bodies"].items():
    for r in rows:
        if not r["search"].startswith("3 days"):
            d = r.get("nasaMinusEngineHours")
            print(f"| {body} | {r['engineAt']} | {r['boundary']} | {r['retrograde']} | {'none found' if d is None else format(d, '+.2f')} | {r['nasaCrossingsOfThisBoundaryInWindow']} |")
print("\n## Neptune into Aries, 2026\n")
for r in data["bodies"]["Neptune"]:
    if r["engineAt"].startswith("2026-01-26"):
        print(f"Engine {r['engineAt']} (JD {r['engineJdTT']:.6f} TT); Horizons JD {r['nasaJdTT']:.6f} TT; NASA minus engine {r['nasaMinusEngineHours']:+.4f} h.")
