import importlib.util
import pathlib
import unittest
from unittest.mock import Mock, patch


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

    @patch.object(SETUP.requests, "post")
    def test_superuser_password_auth_without_mfa(self, post):
        response = Mock(ok=True, content=b"{}", status_code=200)
        response.json.return_value = {"token": "password-token"}
        post.return_value = response

        token = SETUP.authenticate(
            "https://example.test", "admin@example.test", "password"
        )

        self.assertEqual(token, "password-token")
        self.assertEqual(post.call_count, 1)

    @patch.object(SETUP.getpass, "getpass", return_value="123456")
    @patch.object(SETUP.requests, "post")
    def test_superuser_mfa_requests_and_verifies_otp(self, post, getpass):
        password_response = Mock(ok=False, content=b"{}", status_code=401)
        password_response.json.return_value = {"mfaId": "mfa-session"}
        otp_request = Mock(ok=True, content=b"{}", status_code=200)
        otp_request.json.return_value = {"otpId": "otp-request"}
        otp_auth = Mock(ok=True, content=b"{}", status_code=200)
        otp_auth.json.return_value = {"token": "mfa-token"}
        post.side_effect = [password_response, otp_request, otp_auth]

        token = SETUP.authenticate(
            "https://example.test", "admin@example.test", "password"
        )

        self.assertEqual(token, "mfa-token")
        self.assertEqual(post.call_count, 3)
        self.assertEqual(
            post.call_args_list[2].kwargs["json"],
            {
                "otpId": "otp-request",
                "password": "123456",
                "mfaId": "mfa-session",
            },
        )
        getpass.assert_called_once()

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

    def test_profile_logo_field_is_small_and_protected(self):
        logo = next(
            field for field in SETUP.PREFERENCE_FIELDS
            if field["name"] == "profile_logo"
        )

        self.assertTrue(logo["protected"])
        self.assertEqual(logo["maxSelect"], 1)
        self.assertLessEqual(logo["maxSize"], 2 * 1024 * 1024)

    def test_grading_item_photo_is_single_and_protected(self):
        photo = next(
            field for field in SETUP.GRADING_ITEM_FIELDS
            if field["name"] == "photo"
        )

        self.assertTrue(photo["protected"])
        self.assertEqual(photo["maxSelect"], 1)
        self.assertLessEqual(photo["maxSize"], 10 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()
