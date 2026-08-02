"""Non-destructive PocketBase installer for Slab Ledger business records."""

from __future__ import annotations

import getpass
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / "collector.env"
SETUP_ENV_FILE = ROOT / "pocketbase-setup.env"
TIMEOUT = 25

MARKET_FIELDS = [
    {"name": "card_id", "type": "text", "required": True, "max": 100},
    {"name": "query", "type": "text", "max": 2000},
    {"name": "search_url", "type": "url"},
    {"name": "market_value", "type": "number"},
    {"name": "confidence", "type": "select", "maxSelect": 1,
     "values": ["low", "medium", "high"]},
    {"name": "identity_confidence", "type": "select", "maxSelect": 1,
     "values": ["low", "medium", "high"]},
    {"name": "volatility", "type": "select", "maxSelect": 1,
     "values": ["unknown", "stable", "moderate", "high"]},
    {"name": "auto_status", "type": "select", "maxSelect": 1,
     "values": ["manual", "automatic", "provisional", "attention"]},
    {"name": "suggested_value", "type": "number", "min": 0},
    {"name": "checked_at", "type": "date"},
    {"name": "comparable_count", "type": "number", "onlyInt": True},
    {"name": "rejected_count", "type": "number", "onlyInt": True},
    {"name": "low", "type": "number"},
    {"name": "high", "type": "number"},
    {"name": "comparables", "type": "json", "maxSize": 2000000},
    {"name": "pending_best_offers", "type": "json", "maxSize": 2000000},
    {"name": "active_listings", "type": "json", "maxSize": 2000000},
    {"name": "review_candidates", "type": "json", "maxSize": 2000000},
    {"name": "algorithm_version", "type": "text", "max": 80},
    {"name": "source", "type": "text", "max": 200},
    {"name": "notes", "type": "text", "max": 10000},
    {"name": "history", "type": "json", "maxSize": 2000000},
    {"name": "error", "type": "text", "max": 5000},
]

BUSINESS_FIELDS = [
    {"name": "entry_date", "type": "date", "required": True},
    {"name": "entry_type", "type": "select", "required": True, "maxSelect": 1,
     "values": ["expense", "contribution", "draw", "other_income",
                "loan_in", "loan_payment"]},
    {"name": "category", "type": "text", "max": 300},
    {"name": "amount", "type": "number", "required": True, "min": 0},
    {"name": "vendor", "type": "text", "max": 500},
    {"name": "deductible_percent", "type": "number", "min": 0, "max": 100},
    {"name": "notes", "type": "text", "max": 10000},
    {"name": "receipt", "type": "file", "maxSelect": 1,
     "maxSize": 10485760, "protected": True,
     "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/heic",
                   "image/heif", "application/pdf"]},
]

CARD_EXTRA_FIELDS = [
    {"name": "ebay_search", "type": "text", "max": 1000},
    {"name": "psa_year", "type": "text", "max": 20},
    {"name": "psa_subject", "type": "text", "max": 500},
    {"name": "psa_brand", "type": "text", "max": 500},
    {"name": "psa_card_number", "type": "text", "max": 100},
    {"name": "psa_spec_id", "type": "text", "max": 100},
    {"name": "photo_back", "type": "file", "maxSelect": 1,
     "maxSize": 10485760, "protected": True,
     "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/heic",
                   "image/heif"]},
    {"name": "selling_fees", "type": "number", "min": 0},
    {"name": "shipping_cost", "type": "number", "min": 0},
    {"name": "psa_estimate", "type": "number", "min": 0},
    {"name": "psa_estimate_updated", "type": "date"},
    {"name": "psa_sales_count", "type": "number", "min": 0, "onlyInt": True},
]

PREFERENCE_FIELDS = [
    {"name": "bank_capital", "type": "number", "min": 0},
    {"name": "cash_capital", "type": "number", "min": 0},
    {"name": "capital_note", "type": "text", "max": 2000},
    {"name": "display_name", "type": "text", "max": 120},
    {"name": "profile_logo", "type": "file", "maxSelect": 1,
     "maxSize": 2097152, "protected": True,
     "mimeTypes": ["image/jpeg", "image/png", "image/webp"]},
    {"name": "parse_credits_month", "type": "text", "max": 7},
    {"name": "parse_credits_used", "type": "number", "min": 0,
     "onlyInt": True},
    {"name": "parse_credit_balance", "type": "number", "min": 0,
     "onlyInt": True},
    {"name": "parse_credit_reset_at", "type": "text", "max": 10},
    {"name": "parse_credit_used_at_sync", "type": "number", "min": 0,
     "onlyInt": True},
]

MARKETPLACE_USAGE_FIELDS = [
    {"name": "period_type", "type": "select", "required": True, "maxSelect": 1,
     "values": ["day", "month"]},
    {"name": "period", "type": "text", "required": True, "max": 10},
    {"name": "records_used", "type": "number", "min": 0, "onlyInt": True},
    {"name": "operations", "type": "number", "min": 0, "onlyInt": True},
    {"name": "cache_hits", "type": "number", "min": 0, "onlyInt": True},
    {"name": "usage_by_feature", "type": "json", "maxSize": 100000},
]

MARKETPLACE_ACTIVITY_FIELDS = [
    {"name": "provider", "type": "text", "required": True, "max": 50},
    {"name": "operation_id", "type": "text", "required": True, "max": 100},
    {"name": "feature", "type": "text", "max": 80},
    {"name": "status", "type": "text", "required": True, "max": 40},
    {"name": "records_used", "type": "number", "min": 0, "onlyInt": True},
    {"name": "cache_hit", "type": "bool"},
    {"name": "safe_message", "type": "text", "max": 500},
    {"name": "expires_at", "type": "date", "required": True},
]

MARKETPLACE_CACHE_FIELDS = [
    {"name": "provider", "type": "text", "required": True, "max": 50},
    {"name": "query_hash", "type": "text", "required": True, "max": 100},
    {"name": "query_summary", "type": "text", "max": 300},
    {"name": "results", "type": "json", "maxSize": 2000000},
    {"name": "rejection_counts", "type": "json", "maxSize": 100000},
    {"name": "records_returned", "type": "number", "min": 0, "onlyInt": True},
    {"name": "retrieved_at", "type": "date"},
    {"name": "expires_at", "type": "date", "required": True},
]

MARKETPLACE_OBSERVATION_FIELDS = [
    {"name": "provider", "type": "text", "required": True, "max": 50},
    {"name": "listing_id", "type": "text", "required": True, "max": 2000},
    {"name": "query_hash", "type": "text", "required": True, "max": 100},
    {"name": "card_id", "type": "text", "max": 100},
    {"name": "marketplace", "type": "text", "required": True, "max": 30},
    {"name": "title", "type": "text", "required": True, "max": 1000},
    {"name": "sold_at", "type": "date"},
    {"name": "price", "type": "number", "min": 0},
    {"name": "shipping", "type": "number", "min": 0},
    {"name": "total", "type": "number", "min": 0},
    {"name": "currency", "type": "text", "max": 10},
    {"name": "condition", "type": "text", "max": 200},
    {"name": "listing_url", "type": "url"},
    {"name": "retrieved_at", "type": "date", "required": True},
    {"name": "match_status", "type": "select", "required": True, "maxSelect": 1,
     "values": ["accepted", "rejected"]},
    {"name": "rejection_reason", "type": "text", "max": 80},
    {"name": "algorithm_version", "type": "text", "max": 80},
    {"name": "expires_at", "type": "date", "required": True},
]

MARKETPLACE_REFRESH_SETTING_FIELDS = [
    {"name": "enabled", "type": "bool"},
    {"name": "listing_count", "type": "number", "required": True,
     "min": 3, "max": 5, "onlyInt": True},
    {"name": "interval_unit", "type": "select", "required": True,
     "maxSelect": 1, "values": ["hours", "days", "weeks", "months"]},
    {"name": "interval_value", "type": "number", "required": True,
     "min": 1, "max": 720, "onlyInt": True},
    {"name": "last_run_at", "type": "date"},
    {"name": "next_run_at", "type": "date"},
    {"name": "sold_enabled", "type": "bool"},
    {"name": "sold_listing_count", "type": "number", "min": 1, "max": 2,
     "onlyInt": True},
    {"name": "sold_interval_unit", "type": "select", "maxSelect": 1,
     "values": ["hours", "days", "weeks", "months"]},
    {"name": "sold_interval_value", "type": "number", "min": 1, "max": 720,
     "onlyInt": True},
    {"name": "active_enabled", "type": "bool"},
    {"name": "active_listing_count", "type": "number", "min": 3, "max": 5,
     "onlyInt": True},
    {"name": "active_interval_unit", "type": "select", "maxSelect": 1,
     "values": ["hours", "days", "weeks", "months"]},
    {"name": "active_interval_value", "type": "number", "min": 1, "max": 720,
     "onlyInt": True},
]

MARKETPLACE_REFRESH_STATE_FIELDS = [
    {"name": "card_id", "type": "text", "required": True, "max": 100},
    {"name": "last_run_at", "type": "date"},
    {"name": "next_run_at", "type": "date"},
    {"name": "status", "type": "text", "max": 40},
    {"name": "records_used", "type": "number", "min": 0, "onlyInt": True},
    {"name": "safe_error", "type": "text", "max": 500},
    {"name": "schedule_override", "type": "json"},
    {"name": "sold_last_run_at", "type": "date"},
    {"name": "sold_next_run_at", "type": "date"},
    {"name": "active_last_run_at", "type": "date"},
    {"name": "active_next_run_at", "type": "date"},
]

MARKETPLACE_COLLECTOR_STATUS_FIELDS = [
    {"name": "collector_id", "type": "text", "required": True, "max": 80},
    {"name": "status", "type": "select", "required": True, "maxSelect": 1,
     "values": ["starting", "ready", "working", "attention", "cooldown",
                "offline", "error"]},
    {"name": "safe_message", "type": "text", "max": 500},
    {"name": "card_id", "type": "text", "max": 100},
    {"name": "heartbeat_at", "type": "date", "required": True},
    {"name": "last_success_at", "type": "date"},
    {"name": "next_check_at", "type": "date"},
    {"name": "action_required_at", "type": "date"},
]

DEBT_FIELDS = [
    {"name": "direction", "type": "select", "required": True, "maxSelect": 1,
     "values": ["owed_to_me", "i_owe"]},
    {"name": "person", "type": "text", "required": True, "max": 500},
    {"name": "amount", "type": "number", "required": True, "min": 0},
    {"name": "reminder_date", "type": "date", "required": True},
    {"name": "notes", "type": "text", "max": 2000},
    {"name": "settled", "type": "bool"},
]

EXCEPTION_FIELDS = [
    {"name": "exception_date", "type": "date", "required": True},
    {"name": "exception_type", "type": "select", "required": True,
     "maxSelect": 1,
     "values": ["personal_paid_business", "business_received_personal",
                "personal_reimbursement", "other"]},
    {"name": "amount", "type": "number", "min": 0},
    {"name": "account_source", "type": "text", "max": 500},
    {"name": "notes", "type": "text", "required": True, "max": 10000},
    {"name": "reviewed", "type": "bool"},
]

GRADING_PLAY_FIELDS = [
    {"name": "play_name", "type": "text", "required": True, "max": 1000},
    {"name": "submitted_date", "type": "date"},
    {"name": "status", "type": "select", "required": True, "maxSelect": 1,
     "values": ["planning", "submitted", "returned", "selling", "complete"]},
    {"name": "notes", "type": "text", "max": 5000},
]

GRADING_ITEM_FIELDS = [
    {"name": "card_name", "type": "text", "required": True, "max": 1000},
    {"name": "quantity", "type": "number", "required": True, "min": 1,
     "onlyInt": True},
    {"name": "raw_cost_each", "type": "number", "min": 0},
    {"name": "grading_cost_each", "type": "number", "min": 0},
    {"name": "photo", "type": "file", "maxSelect": 1,
     "maxSize": 10485760, "protected": True,
     "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/heic",
                   "image/heif"]},
    {"name": "notes", "type": "text", "max": 2000},
]


def grading_card_fields(play_collection_id: str):
    return [
        {"name": "play", "type": "relation", "required": True,
         "collectionId": play_collection_id, "maxSelect": 1,
         "cascadeDelete": True},
        {"name": "card_name", "type": "text", "required": True, "max": 1000},
        {"name": "quantity", "type": "number", "required": True, "min": 1,
         "onlyInt": True},
        {"name": "raw_cost_each", "type": "number", "min": 0},
        {"name": "grading_cost_each", "type": "number", "min": 0},
        {"name": "tens_count", "type": "number", "min": 0, "onlyInt": True},
        {"name": "notes", "type": "text", "max": 2000},
    ]


def grading_sale_fields(play_collection_id: str, card_collection_id: str):
    return [
        {"name": "play", "type": "relation", "required": True,
         "collectionId": play_collection_id, "maxSelect": 1,
         "cascadeDelete": True},
        {"name": "card", "type": "relation", "required": True,
         "collectionId": card_collection_id, "maxSelect": 1,
         "cascadeDelete": True},
        {"name": "sale_date", "type": "date", "required": True},
        {"name": "quantity", "type": "number", "required": True, "min": 1,
         "onlyInt": True},
        {"name": "gross_amount", "type": "number", "required": True, "min": 0},
        {"name": "fees", "type": "number", "min": 0},
        {"name": "shipping", "type": "number", "min": 0},
        {"name": "notes", "type": "text", "max": 2000},
    ]


def env_value(name: str) -> str:
    for path in (SETUP_ENV_FILE, ENV_FILE):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if raw.strip().startswith(name + "="):
                return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return os.getenv(name, "")


def save_nonsecret_defaults(base_url: str, email: str) -> None:
    SETUP_ENV_FILE.write_text(
        f"SLAB_POCKETBASE_URL={base_url}\n"
        f"SLAB_POCKETBASE_SUPERUSER_EMAIL={email}\n",
        encoding="utf-8",
    )


def response_message(response: requests.Response) -> str:
    try:
        data = response.json()
        message = data.get("message") or "PocketBase rejected the request."
        details = data.get("data")
        return f"{message} Details: {json.dumps(details)}" if details else message
    except ValueError:
        return response.text[:500]


def authenticate(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        base_url + "/api/collections/_superusers/auth-with-password",
        json={"identity": email, "password": password}, timeout=TIMEOUT,
    )
    data = response.json() if response.content else {}
    if response.ok:
        return data["token"]

    mfa_id = data.get("mfaId")
    if not mfa_id:
        raise RuntimeError(f"Superuser sign-in failed: {response_message(response)}")

    otp_response = requests.post(
        base_url + "/api/collections/_superusers/request-otp",
        json={"email": email}, timeout=TIMEOUT,
    )
    if not otp_response.ok:
        raise RuntimeError(
            "The password was accepted, but PocketBase could not send the MFA "
            f"email: {response_message(otp_response)}"
        )
    otp_id = otp_response.json().get("otpId")
    if not otp_id:
        raise RuntimeError("PocketBase did not return an MFA request identifier.")

    print("Password accepted. PocketBase sent an MFA code to the superuser email.")
    otp_code = getpass.getpass("MFA code from email (hidden): ").strip()
    if not otp_code:
        raise RuntimeError("The MFA code cannot be empty.")
    mfa_response = requests.post(
        base_url + "/api/collections/_superusers/auth-with-otp",
        json={"otpId": otp_id, "password": otp_code, "mfaId": mfa_id},
        timeout=TIMEOUT,
    )
    if not mfa_response.ok:
        raise RuntimeError(
            f"Superuser MFA verification failed: {response_message(mfa_response)}"
        )
    return mfa_response.json()["token"]


def request(base_url: str, token: str, method: str, path: str, body=None):
    response = requests.request(
        method, base_url + path,
        headers={"Authorization": token, "Accept": "application/json",
                 "Content-Type": "application/json"},
        json=body, timeout=TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(
            f"PocketBase {method} {path} failed: {response_message(response)}"
        )
    return response.json() if response.content else None


def collection(base_url: str, token: str, name: str):
    response = requests.get(
        base_url + "/api/collections/" + name,
        headers={"Authorization": token, "Accept": "application/json"},
        timeout=TIMEOUT,
    )
    if response.status_code == 404:
        return None
    if not response.ok:
        raise RuntimeError(f"Could not inspect {name}: {response_message(response)}")
    return response.json()


def owner_field(users_id: str):
    return {
        "name": "owner", "type": "relation", "required": True,
        "collectionId": users_id, "maxSelect": 1, "cascadeDelete": True,
    }


def create_owner_collection(base_url: str, token: str, users_id: str,
                            name: str, fields: list[dict], indexes=None):
    rule = '@request.auth.id != "" && owner = @request.auth.id'
    body = {
        "name": name, "type": "base",
        "listRule": rule, "viewRule": rule,
        "createRule": '@request.auth.id != "" && @request.body.owner = @request.auth.id',
        "updateRule": rule, "deleteRule": rule,
        "fields": [owner_field(users_id), *fields],
        "indexes": indexes or [],
    }
    created = request(base_url, token, "POST", "/api/collections", body)
    print(f"{name} was created.")
    return created


def ensure_fields(base_url: str, token: str, current: dict,
                  required: list[dict], label: str):
    existing_names = {field.get("name") for field in current.get("fields", [])}
    additions = [field for field in required if field["name"] not in existing_names]
    if not additions:
        print(f"{label} already contains every required field.")
        return current
    updated_fields = [*current.get("fields", []), *additions]
    updated = request(
        base_url, token, "PATCH",
        "/api/collections/" + current["id"],
        {"fields": updated_fields},
    )
    print(f"{label} added: " + ", ".join(field["name"] for field in additions))
    return updated


def owner_security_rules() -> dict:
    rule = '@request.auth.id != "" && owner = @request.auth.id'
    return {
        "listRule": rule,
        "viewRule": rule,
        "createRule": (
            '@request.auth.id != "" && '
            '@request.body.owner = @request.auth.id'
        ),
        "updateRule": rule,
        "deleteRule": rule,
    }


def has_unowned_records(base_url: str, token: str, collection_name: str) -> bool:
    response = requests.get(
        base_url + f"/api/collections/{collection_name}/records",
        headers={"Authorization": token, "Accept": "application/json"},
        params={"perPage": 1, "filter": 'owner = ""'},
        timeout=TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(
            f"Could not audit {collection_name} ownership: "
            f"{response_message(response)}"
        )
    return bool(response.json().get("items"))


def secure_existing_owner_collection(base_url: str, token: str, current: dict,
                                     users_id: str, label: str) -> dict:
    owner = next(
        (field for field in current.get("fields", [])
         if field.get("name") == "owner"),
        None,
    )
    if not owner:
        raise RuntimeError(
            f"{label} has no owner field. No security rules were changed. "
            "Assign owners to existing records before continuing."
        )
    if (owner.get("type") != "relation"
            or owner.get("collectionId") != users_id
            or owner.get("maxSelect") != 1):
        raise RuntimeError(
            f"{label}.owner is not a single relation to users. "
            "No security rules were changed."
        )
    if has_unowned_records(base_url, token, label):
        raise RuntimeError(
            f"{label} contains records without an owner. "
            "No security rules were changed."
        )

    expected = owner_security_rules()
    changes = {
        key:value for key, value in expected.items()
        if current.get(key) != value
    }
    if not changes:
        print(f"{label} owner-only API rules verified.")
        return current
    updated = request(
        base_url, token, "PATCH",
        "/api/collections/" + current["id"],
        changes,
    )
    print(f"{label} owner-only API rules repaired.")
    return updated


def protect_card_photo(base_url: str, token: str, cards: dict) -> dict:
    fields = cards.get("fields", [])
    photo_fields = [
        field for field in fields
        if field.get("name") in ("photo", "photo_back")
    ]
    photo = next((field for field in photo_fields if field.get("name") == "photo"), None)
    if not photo:
        print("cards.photo was not found; photo protection was skipped.")
        return cards
    if any(field.get("type") != "file" for field in photo_fields):
        raise RuntimeError(
            "A cards photo field exists but is not a file field. "
            "Photo protection was not changed."
        )
    if all(field.get("protected") is True for field in photo_fields):
        print("cards photo fields are already protected.")
        return cards
    protected_fields = [
        ({**field, "protected": True}
         if field.get("name") in ("photo", "photo_back") else field)
        for field in fields
    ]
    updated = request(
        base_url, token, "PATCH",
        "/api/collections/" + cards["id"],
        {"fields": protected_fields},
    )
    print("cards photo fields are now protected by short-lived file tokens.")
    return updated


def configure_schema(base_url: str, token: str):
    users = collection(base_url, token, "users")
    if not users:
        raise RuntimeError("The users collection was not found.")
    users_id = users["id"]

    cards = collection(base_url, token, "cards")
    if not cards:
        raise RuntimeError("The cards collection was not found.")
    cards = ensure_fields(base_url, token, cards, CARD_EXTRA_FIELDS, "cards")
    cards = secure_existing_owner_collection(
        base_url, token, cards, users_id, "cards"
    )
    protect_card_photo(base_url, token, cards)

    market = collection(base_url, token, "market_values")
    if market:
        market = ensure_fields(
            base_url, token, market, MARKET_FIELDS, "market_values"
        )
        secure_existing_owner_collection(
            base_url, token, market, users_id, "market_values"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "market_values", MARKET_FIELDS,
            ["CREATE UNIQUE INDEX `idx_market_values_owner_card` "
             "ON `market_values` (`owner`, `card_id`)"],
        )

    business = collection(base_url, token, "business_entries")
    if business:
        business = ensure_fields(
            base_url, token, business, BUSINESS_FIELDS, "business_entries"
        )
        secure_existing_owner_collection(
            base_url, token, business, users_id, "business_entries"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "business_entries", BUSINESS_FIELDS,
            ["CREATE INDEX `idx_business_entries_owner_date` "
             "ON `business_entries` (`owner`, `entry_date`)"],
        )

    preferences = collection(base_url, token, "app_preferences")
    if preferences:
        preferences = ensure_fields(
            base_url, token, preferences, PREFERENCE_FIELDS, "app_preferences"
        )
        secure_existing_owner_collection(
            base_url, token, preferences, users_id, "app_preferences"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "app_preferences", PREFERENCE_FIELDS,
            ["CREATE UNIQUE INDEX `idx_app_preferences_owner` "
             "ON `app_preferences` (`owner`)"],
        )

    marketplace_collections = [
        (
            "marketplace_usage",
            MARKETPLACE_USAGE_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_usage_owner_period` "
             "ON `marketplace_usage` (`owner`, `period_type`, `period`)"],
        ),
        (
            "marketplace_activity",
            MARKETPLACE_ACTIVITY_FIELDS,
            # Some PocketBase versions cannot reference the automatic
            # `created` column in the same request that creates a collection.
            # Owner scoping is the important lookup boundary; retention keeps
            # this collection bounded.
            ["CREATE INDEX `idx_marketplace_activity_owner` "
             "ON `marketplace_activity` (`owner`)"],
        ),
        (
            "marketplace_search_cache",
            MARKETPLACE_CACHE_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_cache_owner_query` "
             "ON `marketplace_search_cache` (`owner`, `provider`, `query_hash`)"],
        ),
        (
            "marketplace_observations",
            MARKETPLACE_OBSERVATION_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_observation_owner_listing` "
             "ON `marketplace_observations` (`owner`, `provider`, `listing_id`)",
             "CREATE INDEX `idx_marketplace_observation_owner_query` "
             "ON `marketplace_observations` (`owner`, `query_hash`)"],
        ),
        (
            "marketplace_refresh_settings",
            MARKETPLACE_REFRESH_SETTING_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_refresh_setting_owner` "
             "ON `marketplace_refresh_settings` (`owner`)"],
        ),
        (
            "marketplace_refresh_state",
            MARKETPLACE_REFRESH_STATE_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_refresh_state_owner_card` "
             "ON `marketplace_refresh_state` (`owner`, `card_id`)",
             "CREATE INDEX `idx_marketplace_refresh_state_owner_next` "
             "ON `marketplace_refresh_state` (`owner`, `next_run_at`)"],
        ),
        (
            "marketplace_collector_status",
            MARKETPLACE_COLLECTOR_STATUS_FIELDS,
            ["CREATE UNIQUE INDEX `idx_marketplace_collector_owner_id` "
             "ON `marketplace_collector_status` (`owner`, `collector_id`)",
             "CREATE INDEX `idx_marketplace_collector_owner_heartbeat` "
             "ON `marketplace_collector_status` (`owner`, `heartbeat_at`)"],
        ),
    ]
    for name, fields, indexes in marketplace_collections:
        current = collection(base_url, token, name)
        if current:
            current = ensure_fields(
                base_url, token, current, fields, name
            )
            secure_existing_owner_collection(
                base_url, token, current, users_id, name
            )
        else:
            create_owner_collection(
                base_url, token, users_id, name, fields, indexes
            )

    debts = collection(base_url, token, "debt_reminders")
    if debts:
        debts = ensure_fields(
            base_url, token, debts, DEBT_FIELDS, "debt_reminders"
        )
        secure_existing_owner_collection(
            base_url, token, debts, users_id, "debt_reminders"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "debt_reminders", DEBT_FIELDS,
            ["CREATE INDEX `idx_debt_reminders_owner_date` "
             "ON `debt_reminders` (`owner`, `reminder_date`)"],
        )

    exceptions = collection(base_url, token, "business_exceptions")
    if exceptions:
        exceptions = ensure_fields(
            base_url, token, exceptions, EXCEPTION_FIELDS, "business_exceptions"
        )
        secure_existing_owner_collection(
            base_url, token, exceptions, users_id, "business_exceptions"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "business_exceptions", EXCEPTION_FIELDS,
            ["CREATE INDEX `idx_business_exceptions_owner_date` "
             "ON `business_exceptions` (`owner`, `exception_date`)"],
        )

    grading_items = collection(base_url, token, "grading_items")
    if grading_items:
        grading_items = ensure_fields(
            base_url, token, grading_items, GRADING_ITEM_FIELDS, "grading_items"
        )
        secure_existing_owner_collection(
            base_url, token, grading_items, users_id, "grading_items"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "grading_items", GRADING_ITEM_FIELDS,
            ["CREATE INDEX `idx_grading_items_owner` "
             "ON `grading_items` (`owner`)"],
        )

    plays = collection(base_url, token, "grading_plays")
    if plays:
        plays = ensure_fields(
            base_url, token, plays, GRADING_PLAY_FIELDS, "grading_plays"
        )
        plays = secure_existing_owner_collection(
            base_url, token, plays, users_id, "grading_plays"
        )
    else:
        plays = create_owner_collection(
            base_url, token, users_id, "grading_plays", GRADING_PLAY_FIELDS,
            ["CREATE INDEX `idx_grading_plays_owner_date` "
             "ON `grading_plays` (`owner`, `submitted_date`)"],
        )

    card_fields = grading_card_fields(plays["id"])
    grading_cards = collection(base_url, token, "grading_play_cards")
    if grading_cards:
        grading_cards = ensure_fields(
            base_url, token, grading_cards, card_fields, "grading_play_cards"
        )
        grading_cards = secure_existing_owner_collection(
            base_url, token, grading_cards, users_id, "grading_play_cards"
        )
    else:
        grading_cards = create_owner_collection(
            base_url, token, users_id, "grading_play_cards", card_fields,
            ["CREATE INDEX `idx_grading_play_cards_owner_play` "
             "ON `grading_play_cards` (`owner`, `play`)"],
        )

    sale_fields = grading_sale_fields(plays["id"], grading_cards["id"])
    grading_sales = collection(base_url, token, "grading_play_sales")
    if grading_sales:
        grading_sales = ensure_fields(
            base_url, token, grading_sales, sale_fields, "grading_play_sales"
        )
        secure_existing_owner_collection(
            base_url, token, grading_sales, users_id, "grading_play_sales"
        )
    else:
        create_owner_collection(
            base_url, token, users_id, "grading_play_sales", sale_fields,
            ["CREATE INDEX `idx_grading_play_sales_owner_play` "
             "ON `grading_play_sales` (`owner`, `play`)"],
        )


def main() -> int:
    suggested = env_value("SLAB_POCKETBASE_URL")
    if suggested:
        base_url = suggested.rstrip("/")
        print(f"PocketBase URL: {base_url}")
    else:
        base_url = input("PocketBase URL: ").strip().rstrip("/")
    if not base_url.startswith(("https://", "http://")):
        print("Enter the complete PocketBase URL.", file=sys.stderr)
        return 1
    suggested_email = env_value("SLAB_POCKETBASE_SUPERUSER_EMAIL")
    if suggested_email:
        email = suggested_email
        print(f"PocketBase superuser email: {email}")
    else:
        email = input("PocketBase superuser email: ").strip()
    print("Enter only your PocketBase superuser password below.")
    password = getpass.getpass("Superuser password (hidden): ")
    if not email or not password:
        print("Email and password are required.", file=sys.stderr)
        return 1
    try:
        token = authenticate(base_url, email, password)
        configure_schema(base_url, token)
        save_nonsecret_defaults(base_url, email)
        print("Slab Ledger market, business-finance, and tools schema is ready.")
        print("PocketBase URL and superuser email were saved locally for next time.")
        print("Superuser password was not saved.")
        return 0
    except (requests.RequestException, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
