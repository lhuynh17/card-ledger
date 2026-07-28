# PocketBase setup for Slab Ledger

After pulling this version, run the setup tool on either computer:

- Windows: double-click `setup-pocketbase.bat`.
- Mac: double-click `setup-pocketbase-mac.command`. The first launch may require
  right-clicking it and choosing **Open**.

Enter the PocketBase URL and superuser credentials when prompted. The installer
never saves the password and never deletes existing records.
If superuser MFA is enabled, the password step triggers the normal PocketBase
MFA email and the tool then asks for that one-time code. MFA does not need to be
disabled.
After the first successful run, the non-secret URL and superuser email are saved
only in the ignored local `pocketbase-setup.env` file. Future runs display those
two saved values without stopping for input; the only prompt is
`Superuser password (hidden)`.

Before changing the schema, create a PocketBase backup from **Settings →
Backups**. The setup tool performs an ownership safety check before repairing
API rules. If any collection has a missing, invalid, or empty owner, it stops
without changing that collection's rules so existing records are not locked
out.

It prepares:

- `cards`: adds selling-cost fields, optional PSA sales-estimate fields,
  editable eBay search keywords, and a protected back-photo field; verifies
  owner-only API rules; and protects both inventory photos with short-lived
  file tokens;
- `market_values`: keeps manual comps, source, notes, update date, and history;
- `business_entries`: stores owner-scoped expenses, contributions, draws,
  loans, other income, and protected receipt/invoice uploads.
- `app_preferences`: privately syncs the optional bank/cash buying-capital
  reminder and Slab Ledger's successful Parse.bot call count; neither is
  included in ledger exports or tax estimates.
- `debt_reminders`: privately syncs the **Owed to me** and **I owe** reminder
  lists; settled reminders are retained but excluded from active totals.
- `business_exceptions`: stores year-end review notes for business money that
  moved through a personal account or other unusual situations.
- `grading_items`: privately stores the simplified grading tracker, including
  quantity, raw-card cost, grading cost, notes, and an optional protected photo.
- `grading_plays`: stores submission-level status and notes.
- `grading_play_cards`: stores multiple card lines, quantities, costs, and
  grading results inside each play.
- `grading_play_sales`: stores any number of sales against each grading play.
- `marketplace_usage`: owner-private daily/monthly returned-record counters,
  operations, cache hits, and usage by feature.
- `marketplace_activity`: bounded owner-private provider activity and safe error
  summaries.
- `marketplace_search_cache`: short-lived owner-private normalized query
  results, including empty results.
- `marketplace_observations`: owner-private normalized accepted/rejected listing
  observations with rejection reasons and expiry.

The three older `grading_play_*` collections are retained so upgrading does
not delete any grading data created by earlier Slab Ledger versions.

Every inventory, market, and business record is protected by owner-based API
rules:

- List/View/Update/Delete: `owner = @request.auth.id`
- Create: `@request.body.owner = @request.auth.id`

## Optional Parse.bot PSA lookup

Slab Ledger can fill the card title, grade, population, and available PSA
front/back scans from a PSA cert number. It can also calculate a clearly
labeled estimate from up to three recent comparable sales. Parse.bot currently
does not return a direct PSA price guide value.

1. Create a Parse.bot account and API key.
2. Copy `pb_hooks/slab_ledger_psa.pb.js` next to the PocketBase executable as
   `pb_hooks/slab_ledger_psa.pb.js`.
3. Set `PARSE_BOT_API_KEY` in the environment that starts PocketBase, then
   restart PocketBase. If PocketBase is launched from another directory, start
   it with `--hooksDir=/path/to/pb_hooks`.
4. Run the Slab Ledger PocketBase setup tool once. This adds the optional
   estimate fields and protected `photo_back` field to `cards`.
5. Sign in to Slab Ledger and tap **Scan PSA label**. A successful QR or
   barcode scan automatically starts the PSA lookup. You can also choose
   **Enter a cert number instead**. **Get estimate** uses one additional
   Parse.bot credit.

The API key remains on the PocketBase server and is never sent to the browser.
All PSA routes require an authenticated `users` account. The image relay accepts
only HTTPS images hosted by PSA or its public image CDN; it cannot request NAS
or private-network addresses. Parse.bot currently
advertises 200 free credits and a 5 requests/minute limit, while some individual
marketplace tables still display an older allowance. Use the signed-in usage
page as the source of truth for your account.

The compact header badge tracks successful Parse.bot calls made through Slab
Ledger. Click it once to enter the starting balance and the next reset date.
That starting point is privately synced through `app_preferences`, app lookups
count down from it on every signed-in device, and the counter returns to the
monthly allowance on the chosen date. A local copy provides an offline fallback.
It uses 200 monthly credits by default. If your allowance changes, set
`PARSE_BOT_MONTHLY_CREDITS` in the PocketBase container environment. Parse.bot
does not currently document an account balance endpoint, so calls made outside
Slab Ledger are not included automatically.

The grading tracker loads through the authenticated
`/api/slab-ledger/grading-items` hook route. It always filters by the signed-in
user on the server and retains the last successful device copy as a loading
fallback.

## Optional Bright Data marketplace evaluation

Bright Data is implemented as a default-off evaluation provider. It does not
replace Parse.bot, eBay Product Research, manual comps, cached values, or the
local collector. A managed result only fills the existing review form; the
owner must explicitly save it.

### Safety gates

- All browser calls go to authenticated PocketBase routes.
- PocketBase makes outbound HTTPS calls only to `api.brightdata.com`.
- No public webhook, listener, Funnel, or inbound firewall rule is used.
- The API token remains only in the PocketBase/container environment.
- The adapter refuses live requests until the account schema is confirmed.
- The feature flag defaults off and the kill switch defaults on.
- Empty or failed searches never update `market_values`.

### Install the server files

1. Create a PocketBase backup.
2. Run `setup_pocketbase.py`. The migration only adds the four owner-private
   marketplace collections listed above; it does not alter or delete inventory
   or existing market values.
3. Copy `pb_hooks/slab_ledger_marketplace.pb.js` and the complete
   `pb_hooks/lib/` directory beside the PocketBase executable. Preserve the
   directory layout because the hook loads the provider modules from `lib/`.
4. Restart PocketBase. Leave Bright Data disabled during metadata validation.

### Validate the account without consuming scraper records

Do not paste the token into a command argument, repository file, browser field,
PocketBase record, screenshot, or chat. Put it temporarily in the process
environment and run:

```text
BRIGHT_DATA_API_TOKEN=(set securely in your shell environment)
python3 bright_data_validate.py
```

The utility calls only Bright Data's dataset-list metadata endpoint and reports
eBay datasets available to that account. It reports `records_consumed: 0`.
After choosing a candidate:

```text
BRIGHT_DATA_API_TOKEN=(set securely in your shell environment)
python3 bright_data_validate.py --dataset-id=ACCOUNT_DATASET_ID
```

The selected ID is not a secret. Metadata field signals are not proof of
sold/completed behavior. Before setting `BRIGHT_DATA_SCHEMA_CONFIRMED=1`,
confirm in the Bright Data account scraper page:

- the exact request input: eBay search URL or keyword;
- the returned field names and types;
- whether it supports active listings;
- whether it supports genuinely sold/completed listings and sold timestamps;
- the billing unit, including how empty/failed records are charged;
- per-request and per-page record limits;
- synchronous and asynchronous availability and typical latency;
- current pricing and applicable marketplace/provider terms.

Do not use a dataset ID copied from public examples.

### Secure container configuration

Enter these values in Synology Container Manager's environment settings for the
private PocketBase container. Do not add them to frontend code or a committed
file.

| Variable | Initial value | Purpose |
| --- | --- | --- |
| `BRIGHT_DATA_API_TOKEN` | account token | Secret server-only bearer token |
| `BRIGHT_DATA_DATASET_ID` | validated account ID | Exact eBay scraper/dataset |
| `BRIGHT_DATA_INPUT_FIELD` | `url` or `keyword` | Confirmed request input |
| `BRIGHT_DATA_REQUEST_MODE` | `sync` or `async` | Confirmed delivery mode |
| `BRIGHT_DATA_SCHEMA_CONFIRMED` | `0`, then `1` after validation | Prevents assumed schemas |
| `BRIGHT_DATA_ENABLED` | `0`, then `1` for evaluation | Feature flag |
| `BRIGHT_DATA_KILL_SWITCH` | `1`, then `0` for evaluation | Immediate stop |
| `BRIGHT_DATA_MONTHLY_ALLOWANCE` | `5000` | Returned-record monthly allowance |
| `BRIGHT_DATA_WARNING_THRESHOLDS` | `50,75,90` | Percent-consumed warnings |
| `BRIGHT_DATA_DAILY_CEILING` | `250` | Returned-record daily ceiling |
| `BRIGHT_DATA_HARD_STOP` | `1` | Stop before a request could cross a limit |
| `BRIGHT_DATA_RESULT_LIMIT` | `50` | Maximum normalized records per operation |
| `BRIGHT_DATA_PAGE_LIMIT` | `1` | Provider discovery page limit |
| `BRIGHT_DATA_TIMEOUT_SECONDS` | `25` | Per-request timeout |
| `BRIGHT_DATA_MAX_RETRIES` | `1` | Bounded retry count, maximum 2 |
| `BRIGHT_DATA_POLL_INTERVAL_SECONDS` | `5` | Async outbound polling interval |
| `BRIGHT_DATA_MAX_POLLS` | `10` | Async polling limit |
| `BRIGHT_DATA_COOLDOWN_MINUTES` | `15` | Cooldown after retryable failures |
| `BRIGHT_DATA_CACHE_HOURS` | `22` | Private identical-query cache lifetime |
| `BRIGHT_DATA_RETENTION_DAYS` | `90` | Activity and observation retention |

`BRIGHT_DATA_HARD_STOP=0` permits warnings without blocking after the limits are
reached and should be used only after a deliberate budget review.

### First live validation

Only after the account details above are confirmed:

1. set `BRIGHT_DATA_SCHEMA_CONFIRMED=1`;
2. keep the monthly/daily limits and result limit conservative;
3. set `BRIGHT_DATA_ENABLED=1`;
4. set `BRIGHT_DATA_KILL_SWITCH=0`;
5. restart PocketBase;
6. sign in, open **Marketplace Usage**, and confirm evaluation mode is ready;
7. evaluate one manually reviewed card;
8. compare candidates, rejections, record usage, and cost against eBay Product
   Research before saving anything.

If the live response does not match the adapter schema, turn the kill switch on
and leave `BRIGHT_DATA_SCHEMA_CONFIRMED=0` until the adapter is updated.

### Rollback

Set `BRIGHT_DATA_KILL_SWITCH=1` or `BRIGHT_DATA_ENABLED=0` and restart
PocketBase. The PWA immediately falls back to manual comps, cached values,
Product Research, Parse.bot, and the local collector. Do not delete the new
collections during rollback; they are owner-private and can be retained for
audit or removed later only after a separate backup and explicit approval.

Security impact: this feature adds one outbound provider destination and two
authenticated PocketBase routes. It does not add a public network path, change
existing collection ownership, expose secrets to the browser, or make managed
results authoritative.

## Recommended PocketBase launch restrictions

For the GitHub Pages app, add this launch option to restrict cross-origin
browser access:

```text
--origins=https://lhuynh17.github.io
```

Keep Tailscale Serve private and do not enable Tailscale Funnel. Also enable
PocketBase rate limiting, create regular backups, and review the `_superusers`
MFA and IP restriction options before exposing any additional network path.

## After setup

1. Refresh Slab Ledger and sign in.
2. Use **Market** on an active card to save up to three manual comps.
3. When marking a card sold, enter platform fees and shipping cost.
4. Use **Business finances** for operating expenses and owner/capital activity.
   Each entry can include one receipt photo, screenshot, or PDF up to 10 MB.
5. Use **Tools** for the personal buying-capital reminder and quick percentage
   calculators, plus informal money owed reminders.
6. Use **Exceptions log** in Business Ledger to document unusual account
   activity for year-end review. Exception notes do not change calculated
   totals automatically.
7. Use the **Grading tracker** in Tools to record raw cards, quantities, photos,
   and estimated all-in grading costs.
8. Keep receipts, invoices, bank statements, and annual exports with your tax
   records. Slab Ledger organizes records but does not determine tax treatment.

The Windows scraper is optional and is not required for manual market values or
the business ledger.
