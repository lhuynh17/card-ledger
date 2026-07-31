"""Inspect Bright Data account metadata without consuming scraper records."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import requests

API_ORIGIN = "https://api.brightdata.com"
TIMEOUT = 25


def api_get(path: str, token: str) -> Any:
    response = requests.get(
        API_ORIGIN + path,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=TIMEOUT,
    )
    if not response.ok:
        if response.status_code in (401, 403):
            raise RuntimeError("Bright Data authentication failed.")
        raise RuntimeError(
            f"Bright Data metadata request failed ({response.status_code})."
        )
    return response.json()


def ebay_datasets(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        raise RuntimeError("Bright Data returned an unexpected dataset-list shape.")
    matches = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        if "ebay" not in name.lower():
            continue
        matches.append({
            "id": str(item.get("id") or ""),
            "name": name,
            "size": item.get("size"),
        })
    return matches


def metadata_summary(dataset_id: str, metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        raise RuntimeError("Bright Data returned unexpected dataset metadata.")
    raw_fields = metadata.get("fields") or {}
    if isinstance(raw_fields, dict):
        fields = sorted(str(name) for name in raw_fields)
    elif isinstance(raw_fields, list):
        fields = sorted(
            str(item.get("name") or item.get("field") or "")
            for item in raw_fields if isinstance(item, dict)
        )
    else:
        fields = []
    lower = {field.lower() for field in fields}
    sold_signals = sorted(lower.intersection({
        "sold_at", "sold_date", "date_sold", "ended_at", "sold_price",
        "final_price", "sale_price",
    }))
    active_signals = sorted(lower.intersection({
        "availability", "listing_status", "status", "is_active", "end_time",
    }))
    return {
        "dataset_id": dataset_id,
        "name": str(metadata.get("name") or ""),
        "fields": fields,
        "sold_field_signals": sold_signals,
        "active_field_signals": active_signals,
        "sold_support_confirmed": bool(sold_signals),
        "active_support_confirmed": bool(active_signals),
        "note": (
            "Field signals are necessary but not sufficient. Confirm request inputs, "
            "sold/completed semantics, billing unit, limits, and sync/async support "
            "in the account scraper page before enabling live collection."
        ),
    }


def inspect_account(token: str, dataset_id: str = "") -> dict[str, Any]:
    datasets = ebay_datasets(api_get("/datasets/list", token))
    result: dict[str, Any] = {
        "ebay_datasets": datasets,
        "records_consumed": 0,
    }
    if dataset_id:
        if dataset_id not in {item["id"] for item in datasets}:
            raise RuntimeError(
                "The selected dataset ID is not an eBay dataset available to this account."
            )
        metadata = api_get(f"/datasets/{dataset_id}/metadata", token)
        result["selected"] = metadata_summary(dataset_id, metadata)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "List account-available eBay datasets and inspect one dataset's metadata "
            "without triggering a paid scrape."
        )
    )
    parser.add_argument(
        "--dataset-id",
        default=os.getenv("BRIGHT_DATA_DATASET_ID", ""),
        help="Optional account-available dataset ID to inspect; this is not a secret.",
    )
    args = parser.parse_args()
    token = os.getenv("BRIGHT_DATA_API_TOKEN", "")
    if not token:
        print(
            "Set BRIGHT_DATA_API_TOKEN in this process environment. "
            "Do not pass it on the command line or save it in this repository.",
            file=sys.stderr,
        )
        return 2
    try:
        print(json.dumps(inspect_account(token, args.dataset_id), indent=2))
        return 0
    except (requests.RequestException, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
