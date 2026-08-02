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
    def test_one_time_refresh_preserves_evidence_and_clears_freshness(self):
        payload = {
            "inventory":[{"id":"card-1", "name":"Pikachu PSA 10"}],
            "valuations":[{
                "cardId":"card-1", "lastChecked":"2026-08-01T00:00:00Z",
                "marketValue":3000, "recentComparables":[{"id":"sale-1"}],
            }],
            "collector":{"extensionJobs":[
                {
                    "role":"sold", "status":"complete",
                    "search":"Pikachu PSA 10 -raw -ungraded",
                },
                {"role":"active", "status":"pending", "search":"other"},
            ]},
        }
        with patch.object(scraper, "write_data") as write_data, \
                patch.object(
                    scraper, "ebay_search_terms",
                    return_value="Pikachu PSA 10 -raw -ungraded",
                ):
            count = scraper.prepare_one_time_refresh(payload)
        self.assertEqual(count, 1)
        self.assertEqual(payload["valuations"][0]["lastChecked"], "")
        self.assertEqual(payload["valuations"][0]["marketValue"], 3000)
        self.assertEqual(
            payload["valuations"][0]["recentComparables"], [{"id":"sale-1"}]
        )
        self.assertEqual(len(payload["collector"]["extensionJobs"]), 1)
        write_data.assert_called_once_with(payload)

    def test_optional_status_failure_never_stops_collection(self):
        client = MagicMock()
        client.report_collector_status.side_effect = TypeError("bad status")
        with patch.object(scraper, "CLOUD_CLIENT", client):
            scraper.report_cloud_status("ready", "Safe message")
        client.report_collector_status.assert_called_once()

    def test_active_preference_error_is_safe_and_actionable(self):
        client = scraper.PocketBaseClient(
            "https://example.test", "owner@example.test", "unused"
        )
        client.request = MagicMock(side_effect=[
            TypeError("PocketBase 404: Not Found"),
            MagicMock(json=lambda: {"items": []}),
        ])
        with patch.object(scraper.requests, "RequestException", Exception), \
                patch.object(scraper, "report") as report_mock:
            self.assertEqual(client.active_inventory(), [])
        message = report_mock.call_args.args[0]
        self.assertIn("PocketBase 404", message)
        self.assertNotIn("owner@example.test", message)

    def test_pairing_key_state_is_outside_dashboard_document_root(self):
        self.assertFalse(
            str(scraper.EXTENSION_PAIRING_FILE).startswith(
                str(scraper.ROOT) + os.sep
            )
        )

    def test_default_cycle_starts_at_two_and_is_evaluation_only(self):
        with patch.dict(os.environ, {}, clear=True):
            config = scraper.collector_config()
        self.assertEqual(config["start"], (2, 0))
        self.assertEqual(config["end"], (12, 0))
        self.assertEqual(config["result_limit"], 1)
        self.assertEqual(config["proof_limit"], 0)
        self.assertTrue(config["evaluation_only"])

    def test_mode_summary_distinguishes_evaluation_and_production(self):
        evaluation = scraper.collector_mode_summary({
            "evaluation_only": True, "proof_limit": 3,
        })
        production = scraper.collector_mode_summary({
            "evaluation_only": False, "proof_limit": 0,
        })
        self.assertIn("EVALUATION ONLY", evaluation[0])
        self.assertIn("3 unique", evaluation[1])
        self.assertIn("GUARDED PRODUCTION", production[0])
        self.assertIn("disabled", production[1])

    def test_cached_values_stay_local_in_evaluation_mode(self):
        client = MagicMock()
        with patch.object(
            scraper, "collector_config", return_value={"evaluation_only": True}
        ), patch.object(scraper, "read_data") as read_data:
            self.assertEqual(
                scraper.sync_cached_valuations_to_cloud(client), 0
            )
        read_data.assert_not_called()
        client.upsert_valuation.assert_not_called()

    def test_production_reconciles_only_safe_current_inventory_cache(self):
        client = MagicMock()
        client.upsert_valuation.return_value = True
        payload = {
            "inventory":[{"id":"card-1"}],
            "valuations":[
                {
                    "cardId":"card-1", "error":"",
                    "recentComparables":[{"id":"sale-1", "total":5000}],
                },
                {
                    "cardId":"card-1", "error":"empty response",
                    "recentComparables":[{"id":"sale-2", "total":0}],
                },
                {
                    "cardId":"removed-card", "error":"",
                    "recentComparables":[{"id":"sale-3", "total":100}],
                },
            ],
        }
        with patch.object(
            scraper, "collector_config", return_value={"evaluation_only": False}
        ), patch.object(scraper, "read_data", return_value=payload):
            self.assertEqual(
                scraper.sync_cached_valuations_to_cloud(client), 1
            )
        client.upsert_valuation.assert_called_once_with(payload["valuations"][0])

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
        self.assertEqual(config["result_limit"], 1)
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

    def test_best_offer_only_search_is_saved_for_manual_verification(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"Gengar EX #090 1st Edition", "active_listing_count":0,
        }
        payload = {
            "inventory":[card], "valuations":[], "collector":{},
            "extensionJobs":[],
        }
        job = {
            "id":"job-1", "role":"sold", "status":"running",
            "search":"Gengar EX 090 PSA 10 1st Edition", "cards":[card],
        }
        items = [{
            "id":"123", "title":"Gengar EX 090 PSA 10 1st Edition",
            "priceText":"$7,200.00", "soldText":"Sold Jul 27, 2026",
            "bestOfferAccepted":True,
            "url":"https://www.ebay.com/itm/123",
        }]
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "data.json"
            with patch.object(scraper, "OUTPUT", output):
                scraper.finish_extension_job(payload, job, items)
                saved = scraper.read_data()
        self.assertEqual(saved["valuations"][0]["recentComparables"], [])
        self.assertEqual(len(saved["valuations"][0]["pendingBestOffers"]), 1)

    def test_recent_verified_sales_are_sorted_by_sold_date(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"Pokemon #400 Pikachu",
        }
        listings = [
            {
                "id":"old", "title":"Pikachu 400 PSA 10", "total":4609,
                "soldAt":"2026-05-06",
            },
            {
                "id":"new", "title":"Pikachu 400 PSA 10", "total":5100,
                "soldAt":"2026-07-16",
            },
        ]
        result = scraper.valuation(card, "Pikachu 400 PSA 10", listings)
        self.assertEqual(result["recentComparables"][0]["id"], "new")

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

    def test_extension_completion_saves_evidence_in_guarded_production(self):
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
            "id":"123", "title":"2023 Pokemon 199 Charizard PSA 10",
            "priceText":"$100.00", "shippingText":"Free shipping",
            "soldText":"Sold Jul 27, 2026",
            "url":"https://www.ebay.com/itm/123",
        }]
        client = MagicMock()
        client.upsert_valuation.return_value = True
        config = {"result_limit":3, "minimum_delay_minutes":12,
                  "evaluation_only":False}
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "data.json"
            with patch.object(scraper, "OUTPUT", output), \
                    patch.object(scraper, "CLOUD_CLIENT", client), \
                    patch.object(scraper, "collector_config",
                                 return_value=config):
                scraper.finish_extension_job(payload, job, items)
        client.upsert_valuation.assert_called_once()
        result = client.upsert_valuation.call_args.args[0]
        self.assertEqual(result["cardId"], "card-1")
        self.assertEqual(result["marketValue"], 100)

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

    def test_valuation_uses_only_the_most_recent_exact_sale(self):
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
                "soldAt":f"2026-07-{index:02d}T00:00:00Z",
            }
            for index, total in enumerate((100, 110, 120, 130), start=1)
        ]
        result = scraper.valuation(
            card, scraper.ebay_search_terms(card), listings, result_limit=3
        )
        self.assertEqual(len(result["recentComparables"]), 1)
        self.assertEqual(result["marketValue"], 130)

    def test_query_keeps_year_language_number_and_edition(self):
        card = {
            "company":"PSA", "grade":"10",
            "name":"2014 Pokemon Japanese Phantom Gate #090/088 Gengar EX 1st Ed",
            "ebay_search":"090 GENGAR EX 1ST ED",
        }
        query = scraper.ebay_search_terms(card)
        self.assertIn("2014", query)
        self.assertIn("JAPANESE", query)
        self.assertIn("090/088", query)
        self.assertIn("GENGAR EX", query)
        self.assertIn("1st Edition", query)
        self.assertIn('-"PSA 9"', query)

    def test_grade_must_be_attached_to_the_grading_company(self):
        card = {
            "company":"PSA", "grade":"10",
            "name":"2023 Pokemon #010 Charizard",
        }
        self.assertTrue(scraper.comparable(card, {
            "title":"2023 Pokemon Charizard 010 PSA 10 GEM MINT"
        }))
        self.assertFalse(scraper.comparable(card, {
            "title":"2023 Pokemon Charizard 010 PSA 9 MINT"
        }))
        status, reasons = scraper.listing_identity_assessment(card, {
            "title":"2023 Pokemon Charizard 010 PSA 9 MINT"
        })
        self.assertEqual(status, "rejected")
        self.assertIn("different_grader_or_grade", reasons)

    def test_wrong_variant_in_same_set_is_not_an_exact_match(self):
        card = {
            "company":"PSA", "grade":"10", "psa_year":"2016",
            "psa_subject":"Pikachu 20th Anniversary Festa",
            "psa_brand":"Pokemon Japanese XY Promo",
            "name":"2016 Pokemon Japanese XY Promo Pikachu Festa",
        }
        self.assertTrue(scraper.comparable(card, {
            "title":"2016 Japanese XY Promo Pikachu 20th Anniversary Festa PSA 10"
        }))
        self.assertFalse(scraper.comparable(card, {
            "title":"2016 Japanese XY Promo Pikachu Battle Festa PSA 10"
        }))

    def test_query_prefers_structured_psa_identity_fields(self):
        card = {
            "company":"PSA", "grade":"10", "name":"Gengar card",
            "psa_year":"2014", "psa_subject":"Gengar EX",
            "psa_brand":"Pokemon Japanese XY Phantom Gate",
            "psa_card_number":"090/088",
            "ebay_search":"old broad gengar search",
        }
        query = scraper.ebay_search_terms(card)
        for required in (
            "2014", "JAPANESE", "XY PHANTOM GATE", "GENGAR EX",
            "090/088", '"PSA 10"', "-raw", "-ungraded",
        ):
            self.assertIn(required, query)

    def test_gengar_requires_year_language_and_full_card_number(self):
        card = {
            "id":"card-1",
            "company":"PSA", "grade":"10",
            "name":"2014 Pokemon Japanese Phantom Gate #090/088 Gengar EX 1st Ed",
        }
        valid = {"title":"2014 Japanese Phantom Gate Gengar EX 090/088 PSA 10 1st Edition"}
        self.assertTrue(scraper.comparable(card, valid))
        for title in (
            "2014 Japanese Phantom Gate Gengar EX 090/088 PSA 10 Unlimited",
            "2014 Japanese Phantom Gate Gengar EX 090/087 PSA 10 1st Edition",
            "2014 English Phantom Gate Gengar EX 090/088 PSA 10 1st Edition",
            "2015 Japanese Phantom Gate Gengar EX 090/088 PSA 10 1st Edition",
            "2014 Japanese Gengar EX 090 PSA 10 1st Edition",
        ):
            self.assertFalse(scraper.comparable(card, {"title":title}), title)

    def test_incomplete_but_plausible_gengar_is_sent_for_confirmation(self):
        card = {
            "id":"card-1",
            "company":"PSA", "grade":"10",
            "name":"2014 Pokemon Japanese Phantom Gate #090/088 Gengar EX 1st Ed",
        }
        listing = {
            "id":"maybe-1", "title":"Japanese Gengar EX 090 PSA 10",
            "total":4100, "soldAt":"2026-07-31T00:00:00Z",
        }
        result = scraper.valuation(card, scraper.ebay_search_terms(card), [listing])
        self.assertEqual(result["marketValue"], 0)
        self.assertEqual(result["recentComparables"], [])
        self.assertEqual(result["reviewCandidates"][0]["id"], "maybe-1")
        self.assertIn(
            "printed_number_missing",
            result["reviewCandidates"][0]["reviewReasons"],
        )

    def test_explicit_identity_conflicts_are_rejected_not_reviewed(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"2014 Pokemon Japanese Phantom Gate #090/088 Gengar EX 1st Ed",
        }
        titles = (
            "2015 Japanese Phantom Gate Gengar EX 090/088 PSA 10 1st Edition",
            "2014 English Phantom Gate Gengar EX 090/088 PSA 10 1st Edition",
            "2014 Japanese Phantom Gate Gengar EX 090/087 PSA 10 1st Edition",
            "2014 Japanese Phantom Gate Gengar EX 090/088 PSA 10 Unlimited",
        )
        for title in titles:
            status, reasons = scraper.listing_identity_assessment(
                card, {"title":title}
            )
            self.assertEqual(status, "rejected", (title, reasons))

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
            first, {**base, "title":"2014 Gengar EX 090 PSA 10 1st Edition"}
        ))
        self.assertFalse(scraper.comparable(
            first, {**base, "title":"2014 Gengar EX 090 PSA 10 Unlimited"}
        ))
        self.assertFalse(scraper.comparable(
            unlimited, {**base, "title":"2014 Gengar EX 090 PSA 10 1st Edition"}
        ))
        self.assertTrue(scraper.comparable(
            unlimited, {**base, "title":"2014 Gengar EX 090 PSA 10 Unlimited"}
        ))

    def test_explicit_card_number_must_match(self):
        card = {
            "company":"PSA", "grade":"10",
            "name":"2016 Pokemon Japanese XY Promo #279 Pikachu Festa",
        }
        self.assertTrue(scraper.comparable(card, {
            "title":"2016 Japanese Pokemon XY Promo 279 Pikachu Festa PSA 10"
        }))
        self.assertFalse(scraper.comparable(card, {
            "title":"2016 Pokemon XY Promo 224 Pikachu PSA 10"
        }))
        status, _ = scraper.listing_identity_assessment(card, {
            "title":"2016 Japanese Pokemon XY Promo #224 Pikachu PSA 10"
        })
        self.assertEqual(status, "rejected")

    def test_shared_character_but_wrong_variant_is_not_reviewable(self):
        card = {
            "company":"PSA", "grade":"10", "psa_year":"2016",
            "psa_subject":"Pikachu Holo 20th Anniversary Festa",
            "psa_brand":"Pokemon Japanese XY Promo",
            "psa_card_number":"279",
            "name":"2016 Pokemon Japanese XY Promo #279 Pikachu Festa",
        }
        status, _ = scraper.listing_identity_assessment(card, {
            "title":"2016 Japanese Pikachu Battle Promo PSA 10"
        })
        self.assertEqual(status, "rejected")

    def test_latest_exact_sale_is_used_even_when_prices_swing(self):
        card = {
            "id":"card-1", "company":"PSA", "grade":"10",
            "name":"Pokemon #090 Gengar EX",
        }
        listings = [
            {"id":str(index), "title":"Gengar EX 090 PSA 10", "total":total,
             "soldAt":f"2026-07-{4-index:02d}T00:00:00Z"}
            for index, total in enumerate((8000, 4000, 3900), start=1)
        ]
        result = scraper.valuation(card, "Gengar EX 090 PSA 10", listings)
        self.assertEqual(result["comparableCount"], 3)
        self.assertEqual(result["marketValue"], 8000)
        self.assertEqual(result["volatility"], "unknown")

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

    def test_empty_recent_result_is_retried_before_verified_cache(self):
        now = datetime.now().astimezone()
        old_enough_for_empty = (
            now.replace(microsecond=0)
            - scraper.timedelta(hours=scraper.EMPTY_RESULT_RETRY_HOURS + 1)
        ).isoformat()
        payload = {
            "inventory":[{
                "id":"card-1", "company":"PSA", "grade":"10",
                "name":"Pokemon #400 Pikachu",
            }],
            "valuations":[{
                "cardId":"card-1", "lastChecked":old_enough_for_empty,
                "recentComparables":[], "pendingBestOffers":[],
            }],
        }
        self.assertEqual(
            scraper.next_due_group(payload)[0]["id"], "card-1"
        )

    def test_high_confidence_auto_update_preserves_history(self):
        result = {
            "cardId":"card-1", "marketValue":5000, "confidence":"high",
            "identityConfidence":"high", "volatility":"high",
            "lastChecked":"2026-07-30T12:00:00+00:00",
            "recentComparables":[{"id":"sale-1", "total":5000}],
        }
        previous = {
            "market_value":4200, "source":"Manual",
            "history":[{"date":"2026-07-01", "value":4200, "source":"Manual"}],
        }
        payload = scraper.automatic_market_payload(result, previous, "owner-1")
        self.assertEqual(payload["market_value"], 5000)
        self.assertEqual(payload["auto_status"], "automatic")
        self.assertEqual(payload["history"][-1]["value"], 5000)
        self.assertEqual(payload["algorithm_version"], "local-ebay-v5")

    def test_low_confidence_is_provisional_and_keeps_trusted_value(self):
        result = {
            "cardId":"card-1", "marketValue":5000, "confidence":"low",
            "lastChecked":"2026-07-30T12:00:00+00:00",
            "recentComparables":[{"id":"sale-1", "total":5000}],
        }
        payload = scraper.automatic_market_payload(
            result, {"market_value":4200, "source":"Manual"}, "owner-1"
        )
        self.assertEqual(payload["market_value"], 4200)
        self.assertEqual(payload["suggested_value"], 5000)
        self.assertEqual(payload["auto_status"], "provisional")

    def test_new_exact_sale_rolls_history_and_sales_to_three(self):
        result = {
            "cardId":"card-1", "marketValue":4000, "confidence":"high",
            "lastChecked":"2026-08-01T07:00:00+00:00",
            "recentComparables":[{
                "id":"sale-4", "total":4000,
                "soldAt":"2026-08-01T06:00:00+00:00",
            }],
        }
        previous = {
            "market_value":3900, "source":"Local eBay collector",
            "comparables":[
                {"id":"sale-3", "total":3900, "soldAt":"2026-07-31"},
                {"id":"sale-2", "total":3800, "soldAt":"2026-07-30"},
                {"id":"sale-1", "total":3700, "soldAt":"2026-07-29"},
            ],
            "history":[
                {"date":"2026-07-29", "value":3700},
                {"date":"2026-07-30", "value":3800},
                {"date":"2026-07-31", "value":3900},
            ],
        }
        payload = scraper.automatic_market_payload(result, previous, "owner-1")
        self.assertEqual(payload["market_value"], 4000)
        self.assertEqual(
            [sale["id"] for sale in payload["comparables"]],
            ["sale-4", "sale-3", "sale-2"],
        )
        self.assertEqual(len(payload["history"]), 3)
        self.assertEqual(payload["history"][-1]["listingId"], "sale-4")

    def test_dramatic_price_change_requires_review(self):
        result = {
            "cardId":"card-1", "marketValue":167, "confidence":"high",
            "lastChecked":"2026-07-31T12:00:00+00:00",
            "recentComparables":[
                {"id":"sale-1", "total":160},
                {"id":"sale-2", "total":167},
                {"id":"sale-3", "total":175},
            ],
        }
        payload = scraper.automatic_market_payload(
            result, {"market_value":3500, "source":"Manual"}, "owner-1"
        )
        self.assertEqual(payload["market_value"], 3500)
        self.assertEqual(payload["suggested_value"], 167)
        self.assertEqual(payload["auto_status"], "provisional")


if __name__ == "__main__":
    unittest.main()
