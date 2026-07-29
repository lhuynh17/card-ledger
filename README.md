# Slab Ledger

A mobile-friendly inventory and business ledger for graded trading cards.

The app tracks:

- active and sold inventory, cost basis, sale proceeds, fees, and shipping;
- scan-first PSA certificate autofill for card details, protected front/back
  slab images, and optional recent-sales estimates through private PocketBase
  routes, with structured, editable eBay search keywords and a guided manual
  fallback;
- one-tap PSA recent-sale comparables or manual market values from one to five
  sales, including links, source, notes, update date, and value history;
- a default-off Bright Data evaluation adapter behind authenticated PocketBase
  routes, with private usage controls, caching, normalized observations, and a
  Marketplace Usage dashboard; live collection remains disabled until the
  owner's account-specific eBay dataset and schema are validated;
- separate default-off Apify sold-evidence and Bright Data active-listing
  schedules at hour/day/week/month intervals, with live free-tier estimates,
  per-card sold-schedule overrides, and no automatic value replacement;
- an optional evaluation-only Windows sold-listing collector that can run a
  three-card all-day proof, pause for a manual browser check, and retain one
  to three candidates locally without replacing trusted values;
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
