# PocketBase setup for Slab Ledger

After pulling this version, run the setup tool on either computer:

- Windows: double-click `setup-pocketbase.bat`.
- Mac: double-click `setup-pocketbase-mac.command`. The first launch may require
  right-clicking it and choosing **Open**.

Enter the PocketBase URL and superuser credentials when prompted. The installer
never saves the password and never deletes existing records.
After the first successful run, the non-secret URL and superuser email are saved
only in the ignored local `pocketbase-setup.env` file. Future runs ask only for
the password.

It prepares:

- `cards`: adds `selling_fees` and `shipping_cost`;
- `market_values`: keeps manual comps, source, notes, update date, and history;
- `business_entries`: stores owner-scoped expenses, contributions, draws,
  loans, other income, and protected receipt/invoice uploads.
- `app_preferences`: privately syncs the optional bank/cash buying-capital
  reminder; it is not included in ledger exports or tax estimates.
- `debt_reminders`: privately syncs the **Owed to me** and **I owe** reminder
  lists; settled reminders are retained but excluded from active totals.
- `business_exceptions`: stores year-end review notes for business money that
  moved through a personal account or other unusual situations.

Every market and business record is protected by owner-based API rules:

- List/View/Update/Delete: `owner = @request.auth.id`
- Create: `@request.body.owner = @request.auth.id`

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
5. Keep receipts, invoices, bank statements, and annual exports with your tax
   records. Slab Ledger organizes records but does not determine tax treatment.

The Windows scraper is optional and is not required for manual market values or
the business ledger.
