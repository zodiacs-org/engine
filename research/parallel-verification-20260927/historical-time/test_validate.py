"""Regression tests for ambiguous clocks, explicit time bases and scope refusal."""
from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import unittest
from validate import ValidationError, label, local_at_reference, parse_label, resolve_near_transition, transition_instant, validate

DATA = json.loads(Path(__file__).with_name("rules.json").read_text())
RULES = {r["id"]: r for r in DATA["rules"]}

class HistoricalRuleTests(unittest.TestCase):
    def test_fixed_source_derived_fixtures(self):
        report = validate(DATA)
        self.assertEqual(report["rules"], 5)
        self.assertEqual(report["transition_fixtures"], 8)

    def test_wrong_clock_basis_is_detected(self):
        # UK October is 01:00 GMT / 02:00 pre-transition local. Treating it
        # as 01:00 local yields a one-hour error which the fixed vector detects.
        altered = deepcopy(DATA)
        uk = next(r for r in altered["rules"] if r["id"] == "uk-2002-season")
        uk["transitions"][1]["clock_basis"] = "wall_before"
        with self.assertRaisesRegex(ValidationError, "wrong transition instant"):
            validate(altered)

    def test_enactment_day_is_not_wartime_clock_change(self):
        rule = RULES["us-1942-war-start"]
        self.assertEqual(label(transition_instant(rule, 1942, rule["transitions"][0])), "1942-02-09T07:00:00")
        altered = deepcopy(DATA)
        next(r for r in altered["rules"] if r["id"] == rule["id"])["transitions"][0]["date_rule"]["days"] = 0
        with self.assertRaisesRegex(ValidationError, "wrong transition instant"):
            validate(altered)

    def test_unreviewed_year_is_refused(self):
        for r in RULES.values():
            with self.subTest(rule=r["id"]), self.assertRaises(ValidationError):
                transition_instant(r, r["reviewed_years"][0]+1, r["transitions"][0])

    def test_civil_label_does_not_accept_utc_claim(self):
        for bad in ["1918-03-31T07:00:00Z", "1918-03-31T07:00:00+00:00", "1918-03-31T07:00:00.5"]:
            with self.subTest(label=bad), self.assertRaises(ValidationError):
                parse_label(bad)

    def test_fold_endpoints_are_half_open(self):
        r = RULES["us-1945-war-end"]
        t = r["transitions"][0]
        instant = transition_instant(r, 1945, t)
        self.assertEqual(len(resolve_near_transition(parse_label("1945-09-30T00:59:59"), instant, t)), 1)
        self.assertEqual(len(resolve_near_transition(parse_label("1945-09-30T01:00:00"), instant, t)), 2)
        self.assertEqual(len(resolve_near_transition(parse_label("1945-09-30T01:59:59"), instant, t)), 2)
        self.assertEqual(len(resolve_near_transition(parse_label("1945-09-30T02:00:00"), instant, t)), 1)

    def test_gap_endpoints_are_half_open(self):
        r = RULES["us-1918-season"]
        t = r["transitions"][0]
        instant = transition_instant(r, 1918, t)
        for stamp, count in [("01:59:59",1),("02:00:00",0),("02:59:59",0),("03:00:00",1)]:
            self.assertEqual(len(resolve_near_transition(parse_label(f"1918-03-31T{stamp}"), instant, t)), count)

    def test_outside_fixture_window_is_refused(self):
        r = RULES["uk-2002-season"]
        t = r["transitions"][0]
        instant = transition_instant(r, 2002, t)
        with self.assertRaises(ValidationError):
            resolve_near_transition(parse_label("2002-05-01T12:00:00"), instant, t)
        with self.assertRaises(ValidationError):
            local_at_reference(instant + timedelta(days=2), instant, t)

    def test_rollback_window_clipping_cannot_create_false_gap(self):
        r = RULES["us-1945-war-end"]
        t = r["transitions"][0]
        instant = transition_instant(r, 1945, t)
        # This ordinary label is outside the one-day reference window. A
        # clipped candidate set must be reported as unsupported, not a gap.
        with self.assertRaises(ValidationError):
            resolve_near_transition(parse_label("1945-09-29T01:30:00"), instant, t)

    def test_missing_source_fails_validation(self):
        altered = deepcopy(DATA)
        altered["sources"] = altered["sources"][1:]
        with self.assertRaisesRegex(ValidationError, "Missing source"):
            validate(altered)

    def test_dropped_transition_fails_validation(self):
        altered = deepcopy(DATA)
        altered["fixtures"] = altered["fixtures"][1:]
        with self.assertRaisesRegex(ValidationError, "coverage is incomplete"):
            validate(altered)

    def test_swapped_expected_fold_candidates_fails(self):
        altered = deepcopy(DATA)
        next(f for f in altered["fixtures"] if f["expected_wall_status"] == "fold")["expected_reference_candidates"] = []
        with self.assertRaisesRegex(ValidationError, "wrong candidate set"):
            validate(altered)

    def test_research_record_cannot_silently_become_production(self):
        altered = deepcopy(DATA)
        altered["rules"][0]["production_eligible"] = True
        with self.assertRaisesRegex(ValidationError, "production-eligible"):
            validate(altered)

if __name__ == "__main__":
    unittest.main()
