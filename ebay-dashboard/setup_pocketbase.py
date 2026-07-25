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
TIMEOUT = 25

MARKET_FIELDS = [
    {"name": "card_id", "type": "text", "required": True, "max": 100},
    {"name": "query", "type": "text", "max": 2000},
    {"name": "search_url", "type": "url"},
    {"name": "market_value", "type": "number"},
    {"name": "confidence", "type": "select", "maxSelect": 1,
     "values": ["low", "medium", "high"]},
    {"name": "checked_at", "type": "date"},
    {"name": "comparable_count", "type": "number", "onlyInt": True},
    {"name": "rejected_count", "type": "number", "onlyInt": True},
    {"name": "low", "type": "number"},
    {"name": "high", "type": "number"},
    {"name": "comparables", "type": "json", "maxSize": 2000000},
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
]

CARD_FINANCE_FIELDS = [
    {"name": "selling_fees", "type": "number", "min": 0},
    {"name": "shipping_cost", "type": "number", "min": 0},
]


def configured_url() -> str:
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if raw.strip().startswith("SLAB_POCKETBASE_URL="):
                return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return os.getenv("SLAB_POCKETBASE_URL", "")


def response_message(response: requests.Response) -> str:
    try:
        data = response.json()
        return data.get("message") or json.dumps(data)
    except ValueError:
        return response.text[:500]


def authenticate(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        base_url + "/api/collections/_superusers/auth-with-password",
        json={"identity": email, "password": password}, timeout=TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(f"Superuser sign-in failed: {response_message(response)}")
    return response.json()["token"]


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


def configure_schema(base_url: str, token: str):
    users = collection(base_url, token, "users")
    if not users:
        raise RuntimeError("The users collection was not found.")
    users_id = users["id"]

    cards = collection(base_url, token, "cards")
    if not cards:
        raise RuntimeError("The cards collection was not found.")
    ensure_fields(base_url, token, cards, CARD_FINANCE_FIELDS, "cards")

    market = collection(base_url, token, "market_values")
    if market:
        ensure_fields(base_url, token, market, MARKET_FIELDS, "market_values")
    else:
        create_owner_collection(
            base_url, token, users_id, "market_values", MARKET_FIELDS,
            ["CREATE UNIQUE INDEX `idx_market_values_owner_card` "
             "ON `market_values` (`owner`, `card_id`)"],
        )

    business = collection(base_url, token, "business_entries")
    if business:
        ensure_fields(base_url, token, business, BUSINESS_FIELDS, "business_entries")
    else:
        create_owner_collection(
            base_url, token, users_id, "business_entries", BUSINESS_FIELDS,
            ["CREATE INDEX `idx_business_entries_owner_date` "
             "ON `business_entries` (`owner`, `entry_date`)"],
        )


def main() -> int:
    suggested = configured_url()
    base_url = (input(f"PocketBase URL [{suggested}]: ").strip() or suggested).rstrip("/")
    if not base_url.startswith(("https://", "http://")):
        print("Enter the complete PocketBase URL.", file=sys.stderr)
        return 1
    email = input("PocketBase superuser email: ").strip()
    password = getpass.getpass("PocketBase superuser password: ")
    if not email or not password:
        print("Email and password are required.", file=sys.stderr)
        return 1
    try:
        token = authenticate(base_url, email, password)
        configure_schema(base_url, token)
        print("Slab Ledger market and business-finance schema is ready.")
        print("Superuser credentials were not saved.")
        return 0
    except (requests.RequestException, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
