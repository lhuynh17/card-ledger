"""Paced eBay sold-search collector for the Slab Ledger dashboard.

Install once on Windows:
    setup-windows.bat

Run continuously and serve the dashboard:
    py scraper.py --watch

The default transport pairs with an unpacked extension in the owner's normal
Chrome profile. Playwright remains a disabled troubleshooting fallback. Neither
path uses stealth plugins or attempts to solve challenges. Review eBay's terms
before use. HTML can change, so selectors may occasionally need updates.
"""

from __future__ import annotations

import argparse
import atexit
import json
import logging
import os
import random
import re
import secrets
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
WINDOWS_LOCAL_STATE = os.getenv("LOCALAPPDATA", "").strip()
LOCAL_STATE_DIR = (
    Path(WINDOWS_LOCAL_STATE) / "SlabLedgerCollector"
    if WINDOWS_LOCAL_STATE
    else ROOT.parent / ".slab-ledger-collector"
)
OUTPUT = ROOT / "data.json"
SEARCH_URL = "https://www.ebay.com/sch/i.html"
DATA_LOCK = threading.RLock()
ENV_FILE = ROOT / "collector.env"
CLOUD_CLIENT = None
LOG_DIR = ROOT / "logs"
FAILURE_DIR = LOG_DIR / "scraper-failures"
PROFILE_DIR = LOCAL_STATE_DIR / "ebay-browser-profile"
EXTENSION_PAIRING_FILE = LOCAL_STATE_DIR / "extension-pairing-key.txt"
LOCK_FILE = ROOT / "collector.lock"
BROWSER_COLLECTOR = None

# Continuous mode makes at most one request in each interval. Identical slabs
# share one query and cached valuation, so duplicates add no eBay traffic.
PAGES_PER_SEARCH = 1
MIN_WATCH_INTERVAL_MINUTES = 12
MAX_WATCH_INTERVAL_MINUTES = 20
REFRESH_AFTER_HOURS = 22
EMPTY_RESULT_RETRY_HOURS = 1
MAX_REQUESTS_PER_DAY = 72
BLOCK_COOLDOWN_HOURS = (3, 12, 24, 72)
REQUEST_TIMEOUT_SECONDS = 25
POCKETBASE_POLL_SECONDS = 60

USER_AGENT = "SlabLedgerMarketTracker/0.1 (personal inventory valuation)"
REPLICA_WORDS = {
    "REPLICA", "REPRINT", "PROXY", "CUSTOM", "ORICA", "FACSIMILE",
    "COUNTERFEIT", "UNOFFICIAL", "METAL CARD",
}
LANGUAGE_WORDS = {
    "JAPANESE", "ENGLISH", "KOREAN", "CHINESE",
    "FRENCH", "GERMAN", "SPANISH", "ITALIAN",
}


def configure_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("slab-market")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    file_handler = logging.FileHandler(
        LOG_DIR / "collector.log", encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger


LOGGER = configure_logging()


def report(message: str, level: int = logging.INFO) -> None:
    print(message)
    LOGGER.log(level, message)


def acquire_instance_lock() -> None:
    """Prevent two collector windows from scraping the same queue."""
    try:
        handle = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(handle, str(os.getpid()).encode("ascii"))
        os.close(handle)
    except FileExistsError:
        try:
            existing_pid = int(LOCK_FILE.read_text(encoding="ascii").strip())
        except (OSError, ValueError):
            existing_pid = 0
        if existing_pid:
            try:
                os.kill(existing_pid, 0)
            except OSError:
                existing_pid = 0
        if existing_pid:
            raise RuntimeError(
                "Another Slab Ledger collector is already running. "
                "Close its window before starting a second copy."
            )
        LOCK_FILE.unlink(missing_ok=True)
        acquire_instance_lock()
        return
    atexit.register(lambda: LOCK_FILE.unlink(missing_ok=True))


def load_environment(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def environment_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)).strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def environment_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "1" if default else "0").strip().lower()
    return value not in {"0", "false", "no", "off"}


def parse_clock(value: str, default: tuple[int, int]) -> tuple[int, int]:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", str(value or ""))
    if not match:
        return default
    hour, minute = int(match.group(1)), int(match.group(2))
    return (hour, minute) if 0 <= hour <= 23 and 0 <= minute <= 59 else default


def collector_config() -> dict:
    minimum_delay = environment_int(
        "SLAB_COLLECTOR_MIN_DELAY_MINUTES", MIN_WATCH_INTERVAL_MINUTES, 1, 1440
    )
    maximum_delay = environment_int(
        "SLAB_COLLECTOR_MAX_DELAY_MINUTES", MAX_WATCH_INTERVAL_MINUTES, 1, 1440
    )
    return {
        "start": parse_clock(os.getenv("SLAB_COLLECTOR_START_TIME", "00:00"), (0, 0)),
        "end": parse_clock(os.getenv("SLAB_COLLECTOR_END_TIME", "00:00"), (0, 0)),
        "minimum_delay_minutes": minimum_delay,
        "maximum_delay_minutes": max(minimum_delay, maximum_delay),
        "daily_ceiling": environment_int(
            "SLAB_COLLECTOR_DAILY_CEILING", MAX_REQUESTS_PER_DAY, 1, MAX_REQUESTS_PER_DAY
        ),
        "result_limit": environment_int("SLAB_COLLECTOR_RESULT_LIMIT", 3, 1, 3),
        "proof_limit": environment_int("SLAB_COLLECTOR_PROOF_LIMIT", 3, 0, 500),
        "evaluation_only": environment_bool("SLAB_COLLECTOR_EVALUATION_ONLY", True),
        "captcha_wait_minutes": environment_int(
            "SLAB_COLLECTOR_CAPTCHA_WAIT_MINUTES", 720, 5, 720
        ),
    }


def within_collection_window(moment: datetime, start: tuple[int, int],
                             end: tuple[int, int]) -> bool:
    current = moment.hour * 60 + moment.minute
    start_minutes = start[0] * 60 + start[1]
    end_minutes = end[0] * 60 + end[1]
    if start_minutes == end_minutes:
        return True
    if start_minutes < end_minutes:
        return start_minutes <= current < end_minutes
    return current >= start_minutes or current < end_minutes


def next_window_start(moment: datetime, start: tuple[int, int]) -> datetime:
    candidate = moment.replace(
        hour=start[0], minute=start[1], second=0, microsecond=0
    )
    if candidate <= moment:
        candidate += timedelta(days=1)
    return candidate


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


class BrowserCollector:
    """Standard persistent Chromium session for rendered sold-search pages."""

    def __init__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as error:
            raise RuntimeError(
                "The browser collector is not installed. Run setup-windows.bat once."
            ) from error
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()
        headless = os.getenv("SLAB_BROWSER_HEADLESS", "1").strip() != "0"
        channel = os.getenv("SLAB_BROWSER_CHANNEL", "chrome").strip()
        try:
            options = {
                "headless": headless,
                "locale": "en-US",
                "timezone_id": "America/Chicago",
                "viewport": {"width": 1440, "height": 900},
            }
            if channel:
                options["channel"] = channel
            self._context = self._playwright.chromium.launch_persistent_context(
                str(PROFILE_DIR), **options
            )
        except Exception as error:
            self._playwright.stop()
            if channel == "chrome":
                raise RuntimeError(
                    "Google Chrome could not be started. Install the current "
                    "Google Chrome for Windows, then restart the collector."
                ) from error
            raise
        report(
            "Browser collector ready "
            f"({'background' if headless else 'visible'} "
            f"{'Google Chrome' if channel == 'chrome' else 'Chromium'}, "
            "persistent profile)."
        )

    def close(self) -> None:
        try:
            self._context.close()
        finally:
            self._playwright.stop()

    def fetch(self, search: str, page_number: int, role: str = "sold") -> str:
        params = {
            "_nkw": search, "_pgn": page_number, "_ipg": 60,
            "_sop": 13 if role == "sold" else 15,
        }
        if role == "sold":
            params.update({"LH_Sold": 1, "LH_Complete": 1})
        url = f"{SEARCH_URL}?{urlencode(params)}"
        page = self._context.new_page()
        try:
            response = page.goto(
                url, wait_until="domcontentloaded", timeout=45_000
            )
            if response and response.status in (403, 429):
                raise RuntimeError(
                    f"eBay returned {response.status}; stop and try again later"
                )
            try:
                page.wait_for_selector(
                    "li.s-item, a[href*='/itm/']", timeout=15_000
                )
            except Exception:
                pass
            # Load the first page's lazy-rendered rows without following links.
            for position in (0.35, 0.7, 1.0):
                page.evaluate(
                    "(position) => window.scrollTo(0, "
                    "document.documentElement.scrollHeight * position)",
                    position,
                )
                page.wait_for_timeout(500)
            body = page.locator("body").inner_text(timeout=5_000).lower()
            if self._is_operator_check(body):
                if os.getenv("SLAB_BROWSER_HEADLESS", "1").strip() != "0":
                    raise RuntimeError(
                        "eBay requested a verification check. Set "
                        "SLAB_BROWSER_HEADLESS=0, restart the collector, and "
                        "complete the check in the visible browser."
                    )
                body = self._wait_for_operator(page, body)
            html = page.content()
            if not BeautifulSoup(html, "html.parser").select_one(
                "li.s-item, a[href*='/itm/']"
            ):
                raise RuntimeError("eBay returned no recognizable listing rows")
            return html
        except Exception as error:
            self._save_failure(page, search, error)
            if isinstance(error, RuntimeError):
                raise
            raise RuntimeError(f"Browser lookup failed: {error}") from error
        finally:
            page.close()

    @staticmethod
    def _is_operator_check(body: str) -> bool:
        return any(marker in body for marker in (
            "pardon our interruption", "verify yourself", "security check",
            "are you a human", "unusual activity", "sign in to your account",
            "captcha",
        ))

    def _wait_for_operator(self, page, body: str) -> str:
        config = collector_config()
        deadline = time.monotonic() + config["captcha_wait_minutes"] * 60
        report(
            "eBay needs a manual check or sign-in. The collector is paused. "
            "Connect to this computer, complete the page in the visible browser, "
            "and leave the tab open; collection will resume automatically.",
            logging.WARNING,
        )
        while self._is_operator_check(body) and time.monotonic() < deadline:
            page.wait_for_timeout(15_000)
            body = page.locator("body").inner_text(timeout=5_000).lower()
        if self._is_operator_check(body):
            raise RuntimeError(
                "Manual eBay check was not completed before the local wait limit."
            )
        report("Manual eBay check completed; resuming the queued search.")
        try:
            page.wait_for_selector("li.s-item, a[href*='/itm/']", timeout=15_000)
        except Exception:
            pass
        return body

    def _save_failure(self, page, search: str, error: Exception) -> None:
        """Keep a small local diagnostic bundle; it is excluded from Git."""
        FAILURE_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        safe = re.sub(r"[^A-Za-z0-9]+", "-", search).strip("-")[:45] or "search"
        base = FAILURE_DIR / f"{stamp}-{safe}"
        try:
            page.screenshot(path=str(base.with_suffix(".png")), full_page=False)
        except Exception:
            pass
        try:
            base.with_suffix(".html").write_text(
                page.content(), encoding="utf-8"
            )
        except Exception:
            pass
        report(
            f"Browser lookup failed; diagnostic saved under {FAILURE_DIR.name}: {error}",
            logging.WARNING,
        )


def browser_collector() -> BrowserCollector:
    global BROWSER_COLLECTOR
    if BROWSER_COLLECTOR is None:
        BROWSER_COLLECTOR = BrowserCollector()
        atexit.register(BROWSER_COLLECTOR.close)
    return BROWSER_COLLECTOR


class PocketBaseClient:
    """Minimal PocketBase client for inventory input and valuation output."""

    def __init__(self, url: str, email: str, password: str):
        self.url = url.rstrip("/")
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self.user_id = ""
        self.active_preferences_warning_reported = False

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
        active_overrides = {}
        try:
            preferences = self.request(
                "GET",
                "/api/collections/marketplace_refresh_state/records",
                params={"perPage": 500},
            ).json().get("items", [])
            for preference in preferences:
                override = preference.get("schedule_override") or {}
                active = override.get("active") if isinstance(override, dict) else {}
                if isinstance(active, dict) and active.get("mode") == "custom":
                    active_overrides[str(preference.get("card_id") or "")] = min(
                        3, max(0, int(active.get("listing_count") or 0))
                    )
            self.active_preferences_warning_reported = False
        except (requests.RequestException, TypeError, ValueError):
            if not self.active_preferences_warning_reported:
                report(
                    "Per-card active-listing choices are unavailable; sold-only "
                    "collection will continue.",
                    logging.WARNING,
                )
                self.active_preferences_warning_reported = True
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
                "ebay_search": str(record.get("ebay_search") or ""),
                "grade": str(record.get("grade") or ""),
                "cost": number(record.get("cost")),
                "photo": "",
                "active_listing_count": active_overrides.get(str(record["id"]), 0),
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


def sold_date(text: str) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    match = re.search(
        r"\bSold\s+([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})\b", value,
        re.IGNORECASE,
    )
    if not match:
        return ""
    for pattern in ("%b %d, %Y", "%b %d %Y"):
        try:
            return datetime.strptime(match.group(1), pattern).date().isoformat()
        except ValueError:
            continue
    return ""


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


def normalized_card_name(name: str) -> str:
    """Convert slab-label punctuation into the wording sellers commonly use."""
    value = str(name or "").strip()
    value = re.sub(r"(?<=[A-Za-z])\.(?=[A-Za-z&])", " ", value)
    value = re.sub(r"(?<=[A-Za-z])/(?=[A-Za-z])", " ", value)
    while re.search(r"(\S)&(\S)", value):
        value = re.sub(r"(\S)&(\S)", r"\1 & \2", value)
    return re.sub(r"\s+", " ", value).strip()


def card_keywords(name: str) -> str:
    """Port of Slab Ledger's ebayCardKeywords() function."""
    generic = {
        "POKEMON", "CARD", "CARDS", "TRADING", "COLLECTIBLE",
        "HOLO", "HOLOFOIL", "HOLOGRAPHIC", "FOIL", "FA",
        "LMTD", "COLL", "MASTER", "BTL", "SET",
    }
    original = str(name or "").upper()
    numbered_title = re.match(r"^(.*?)#\s*([A-Z0-9-]+)\s+(.+)$", original)
    if numbered_title:
        prefix_words = re.sub(r"[^A-Z0-9]+", " ", numbered_title.group(1)).split()
        repeated_words = set(prefix_words)
        year_words = [word for word in prefix_words if re.fullmatch(r"(?:19|20)\d{2}", word)]
        languages = {
            "JAPANESE", "ENGLISH", "KOREAN", "CHINESE",
            "FRENCH", "GERMAN", "SPANISH", "ITALIAN",
        }
        language_words = [word for word in prefix_words if word in languages]
        subject_words = [
            word
            for word in re.sub(r"[^A-Z0-9]+", " ", numbered_title.group(3)).split()
            if word not in generic and word not in repeated_words
        ]
        concise_words = list(dict.fromkeys(
            year_words + language_words + [numbered_title.group(2)] + subject_words
        ))
        if len(concise_words) >= 2:
            return " ".join(concise_words)

    words, seen = [], set()
    clean_name = normalized_card_name(name)
    for word in re.sub(r"[^A-Z0-9/]+", " ", clean_name.upper()).split():
        if word in generic or re.fullmatch(r"20\d{2}", word) or word in seen:
            continue
        seen.add(word)
        words.append(word)
    return " ".join(words) if len(words) >= 2 else str(name or "").strip()


def ebay_search_terms(card: dict) -> str:
    """Build a concise query without losing price-critical edition markers."""
    company = str(card.get("company") or "PSA").upper()
    grade = grade_number(str(card.get("grade") or ""))
    exact_grade = f'"{company} {grade}"' if grade else company
    if card.get("grade") == "BL10":
        exact_grade += ' "Black Label"'
    if card.get("grade") == "P10":
        exact_grade += " Pristine"
    keywords = str(card.get("ebay_search") or "").strip() or card_keywords(card.get("name", ""))
    words = keywords.split()
    concise = [
        word for word in words
        if word.upper() not in LANGUAGE_WORDS
        and not re.fullmatch(r"(?:19|20)\d{2}", word)
    ]
    if len(concise) >= 2:
        keywords = " ".join(concise)
    return " ".join(filter(None, [keywords, exact_grade, "-raw", "-ungraded"]))


def edition_identity(card: dict) -> str:
    identity = " ".join([
        str(card.get("name") or ""),
        str(card.get("ebay_search") or ""),
    ]).upper()
    if re.search(r"\b(?:1ST|FIRST)\s+(?:ED|EDITION)\b", identity):
        return "first_edition"
    if re.search(r"\bUNLIMITED\b", identity):
        return "unlimited"
    return "not_specified"


def listing_edition(title: str) -> str:
    identity = str(title or "").upper()
    if re.search(r"\b(?:1ST|FIRST)\s+(?:ED|EDITION)\b", identity):
        return "first_edition"
    if re.search(r"\bUNLIMITED\b", identity):
        return "unlimited"
    return "unknown"


def fetch_page(session: requests.Session, search: str, page: int,
               role: str = "sold") -> str:
    backend = os.getenv("SLAB_SCRAPER_BACKEND", "browser").strip().lower()
    if backend == "browser":
        return browser_collector().fetch(search, page, role)
    if backend != "requests":
        raise RuntimeError(
            "SLAB_SCRAPER_BACKEND must be 'browser' or 'requests'."
        )
    params = {
        "_nkw": search, "_pgn": page, "_ipg": 60,
        "_sop": 13 if role == "sold" else 15,
    }
    if role == "sold":
        params.update({"LH_Sold": 1, "LH_Complete": 1})
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
        completed_at = sold_date(sold_text)
        if not completed_at or "best offer accepted" in (
            f"{price_text} {sold_text}".lower()
        ):
            continue
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
            "soldAt": completed_at,
        })
    return listings


def parse_active_listings(html: str, search: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    for row in soup.select("li.s-item"):
        title = text_of(row, ".s-item__title")
        link = row.select_one("a.s-item__link")
        price_text = text_of(row, ".s-item__price")
        if not title or not link or title.lower() == "shop on ebay" or not price_text:
            continue
        shipping_text = text_of(row, ".s-item__shipping, .s-item__logisticsCost")
        price = amount(price_text)
        shipping = 0.0 if "free" in shipping_text.lower() else amount(shipping_text)
        item_url = link.get("href", "")
        item_id_match = re.search(r"/itm/(?:[^/]+/)?(\d+)", item_url)
        if price <= 0:
            continue
        listings.append({
            "id": item_id_match.group(1) if item_id_match else item_url,
            "search": search,
            "title": title,
            "price": price,
            "shipping": shipping,
            "total": round(price + shipping, 2),
            "currency": "USD",
            "condition": text_of(row, ".SECONDARY_INFO", "Not specified"),
            "url": item_url,
            "listingRole": "active",
        })
    return listings


def comparable(card: dict, listing: dict) -> bool:
    """Score title overlap while strictly enforcing slab company and grade."""
    title = re.sub(r"[^A-Z0-9.]+", " ", listing["title"].upper())
    if any(word in title for word in REPLICA_WORDS):
        return False
    company = str(card.get("company") or "PSA").upper()
    grade = grade_number(str(card.get("grade") or ""))
    if company not in title or (grade and not re.search(rf"\b{re.escape(grade)}\b", title)):
        return False
    expected_edition = edition_identity(card)
    found_edition = listing_edition(title)
    if expected_edition == "first_edition" and found_edition != "first_edition":
        return False
    if expected_edition == "unlimited" and found_edition != "unlimited":
        return False
    meaningful = [
        word for word in card_keywords(card.get("name", "")).split()
        if len(word) > 1
        and word not in LANGUAGE_WORDS
        and not re.fullmatch(r"(?:19|20)\d{2}", word)
        and word not in {"1ST", "FIRST", "ED", "EDITION", "UNLIMITED"}
    ]
    if not meaningful:
        return True
    hits = sum(
        1 for word in meaningful
        if re.search(rf"\b{re.escape(word)}\b", title)
    )
    # Require the important first token plus broad title agreement. This keeps
    # similarly graded cards from the same set out of the valuation.
    first_matches = bool(
        re.search(rf"\b{re.escape(meaningful[0])}\b", title)
    )
    return first_matches and hits / len(meaningful) >= 0.65


def lowest_active_comparables(card: dict, listings: list[dict],
                              limit: int = 3) -> list[dict]:
    matches = [item for item in listings if comparable(card, item)]
    matches.sort(key=lambda item: item["total"])
    return matches[:max(0, min(3, limit))]


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


def valuation(card: dict, search: str, raw: list[dict], error: str = "",
              result_limit: int = 3) -> dict:
    matched = [item for item in raw if comparable(card, item)]
    pending_offers = sorted([
        item for item in matched if item.get("priceVerificationRequired")
    ], key=lambda item: item.get("soldAt", ""), reverse=True)[:3]
    verified = sorted([
        item for item in matched
        if not item.get("priceVerificationRequired") and item.get("total", 0) > 0
    ], key=lambda item: item.get("soldAt", ""), reverse=True)
    recent_results = verified[:max(1, min(3, result_limit))]
    values = sorted(item["total"] for item in recent_results if item["total"] > 0)
    estimate = round(statistics.median(values), 2) if values else 0
    confidence = (
        "high" if len(values) >= 3
        else "medium" if len(values) == 2
        else "low"
    )
    volatility = "unknown"
    if len(values) >= 2 and estimate:
        spread_ratio = (values[-1] - values[0]) / estimate
        volatility = (
            "high" if spread_ratio > 0.5
            else "moderate" if spread_ratio > 0.2
            else "stable"
        )
    return {
        "cardId": card["id"], "query": search,
        "searchUrl": f"{SEARCH_URL}?{urlencode({'_nkw': search, 'LH_Sold': 1, 'LH_Complete': 1, '_sop': 13})}",
        "marketValue": estimate, "lastThreeAverage": (
            round(sum(values) / len(values), 2) if values else 0
        ), "medianValue": estimate,
        "confidence": confidence,
        "identityConfidence": confidence, "volatility": volatility,
        "edition": edition_identity(card),
        "comparableCount": len(verified),
        "pendingVerificationCount": len(pending_offers),
        "pendingBestOffers": pending_offers,
        "rejectedCount": len(raw) - len(matched),
        "low": values[0] if values else 0, "high": values[-1] if values else 0,
        "comparables": recent_results, "recentComparables": recent_results,
        "error": error,
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


def extension_pairing_key() -> str:
    EXTENSION_PAIRING_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not EXTENSION_PAIRING_FILE.exists():
        temporary = EXTENSION_PAIRING_FILE.with_suffix(".tmp")
        temporary.write_text(secrets.token_urlsafe(24), encoding="ascii")
        temporary.replace(EXTENSION_PAIRING_FILE)
        try:
            EXTENSION_PAIRING_FILE.chmod(0o600)
        except OSError:
            pass
    return EXTENSION_PAIRING_FILE.read_text(encoding="ascii").strip()


def extension_jobs(payload: dict) -> list[dict]:
    jobs = payload.setdefault("extensionJobs", [])
    if not isinstance(jobs, list):
        jobs = []
        payload["extensionJobs"] = jobs
    return jobs


def active_extension_job(payload: dict) -> Optional[dict]:
    return next(
        (
            job for job in extension_jobs(payload)
            if job.get("status") in ("pending", "running", "operator_required")
        ),
        None,
    )


def queue_extension_group(payload: dict, cards: list[dict]) -> None:
    latest_active_ids = {str(card["id"]) for card in read_data().get("inventory", [])}
    cards = [card for card in cards if str(card["id"]) in latest_active_ids]
    if not cards:
        return
    representative = cards[0]
    search = ebay_search_terms(representative)
    search_params = {
        "_nkw": search, "_pgn": 1, "_ipg": 60,
        "LH_Sold": 1, "LH_Complete": 1, "_sop": 13,
    }
    job = {
        "id": secrets.token_urlsafe(12),
        "role": "sold",
        "status": "pending",
        "search": search,
        "url": f"{SEARCH_URL}?{urlencode(search_params)}",
        "cards": cards,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    jobs = extension_jobs(payload)
    jobs.append(job)
    payload["extensionJobs"] = jobs[-20:]
    collector = payload.setdefault("collector", {})
    collector["extensionLastQueuedAt"] = job["createdAt"]
    write_data(payload)
    print(
        f"Queued {representative.get('name', representative['id'])!r} for "
        "the normal-Chrome extension."
    )


def normalize_extension_items(items, role: str, search: str) -> list[dict]:
    if not isinstance(items, list):
        raise ValueError("items must be an array")
    normalized = []
    for raw in items[:60]:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()[:500]
        url = str(raw.get("url") or "").strip()
        listing_id = str(raw.get("id") or "").strip()[:200]
        price = amount(str(raw.get("priceText") or ""))
        shipping_text = str(raw.get("shippingText") or "")
        shipping = 0.0 if "free" in shipping_text.lower() else amount(shipping_text)
        if (
            not title or price <= 0 or not listing_id
            or not re.match(r"^https://www\.ebay\.com/", url)
        ):
            continue
        item = {
            "id": listing_id,
            "search": search,
            "title": title,
            "price": price,
            "shipping": shipping,
            "total": round(price + shipping, 2),
            "currency": "USD",
            "condition": str(raw.get("condition") or "Not specified")[:200],
            "url": url,
        }
        if role == "sold":
            sold_text = str(raw.get("soldText") or "")[:200]
            completed_at = sold_date(sold_text)
            if not completed_at:
                continue
            best_offer = bool(raw.get("bestOfferAccepted")) or (
                "best offer accepted" in
                f"{raw.get('priceText', '')} {sold_text}".lower()
            )
            item.update({
                "soldText": sold_text,
                "soldAt": completed_at,
                "priceVerificationRequired": best_offer,
            })
            if best_offer:
                item.update({
                    "displayedAskingPrice": item["price"],
                    "price": 0,
                    "shipping": 0,
                    "total": 0,
                    "verificationReason": "best_offer_actual_price_unknown",
                })
        else:
            item["listingRole"] = "active"
        normalized.append(item)
    return normalized


def finish_extension_job(payload: dict, job: dict, items: list[dict]) -> None:
    role = str(job.get("role") or "sold")
    search = str(job.get("search") or "")
    cards = [
        card for card in job.get("cards", [])
        if isinstance(card, dict) and card.get("id")
    ]
    unique = list(
        {str(item["id"]): item for item in normalize_extension_items(
            items, role, search
        )}.values()
    )
    previous = {
        str(item.get("cardId")): item for item in payload.get("valuations", [])
    }
    updated = []
    if role == "sold":
        for card in cards:
            result = valuation(
                card, search, unique,
                result_limit=collector_config()["result_limit"],
            )
            if result.get("recentComparables"):
                old_active = previous.get(str(card["id"]), {}).get(
                    "activeListings", []
                )
                result["activeListings"] = old_active
                updated.append(result)
        if not updated:
            payload.setdefault("errors", []).append(
                f"{search}: the extension returned no verified sold results"
            )
        active_cards = [
            card for card in cards
            if int(card.get("active_listing_count") or 0) > 0
        ]
        if active_cards:
            params = {
                "_nkw": search, "_pgn": 1, "_ipg": 60, "_sop": 15,
            }
            extension_jobs(payload).append({
                "id": secrets.token_urlsafe(12),
                "role": "active",
                "status": "pending",
                "search": search,
                "url": f"{SEARCH_URL}?{urlencode(params)}",
                "cards": active_cards,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
    else:
        for card in cards:
            old = previous.get(str(card["id"]))
            if not old:
                continue
            old["activeListings"] = lowest_active_comparables(
                card, unique, int(card.get("active_listing_count") or 0)
            )
            updated.append(old)

    if updated:
        updated_ids = {str(item["cardId"]) for item in updated}
        payload["valuations"] = [
            item for item in payload.get("valuations", [])
            if str(item.get("cardId")) not in updated_ids
        ] + updated
    job["status"] = "complete"
    job["completedAt"] = datetime.now(timezone.utc).isoformat()
    job["acceptedCount"] = len(unique)
    payload["errors"] = payload.get("errors", [])[-20:]
    collector = payload.setdefault("collector", {})
    request_time = datetime.now(timezone.utc)
    request_log = [
        stamp for stamp in collector.get("requestLog", [])
        if checked_at(stamp) > request_time - timedelta(days=1)
    ]
    request_log.append(request_time.isoformat())
    collector.update({
        "requestLog": request_log,
        "lastRequestAt": request_time.isoformat(),
        "nextEligibleAt": (
            request_time + timedelta(
                minutes=collector_config()["minimum_delay_minutes"]
            )
        ).isoformat(),
        "pausedReason": "",
        "consecutiveBlocks": 0,
    })
    write_data(payload)


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
    now = datetime.now(timezone.utc)
    evidence_cutoff = now - timedelta(hours=REFRESH_AFTER_HOURS)
    empty_cutoff = now - timedelta(hours=EMPTY_RESULT_RETRY_HOURS)
    due = []
    for cards in query_groups(payload).values():
        records = [valuations.get(card["id"], {}) for card in cards]
        has_evidence = all(
            record.get("recentComparables") or record.get("pendingBestOffers")
            for record in records
        )
        oldest = min(
            checked_at(record.get("lastChecked", "")) for record in records
        )
        if has_evidence and oldest > evidence_cutoff:
            continue
        search = ebay_search_terms(cards[0]).casefold()
        latest_attempt = max(
            (
                checked_at(job.get("completedAt", ""))
                for job in extension_jobs(payload)
                if str(job.get("role") or "sold") == "sold"
                and str(job.get("status") or "") == "complete"
                and str(job.get("search") or "").casefold() == search
            ),
            default=datetime.min.replace(tzinfo=timezone.utc),
        )
        if latest_attempt > empty_cutoff:
            continue
        due.append((max(oldest, latest_attempt), cards))
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
    requests_made = 0
    try:
        requests_made += 1
        found = parse_listings(fetch_page(session, search, 1), search)
        unique = list({str(item["id"]): item for item in found}.values())
        result_limit = collector_config()["result_limit"]
        results = [
            valuation(card, search, unique, result_limit=result_limit)
            for card in cards
        ]
        print(f"Accepted {results[0]['comparableCount']} of {len(unique)} sold results")
        if any(int(card.get("active_listing_count") or 0) > 0 for card in cards):
            requests_made += 1
            try:
                active_found = parse_active_listings(
                    fetch_page(session, search, 1, "active"), search
                )
                active_unique = list(
                    {str(item["id"]): item for item in active_found}.values()
                )
                for result, card in zip(results, cards):
                    active_limit = min(3, int(card.get("active_listing_count") or 0))
                    result["activeListings"] = lowest_active_comparables(
                        card, active_unique, active_limit
                    )
                print(
                    "Optional active listing check completed; retained up to "
                    "three lowest matching asking prices for selected cards."
                )
            except (requests.RequestException, RuntimeError) as active_error:
                message = str(active_error)
                blocked = any(word in message.lower() for word in (
                    "403", "429", "verification", "captcha",
                    "manual ebay check",
                ))
                payload.setdefault("errors", []).append(
                    f"{search} active listings: {message}"
                )
                payload["errors"] = payload["errors"][-20:]
                print(
                    "The optional active-listing check failed; valid sold "
                    "candidates were preserved."
                )
    except (requests.RequestException, RuntimeError) as error:
        message = str(error)
        blocked = any(word in message.lower() for word in (
            "403", "429", "verification", "captcha", "manual ebay check",
        ))
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
    log.extend([request_time.isoformat()] * max(1, requests_made))
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
    config = collector_config()
    if CLOUD_CLIENT and not config["evaluation_only"]:
        for result in results:
            if result.get("error") or not result.get("recentComparables"):
                continue
            if str(result.get("cardId")) not in valid_ids:
                continue
            try:
                CLOUD_CLIENT.upsert_valuation(result)
                print(f"PocketBase market value saved for card {result['cardId']}.")
            except requests.RequestException as error:
                print(f"PocketBase market-value save failed: {error}")
    elif CLOUD_CLIENT:
        print(
            "Evaluation-only mode: candidates stayed in the local review file; "
            "no PocketBase market value was changed."
        )
    return blocked


def scrape_due_once(session: requests.Session) -> bool:
    payload = read_data()
    cards = next_due_group(payload)
    if not cards:
        print("Every unique slab search has a recent valuation; no request needed.")
        return False
    return refresh_group(session, payload, cards)


def watch() -> None:
    """Refresh one due slab at a time inside the configured local window."""
    session = requests.Session()
    session.headers.update(headers())
    backend = os.getenv("SLAB_SCRAPER_BACKEND", "extension").strip().lower()
    if (
        backend == "browser"
        and os.getenv("SLAB_BROWSER_HEADLESS", "1").strip() == "0"
    ):
        browser_collector()
    if backend == "extension":
        print(
            "Chrome extension pairing code: "
            f"{extension_pairing_key()}\n"
            "Enter this code only in the Slab Ledger Collector extension."
        )
    completed_in_window = 0
    active_window_date = None
    while True:
        config = collector_config()
        now = datetime.now(timezone.utc)
        local_now = datetime.now()
        payload = read_data()
        collector = payload.setdefault("collector", {})
        request_times = [checked_at(stamp) for stamp in collector.get("requestLog", [])
                         if checked_at(stamp) > now - timedelta(days=1)]
        eligible_at = checked_at(collector.get("nextEligibleAt", ""))
        extension_job = active_extension_job(payload) if backend == "extension" else None
        extension_completed = len([
            job for job in extension_jobs(payload)
            if job.get("role") == "sold" and job.get("status") == "complete"
            and checked_at(job.get("completedAt", "")) > now - timedelta(days=1)
        ])

        if active_window_date != local_now.date():
            active_window_date = local_now.date()
            completed_in_window = 0

        if not within_collection_window(local_now, config["start"], config["end"]):
            resume = next_window_start(local_now, config["start"])
            delay = max(60, (resume - local_now).total_seconds())
            print(f"Quiet hours; collection resumes at {resume.strftime('%I:%M %p')}.")
        elif now < eligible_at:
            delay = max(60, min(1800, (eligible_at - now).total_seconds()))
            print(f"Collector paused until {eligible_at.astimezone().strftime('%Y-%m-%d %I:%M %p')}.")
        elif len(request_times) >= config["daily_ceiling"]:
            delay = 60 * 60
            print("Daily request ceiling reached; checking again in one hour.")
        elif extension_job:
            delay = 60
            print(
                "Waiting for the Chrome extension to finish the current "
                f"{extension_job.get('role', 'sold')} search."
            )
        elif config["proof_limit"] and (
            extension_completed >= config["proof_limit"]
            if backend == "extension" else completed_in_window >= config["proof_limit"]
        ):
            resume = next_window_start(local_now, config["start"])
            delay = max(60, (resume - local_now).total_seconds())
            print(
                "Proof-of-concept limit reached; no more cards will be checked "
                f"until {resume.strftime('%I:%M %p')}."
            )
        else:
            due = next_due_group(payload)
            if due:
                expected_requests = 1 + int(any(
                    int(card.get("active_listing_count") or 0) > 0 for card in due
                ))
                if len(request_times) + expected_requests > config["daily_ceiling"]:
                    delay = 60 * 60
                    print(
                        "The next card would cross the daily request ceiling; "
                        "checking again in one hour."
                    )
                elif backend == "extension":
                    queue_extension_group(payload, due)
                    completed_in_window += 1
                    delay = 60
                else:
                    blocked = refresh_group(session, payload, due)
                    completed_in_window += 1
                    if blocked:
                        updated = read_data()
                        paused_until = checked_at(
                            updated.get("collector", {}).get("nextEligibleAt", "")
                        )
                        delay = max(
                            60,
                            (
                                paused_until - datetime.now(timezone.utc)
                            ).total_seconds(),
                        )
                    else:
                        delay = random.uniform(
                            config["minimum_delay_minutes"] * 60,
                            config["maximum_delay_minutes"] * 60,
                        )
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
            origin = self.headers.get("Origin", "")
            allowed_origin = os.getenv(
                "SLAB_COLLECTOR_ALLOWED_ORIGIN",
                "https://lhuynh17.github.io",
            ).strip()
            if (
                origin.startswith("chrome-extension://")
                or origin == allowed_origin
            ):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, X-Slab-Collector-Key",
            )
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def extension_authorized(self) -> bool:
            supplied = self.headers.get("X-Slab-Collector-Key", "")
            expected = extension_pairing_key()
            return bool(supplied) and secrets.compare_digest(supplied, expected)

        def send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            private_path = self.path.split("?", 1)[0].lower()
            if (
                private_path.startswith("/data/")
                or private_path.startswith("/logs/")
                or private_path in ("/collector.env", "/collector.lock")
            ):
                self.send_error(404)
                return
            if self.path not in (
                "/api/extension/health", "/api/extension/next"
            ):
                return super().do_GET()
            if not self.extension_authorized():
                self.send_json(401, {"ok": False, "error": "pairing_required"})
                return
            if self.path == "/api/extension/health":
                self.send_json(200, {
                    "ok": True,
                    "mode": "evaluation_only",
                })
                return
            payload = read_data()
            job = next(
                (
                    item for item in extension_jobs(payload)
                    if item.get("status") in (
                        "pending", "running", "operator_required"
                    )
                ),
                None,
            )
            if not job:
                self.send_json(200, {"ok": True, "job": None})
                return
            job["status"] = "running"
            job["startedAt"] = datetime.now(timezone.utc).isoformat()
            write_data(payload)
            self.send_json(200, {
                "ok": True,
                "job": {
                    "id": job["id"],
                    "role": job["role"],
                    "url": job["url"],
                },
            })

        def do_POST(self):
            if self.path == "/api/extension/result":
                if not self.extension_authorized():
                    self.send_json(401, {
                        "ok": False, "error": "pairing_required",
                    })
                    return
                try:
                    if "application/json" not in self.headers.get(
                        "Content-Type", ""
                    ).lower():
                        self.send_json(415, {
                            "ok": False, "error": "json_required",
                        })
                        return
                    length = int(self.headers.get("Content-Length", "0"))
                    if length <= 0 or length > 1_000_000:
                        self.send_json(413, {
                            "ok": False, "error": "invalid_body_size",
                        })
                        return
                    incoming = json.loads(
                        self.rfile.read(length).decode("utf-8")
                    )
                    payload = read_data()
                    job = next(
                        (
                            item for item in extension_jobs(payload)
                            if secrets.compare_digest(
                                str(item.get("id") or ""),
                                str(incoming.get("jobId") or ""),
                            )
                        ),
                        None,
                    )
                    if not job:
                        raise ValueError("unknown job")
                    status = str(incoming.get("status") or "")
                    if status == "operator_required":
                        job["status"] = "operator_required"
                        job["safeError"] = "eBay requires a manual browser check."
                        write_data(payload)
                    elif status == "complete":
                        finish_extension_job(
                            payload, job, incoming.get("items", [])
                        )
                    else:
                        job["status"] = "failed"
                        job["safeError"] = str(
                            incoming.get("error")
                            or "The extension could not read this eBay page."
                        )[:300]
                        payload.setdefault("errors", []).append(
                            f"{job.get('search', '')}: {job['safeError']}"
                        )
                        payload.setdefault("collector", {})["nextEligibleAt"] = (
                            datetime.now(timezone.utc) + timedelta(hours=3)
                        ).isoformat()
                        write_data(payload)
                    self.send_json(200, {"ok": True})
                except (ValueError, json.JSONDecodeError) as error:
                    self.send_json(400, {
                        "ok": False, "error": str(error),
                    })
                return
            if self.path != "/api/inventory":
                self.send_error(404)
                return
            if CLOUD_CLIENT:
                body = json.dumps({
                    "ok": True,
                    "ignored": True,
                    "source": "pocketbase",
                    "cards": len(read_data().get("inventory", [])),
                }).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 1_000_000:
                    raise ValueError("inventory body size is invalid")
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
    acquire_instance_lock()
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
