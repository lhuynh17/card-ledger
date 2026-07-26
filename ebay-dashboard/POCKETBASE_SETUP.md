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
  reminder; it is not included in ledger exports or tax estimates.
- `debt_reminders`: privately syncs the **Owed to me** and **I owe** reminder
  lists; settled reminders are retained but excluded from active totals.
- `business_exceptions`: stores year-end review notes for business money that
  moved through a personal account or other unusual situations.
- `grading_plays`: stores submission-level status and notes.
- `grading_play_cards`: stores multiple card lines, quantities, costs, and
  grading results inside each play.
- `grading_play_sales`: stores any number of sales against each grading play.

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
7. Use **Grading plays** in Tools to measure batch grading results and sales.
5. Keep receipts, invoices, bank statements, and annual exports with your tax
   records. Slab Ledger organizes records but does not determine tax treatment.

The Windows scraper is optional and is not required for manual market values or
the business ledger.
