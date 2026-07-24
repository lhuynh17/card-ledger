# PocketBase setup for remote market values

Slab Ledger already stores inventory in the `cards` collection. Add one new
base collection named `market_values`; do not add market fields to `cards`.

## Automatic setup

Run `setup-pocketbase.bat` and enter the PocketBase URL and superuser
credentials when prompted. The installer:

- creates `market_values` only if it is missing;
- verifies all required fields when it already exists;
- never deletes or replaces an existing collection;
- does not save the superuser email, password, or token.

The manual specification below is retained for review and troubleshooting.

## Fields

Create these fields in `market_values`:

| Field | Type | Required |
|---|---|---|
| `owner` | Relation → `users` (single) | Yes |
| `card_id` | Text | Yes |
| `query` | Text | No |
| `search_url` | URL or Text | No |
| `market_value` | Number | No |
| `confidence` | Select: `low`, `medium`, `high` | No |
| `checked_at` | Date | No |
| `comparable_count` | Number | No |
| `rejected_count` | Number | No |
| `low` | Number | No |
| `high` | Number | No |
| `comparables` | JSON | No |
| `error` | Text | No |

If your PocketBase version supports indexes, add a unique index over
`owner, card_id`.

## API rules

Use these rules:

- List/Search: `owner = @request.auth.id`
- View: `owner = @request.auth.id`
- Create: `@request.body.owner = @request.auth.id`
- Update: `owner = @request.auth.id`
- Delete: `owner = @request.auth.id`

These rules ensure each signed-in user can only see and modify their own market
records.

## Collector configuration

1. Copy `collector.env.example` to `collector.env`.
2. Set `SLAB_POCKETBASE_URL` to the same `https://...ts.net` address used by
   Slab Ledger.
3. Enter the PocketBase email and password used by Slab Ledger.
4. Keep `collector.env` private.
5. Run `setup-windows.bat` once to install the collector and its standard
   Chromium browser.
6. Run `test-cloud.bat`. It should report the number of active cards found.
7. Run `install-slab-ledger-integration.bat` again so the newest phone panel
   is copied into the Slab Ledger folder.
8. Start `run.bat`.

The Windows computer must have Tailscale connected and must be able to reach
PocketBase. The phone also needs Tailscale connected while it synchronizes.

## Expected flow

1. Slab Ledger saves inventory to `cards`.
2. The Windows collector checks `cards` every minute.
3. A paced eBay lookup produces a market value.
4. The collector creates or updates the corresponding `market_values` record.
5. Slab Ledger reads that record when the card tile is opened.

`data.json` remains a local cache. PocketBase is the cross-device source of
truth.
