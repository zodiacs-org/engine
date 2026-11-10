#!/usr/bin/env python3
"""Validate a bounded historical-rule research dataset using only stdlib.

The functions operate on named conditional clock models. They are not a
geographical time-zone resolver and do not compute physical UTC or UT1.
"""
from __future__ import annotations
import argparse
import calendar
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re

DEFAULT_DATA = Path(__file__).with_name("rules.json")

class ValidationError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise ValidationError(message)

def parse_label(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", value) is not None,
            "Expected a civil label with no timezone or fractional seconds")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")

def label(value):
    return value.isoformat(timespec="seconds")

def transition_instant(rule, year, transition):
    require(year in rule["reviewed_years"], f"Unreviewed year {year} for {rule['id']}")
    spec = transition["date_rule"]
    if spec["kind"] == "last_weekday_of_month":
        d = date(year, spec["month"], calendar.monthrange(year, spec["month"])[1])
        d -= timedelta(days=(d.isoweekday() - spec["weekday_iso"]) % 7)
    elif spec["kind"] == "fixed_date":
        d = date(year, spec["month"], spec["day"])
    elif spec["kind"] == "days_after_instrument":
        d = date.fromisoformat(rule["instrument_date"]) + timedelta(days=spec["days"])
        require(d.year == year, "Relative date outside requested year")
    else:
        raise ValidationError("Unsupported date rule")
    wall = parse_label(f"{d.isoformat()}T{transition['clock_label']}")
    basis = transition["clock_basis"]
    require(basis in ("wall_before", "reference_GMT"), "Unsupported clock basis")
    return wall - timedelta(seconds=transition["offset_before_seconds"] if basis == "wall_before" else 0)

def local_at_reference(reference, instant, transition):
    require(reference.tzinfo is None and instant.tzinfo is None, "Civil model requires naive labels")
    require(abs(reference - instant) <= timedelta(days=1), "Outside the fixture's one-day reference window")
    offset = transition["offset_before_seconds"] if reference < instant else transition["offset_after_seconds"]
    return reference + timedelta(seconds=offset)

def resolve_near_transition(wall, instant, transition):
    """Return every civil-reference candidate in this one-transition fixture.

    Zero candidates is a gap; two is a fold. It never silently picks a side.
    The function refuses wall labels beyond the local one-day fixture window.
    """
    require(wall.tzinfo is None and instant.tzinfo is None, "Civil model requires naive labels")
    local_window_start = instant - timedelta(days=1) + timedelta(seconds=transition["offset_before_seconds"])
    local_window_end = instant + timedelta(days=1) + timedelta(seconds=transition["offset_after_seconds"])
    require(local_window_start < wall < local_window_end, "Outside fixture's local window")
    result = []
    for offset in set((transition["offset_before_seconds"], transition["offset_after_seconds"])):
        candidate = wall - timedelta(seconds=offset)
        if abs(candidate - instant) <= timedelta(days=1) and local_at_reference(candidate, instant, transition) == wall:
            result.append(candidate)
    return sorted(result)

def validate(data):
    require(data["schema_version"] == 1, "Unsupported schema version")
    sources = {s["id"]: s for s in data["sources"]}
    require(len(sources) == len(data["sources"]), "Duplicate source IDs")
    for source in sources.values():
        require(source["url"].startswith("https://"), "Source must use HTTPS")
        require(source["locator"] and source["excerpt_locator"], "Source location missing")
        require(len(source["excerpt"].split()) <= 25, "Excerpt exceeds 25 words")
        begin = datetime.fromisoformat(source["retrieval"]["started_at"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(source["retrieval"]["completed_at"].replace("Z", "+00:00"))
        require(begin.tzinfo is not None and end.tzinfo is not None and begin <= end, "Invalid retrieval interval")
    rules = {r["id"]: r for r in data["rules"]}
    require(len(rules) == len(data["rules"]), "Duplicate rule IDs")
    for rule in rules.values():
        require(rule["production_eligible"] is False, "Research record cannot be production-eligible")
        require(rule["reference_time_scale"] == "GMT_civil_arithmetic", "Unsupported reference scale")
        require(rule["uncertainties"] and rule["applicability"], "Scope limits missing")
        require(rule["source_ids"] and all(s in sources for s in rule["source_ids"]), "Missing source reference")
        require(len(set(t["name"] for t in rule["transitions"])) == len(rule["transitions"]), "Duplicate transition name")
        if rule["law_commencement_date"]:
            require(rule["law_commencement_date"] <= rule["first_modelled_clock_change_date"], "Clock change before commencement")
    covered = set()
    fixture_ids = set()
    for fixture in data["fixtures"]:
        fid = fixture["id"]
        require(fid not in fixture_ids, "Duplicate fixture ID")
        fixture_ids.add(fid)
        rule = rules[fixture["rule_id"]]
        transition = next(t for t in rule["transitions"] if t["name"] == fixture["transition"])
        instant = transition_instant(rule, fixture["year"], transition)
        require(label(instant) == fixture["expected_reference_instant"], f"{fid}: wrong transition instant")
        before = local_at_reference(instant - timedelta(seconds=1), instant, transition)
        after = local_at_reference(instant, instant, transition)
        require(label(before) == fixture["expected_local_one_second_before"], f"{fid}: wrong before label")
        require(label(after) == fixture["expected_local_at_transition"], f"{fid}: wrong after label")
        candidates = [label(t) for t in resolve_near_transition(parse_label(fixture["wall_label_to_resolve"]), instant, transition)]
        require(candidates == fixture["expected_reference_candidates"], f"{fid}: wrong candidate set")
        status = {0:"gap",1:"unique",2:"fold"}[len(candidates)]
        require(status == fixture["expected_wall_status"], f"{fid}: wrong gap/fold classification")
        covered.add((rule["id"], fixture["year"], transition["name"]))
    expected_coverage = {(r["id"], y, t["name"]) for r in rules.values() for y in r["reviewed_years"] for t in r["transitions"]}
    require(covered == expected_coverage, "Transition fixture coverage is incomplete")
    return {"status":"pass","rules":len(rules),"sources":len(sources),"transition_fixtures":len(fixture_ids),
            "meaning":"Local consistency and conditional civil-clock boundary checks only; not independent proof of historical local observance."}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("data", nargs="?", type=Path, default=DEFAULT_DATA)
    args = p.parse_args()
    try:
        result = validate(json.loads(args.data.read_text()))
    except (ValidationError, KeyError, ValueError, StopIteration, TypeError) as exc:
        raise SystemExit(f"Validation failed: {exc}")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
