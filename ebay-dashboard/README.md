# Slab Ledger market collector

This Windows companion reads active inventory from PocketBase, checks rendered
eBay sold-search results at a deliberately slow pace, and writes the latest
accepted comparables and market estimate back to PocketBase.

## First-time Windows setup

1. Pull the latest `card-ledger` changes in GitHub Desktop.
2. Close the old collector window.
3. Double-click `setup-windows.bat`.
4. Keep your existing private `collector.env`.
5. Double-click `test-cloud.bat`.
6. Double-click `run.bat` and leave its window open.

`setup-windows.bat` installs Python packages and standard Playwright Chromium.
The browser keeps a local profile under `data/`; that folder, logs, credentials,
and live results are excluded from Git.

## Collection safeguards

- Active PocketBase inventory is authoritative; sold cards are skipped.
- Identical slab searches share a cached result.
- One due search runs every 12–20 minutes, only from 7 AM to 11 PM.
- Results remain current for 22 hours.
- No more than 72 requests run in a rolling 24-hour window.
- A 403, 429, or verification page triggers an escalating cooldown.
- A lock file prevents two collector windows from running simultaneously.
- Failures are logged locally under `logs/`, with a screenshot and HTML
  diagnostic when the browser cannot read a results page.

The collector uses normal Chromium. It does not include stealth plugins,
fingerprint disguises, challenge solvers, proxy rotation, or other blocking
workarounds.

## Private configuration

`collector.env` is never committed. The supported optional settings are:

```text
SLAB_SCRAPER_BACKEND=browser
SLAB_BROWSER_HEADLESS=1
```

Use `SLAB_SCRAPER_BACKEND=requests` only as a troubleshooting fallback.
Changing `SLAB_BROWSER_HEADLESS` to `0` shows the browser window for diagnosis.
