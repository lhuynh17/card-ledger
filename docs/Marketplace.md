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

### Local eBay collector — Current, optional legacy companion

The Python collector:

- reads active PocketBase inventory;
- builds normalized searches;
- retrieves one rendered sold-results page through standard Chromium;
- filters candidates locally;
- calculates a valuation;
- writes normalized values back to PocketBase;
- serves a separate dashboard only on `127.0.0.1`.

It is deliberately slow and does not use stealth or challenge bypasses.

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
- a Marketplace Usage dashboard.

Still required before live record collection:

- identify the exact eBay scraper available to the owner's account;
- confirm its input mode, response schema, active-listing and sold/completed
  support, billing unit, record/page limits, and sync/async behavior;
- run metadata inspection, then one deliberately bounded live validation;
- compare a representative card set against manual Product Research.

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
