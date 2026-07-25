# PocketBase setup for Slab Ledger

Run `setup-pocketbase.bat` after pulling this version. Enter the PocketBase URL
and superuser credentials when prompted. The installer never saves those
superuser credentials and never deletes existing records.

It prepares:

- `cards`: adds `selling_fees` and `shipping_cost`;
- `market_values`: keeps manual comps, source, notes, update date, and history;
- `business_entries`: stores owner-scoped expenses, contributions, draws,
  loans, and other income.

Every market and business record is protected by owner-based API rules:

- List/View/Update/Delete: `owner = @request.auth.id`
- Create: `@request.body.owner = @request.auth.id`

## After setup

1. Refresh Slab Ledger and sign in.
2. Use **Market** on an active card to save up to three manual comps.
3. When marking a card sold, enter platform fees and shipping cost.
4. Use **Business finances** for operating expenses and owner/capital activity.
5. Keep receipts, invoices, bank statements, and annual exports with your tax
   records. Slab Ledger organizes records but does not determine tax treatment.

The Windows scraper is optional and is not required for manual market values or
the business ledger.
