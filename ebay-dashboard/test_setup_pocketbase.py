import importlib.util
import pathlib
import unittest
from unittest.mock import patch


MODULE_PATH = pathlib.Path(__file__).with_name("setup_pocketbase.py")
SPEC = importlib.util.spec_from_file_location("setup_pocketbase", MODULE_PATH)
SETUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SETUP)


class PocketBaseSecurityTests(unittest.TestCase):
    def setUp(self):
        self.users = {"id": "users_collection"}
        self.owner = {
            "name": "owner",
            "type": "relation",
            "collectionId": self.users["id"],
            "maxSelect": 1,
        }
        self.rules = SETUP.owner_security_rules()

    @patch.object(SETUP.requests, "get")
    @patch.object(SETUP, "request")
    def test_correct_owner_rules_are_left_unchanged(self, request, get):
        collection = {"name": "cards", "fields": [self.owner], **self.rules}
        get.return_value.ok = True
        get.return_value.json.return_value = {"items": []}

        SETUP.secure_existing_owner_collection(
            "https://example.test", "token", collection,
            self.users["id"], "cards",
        )

        get.assert_called_once()
        request.assert_not_called()

    @patch.object(SETUP.requests, "get")
    @patch.object(SETUP, "request")
    def test_missing_owner_field_stops_without_changing_rules(self, request, get):
        collection = {"name": "cards", "fields": [], **self.rules}

        with self.assertRaisesRegex(RuntimeError, "has no owner field"):
            SETUP.secure_existing_owner_collection(
                "https://example.test", "token", collection,
                self.users["id"], "cards",
            )

        get.assert_not_called()
        request.assert_not_called()

    @patch.object(SETUP.requests, "get")
    @patch.object(SETUP, "request")
    def test_unowned_records_stop_without_changing_rules(self, request, get):
        collection = {"name": "cards", "fields": [self.owner], **self.rules}
        get.return_value.ok = True
        get.return_value.json.return_value = {"items": [{"id": "unowned"}]}

        with self.assertRaisesRegex(RuntimeError, "records without an owner"):
            SETUP.secure_existing_owner_collection(
                "https://example.test", "token", collection,
                self.users["id"], "cards",
            )

        get.assert_called_once()
        request.assert_not_called()

    @patch.object(SETUP.requests, "get")
    @patch.object(SETUP, "request")
    def test_incorrect_owner_rules_are_repaired(self, request, get):
        collection = {
            "id": "cards_collection",
            "name": "cards",
            "fields": [self.owner],
            **{key: None for key in self.rules},
        }
        get.return_value.ok = True
        get.return_value.json.return_value = {"items": []}
        request.return_value = {}

        SETUP.secure_existing_owner_collection(
            "https://example.test", "token", collection,
            self.users["id"], "cards",
        )

        request.assert_called_once_with(
            "https://example.test", "token", "PATCH",
            "/api/collections/cards_collection", self.rules,
        )

    @patch.object(SETUP, "request")
    def test_unprotected_card_photo_is_protected(self, request):
        collection = {
            "id": "cards_collection",
            "name": "cards",
            "fields": [
                self.owner,
                {"name": "photo", "type": "file", "protected": False},
            ],
        }
        request.return_value = {}

        SETUP.protect_card_photo("https://example.test", "token", collection)

        request.assert_called_once()
        fields = request.call_args.args[4]["fields"]
        photo = next(field for field in fields if field["name"] == "photo")
        self.assertTrue(photo["protected"])

    @patch.object(SETUP, "request")
    def test_protected_card_photo_is_left_unchanged(self, request):
        collection = {
            "id": "cards_collection",
            "name": "cards",
            "fields": [
                self.owner,
                {"name": "photo", "type": "file", "protected": True},
            ],
        }

        SETUP.protect_card_photo("https://example.test", "token", collection)

        request.assert_not_called()

    @patch.object(SETUP, "request")
    def test_front_and_back_card_photos_are_protected(self, request):
        collection = {
            "id": "cards_collection",
            "name": "cards",
            "fields": [
                self.owner,
                {"name": "photo", "type": "file", "protected": True},
                {"name": "photo_back", "type": "file", "protected": False},
            ],
        }
        request.return_value = {}

        SETUP.protect_card_photo("https://example.test", "token", collection)

        fields = request.call_args.args[4]["fields"]
        photos = {
            field["name"]: field for field in fields
            if field["name"] in ("photo", "photo_back")
        }
        self.assertTrue(photos["photo"]["protected"])
        self.assertTrue(photos["photo_back"]["protected"])


if __name__ == "__main__":
    unittest.main()
