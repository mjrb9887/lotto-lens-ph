import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from archive import prune_history, retention_start, parse_page, source_urls, SourceUnavailable

class RetentionTests(unittest.TestCase):
    def test_calendar_year_and_leap_day(self):
        self.assertEqual(retention_start(date(2026, 10, 10)), date(2025, 10, 10))
        self.assertEqual(retention_start(date(2024, 2, 29)), date(2023, 2, 28))

    def test_prunes_old_and_future_records_deduplicates_by_date(self):
        row = lambda d: {"date": d, "numbers": [1,2,3,4,5,6]}
        h = {"games": {"6/42": [row("2025-10-09"), row("2025-10-10"), row("2026-10-09"), row("2026-10-09"), row("2026-10-11")]}}
        prune_history(h, date(2026, 10, 10))
        self.assertEqual([r["date"] for r in h["games"]["6/42"]], ["2026-10-09", "2025-10-10"])

    def test_conflicting_same_day_results_fail(self):
        h = {"games": {"6/42": [{"date":"2026-01-01", "numbers":[1,2,3,4,5,6]}, {"date":"2026-01-01", "numbers":[1,2,3,4,5,7]}]}}
        with self.assertRaises(ValueError): prune_history(h, date(2026,10,10))

    def test_publisher_fixtures_and_wrong_dates(self):
        fixtures = Path(__file__).parent / "fixtures"
        for filename, selected, source in [("gma.html", date(2026,1,1), 0), ("summit.html", date(2023,1,3), 1)]:
            label, url = source_urls(selected)[source]
            found = parse_page((fixtures / filename).read_text(), selected, label, url)
            self.assertEqual(found["6/42"]["date"], selected.isoformat())
            with self.assertRaises(SourceUnavailable):
                parse_page((fixtures / filename).read_text(), date(2026,1,2), label, url)

if __name__ == "__main__": unittest.main()
