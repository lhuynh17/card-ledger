"""One-time, non-destructive PocketBase schema installer.

Creates the market_values collection when it doesn't exist. Superuser
credentials are used only for this process and are never written to disk.
"""

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
REQUIRED_FIELDS = {
    "owner", "card_id", "query", "search_url", "market_value", "confidence",
    "checked_at", "comparable_count", "rejected_count", "low", "high",
    "comparables", "error",
}


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
        json={"identity": email, "password": password},
        timeout=TIMEOUT,
    )
    if response.status_code == 401 and response.headers.get("Content-Type", "").startswith("application/json"):
        data = response.json()
        if data.get("mfaId"):
            raise RuntimeError(
                "This superuser requires MFA. Create the collection in the "
                "PocketBase dashboard or temporarily use a non-MFA setup account."
            )
    if not response.ok:
        raise RuntimeError(f"Superuser sign-in failed: {response_message(response)}")
    return response.json()["token"]


def api_get(base_url: str, token: str, path: str) -> requests.Response:
    return requests.get(
        base_url + path,
        headers={"Authorization": token, "Accept": "application/json"},
        timeout=TIMEOUT,
    )


def verify_existing(collection: dict) -> None:
    present = {field.get("name") for field in collection.get("fields", [])}
    missing = sorted(REQUIRED_FIELDS - present)
    if missing:
        raise RuntimeError(
            "market_values already exists but is missing fields: " + ", ".join(missing) +
            ". Nothing was changed."
        )
    print("market_values already exists and contains every required field.")


def create_collection(base_url: str, token: str, users_id: str) -> None:
    owner_rule = '@request.auth.id != "" && owner = @request.auth.id'
    body = {
        "name": "market_values",
        "type": "base",
        "listRule": owner_rule,
        "viewRule": owner_rule,
        "createRule": '@request.auth.id != "" && @request.body.owner = @request.auth.id',
        "updateRule": owner_rule,
        "deleteRule": owner_rule,
        "fields": [
            {
                "name": "owner", "type": "relation", "required": True,
                "collectionId": users_id, "maxSelect": 1, "cascadeDelete": True,
            },
            {"name": "card_id", "type": "text", "required": True, "max": 100},
            {"name": "query", "type": "text", "max": 2000},
            {"name": "search_url", "type": "url"},
            {"name": "market_value", "type": "number"},
            {
                "name": "confidence", "type": "select", "maxSelect": 1,
                "values": ["low", "medium", "high"],
            },
            {"name": "checked_at", "type": "date"},
            {"name": "comparable_count", "type": "number", "onlyInt": True},
            {"name": "rejected_count", "type": "number", "onlyInt": True},
            {"name": "low", "type": "number"},
            {"name": "high", "type": "number"},
            {"name": "comparables", "type": "json", "maxSize": 2000000},
            {"name": "error", "type": "text", "max": 5000},
        ],
        "indexes": [
            "CREATE UNIQUE INDEX `idx_market_values_owner_card` "
            "ON `market_values` (`owner`, `card_id`)"
        ],
    }
    response = requests.post(
        base_url + "/api/collections",
        headers={
            "Authorization": token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(f"Collection creation failed: {response_message(response)}")
    verify_existing(response.json())
    print("market_values was created successfully.")


def main() -> int:
    suggested = configured_url()
    prompt = f"PocketBase URL [{suggested}]: " if suggested else "PocketBase URL: "
    base_url = (input(prompt).strip() or suggested).rstrip("/")
    if not base_url.startswith("https://") and not base_url.startswith("http://"):
        print("Enter the full URL beginning with https:// or http://.", file=sys.stderr)
        return 1
    email = input("PocketBase superuser email: ").strip()
    password = getpass.getpass("PocketBase superuser password: ")
    if not email or not password:
        print("Email and password are required.", file=sys.stderr)
        return 1

    try:
        token = authenticate(base_url, email, password)
        existing = api_get(base_url, token, "/api/collections/market_values")
        if existing.ok:
            verify_existing(existing.json())
            print("No schema changes were needed.")
            return 0
        if existing.status_code != 404:
            raise RuntimeError(f"Collection check failed: {response_message(existing)}")

        users = api_get(base_url, token, "/api/collections/users")
        if not users.ok:
            raise RuntimeError(f"Could not find the users collection: {response_message(users)}")
        create_collection(base_url, token, users.json()["id"])
        print("Superuser credentials were not saved.")
        return 0
    except requests.RequestException as error:
        print(f"Could not reach PocketBase: {error}", file=sys.stderr)
        return 1
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

