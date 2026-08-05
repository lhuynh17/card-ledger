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

## 2026-07-28 — Scheduled marketplace checks remain bounded evaluations

**Decision:** Let the owner schedule three to five recent sold-listing checks
per active graded card using hour, day, week, or month intervals. Keep the
schedule off by default, track each card independently, and process only a
bounded number of due cards every 15 minutes.

**Why:** Cards need different refresh timing without creating a request burst
or forcing manual refreshes, while the owner needs a visible estimate of
monthly record use.

**Consequence:** Scheduled runs use the same authenticated outbound boundary,
cache, returned-record budgets, cooldowns, normalization, and rejection logic
as manual evaluations. They store private observations but never overwrite a
trusted market value automatically.

## 2026-07-28 — Separate sold evidence from active asking prices

**Decision:** Use a provider-role boundary: Apify may supply one or two
completed-sale observations, while Bright Data may supply three to five active
listing observations. Show separate schedules and estimates, including
per-card sold overrides.

**Why:** Active asking prices are useful competitive context but are not proof
of a transaction. Separate roles prevent active listings from being treated as
sold comparables while allowing low-cost refresh schedules.

**Consequence:** Both adapters remain default-off and schema-gated. The
dashboard forecasts Apify returned-record cost and each provider allowance
before saving. Neither role automatically overwrites a trusted value.

## 2026-07-28 — Validate local paced sold collection before import

**Decision:** Use the existing optional Windows collector for a three-card,
evaluation-only proof spread throughout the day on the dedicated computer.
Retain the latest three
recent candidates per card, keep the persistent browser visible, and pause for
the owner to manually complete a normal eBay sign-in or CAPTCHA.

**Why:** The owner needs unattended batch collection, but the tested hosted
sold-listing actor was blocked by eBay. A local browser session can eliminate
repetitive searches without introducing a public endpoint, CAPTCHA solver,
stealth tooling, proxy rotation, or a new paid provider.

**Consequence:** Proof results remain in the ignored local review file and
cannot replace trusted PocketBase values. Full-inventory scheduling and
normalized observation import remain gated on reviewed proof results.

The owner may separately select scarce cards for one active-results request.
Only the three lowest locally matched asking prices are retained, clearly
labeled as active, and excluded from sold-evidence valuation.

## 2026-07-29 — Use installed Chrome for manual verification compatibility

**Decision:** Run the local collector through the dedicated profile of the
normally installed Google Chrome rather than bundled Playwright Chromium.

**Why:** The live proof reached eBay, but bundled Chromium received HTTP 403
and could not render eBay's hCaptcha verification page. Installed Chrome lets
the owner complete a normal supported-browser challenge without adding a
solver, stealth tooling, fingerprint changes, or proxy rotation.

**Consequence:** Chrome must be installed on the Windows collector computer.
The collector still uses an isolated ignored profile and preserves all pacing,
cooldown, evaluation-only, and localhost restrictions.

## 2026-07-29 — Replace controlled-browser proof with normal-Chrome extension

**Decision:** Make an unpacked extension in the owner's ordinary signed-in
Chrome profile the default local collection transport. Pair it to the
localhost-only companion with a random local key.

**Why:** Both bundled Chromium and Playwright-controlled installed Chrome were
rejected by the Google/eBay sign-in flow and could not render eBay's hCaptcha.
The normal browser profile already supports the owner's sign-in and manual
verification without weakening the collector boundary.

**Consequence:** The extension receives only a bounded research job and returns
structured listing text to the local validator. It never receives PocketBase
credentials, never writes trusted values, and activates a tab for owner action
instead of automating CAPTCHA. The Playwright transport remains disabled by
default as a troubleshooting fallback.

## 2026-07-30 — Guarded automatic values with reversible evidence

**Decision:** After the evaluation gate is deliberately disabled, allow
identity-matched medium- and high-confidence sold evidence to update the
current market value automatically. Low-confidence results remain provisional,
empty or failed searches preserve the trusted value, and every promoted value
keeps bounded evidence history that the owner can restore.

Treat identity confidence and market volatility as separate signals. Enforce
edition and variant markers such as First Edition versus Unlimited. Retain
Best Offer results with an unknown price and require the owner to verify the
accepted price in eBay Product Research before using it as a comparable.

**Why:** A private daily collector is only useful if reliable results can flow
into inventory without approving every card, but scarce cards and hidden Best
Offer prices require visible uncertainty rather than false precision.

**Consequence:** The collector remains evaluation-only during rollout.
Production promotion requires the additive PocketBase migration and a final
reviewed test. The owner receives an in-app status notice for verification,
offline, cooldown, and error states. Manual values, cached evidence, Product
Research, and history rollback remain available.

## 2026-07-31 — Require identity and price-change safeguards

**Decision:** A listing must contain an inventory card's explicit printed card
number when one is known. Even medium- or high-confidence evidence remains
provisional when its suggested value is less than half or more than one and a
half times the current trusted value.

Present card-level marketplace information as a short evidence summary, with
automatic schedules, manual correction, and value history behind clearly
labeled expandable sections.

**Why:** A broadly similar graded card can share many title words while having
a radically different value. Confidence based only on title overlap is not a
sufficient reason to replace a trusted valuation, and recovery controls must be
visible and understandable when a suspect value has already been saved.

**Consequence:** Suspect results cannot automatically replace the current
value. Existing large changes are labeled for review and, when history is
available, expose a one-click restoration action. No provider, credential,
network boundary, or fallback behavior changes.

## 2026-07-31 — Prefer no valuation over an ambiguous identity

**Decision:** Automatic sold-listing valuation uses the slab's current full
identity rather than an older shortened search. When present, year, language,
printed numerator and denominator, grader, grade, and edition are mandatory
listing-title matches.

Revalidate cached automatic evidence in the app before displaying it. If any
cached comparable fails those identity checks, hide the mismatched evidence
and exclude that automatic value from inventory and portfolio totals.

**Why:** Broad eBay searches can return visually or textually similar cards
whose prices are unrelated. A missing automatic value is safer and more honest
than a precise-looking value based on a different card.

**Consequence:** Scarce cards may show no automatic estimate until exact sold
evidence appears. Manual values, Product Research, stored history, active
listings, and provider fallbacks remain available and unchanged.

## 2026-08-01 — One nightly latest-sale valuation with strict PSA identity

**Decision:** Replace granular per-card marketplace schedules with one paced
nightly local refresh cycle beginning at 2:00 AM by default. For each unique
card identity, request the newest sold results and lowest active listings. Use
only the newest exact sold match as the current market value, accumulate a
rolling maximum of three confirmed sales over future cycles, and retain the
three lowest exact active asking prices separately.

Build the query and validator from structured PSA year, subject, brand/set,
printed card number, edition, grading company, and grade when available. Reject
explicit identity conflicts. A plausible listing that merely omits a required
identity detail remains provisional until the owner opens and confirms it.

**Why:** Three noisy results do not make a reliable valuation. One exact result
is safer, easier to explain, and naturally creates useful history over time.
The value of the automation depends more on card identity than on collection
frequency or the number of candidates returned.

**Consequence:** Failed, empty, ambiguous, and conflicting results cannot erase
or reduce an existing trusted value. The card-detail UI centers current value,
confirmed sales, active asks, and a single confirmation path. The local-only
collector, owner-only PocketBase records, outbound-only network boundary,
manual values, Product Research, and provider fallbacks remain unchanged.

## 2026-08-03 — Card-level collector alerts and focused search controls

**Decision:** Replace the large global collector-attention banner with a small
red notification on the affected inventory tile. The notification explains
whether a sale needs review or the Windows collector needs operator attention.
Hide the obsolete top-level managed-provider dashboard button while keeping its
default-off implementation available for future validation.

Use eBay's native numeric grade facet for sold and active searches, keep grader
and grade terms in the query, and quote only a short distinctive card subject.
Continue to make final acceptance through strict local year, language, printed
number, edition, grader, grade, and subject checks.

**Why:** Collector problems should be visible without displacing the primary
inventory workflow. Full-label exact phrases suppress legitimate listings,
while wholly loose searches create noisy candidates. A selective retrieval
query plus strict local identity validation provides a safer balance.

**Consequence:** No provider, credential, network boundary, stored value, or
manual fallback changes. Managed-provider controls remain dormant rather than
deleted, and ambiguous sales still require explicit owner confirmation.

## 2026-08-04 — Empty cloud responses cannot erase local inventory

**Decision:** When the browser already contains synced cards, treat an empty
PocketBase card response as ambiguous. Preserve the local inventory and report
**Inventory protected** instead of deleting the local copies.

**Why:** An authenticated request may return zero visible records because of a
signed-in-account or ownership-rule mismatch. A successful connection alone
does not prove that the owner intentionally deleted every card.

**Consequence:** Recovery of an already-empty browser still requires checking
the private `cards` collection or a known-good PocketBase backup. The guard does
not invent records or overwrite cloud data.

## 2026-08-04 — Prefer authorized Alt exact-cert evidence with eBay fallback

**Decision:** Under the owner's retained written Alt authorization, the local
visible-Chrome collector first enters the exact PSA certification number into
Alt's `name or cert #` search. Accept data only when the returned cert, PSA
grader, exact grade, year, printed card number, and card identity all match.
Collect at most the latest sold price and three lowest active listings in one
pass. Cap Alt at 59 lookups per rolling 24 hours.

If Alt is empty, ambiguous, unavailable, or over its cap, queue the existing
eBay workflow. Never clear or replace a trusted value on an Alt failure.

**Why:** Certification number is a stronger retrieval key than varying seller
titles and removes much of the query guesswork that caused wrong-card results.

**Consequence:** The extension gains outbound access to Alt only; PocketBase,
the NAS, and the localhost bridge remain private. No Alt credential is stored,
and no buying, bidding, listing, messaging, CAPTCHA solving, stealth, or proxy
behavior is introduced. Manual entry, Product Research, and eBay remain
available.
