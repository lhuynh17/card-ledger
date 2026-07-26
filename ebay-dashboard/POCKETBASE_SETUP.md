# PocketBase setup for Slab Ledger

After pulling this version, run the setup tool on either computer:

- Windows: double-click `setup-pocketbase.bat`.
- Mac: double-click `setup-pocketbase-mac.command`. The first launch may require
  right-clicking it and choosing **Open**.

Enter the PocketBase URL and superuser credentials when prompted. The installer
never saves the password and never deletes existing records.
After the first successful run, the non-secret URL and superuser email are saved
only in the ignored local `pocketbase-setup.env` file. Future runs display those
two saved values without stopping for input; the only prompt is
`Superuser password (hidden)`.

It prepares:

- `cards`: adds selling-cost fields and optional PSA sales-estimate fields;
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

Every market and business record is protected by owner-based API rules:

- List/View/Update/Delete: `owner = @request.auth.id`
- Create: `@request.body.owner = @request.auth.id`

## Optional Parse.bot PSA lookup

Slab Ledger can fill the card title, grade, and population from a PSA cert
number. It can also calculate a clearly labeled estimate from up to three
recent comparable sales. Parse.bot currently does not return a direct PSA price
guide value.

1. Create a Parse.bot account and API key.
2. Copy `pb_hooks/slab_ledger_psa.pb.js` next to the PocketBase executable as
   `pb_hooks/slab_ledger_psa.pb.js`.
3. Set `PARSE_BOT_API_KEY` in the environment that starts PocketBase, then
   restart PocketBase.
4. Run the Slab Ledger PocketBase setup tool once to add the three optional
   estimate fields to `cards`.
5. Sign in to Slab Ledger. Scan a PSA QR or type a cert, then use **Fill from
   PSA**. **Get estimate** uses one additional Parse.bot credit.

The API key remains on the PocketBase server and is never sent to the browser.
Both proxy routes require an authenticated `users` account. Parse.bot's free
tier currently includes 100 successful calls per month at 5 requests/minute;
confirm current limits on Parse.bot before relying on them.

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
