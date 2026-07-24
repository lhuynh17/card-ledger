"""Polite eBay search collector for the local dashboard.

Install once on Windows:
    py -m pip install requests beautifulsoup4

Run continuously and serve the dashboard:
    py scraper.py --watch

Add inventory records to data.json to change what is collected. Review eBay's
terms and robots rules before use. HTML can change, so selectors may
occasionally need updates.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import statistics
import threading
import time
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "data.json"
SEARCH_URL = "https://www.ebay.com/sch/i.html"
DATA_LOCK = threading.RLock()
ENV_FILE = ROOT / "collector.env"
CLOUD_CLIENT = None

# Continuous mode makes at most one request in each interval. Identical slabs
# share one query and cached valuation, so duplicates add no eBay traffic.
PAGES_PER_SEARCH = 1
MIN_WATCH_INTERVAL_MINUTES = 12
MAX_WATCH_INTERVAL_MINUTES = 20
REFRESH_AFTER_HOURS = 22
MAX_REQUESTS_PER_DAY = 72
ACTIVE_START_HOUR = 7
ACTIVE_END_HOUR = 23
BLOCK_COOLDOWN_HOURS = (3, 12, 24, 72)
REQUEST_TIMEOUT_SECONDS = 25
POCKETBASE_POLL_SECONDS = 60

USER_AGENT = "SlabLedgerMarketTracker/0.1 (personal inventory valuation)"


def load_environment(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def pocketbase_date(value: str) -> str:
    try:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        moment = datetime.now(timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z"


def headers() -> dict[str, str]:
    """Use a stable identity instead of pretending to be different browsers."""
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
    }


class PocketBaseClient:
    """Minimal PocketBase client for inventory input and valuation output."""

    def __init__(self, url: str, email: str, password: str):
        self.url = url.rstrip("/")
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self.user_id = ""

    @classmethod
    def from_environment(cls) -> Optional["PocketBaseClient"]:
        url = os.getenv("SLAB_POCKETBASE_URL", "").strip()
        email = os.getenv("SLAB_POCKETBASE_EMAIL", "").strip()
        password = os.getenv("SLAB_POCKETBASE_PASSWORD", "").strip()
        if not (url and email and password):
            return None
        return cls(url, email, password)

    def authenticate(self) -> None:
        response = self.session.post(
            self.url + "/api/collections/users/auth-with-password",
            json={"identity": self.email, "password": self.password},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        result = response.json()
        self.session.headers["Authorization"] = result["token"]
        self.user_id = str(result["record"]["id"])

    def request(self, method: str, path: str, **kwargs):
        if "Authorization" not in self.session.headers:
            self.authenticate()
        response = self.session.request(
            method, self.url + path, timeout=REQUEST_TIMEOUT_SECONDS, **kwargs
        )
        if response.status_code == 401:
            self.authenticate()
            response = self.session.request(
                method, self.url + path, timeout=REQUEST_TIMEOUT_SECONDS, **kwargs
            )
        if not response.ok:
            try:
                detail = response.json().get("message") or response.text[:500]
            except ValueError:
                detail = response.text[:500]
            raise requests.RequestException(
                f"PocketBase {response.status_code}: {detail}"
            )
        response.raise_for_status()
        return response

    def active_inventory(self) -> list[dict]:
        response = self.request(
            "GET",
            "/api/collections/cards/records",
            params={"perPage": 500},
        )
        cards = []
        for record in response.json().get("items", []):
            if bool(record.get("sold")):
                continue
            cards.append({
                "id": str(record["id"]),
                "company": str(record.get("company") or "PSA").upper(),
                "cert": str(record.get("cert") or ""),
                "name": str(record.get("name") or ""),
                "grade": str(record.get("grade") or ""),
                "cost": number(record.get("cost")),
                "photo": "",
            })
        return cards

    def upsert_valuation(self, result: dict) -> None:
        card_id = str(result["cardId"])
        response = self.request(
            "GET",
            "/api/collections/market_values/records",
            params={
                "perPage": 1,
                "filter": f'owner = "{self.user_id}" && card_id = "{card_id}"',
            },
        )
        items = response.json().get("items", [])
        body = {
            "owner": self.user_id,
            "card_id": card_id,
            "query": result.get("query", ""),
            "search_url": result.get("searchUrl", ""),
            "market_value": number(result.get("marketValue")),
            "confidence": result.get("confidence", "low"),
            "checked_at": pocketbase_date(result.get("lastChecked", "")),
            "comparable_count": int(result.get("comparableCount", 0)),
            "rejected_count": int(result.get("rejectedCount", 0)),
            "low": number(result.get("low")),
            "high": number(result.get("high")),
            "comparables": result.get("recentComparables", result.get("comparables", []))[:3],
            "error": result.get("error", ""),
        }
        if items:
            self.request(
                "PATCH",
                f"/api/collections/market_values/records/{items[0]['id']}",
                json=body,
            )
        else:
            self.request("POST", "/api/collections/market_values/records", json=body)


def amount(text: str) -> float:
    """Convert the first displayed dollar amount to a number."""
    match = re.search(r"(?:US\s*)?\$([\d,]+(?:\.\d{2})?)", text or "")
    return round(float(match.group(1).replace(",", "")), 2) if match else 0.0


def number(value) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def text_of(node, selector: str, default: str = "") -> str:
    found = node.select_one(selector)
    return found.get_text(" ", strip=True) if found else default


def grade_number(value: str) -> str:
    if value in ("BL10", "P10"):
        return "10"
    match = re.search(r"\b(10|[1-9](?:\.5)?)\b", str(value or ""))
    return match.group(1) if match else ""


def card_keywords(name: str) -> str:
    """Port of Slab Ledger's ebayCardKeywords() function."""
    generic = {"POKEMON", "CARD", "HOLO", "HOLOGRAPHIC", "FOIL"}
    words, seen = [], set()
    for word in re.sub(r"[^A-Z0-9]+", " ", str(name or "").upper()).split():
        if word in generic or re.fullmatch(r"20\d{2}", word) or word in seen:
            continue
        seen.add(word)
        words.append(word)
    return " ".join(words) if len(words) >= 2 else str(name or "").strip()


def ebay_search_terms(card: dict) -> str:
    """Build the same clean query currently used by Slab Ledger."""
    company = str(card.get("company") or "PSA").upper()
    grade = grade_number(str(card.get("grade") or ""))
    exact_grade = f'"{company} {grade}"' if grade else company
    if card.get("grade") == "BL10":
        exact_grade += ' "Black Label"'
    if card.get("grade") == "P10":
        exact_grade += " Pristine"
    return " ".join(filter(None, [card_keywords(card.get("name", "")), exact_grade, "-raw", "-ungraded"]))


def fetch_page(session: requests.Session, search: str, page: int) -> str:
    params = {
        "_nkw": search, "_pgn": page, "_ipg": 60,
        "LH_Sold": 1, "LH_Complete": 1, "_sop": 13,
    }
    response = session.get(
        f"{SEARCH_URL}?{urlencode(params)}",
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code in (403, 429):
        raise RuntimeError(f"eBay returned {response.status_code}; stop and try again later")
    response.raise_for_status()
    lower = response.text.lower()
    if "captcha" in lower or "verify yourself" in lower or "pardon our interruption" in lower:
        raise RuntimeError("eBay returned a verification page; stop and try again later")
    return response.text


def parse_listings(html: str, search: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    for card in soup.select("li.s-item"):
        title = text_of(card, ".s-item__title")
        link = card.select_one("a.s-item__link")
        price_text = text_of(card, ".s-item__price")
        if not title or not link or title.lower() == "shop on ebay" or not price_text:
            continue

        shipping_text = text_of(card, ".s-item__shipping, .s-item__logisticsCost")
        price = amount(price_text)
        shipping = 0.0 if "free" in shipping_text.lower() else amount(shipping_text)
        seller_text = text_of(card, ".s-item__seller-info-text, .s-item__sellerInfo", "Unknown")
        feedback_match = re.search(r"(\d+(?:\.\d+)?)%", seller_text)
        image = card.select_one(".s-item__image img")
        condition = text_of(card, ".SECONDARY_INFO", "Not specified")
        sold_text = text_of(card, ".s-item__title--tagblock, .s-item__caption")
        item_url = link.get("href", "")
        item_id_match = re.search(r"/itm/(?:[^/]+/)?(\d+)", item_url)
        listings.append({
            "id": item_id_match.group(1) if item_id_match else item_url,
            "search": search,
            "title": title,
            "price": price,
            "shipping": shipping,
            "total": round(price + shipping, 2),
            "currency": "USD",
            "condition": condition,
            "seller": seller_text.split("(")[0].strip(),
            "feedback": float(feedback_match.group(1)) if feedback_match else 0,
            "image": image.get("src", "") if image else "",
            "url": item_url,
            "soldText": sold_text,
        })
    return listings


def comparable(card: dict, listing: dict) -> bool:
    """Reject obvious false positives that escape the search query."""
    title = re.sub(r"[^A-Z0-9.]+", " ", listing["title"].upper())
    company = str(card.get("company") or "PSA").upper()
    grade = grade_number(str(card.get("grade") or ""))
    if company not in title or (grade and not re.search(rf"\b{re.escape(grade)}\b", title)):
        return False
    meaningful = [w for w in card_keywords(card.get("name", "")).split() if len(w) > 1]
    if not meaningful:
        return True
    hits = sum(1 for word in meaningful if re.search(rf"\b{re.escape(word)}\b", title))
    return hits / len(meaningful) >= 0.65


def remove_price_outliers(listings: list[dict]) -> tuple[list[dict], int]:
    priced = [x for x in listings if x["total"] > 0]
    if len(priced) < 4:
        return priced, 0
    values = sorted(x["total"] for x in priced)
    lower_half = values[: len(values) // 2]
    upper_half = values[(len(values) + 1) // 2 :]
    q1, q3 = statistics.median(lower_half), statistics.median(upper_half)
    spread = q3 - q1
    low, high = max(0, q1 - 1.5 * spread), q3 + 1.5 * spread
    kept = [x for x in priced if low <= x["total"] <= high]
    return kept, len(priced) - len(kept)


def valuation(card: dict, search: str, raw: list[dict], error: str = "") -> dict:
    matched = [item for item in raw if comparable(card, item)]
    comps, outliers = remove_price_outliers(matched)
    values = sorted(item["total"] for item in comps)
    recent_three = comps[:3]
    estimate = round(sum(item["total"] for item in recent_three) / len(recent_three), 2) if recent_three else 0
    median_value = round(statistics.median(values), 2) if values else 0
    dispersion = (statistics.pstdev(values) / estimate) if len(values) > 1 and estimate else 1
    if len(values) >= 8 and dispersion <= 0.25:
        confidence = "high"
    elif len(values) >= 3 and dispersion <= 0.5:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "cardId": card["id"], "query": search,
        "searchUrl": f"{SEARCH_URL}?{urlencode({'_nkw': search, 'LH_Sold': 1, 'LH_Complete': 1, '_sop': 13})}",
        "marketValue": estimate, "lastThreeAverage": estimate, "medianValue": median_value,
        "confidence": confidence,
        "comparableCount": len(comps), "rejectedCount": len(raw) - len(matched) + outliers,
        "low": values[0] if values else 0, "high": values[-1] if values else 0,
        "comparables": comps[:20], "recentComparables": recent_three, "error": error,
        "lastChecked": datetime.now(timezone.utc).isoformat(),
    }


def read_data() -> dict:
    with DATA_LOCK:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))


def write_data(payload: dict) -> None:
    with DATA_LOCK:
        payload["generatedAt"] = datetime.now(timezone.utc).isoformat()
        temporary = OUTPUT.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        temporary.replace(OUTPUT)


def sync_inventory_from_cloud(client: PocketBaseClient) -> int:
    cards = client.active_inventory()
    payload = read_data()
    old_cards = payload.get("inventory", [])
    if cards != old_cards:
        valid_ids = {card["id"] for card in cards}
        payload["inventory"] = cards
        payload["valuations"] = [
            value for value in payload.get("valuations", [])
            if str(value.get("cardId")) in valid_ids
        ]
        payload["integration"] = {
            "source": "pocketbase",
            "inventoryReceivedAt": datetime.now(timezone.utc).isoformat(),
            "activeCards": len(cards),
        }
        write_data(payload)
        print(f"PocketBase inventory synchronized: {len(cards)} active cards.")
    return len(cards)


def cloud_sync_loop(client: PocketBaseClient) -> None:
    while True:
        try:
            sync_inventory_from_cloud(client)
        except requests.RequestException as error:
            print(f"PocketBase inventory sync failed: {error}")
        time.sleep(POCKETBASE_POLL_SECONDS)


def checked_at(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.min.replace(tzinfo=timezone.utc)


def query_key(card: dict) -> str:
    return ebay_search_terms(card).casefold()


def query_groups(payload: dict) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for card in payload.get("inventory", []):
        groups.setdefault(query_key(card), []).append(card)
    return groups


def next_due_group(payload: dict) -> Optional[list[dict]]:
    valuations = {item["cardId"]: item for item in payload.get("valuations", [])}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=REFRESH_AFTER_HOURS)
    due = []
    for cards in query_groups(payload).values():
        oldest = min(checked_at(valuations.get(card["id"], {}).get("lastChecked", "")) for card in cards)
        if oldest <= cutoff:
            due.append((oldest, cards))
    return min(due, key=lambda item: item[0], default=(None, None))[1]


def refresh_group(session: requests.Session, payload: dict, cards: list[dict]) -> bool:
    """Make one request and apply its valuation to all identical slabs."""
    latest_active_ids = {str(card["id"]) for card in read_data().get("inventory", [])}
    cards = [card for card in cards if str(card["id"]) in latest_active_ids]
    if not cards:
        print("Queued slab is no longer active; skipping its market request.")
        return False
    representative = cards[0]
    search = ebay_search_terms(representative)
    print(f"Refreshing {representative.get('name', representative['id'])!r} "
          f"for {len(cards)} inventory slab(s)…")
    blocked = False
    try:
        found = parse_listings(fetch_page(session, search, 1), search)
        unique = list({str(item["id"]): item for item in reversed(found)}.values())
        results = [valuation(card, search, unique) for card in cards]
        print(f"Accepted {results[0]['comparableCount']} of {len(unique)} sold results")
    except (requests.RequestException, RuntimeError) as error:
        message = str(error)
        blocked = any(word in message for word in ("403", "429", "verification"))
        previous = {x["cardId"]: x for x in payload.get("valuations", [])}
        results = [
            {**previous.get(card["id"], {}), "cardId": card["id"], "query": search,
             "error": message, "lastChecked": datetime.now(timezone.utc).isoformat()}
            for card in cards
        ]
        payload.setdefault("errors", []).append(f"{search}: {message}")
        payload["errors"] = payload["errors"][-20:]
        print(message)
    refreshed_ids = {card["id"] for card in cards}
    others = [x for x in payload.get("valuations", []) if x["cardId"] not in refreshed_ids]
    payload["valuations"] = others + results
    collector = payload.setdefault("collector", {})
    request_time = datetime.now(timezone.utc)
    log = [stamp for stamp in collector.get("requestLog", [])
           if checked_at(stamp) > request_time - timedelta(days=1)]
    log.append(request_time.isoformat())
    block_count = int(collector.get("consecutiveBlocks", 0)) + 1 if blocked else 0
    cooldown = BLOCK_COOLDOWN_HOURS[min(block_count - 1, len(BLOCK_COOLDOWN_HOURS) - 1)] if blocked else 0
    collector.update({
        "mode": "paced",
        "lastCardIds": sorted(refreshed_ids),
        "lastRequestAt": request_time.isoformat(),
        "requestLog": log,
        "consecutiveBlocks": block_count,
        "pausedReason": "eBay block or verification response" if blocked else "",
        "nextEligibleAt": (
            request_time + timedelta(hours=cooldown) if blocked else
            request_time + timedelta(minutes=MIN_WATCH_INTERVAL_MINUTES)
        ).isoformat(),
    })
    # Inventory may have been re-synced from Slab Ledger while this network
    # request was running. Preserve that newest inventory list.
    latest = read_data()
    payload["inventory"] = latest.get("inventory", payload.get("inventory", []))
    valid_ids = {str(card["id"]) for card in payload["inventory"]}
    payload["valuations"] = [
        item for item in payload["valuations"] if str(item.get("cardId")) in valid_ids
    ]
    write_data(payload)
    if CLOUD_CLIENT:
        for result in results:
            if str(result.get("cardId")) not in valid_ids:
                continue
            try:
                CLOUD_CLIENT.upsert_valuation(result)
                print(f"PocketBase market value saved for card {result['cardId']}.")
            except requests.RequestException as error:
                print(f"PocketBase market-value save failed: {error}")
    return blocked


def scrape_due_once(session: requests.Session) -> bool:
    payload = read_data()
    cards = next_due_group(payload)
    if not cards:
        print("Every unique slab search has a recent valuation; no request needed.")
        return False
    return refresh_group(session, payload, cards)


def watch() -> None:
    """Refresh one due slab at a time, slowly, throughout the day."""
    session = requests.Session()
    session.headers.update(headers())
    while True:
        now = datetime.now(timezone.utc)
        local_now = datetime.now()
        payload = read_data()
        collector = payload.setdefault("collector", {})
        request_times = [checked_at(stamp) for stamp in collector.get("requestLog", [])
                         if checked_at(stamp) > now - timedelta(days=1)]
        eligible_at = checked_at(collector.get("nextEligibleAt", ""))

        if not ACTIVE_START_HOUR <= local_now.hour < ACTIVE_END_HOUR:
            tomorrow = local_now + timedelta(days=1 if local_now.hour >= ACTIVE_END_HOUR else 0)
            resume = tomorrow.replace(hour=ACTIVE_START_HOUR, minute=0, second=0, microsecond=0)
            delay = max(60, (resume - local_now).total_seconds())
            print(f"Quiet hours; collection resumes at {resume.strftime('%I:%M %p')}.")
        elif now < eligible_at:
            delay = max(60, min(1800, (eligible_at - now).total_seconds()))
            print(f"Collector paused until {eligible_at.astimezone().strftime('%Y-%m-%d %I:%M %p')}.")
        elif len(request_times) >= MAX_REQUESTS_PER_DAY:
            delay = 60 * 60
            print("Daily request ceiling reached; checking again in one hour.")
        else:
            due = next_due_group(payload)
            if due:
                blocked = refresh_group(session, payload, due)
                if blocked:
                    updated = read_data()
                    paused_until = checked_at(updated.get("collector", {}).get("nextEligibleAt", ""))
                    delay = max(60, (paused_until - datetime.now(timezone.utc)).total_seconds())
                else:
                    delay = random.uniform(
                        MIN_WATCH_INTERVAL_MINUTES * 60, MAX_WATCH_INTERVAL_MINUTES * 60)
            else:
                delay = 30 * 60
                print("All unique slab searches are current; checking again in 30 minutes.")
        print(f"Next check in {delay / 60:.0f} minutes.")
        time.sleep(delay)


def serve(port: int) -> None:
    class MarketHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def do_POST(self):
            if self.path != "/api/inventory":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                incoming = json.loads(self.rfile.read(length).decode("utf-8"))
                cards = incoming.get("inventory", incoming) if isinstance(incoming, dict) else incoming
                if not isinstance(cards, list):
                    raise ValueError("inventory must be an array")
                normalized = []
                for position, card in enumerate(cards):
                    if not isinstance(card, dict) or not card.get("name"):
                        continue
                    normalized.append({
                        "id": str(card.get("id") or f"card-{position + 1}"),
                        "company": str(card.get("company") or "PSA").upper(),
                        "cert": str(card.get("cert") or ""),
                        "name": str(card.get("name") or ""),
                        "grade": str(card.get("grade") or ""),
                        "cost": number(card.get("cost")),
                        "photo": "",
                    })
                with DATA_LOCK:
                    payload = read_data()
                    valid_ids = {card["id"] for card in normalized}
                    payload["inventory"] = normalized
                    payload["valuations"] = [
                        value for value in payload.get("valuations", [])
                        if str(value.get("cardId")) in valid_ids
                    ]
                    payload["integration"] = {
                        "source": "slab-ledger",
                        "inventoryReceivedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    write_data(payload)
                body = json.dumps({"ok": True, "cards": len(normalized)}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                print(f"Received {len(normalized)} active cards from Slab Ledger.")
            except (ValueError, json.JSONDecodeError) as error:
                body = json.dumps({"ok": False, "error": str(error)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", port), MarketHandler)
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"Dashboard running at {url} — press Ctrl+C to stop")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    load_environment()
    parser = argparse.ArgumentParser(description="Refresh and serve the eBay dashboard")
    parser.add_argument("--serve-only", action="store_true")
    parser.add_argument("--refresh-only", action="store_true")
    parser.add_argument("--watch", action="store_true", help="pace one slab at a time throughout the day")
    parser.add_argument("--test-cloud", action="store_true", help="test PocketBase login and inventory access, then exit")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    CLOUD_CLIENT = PocketBaseClient.from_environment()
    if CLOUD_CLIENT:
        try:
            CLOUD_CLIENT.authenticate()
            sync_inventory_from_cloud(CLOUD_CLIENT)
            threading.Thread(target=cloud_sync_loop, args=(CLOUD_CLIENT,), daemon=True).start()
            print("PocketBase cloud connection ready.")
        except requests.RequestException as error:
            print(f"PocketBase startup connection failed: {error}")
            print("Continuing with the local data.json cache.")
            CLOUD_CLIENT = None
    else:
        print("PocketBase cloud settings not found; using local data.json only.")
    if args.test_cloud:
        if not CLOUD_CLIENT:
            print("Cloud test failed. Check collector.env and Tailscale.")
            raise SystemExit(1)
        print(f"Cloud test passed. Found {len(read_data().get('inventory', []))} active inventory cards.")
        raise SystemExit(0)
    if args.watch and args.refresh_only:
        watch()
    elif args.watch:
        threading.Thread(target=watch, daemon=True).start()
    elif not args.serve_only:
        one_session = requests.Session()
        one_session.headers.update(headers())
        scrape_due_once(one_session)
    if not args.refresh_only:
        import os
        os.chdir(ROOT)
        serve(args.port)
