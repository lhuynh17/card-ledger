import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.modules.setdefault("requests", MagicMock())
sys.modules.setdefault("bs4", MagicMock())
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scraper


class CollectorConfigurationTests(unittest.TestCase):
    def test_default_proof_is_all_day_local_and_evaluation_only(self):
        with patch.dict(os.environ, {}, clear=True):
            config = scraper.collector_config()
        self.assertEqual(config["start"], (0, 0))
        self.assertEqual(config["end"], (0, 0))
        self.assertEqual(config["result_limit"], 3)
        self.assertEqual(config["proof_limit"], 3)
        self.assertTrue(config["evaluation_only"])

    def test_collection_window_supports_day_and_cross_midnight_ranges(self):
        self.assertTrue(
            scraper.within_collection_window(
                datetime(2026, 7, 28, 18, 30), (0, 0), (0, 0)
            )
        )
        self.assertTrue(
            scraper.within_collection_window(
                datetime(2026, 7, 28, 4, 30), (4, 0), (7, 0)
            )
        )
        self.assertFalse(
            scraper.within_collection_window(
                datetime(2026, 7, 28, 8, 0), (4, 0), (7, 0)
            )
        )
        self.assertTrue(
            scraper.within_collection_window(
                datetime(2026, 7, 28, 23, 0), (22, 0), (2, 0)
            )
        )
        self.assertTrue(
            scraper.within_collection_window(
                datetime(2026, 7, 29, 1, 0), (22, 0), (2, 0)
            )
        )

    def test_limits_cannot_exceed_documented_safety_bounds(self):
        values = {
            "SLAB_COLLECTOR_DAILY_CEILING": "9999",
            "SLAB_COLLECTOR_RESULT_LIMIT": "20",
            "SLAB_COLLECTOR_MIN_DELAY_MINUTES": "15",
            "SLAB_COLLECTOR_MAX_DELAY_MINUTES": "2",
        }
        with patch.dict(os.environ, values, clear=True):
            config = scraper.collector_config()
        self.assertEqual(config["daily_ceiling"], scraper.MAX_REQUESTS_PER_DAY)
        self.assertEqual(config["result_limit"], 3)
        self.assertEqual(config["minimum_delay_minutes"], 15)
        self.assertEqual(config["maximum_delay_minutes"], 15)


class SoldResultTests(unittest.TestCase):
    def test_sold_date_requires_explicit_completed_sale_text(self):
        self.assertEqual(
            scraper.sold_date("Sold Jul 27, 2026"), "2026-07-27"
        )
        self.assertEqual(scraper.sold_date("Active listing"), "")

    def test_ebay_query_explicitly_requests_sold_completed_newest(self):
        card = {
            "id": "card-1",
            "company": "PSA",
            "grade": "10",
            "name": "2023 Pokemon #199 Charizard",
        }
        result = scraper.valuation(card, scraper.ebay_search_terms(card), [])
        self.assertIn("LH_Sold=1", result["searchUrl"])
        self.assertIn("LH_Complete=1", result["searchUrl"])
        self.assertIn("_sop=13", result["searchUrl"])

    def test_valuation_retains_only_requested_recent_results(self):
        card = {
            "id": "card-1",
            "company": "PSA",
            "grade": "10",
            "name": "2023 Pokemon #199 Charizard",
        }
        listings = [
            {
                "id": str(index),
                "title": "2023 Pokemon 199 Charizard PSA 10",
                "total": total,
            }
            for index, total in enumerate((100, 110, 120, 130), start=1)
        ]
        result = scraper.valuation(
            card, scraper.ebay_search_terms(card), listings, result_limit=3
        )
        self.assertEqual(len(result["recentComparables"]), 3)
        self.assertEqual(result["marketValue"], 110)

    def test_empty_results_never_create_a_positive_or_blank_estimate(self):
        card = {
            "id": "card-1",
            "company": "PSA",
            "grade": "10",
            "name": "2023 Pokemon #199 Charizard",
        }
        result = scraper.valuation(card, scraper.ebay_search_terms(card), [])
        self.assertEqual(result["recentComparables"], [])
        self.assertEqual(result["marketValue"], 0)

    def test_active_asking_prices_are_separate_lowest_three(self):
        card = {
            "id": "card-1",
            "company": "PSA",
            "grade": "10",
            "name": "2023 Pokemon #199 Charizard",
        }
        listings = [
            {
                "id": str(index),
                "title": "2023 Pokemon 199 Charizard PSA 10",
                "total": total,
            }
            for index, total in enumerate((130, 90, 110, 100), start=1)
        ]
        selected = scraper.lowest_active_comparables(card, listings, 3)
        self.assertEqual([item["total"] for item in selected], [90, 100, 110])


if __name__ == "__main__":
    unittest.main()
