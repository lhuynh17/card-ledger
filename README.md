# Slab Ledger

A mobile-friendly inventory and business ledger for graded trading cards.

The app tracks:

- active and sold inventory, cost basis, sale proceeds, fees, and shipping;
- scan-first PSA certificate autofill for card details, protected front/back
  slab images, and optional recent-sales estimates through private PocketBase
  routes, with structured, editable eBay search keywords and a guided manual
  fallback;
- a nightly local marketplace refresh that uses the newest exact sold match as
  the current value, keeps three confirmed sales, and shows three exact active
  asking prices; uncertain matches wait for owner confirmation;
- a default-off Bright Data evaluation adapter behind authenticated PocketBase
  routes, with private usage controls, caching, normalized observations, and a
  Marketplace Usage dashboard; live collection remains disabled until the
  owner's account-specific eBay dataset and schema are validated;
- separate default-off managed-provider evaluation paths with usage estimates
  and no automatic value replacement;
- an optional Windows collector paired to an unpacked normal-Chrome extension;
  it runs one paced nightly cycle, pauses for manual browser checks, and never
  promotes an ambiguous card identity;
- guarded local rollout with edition-aware matching, provisional
  low-confidence estimates, reversible automatic values, Best Offer
  verification, and owner-private collector alerts;
- collection cost, market value, unrealized gain or loss, and a total
  collection-value timeline reconstructed from saved per-card market history;
- an owner profile with a synced display name and protected business
  logo/profile picture;
- business expenses, owner contributions and draws, loans, other income, and
  protected receipt or invoice uploads, with post-save corrections;
- tax-year estimates for gross receipts, COGS, selling costs, operating
  expenses, profit, and available capital;
- a compact Capital reminder, private balance lists, one switchable percentage
  calculator, and a persistent light/dark theme;
- CSV exports for inventory and annual business records.
- a year-end exceptions log for unusual personal/business account activity.
- a simple grading tracker with optional raw-card photos, quantities, per-card
  raw and grading costs, and live estimated all-in totals.

PocketBase setup instructions are in
[`ebay-dashboard/POCKETBASE_SETUP.md`](ebay-dashboard/POCKETBASE_SETUP.md).
The scraper is optional; manual market tracking and the business ledger work
without it.

Bright Data is also optional. Its adapter never replaces manual values,
Parse.bot, Product Research, cached values, or the local collector. Managed
results only prefill a review form until the owner explicitly saves them.
The local collector may promote medium/high-confidence verified sales only
after evaluation mode is deliberately disabled; every change retains history.

## Project documentation

- [`AGENTS.md`](AGENTS.md): required standards for contributors and future
  Codex conversations
- [`SECURITY.md`](SECURITY.md): private-deployment security model and safeguards
- [`docs/Architecture.md`](docs/Architecture.md): current application and data
  architecture
- [`docs/Marketplace.md`](docs/Marketplace.md): current and target provider,
  search, filtering, and usage architecture
- [`docs/Roadmap.md`](docs/Roadmap.md): committed future direction and explicit
  non-goals
- [`docs/Decision Log.md`](docs/Decision%20Log.md): chronological durable
  decisions and rationale

The setup tool also audits existing collection ownership rules before repairing
them and protects front/back inventory photos with PocketBase short-lived file
tokens. It
stops instead of applying rules when existing records could be locked out.

Slab Ledger is a recordkeeping aid, not accounting or tax advice. Keep original
receipts and statements, and confirm tax classifications with a qualified
professional.
