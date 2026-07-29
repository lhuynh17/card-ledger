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
7. After the three-card proof succeeds, double-click
   `install-collector-startup.bat` once. Windows will then start the collector
   whenever you sign in. Keep that Windows account signed in; locking the
   screen is fine.

`setup-windows.bat` installs Python packages and standard Playwright Chromium.
The browser keeps a local profile under `data/`; that folder, logs, credentials,
and live results are excluded from Git.

## Collection safeguards

- Active PocketBase inventory is authoritative; sold cards are skipped.
- Identical slab searches share a cached result.
- The default proof runs from 2 AM to 7 AM in the Windows computer's local
  time, with one due search every 12–20 minutes.
- The proof stops after three unique searches and retains the latest three
  sold candidates per card.
- Cards explicitly selected in Slab Ledger can also retain their three lowest
  matching active asking prices from one separate request.
- Results remain current for 22 hours.
- No more than 72 requests run in a rolling 24-hour window.
- A 403, 429, or verification page triggers an escalating cooldown.
- A lock file prevents two collector windows from running simultaneously.
- Failures are logged locally under `logs/`, with a screenshot and HTML
  diagnostic when the browser cannot read a results page.
- A visible browser pauses on an eBay sign-in or CAPTCHA for up to 12 hours and
  resumes automatically after the owner completes it.
- Evaluation-only mode keeps proof results local and never replaces a trusted
  PocketBase market value.

The collector uses normal Chromium. It does not include stealth plugins,
fingerprint disguises, challenge solvers, proxy rotation, or other blocking
workarounds.

## Private configuration

`collector.env` is never committed. The supported optional settings are:

```text
SLAB_SCRAPER_BACKEND=browser
SLAB_BROWSER_HEADLESS=0
SLAB_COLLECTOR_START_TIME=02:00
SLAB_COLLECTOR_END_TIME=07:00
SLAB_COLLECTOR_MIN_DELAY_MINUTES=12
SLAB_COLLECTOR_MAX_DELAY_MINUTES=20
SLAB_COLLECTOR_RESULT_LIMIT=3
SLAB_COLLECTOR_PROOF_LIMIT=3
SLAB_COLLECTOR_EVALUATION_ONLY=1
```

Use `SLAB_SCRAPER_BACKEND=requests` only as a troubleshooting fallback.
Keep `SLAB_BROWSER_HEADLESS=0` for the dedicated Windows computer so remote
manual checks remain possible. Do not change
`SLAB_COLLECTOR_EVALUATION_ONLY` until the three-card output has been reviewed.
