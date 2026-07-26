# Slab Ledger

A mobile-friendly inventory and business ledger for graded trading cards.

The app tracks:

- active and sold inventory, cost basis, sale proceeds, fees, and shipping;
- scan-first PSA certificate autofill for card details, protected front/back
  slab images, and optional recent-sales estimates through private PocketBase
  routes, with structured, editable eBay search keywords and a guided manual
  fallback;
- one-tap PSA recent-sale comparables or manual market values from one to three
  sales, including links, source, notes, update date, and value history;
- collection cost, market value, unrealized gain or loss, and a current-value
  acquisition timeline;
- an owner profile with a synced display name and protected business
  logo/profile picture;
- business expenses, owner contributions and draws, loans, other income, and
  protected receipt or invoice uploads, with post-save corrections;
- tax-year estimates for gross receipts, COGS, selling costs, operating
  expenses, profit, and available capital;
- a private bank/cash buying-capital reminder, money owed lists, and quick
  percentage calculators;
- CSV exports for inventory and annual business records.
- a year-end exceptions log for unusual personal/business account activity.
- grading-play tracking for batch costs, PSA 10 results, sales, and play-level
  profit or loss.

PocketBase setup instructions are in
[`ebay-dashboard/POCKETBASE_SETUP.md`](ebay-dashboard/POCKETBASE_SETUP.md).
The scraper is optional; manual market tracking and the business ledger work
without it.

The setup tool also audits existing collection ownership rules before repairing
them and protects front/back inventory photos with PocketBase short-lived file
tokens. It
stops instead of applying rules when existing records could be locked out.

Slab Ledger is a recordkeeping aid, not accounting or tax advice. Keep original
receipts and statements, and confirm tax classifications with a qualified
professional.
