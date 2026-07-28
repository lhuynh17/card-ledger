# Slab Ledger Decision Log

This log records durable product and architecture decisions. Dates reflect the
repository history where available. Later entries supersede earlier ones when
explicitly stated.

## 2026-07-22 — Start as a static, mobile-first personal inventory

**Decision:** Build Slab Ledger as a dependency-light static web app with a PWA
manifest, local browser storage, QR scanning, and CSV/XLSX export.

**Why:** The owner needed a simple phone-friendly inventory without maintaining
a conventional application server or app-store package.

**Still relevant:** Yes. The frontend remains static and mobile-first.

## 2026-07-22 — IndexedDB for inventory and photos

**Decision:** Move durable local inventory from small local storage into
IndexedDB, retaining a one-time migration.

**Why:** Slab photos exceed practical local-storage limits, and cached/offline
operation is valuable on a phone.

**Still relevant:** Yes. IndexedDB is the offline cache, not the authorization
or multi-device source of truth.

## 2026-07-23 — PocketBase becomes synced authority

**Decision:** Use PocketBase on the owner's Synology as the authoritative
multi-device data store while preserving IndexedDB as a local cache.

**Why:** Inventory needed to survive device changes and synchronize without
placing the owner's data in a new public SaaS database.

**Consequence:** Signed-in records use PocketBase IDs and owner relations;
offline/local behavior remains available where practical.

## 2026-07-23 — Active cloud inventory is authoritative for market collection

**Decision:** The optional collector reads active inventory from PocketBase and
skips sold/deleted cards.

**Why:** A second local inventory list produced drift and wasted marketplace
requests.

**Consequence:** Identical searches share cached valuations, and valuation
records are pruned when cards are no longer active.

## 2026-07-24 — Localhost-only, deliberately paced eBay collector

**Decision:** Keep the optional market companion on a trusted personal computer,
bind its dashboard to `127.0.0.1`, and pace one unique request every 12–20
minutes with a daily cap and cooldowns.

**Why:** eBay pages are rendered and fragile; the collector must not become a
public NAS service or behave aggressively.

**Rejected:** stealth plugins, fingerprint spoofing, proxy rotation, challenge
solving, and public binding.

## 2026-07-24 — Standard Chromium is the primary collector backend

**Decision:** Use persistent standard Playwright Chromium by default and retain
plain HTTP requests only as a troubleshooting fallback.

**Why:** Rendered sold results were more reliable in a real browser, while a
visible diagnostic mode lets the owner resolve normal sign-in/verification
issues manually.

## 2026-07-25 — Normalize market values and preserve manual comps

**Decision:** Store current value, source, query, confidence, range, comparables,
notes, timestamps, and history in an owner-scoped `market_values` collection.
Keep one-to-three manual comps available.

**Why:** Automated search can fail or return poor matches. Values must be
auditable and correctable instead of being treated as unquestionable.

## 2026-07-25 — Add an owner-scoped business ledger, not an accounting engine

**Decision:** Track expenses, owner activity, loans, other income, receipts,
exceptions, and estimates while explicitly preserving original records and
professional tax review.

**Why:** The owner needed practical record organization, but tax treatment and
reconciled accounting exceed the app's safe scope.

## 2026-07-25 — Additive, idempotent PocketBase setup

**Decision:** Schema setup adds missing fields/collections, preserves existing
records, and can be run repeatedly.

**Why:** The owner operates setup manually and must be able to upgrade without
database expertise or destructive migrations.

## 2026-07-26 — Security-first private deployment

**Decision:** Keep PocketBase and the NAS private behind Tailscale Serve; do not
use Tailscale Funnel or public port forwarding. Restrict browser origins, enable
rate limiting, use superuser MFA, and maintain backups.

**Why:** Inventory, receipts, balances, credentials, and NAS access are
sensitive. Convenience does not justify public network exposure.

**Still relevant:** Mandatory.

## 2026-07-26 — Enforce owner-only PocketBase rules

**Decision:** Every user-owned collection requires authenticated owner-scoped
list/view/update/delete rules and owner-matching create rules.

**Why:** Client-side filtering cannot prevent another authenticated user from
requesting someone else's records.

**Safeguard:** The setup tool first verifies the owner field and stops if any
record is unowned, preventing accidental lockout or misassignment.

## 2026-07-26 — Protect private files with short-lived tokens

**Decision:** Inventory images, grading images, profile logos, and receipts stay
in protected PocketBase file fields and load with short-lived file tokens.

**Why:** Guessable file URLs or public fields would expose personal assets.

**Rejected:** making files public to fix loading bugs.

## 2026-07-26 — Parse.bot is the PSA certificate-data provider

**Decision:** Use Parse.bot for cert metadata, population, available slab scans,
and optional recent-sale estimates.

**Why:** The official PSA API did not provide the needed complete pricing/market
workflow, while Parse.bot could fill the scan-first intake fields.

**Qualification:** Its estimate is labeled sales-based; it is not a direct PSA
price-guide value.

## 2026-07-26 — Provider keys stay behind authenticated PocketBase hooks

**Decision:** Store `PARSE_BOT_API_KEY` only in the PocketBase/container
environment. The browser calls authenticated hooks.

**Why:** Static frontend code is public and cannot protect secrets.

**Consequence:** Future marketplace and AI provider credentials follow the same
server-side rule.

## 2026-07-26 — PSA image relay uses strict allowlisting

**Decision:** Relay only HTTPS images from approved PSA/Collectors/CDN host
families, with authentication, type checks, a 10 MB limit, and timeout.

**Why:** Browser CORS prevented direct imports, but an arbitrary server-side URL
fetcher could be abused to reach the NAS or private network.

## 2026-07-26 — QR-first inventory intake; retire barcode-first UX

**Decision:** Automatically start PSA autofill after a successful square QR scan
or typed cert. Keep manual cert-page entry and photo upload as fallbacks.

**Why:** QR scanning proved clean and reliable on phones; barcode scanning did
not. Most current PSA slabs include QR codes.

**Rejected:** continuing to emphasize an unreliable rectangular barcode camera
flow.

## 2026-07-26 — Separate display title from marketplace search keywords

**Decision:** Preserve the full PSA card name for inventory display and store a
separate editable `ebay_search` field generated from structured PSA metadata.

**Why:** PSA label wording is verbose and often produces poor eBay results, but
changing the displayed identity to satisfy search would damage inventory data.

## 2026-07-26 — Two-stage marketplace search

**Decision:** Retrieve broad structured sold-listing candidates, then normalize
and filter locally for grader, exact grade, meaningful identity overlap,
replica terms, duplicates, and price outliers.

**Why:** Marketplace search results are noisy; no provider query alone reliably
determines comparability.

**Consequence:** Store accepted/rejected counts and confidence so values remain
explainable.

## 2026-07-26 — Product Research for human verification

**Decision:** Keep a Research action that opens eBay Product Research with the
query prefilled and sales sorted most recent first.

**Why:** It exposes best-offer and sold details that automated results may miss,
while keeping the owner in control.

## 2026-07-26 — Usage tracking is owner-scoped and application-aware

**Decision:** Track successful Parse.bot calls in `app_preferences`, allow the
owner to set the known starting balance/reset date, synchronize it across
devices, and advance the monthly reset automatically.

**Why:** Parse.bot does not provide a documented account-balance endpoint, and
the owner needs visibility into a limited monthly allowance.

**Limitation:** Calls made outside Slab Ledger cannot be counted automatically.

## 2026-07-26 — Simplify the grading tracker and retain old collections

**Decision:** Use a simple grading item with card name, photo, quantity, raw
cost, grading cost, notes, and estimated all-in total. Retain older
submission/card/sale collections without presenting their complex UI.

**Why:** The owner wanted a reminder and cost tracker rather than a full grading
business sub-ledger. Data preservation was more important than schema cleanup.

## 2026-07-26 — Portfolio chart represents total collection value over time

**Decision:** Reconstruct historical collection value from acquisition timing
and saved per-card market histories.

**Why:** A cumulative cost chart would not answer whether the collection itself
rose or fell in market value.

## 2026-07-26 — Owner identity is private and synced

**Decision:** Store an optional display name and protected business
logo/profile image in owner-scoped preferences and show it above navigation.

**Why:** The app should make clear who is signed in and whose collection is
being viewed without becoming a public profile.

## 2026-07-26 — Automatic and off-site backups

**Decision:** Enable PocketBase automatic backups and encrypted Synology Hyper
Backup to Google Drive with version retention and integrity checks.

**Why:** RAID/NAS availability does not replace an off-site versioned backup.

## 2026-07-27 — Compact, aligned, theme-consistent UI

**Decision:** Use shared design tokens, strong consistent outlines, equal field
sizes, compact spacing, full-width mobile navigation, readable list/grid cards,
and green/red semantic money colors.

**Why:** The owner operates primarily on a phone and repeatedly favored clear,
uniform layouts over dense feature chrome.

## 2026-07-27 — Avoid refresh flicker and retain cached content

**Decision:** Keep the last successful data and photos visible while refreshing
instead of clearing sections to loading placeholders.

**Why:** Repeated visual blinking made the app feel unreliable and obscured
useful offline data.

## 2026-07-27 — Provider abstraction for future managed marketplace data

**Decision:** Future marketplace sources must implement a provider-neutral
contract and return normalized candidate records.

**Why:** The domain model, filtering engine, UI, and history must survive a
provider change.

**Status:** Approved target architecture; the current Parse.bot hooks and local
eBay collector predate the generalized interface.

## 2026-07-27 — Bright Data as the first managed marketplace provider

**Decision:** Evaluate and implement Bright Data as the first managed provider
behind the abstraction, gated by accuracy, pricing, terms, quota, and security
validation.

**Why:** A managed provider can reduce dependence on a fragile owner-operated
browser while preserving the local filtering and manual fallback architecture.

**Status:** Roadmap decision, not currently deployed. The local collector
remains until the adapter is proven.

## 2026-07-27 — Hidden Index concept

**Decision:** Plan a private, bounded, normalized marketplace observation cache
shared across identical slabs and provider runs.

**Why:** It can reduce duplicate provider cost, allow deterministic re-filtering,
support trends, and make provider/algorithm decisions auditable.

**Status:** Roadmap concept. The current ignored collector `data.json` is an
operational cache, not the completed Hidden Index.

## 2026-07-27 — AI must remain assistive and provider-abstracted

**Decision:** Any future AI feature uses a server-side provider abstraction,
minimum necessary data, structured validated output, explicit owner
confirmation before writes, provenance, budgets, and deterministic fallbacks.

**Why:** AI may improve keyword generation, classification, and explanation,
but it must not gain superuser access, expose private records, or autonomously
buy, list, price, message, or alter financial records.

## 2026-07-28 — Bright Data ships as a gated evaluation, not an authority

**Decision:** Implement the provider-neutral marketplace foundation and Bright
Data adapter behind authenticated PocketBase routes, a default-off feature
flag, a default-on kill switch, explicit account/schema confirmation, returned-
record budgets, private caching, and owner-reviewed side-by-side results.

**Why:** The managed transport can be evaluated without exposing the NAS,
committing credentials, creating a public webhook, or allowing a provider
failure to erase a trusted valuation.

**Consequence:** Live collection remains disabled until the owner's exact eBay
dataset, input and response schema, sold/completed coverage, billing unit,
limits, and request mode are verified. Async work uses outbound polling. The
local collector, Parse.bot, Product Research, manual comps, and cached values
remain available throughout evaluation.
