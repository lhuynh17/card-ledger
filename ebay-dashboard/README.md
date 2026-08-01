# Slab Ledger market collector

This Windows companion reads active inventory from PocketBase and begins one
paced daily refresh cycle at 2:00 AM local time. The most recent exact-match
sale becomes the market value. Up to three confirmed sales and the three lowest
exact-match active listings remain visible for context.

## First-time Windows setup

1. Pull the latest `card-ledger` changes in GitHub Desktop.
2. Close the old collector window.
3. Double-click `setup-windows.bat`.
4. Keep your existing private `collector.env`.
5. Double-click `test-cloud.bat`.
6. Double-click `run.bat` and leave its window open.
7. After a test card completes successfully, double-click
   `install-collector-startup.bat` once. Windows will then start the collector
   whenever you sign in. Keep that Windows account signed in; locking the
   screen is fine.

`setup-windows.bat` installs the Python collector components. Install the
current Google Chrome for Windows separately. The default proof uses the
unpacked extension under `chrome-extension/` in the owner's normal signed-in
Chrome profile. Local pairing data, logs, credentials, and live results are
excluded from Git.

## Install the normal-Chrome extension

1. Open `chrome://extensions` in the normal Chrome profile that can sign in to
   eBay.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `ebay-dashboard/chrome-extension` folder.
5. Set `SLAB_SCRAPER_BACKEND=extension` in ignored `collector.env`.
6. Start `run.bat` and copy the displayed pairing code.
7. Open the extension's **Details → Extension options**, enter the pairing
   code, check **Enable automatic queued searches**, and choose **Save and
   test**.

The pairing code authorizes only the loopback bridge on this computer. It is
stored in the Windows user's private local application-data folder, not under
the dashboard server. It is not a PocketBase, eBay, or provider credential. Do
not share it.

## Collection safeguards

- Active PocketBase inventory is authoritative; sold cards are skipped.
- Identical slab identities share a cached result.
- One daily cycle starts at 2:00 AM and paces requests every 2–4 minutes.
- Each card gets one sold-results lookup and one active-results lookup.
- Only the most recent exact sale changes the market value.
- Up to three confirmed sales and three lowest exact active listings are kept.
- Ambiguous candidates never change the value until the owner confirms one.
- No more than 150 requests run in a rolling 24-hour window.
- A 403, 429, or verification page triggers an escalating cooldown.
- A lock file prevents two collector windows from running simultaneously.
- Failures are logged locally under `logs/`, with a screenshot and HTML
  diagnostic when the browser cannot read a results page.
- A visible browser pauses on an eBay sign-in or CAPTCHA for up to 12 hours and
  resumes automatically after the owner completes it.
- Evaluation-only mode keeps proof results local and never replaces a trusted
  PocketBase market value.

The default collector uses an unpacked extension in normal Google Chrome.
Playwright remains a disabled troubleshooting fallback. Neither path includes
stealth plugins,
fingerprint disguises, challenge solvers, proxy rotation, or other blocking
workarounds.

## Private configuration

`collector.env` is never committed. The supported optional settings are:

```text
SLAB_SCRAPER_BACKEND=extension
SLAB_BROWSER_CHANNEL=chrome
SLAB_BROWSER_HEADLESS=0
SLAB_COLLECTOR_DAILY_RUN_TIME=02:00
SLAB_COLLECTOR_MIN_DELAY_MINUTES=2
SLAB_COLLECTOR_MAX_DELAY_MINUTES=4
SLAB_COLLECTOR_DAILY_CEILING=150
SLAB_COLLECTOR_PROOF_LIMIT=0
SLAB_COLLECTOR_EVALUATION_ONLY=1
```

Use `SLAB_SCRAPER_BACKEND=requests` only as a troubleshooting fallback.
Keep `SLAB_BROWSER_HEADLESS=0` for the dedicated Windows computer so remote
manual checks remain possible. Keep `SLAB_COLLECTOR_EVALUATION_ONLY=1` during a
first-time test. Set it to `0` only after the exact-match result has been
reviewed; production still refuses ambiguous listings and preserves existing
values after failures.
