# Marketplace Architecture

## Status legend

- **Current:** implemented in the repository.
- **Target:** approved direction but not fully implemented.
- **Optional:** can be disabled without breaking core inventory.

## Goals

Marketplace support should answer:

1. What comparable copies of this exact slab sold recently?
2. What defensible value can be derived from those comparables?
3. What did the system accept or reject, and why?
4. Can the owner correct or replace the result manually?

It must not make the app dependent on one provider, expose provider secrets, or
turn the NAS into a public scraping service.

## Current marketplace paths

### Parse.bot PSA data — Current, optional

Parse.bot is used through authenticated PocketBase hooks for:

- cert details;
- grade and population;
- structured PSA metadata;
- PSA-hosted front/back scans;
- up to three recent sales and a median-based sales estimate.

It is not treated as a direct PSA price-guide provider. The UI labels its value
as sales-based. Each successful app call updates owner-scoped usage tracking.

### eBay Product Research — Current, user-driven

The Research action opens eBay's seller Product Research interface with:

- a normalized query;
- completed/sold intent;
- `EBAY-US`;
- sort order set to most recently sold.

The user remains in control and can inspect best offers and listing details.

### Local visible-browser collector — Current, optional companion

The Python collector and paired Chrome extension:

- reads active PocketBase inventory;
- uses an exact PSA cert-number Alt lookup as the primary path when available;
- independently requires the displayed cert, grader, grade, year, printed
  number, and card identity to match before accepting Alt data;
- extracts one latest sold observation and up to three lowest active listings
  from that single exact-cert pass;
- queues the existing structured eBay sold and active searches when Alt has no
  exact match, the Alt daily cap is reached, or Alt is unavailable;
- filters candidates locally;
- calculates a valuation;
- defaults to evaluation-only so proof candidates remain local;
- serves a separate dashboard only on `127.0.0.1`.

Alt access is limited to the owner's written authorization for fewer than 60
slow cert lookups per day in a visible personal Chrome session. Slab Ledger
hard-stops Alt at 59 rolling-day lookups. No automated buying, bidding, account
action, or bulk database crawl is implemented.

The normal Chrome tab pauses when Alt or eBay requests a sign-in or CAPTCHA and
resumes only after the owner manually completes it. It does not solve, route
around, or intensify traffic after a challenge. A provider failure or unfinished
challenge preserves the last known good data.

The Alt exact-cert path returns active context in the same lookup. The eBay
fallback may make one separate active-results request. Active observations are
never used as proof of a completed transaction.

After the proof output has been reviewed, accepted candidates can be migrated
through the normalized owner-private observation boundary. Enabling that import
is a separate rollout step; proof mode never overwrites a trusted value.

## Provider abstraction — Current foundation

Marketplace retrieval will use a provider-neutral contract. The domain model,
filtering engine, UI, and PocketBase records must not depend on a provider's raw
field names.

The contract, normalized candidate validation, local rejection reasons,
valuation helper, caching policy, and fixture tests are implemented. Parse.bot
and the legacy collector have not been migrated to this contract and remain
unchanged.

Conceptual interface:

```text
MarketplaceProvider
  search(request, budget_context) -> ProviderSearchResult
  health() -> ProviderHealth
  usage() -> ProviderUsage | unknown
```

Normalized request:

```text
MarketplaceSearchRequest
  marketplace
  query
  grader
  grade
  card_identity
  sold_only
  completed_only
  sort
  page_limit
  correlation_id
```

Normalized candidate:

```text
MarketplaceCandidate
  provider
  provider_listing_id
  marketplace
  title
  sold_at
  price
  shipping
  total
  currency
  condition
  seller_summary
  image_url
  listing_url
  retrieved_at
  raw_reference
```

Normalized provider result:

```text
ProviderSearchResult
  candidates
  retrieved_at
  request_count
  provider_usage
  warnings
  next_cursor
```

Provider adapters may preserve a short-lived encrypted/raw reference for
diagnosis, but raw payloads must not become the application model.

## Bright Data as the initial managed provider — Current gated evaluation

Bright Data is the chosen first managed marketplace provider behind the
abstraction, subject to final account, pricing, terms, and endpoint validation.
This decision does **not** replace the local collector until the adapter passes
accuracy, quota, cost, and security checks.

Why start there:

- it can move marketplace transport away from a fragile owner-operated browser;
- it offers a managed boundary where usage and failures can be measured;
- it fits a provider adapter without requiring UI-specific changes;
- it can coexist with manual research and the local collector during rollout.

Constraints:

- credentials remain server-side;
- calls originate from a private backend/hook or dedicated private service;
- budgets and monthly caps are mandatory;
- no frontend Bright Data SDK or token;
- no provider-specific fields in inventory or market-value UI;
- an outage must fall back to manual research/current cached values;
- collected data and use must comply with applicable marketplace/provider terms.

If Bright Data is rejected after validation, another provider can implement the
same contract without rewriting the app.

Implemented safeguards:

- authenticated PocketBase usage and search routes;
- outbound-only HTTPS calls to `api.brightdata.com`;
- sync requests or bounded async polling without a webhook;
- default-off feature flag, default-on kill switch, and explicit schema gate;
- 5,000 returned-record monthly allowance by default;
- configurable warning thresholds, daily ceiling, hard stop, result/page
  limits, timeouts, retries, cooldown, cache lifetime, and retention;
- owner-only usage, activity, cache, and normalized observation records;
- duplicate-operation blocking and shared recent-query cache;
- side-by-side UI evaluation that never writes a value automatically;
- a dormant Marketplace Usage dashboard module retained for future managed-
  provider validation. Its old top-level button is hidden while the deployed
  Windows collector is the active path.
- separate owner-controlled schedules for one-to-two sold observations and
  three-to-five active observations, with per-card due state and overrides.

Still required before live record collection:

- identify the exact eBay scraper available to the owner's account;
- confirm its input mode, response schema, active-listing and sold/completed
  support, billing unit, record/page limits, and sync/async behavior;
- run metadata inspection, then one deliberately bounded live validation;
- compare a representative card set against manual Product Research.

## Nightly local collection — Current deployed path

The trusted local collector starts one inventory refresh cycle at 2:00 AM by
default. It spaces work across a bounded ten-hour window so the dedicated
computer does not burst requests. For every PSA card identity it attempts:

- one exact-cert Alt lookup for the latest sale and active listings;
- the original newest-first eBay sold and lowest-price active lookups only as
  fallbacks;
- strict local identity validation before either result is stored.

The newest exact sold result becomes the current market value. A new listing ID
is added to a rolling maximum of three confirmed sales and three value-history
entries. The three lowest exact active listings are stored separately and never
affect valuation. Empty results, failures, and rejected listings preserve the
existing trusted value.

The eBay query stays broad enough for normal seller-title variations, quotes
only a distinctive two- or three-word subject when useful, and applies eBay's
native numeric Grade facet in addition to local exact-grade validation. If a
plausible result omits the grader, grade, or another required PSA identity
field, up to three newest candidates are held for review. The owner can open
each listing and explicitly use or reject it. An explicit conflict in year,
language, printed number, edition, grader, grade, or subject is rejected and
cannot be confirmed through the normal review queue. The card detail screen is
limited to two evidence sections—recent sold listings and the three lowest
matching active listings—plus direct eBay and Product Research links.

## Managed-provider evaluation schedule — Gated, dormant foundation

The owner can separately configure one or two Apify sold observations and
three, four, or five Bright Data active observations in hours, days, weeks, or
months. Twelve hours is twice daily and one day is once daily.

The scheduler:

- remains off by default and cannot bypass the provider feature flag or kill
  switch;
- wakes every 15 minutes but processes only due provider/card roles;
- keeps independent next-run state for each card;
- limits cards processed per scheduler tick;
- reuses identical-query cache entries without consuming provider records;
- stops at daily/monthly hard limits and honors provider cooldowns;
- records safe usage/activity and normalized private observations;
- never writes or clears `market_values` automatically.

The dashboard estimates monthly operations and returned records for the current
active-card count before the schedule is enabled. Actual billing still depends
on the account-confirmed Bright Data billing unit and response behavior.

The revised gated policy assigns Apify to verified sold evidence and Bright
Data to active asking-price context. Sold checks allow one or two results;
active checks allow three to five. Each role has an independent interval and
allowance forecast. A card can inherit defaults or override its sold schedule.
Active asking prices remain separate and cannot become completed-sale evidence.

## Two-stage marketplace search — Current principle, target expansion

### Stage 1: candidate retrieval

Build a broad but structured query from:

- year;
- language;
- set/product;
- card number;
- subject/character;
- variation/promo/edition;
- grader and exact grade;
- negative terms such as raw and ungraded.

The full PSA label title remains unchanged for display. The editable
`ebay_search` field stores concise marketplace keywords.

Stage 1 favors recall: retrieve enough plausible candidates without assuming
every result is comparable.

### Stage 2: local normalization and filtering

The local engine—not the provider—decides comparability:

- normalize case, punctuation, whitespace, currency, price, shipping, and dates;
- require the expected grading company;
- require the exact grade when present;
- require meaningful card-identity overlap;
- reject replicas, reprints, proxies, customs, facsimiles, counterfeits,
  unofficial items, and metal cards;
- deduplicate listing IDs/URLs;
- reject missing or non-positive totals;
- remove statistical price outliers;
- retain rejection reasons.

This separation prevents provider search quirks from silently defining market
value.

## Valuation

Current automated valuation uses the most recent accepted comparables and stores
supporting range and confidence. Parse.bot's sales estimate uses the median of
up to three returned sales.

The local collector uses the single newest exact sold listing. Over subsequent
nightly cycles it builds a rolling three-sale history; it does not need to find
three sales during every search. First Edition, Unlimited, year, language, set,
printed number, variation, grader, and grade are not interchangeable. Unknown
Best Offer prices remain visible but do not affect valuation until manually
verified through Product Research.

After evaluation mode is deliberately disabled, an exact local match may update
the current value with rollback history. Missing identity data remains a
provisional suggestion, and explicit identity conflicts are discarded.

The normalized valuation record includes:

- source/provider;
- query and research URL;
- checked time;
- accepted/rejected counts;
- current value;
- low/high;
- confidence;
- recent comparable records;
- append-style value history;
- safe error state.

Future scoring may incorporate:

- identity confidence;
- date recency weighting;
- auction versus fixed-price context;
- accepted best-offer uncertainty;
- shipping normalization;
- language/edition exactness;
- provider agreement.

Any algorithm change must be versioned in stored metadata so historical values
remain explainable.

## Hidden Index — Partial foundation

The **Hidden Index** is the planned private normalized cache of marketplace
observations. It is "hidden" because it is internal to the owner's deployment,
not exposed as a public browse/search endpoint.

It should contain only data needed for Slab Ledger valuation:

- provider and marketplace listing identity;
- normalized card identity;
- title and sold timestamp;
- normalized monetary values;
- grader/grade signals;
- retrieval time;
- match/rejection features;
- source URL/reference;
- retention/expiry metadata.

Purposes:

- avoid paying for or requesting the same listing repeatedly;
- share observations among identical slabs;
- allow deterministic local re-filtering when search logic improves;
- support trend calculations without re-querying every provider;
- compare provider quality;
- retain an explainable audit trail for accepted comps.

Safeguards:

- owner-private;
- no public endpoint;
- bounded retention;
- deduplication;
- encryption and access controls appropriate to deployment;
- no provider credentials, cookies, or unrelated personal data;
- respect provider terms and deletion/retention requirements;
- store raw payloads only when necessary, encrypted, access-controlled, and
  short-lived.

The current collector's ignored `data.json` cache is not yet the Hidden Index;
it is a local operational cache.

`marketplace_observations` is now an owner-private, normalized, deduplicated,
retention-bounded foundation for the Hidden Index. It is not yet the completed
cross-provider trend and re-filtering system.

## Usage tracking and budgets

### Current Parse.bot tracking

- Hook-side counters track successful Slab Ledger calls by month.
- The user can set the current remaining balance and provider reset date.
- That baseline syncs in owner-scoped `app_preferences`.
- The app advances the reset monthly.
- Calls made outside Slab Ledger cannot be inferred because Parse.bot has no
  documented balance endpoint.

### Target provider usage

Each adapter should report, when available:

- calls/credits consumed;
- calls remaining;
- billing period/reset time;
- estimated monetary cost;
- throttled/rejected calls;
- cache-hit ratio.

The orchestration layer must enforce an application-side budget even if the
provider offers its own limit. At zero budget, return cached/manual results and
an actionable status; do not continue billing.

## Search and provider observability

Log safe structured events:

- correlation ID;
- provider;
- normalized query hash or safely truncated query;
- cache hit/miss;
- request latency and status category;
- candidate, accepted, rejected, and outlier counts;
- rejection categories;
- algorithm version;
- credit/cost delta;
- cooldown/retry state.

Never log credentials, cookies, bearer tokens, complete raw authenticated
responses, or personal account details.

## Error behavior

- Provider unavailable: show cached/manual values and mark refresh unavailable.
- Quota exhausted: stop provider calls and show reset/budget status.
- No candidates: preserve the last known value; do not replace it with zero.
- Low-quality candidates: save diagnostics/confidence, not a misleading value.
- Authentication error: disable that provider and require operator repair.
- Rate/block response: exponential cooldown and no bypass attempts.
- Schema change: adapter fails closed with a safe normalized error.

## Provider rollout requirements

Before enabling a new provider:

1. document credentials and environment variables;
2. implement the normalized contract;
3. add fixture-based adapter tests;
4. add unauthorized and malformed-payload tests;
5. compare a representative card set against manual eBay research;
6. measure false positives, false negatives, latency, quota use, and cost;
7. confirm logging redaction;
8. confirm private network and auth boundaries;
9. deploy behind a feature flag;
10. preserve manual and cached fallback.
