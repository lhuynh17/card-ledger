import importlib.util
import pathlib
import unittest
from unittest.mock import Mock, patch


MODULE_PATH = pathlib.Path(__file__).with_name("bright_data_validate.py")
SPEC = importlib.util.spec_from_file_location("bright_data_validate", MODULE_PATH)
VALIDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE)


class BrightDataValidationTests(unittest.TestCase):
    def test_filters_account_datasets_to_ebay(self):
        matches = VALIDATE.ebay_datasets([
            {"id": "one", "name": "Amazon products"},
            {"id": "two", "name": "eBay listings", "size": 100},
        ])

        self.assertEqual(matches, [{
            "id": "two", "name": "eBay listings", "size": 100,
        }])

    def test_metadata_reports_sold_and_active_signals_without_overclaiming(self):
        result = VALIDATE.metadata_summary("two", {
            "name": "eBay listings",
            "fields": {
                "title": {"type": "string"},
                "sold_date": {"type": "date"},
                "listing_status": {"type": "string"},
            },
        })

        self.assertTrue(result["sold_support_confirmed"])
        self.assertTrue(result["active_support_confirmed"])
        self.assertIn("necessary but not sufficient", result["note"])

    @patch.object(VALIDATE.requests, "get")
    def test_metadata_errors_do_not_echo_token(self, get):
        response = Mock(ok=False, status_code=401)
        get.return_value = response
        token = "fixture-secret-that-must-not-appear"

        with self.assertRaisesRegex(RuntimeError, "authentication failed") as raised:
            VALIDATE.inspect_account(token)

        self.assertNotIn(token, str(raised.exception))

    @patch.object(VALIDATE, "api_get")
    def test_selected_dataset_must_belong_to_account(self, api_get):
        api_get.return_value = [{"id": "two", "name": "eBay listings"}]

        with self.assertRaisesRegex(RuntimeError, "not an eBay dataset"):
            VALIDATE.inspect_account("fixture-token", "unknown")

        api_get.assert_called_once_with("/datasets/list", "fixture-token")


if __name__ == "__main__":
    unittest.main()
