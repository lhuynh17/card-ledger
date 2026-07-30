import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.modules.setdefault("requests", MagicMock())
sys.modules.setdefault("bs4", MagicMock())
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scraper


class CollectorConfigurationTests(unittest.TestCase):
    def test_pairing_key_state_is_outside_dashboard_document_root(self):
        self.assertFalse(
            str(scraper.EXTENSION_PAIRING_FILE).startswith(
                str(scraper.ROOT) + os.sep
            )
        )

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
    def test_extension_items_require_ebay_url_price_and_sold_date(self):
        items = scraper.normalize_extension_items([
            {
                "id":"123",
                "title":"2023 Pokemon 199 Charizard PSA 10",
                "priceText":"$100.00",
                "shippingText":"Free shipping",
                "soldText":"Sold Jul 27, 2026",
                "url":"https://www.ebay.com/itm/123",
            },
            {
                "id":"124",
                "title":"Missing sold date",
                "priceText":"$10.00",
                "url":"https://www.ebay.com/itm/124",
            },
            {
                "id":"125",
                "title":"Wrong host",
                "priceText":"$10.00",
                "soldText":"Sold Jul 27, 2026",
                "url":"https://example.com/itm/125",
            },
        ], "sold", "charizard")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["soldAt"], "2026-07-27")

    def test_best_offer_is_retained_without_using_displayed_price(self):
        items = scraper.normalize_extension_items([{
            "id":"123",
            "title":"Gengar EX 090 PSA 10 1st Edition",
            "priceText":"$7,200.00",
            "soldText":"Sold Jul 27, 2026",
            "bestOfferAccepted":True,
            "url":"https://www.ebay.com/itm/123",
        }], "sold", "gengar")
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["priceVerificationRequired"])
        self.assertEqual(items[0]["total"], 0)
        self.assertEqual(items[0]["displayedAskingPrice"], 7200)

    def test_extension_completion_stays_in_local_evaluation_file(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"2023 Pokemon #199 Charizard",
            "active_listing_count":0,
        }
        payload = {
            "inventory":[card], "valuations":[], "collector":{},
            "extensionJobs":[],
        }
        job = {
            "id":"job-1", "role":"sold", "status":"running",
            "search":"2023 Pokemon 199 Charizard PSA 10",
            "cards":[card],
        }
        payload["extensionJobs"].append(job)
        items = [{
            "id":"123",
            "title":"2023 Pokemon 199 Charizard PSA 10",
            "priceText":"$100.00",
            "shippingText":"Free shipping",
            "soldText":"Sold Jul 27, 2026",
            "url":"https://www.ebay.com/itm/123",
        }]
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "data.json"
            with patch.object(scraper, "OUTPUT", output):
                scraper.finish_extension_job(payload, job, items)
                saved = scraper.read_data()
        self.assertEqual(job["status"], "complete")
        self.assertEqual(saved["valuations"][0]["marketValue"], 100)
        self.assertEqual(saved["valuations"][0]["recentComparables"][0]["soldAt"],
                         "2026-07-27")

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

    def test_query_drops_year_and_language_but_keeps_edition(self):
        card = {
            "company":"PSA", "grade":"10",
            "ebay_search":"2014 JAPANESE 090 GENGAR EX 1ST ED",
        }
        query = scraper.ebay_search_terms(card)
        self.assertNotIn("2014", query)
        self.assertNotIn("JAPANESE", query)
        self.assertIn("090 GENGAR EX 1ST ED", query)

    def test_first_edition_and_unlimited_are_not_interchangeable(self):
        first = {
            "company":"PSA", "grade":"10",
            "name":"2014 Pokemon #090 Gengar EX 1st Ed",
        }
        unlimited = {
            "company":"PSA", "grade":"10",
            "name":"2014 Pokemon #090 Gengar EX Unlimited",
        }
        base = {"id":"1", "total":100}
        self.assertTrue(scraper.comparable(
            first, {**base, "title":"Gengar EX 090 PSA 10 1st Edition"}
        ))
        self.assertFalse(scraper.comparable(
            first, {**base, "title":"Gengar EX 090 PSA 10 Unlimited"}
        ))
        self.assertFalse(scraper.comparable(
            unlimited, {**base, "title":"Gengar EX 090 PSA 10 1st Edition"}
        ))
        self.assertTrue(scraper.comparable(
            unlimited, {**base, "title":"Gengar EX 090 PSA 10 Unlimited"}
        ))

    def test_real_price_swing_is_labeled_not_removed(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"Pokemon #090 Gengar EX",
        }
        listings = [
            {"id":str(index), "title":"Gengar EX 090 PSA 10", "total":total}
            for index, total in enumerate((8000, 4000, 3900), start=1)
        ]
        result = scraper.valuation(card, "Gengar EX 090 PSA 10", listings)
        self.assertEqual(result["comparableCount"], 3)
        self.assertEqual(result["marketValue"], 4000)
        self.assertEqual(result["volatility"], "high")

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
