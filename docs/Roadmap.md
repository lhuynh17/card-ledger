# Slab Ledger Roadmap

This roadmap distinguishes the committed direction from ideas. Items are not
implemented until the repository and deployment say they are.

## Product principles

- Keep the NAS and PocketBase private.
- Enter information once and carry it through purchase, grading, inventory,
  valuation, sale, and ledger workflows.
- Keep manual paths available when providers fail.
- Prefer a focused personal workflow over public/social features.
- Explain valuations instead of presenting false precision.
- Preserve existing data through additive migrations.
- Optimize for a non-technical owner on a phone.

## Now: reliability and consolidation

### Documentation and operational consistency

- Keep these source-of-truth documents current.
- Remove or update stale code comments that describe the pre-PocketBase app.
- Keep README setup instructions aligned with actual hooks and schema.
- Add a small release/version indicator for support and cache diagnosis.

### Sync and media reliability

- Continue testing protected image loading after app restart.
- Ensure grading, profile, receipt, and inventory photos use one well-tested
  protected-file loading strategy.
- Add visible pending/offline sync state without UI flicker.
- Add duplicate cert warnings before saving.

### Data health

- Add an owner-only data-health screen for missing cost, date, value, photo, or
  search metadata.
- Show last successful sync and backup reminders without exposing admin URLs.
- Add tests for IndexedDB/PocketBase conflict and migration cases.

### UI consistency

- Preserve equal field sizing, compact form spacing, strong section outlines,
  and mobile alignment.
- Continue visual checks of list/grid cards in both themes.
- Keep action menus full-size and touch-friendly.

## Next: lifecycle workflow

### Purchase lots and cost allocation

Add a purchase-lot model:

- source/seller and purchase date;
- subtotal, tax, shipping, fees, and total;
- receipt;
- payment method;
- multiple included cards;
- equal or value-weighted cost allocation.

Allocated cost should carry into grading and inventory automatically.

### Grading-to-inventory conversion

Extend the simple grading tracker without restoring the retired complex UI:

- optional status progression;
- submission/order number;
- submitted and expected return dates;
- service level;
- outbound/return tracking;
- actual grade;
- one-tap conversion of returned cards into inventory;
- cost basis carried forward.

The older grading collections remain untouched unless a deliberate migration is
designed.

### Sale and payout reconciliation

Add optional:

- platform;
- order number;
- sale type;
- buyer-paid shipping;
- actual postage/insurance;
- payout amount/date;
- sold-awaiting-payout status.

Do not connect bank credentials merely to automate this.

### Action center

Create one compact Needs Attention view:

- stale market values;
- missing cost/date/photo/search metadata;
- grading items past an expected date;
- sold cards awaiting payout;
- open debt reminders;
- provider credits running low;
- offline/pending sync.

Avoid duplicating permanent dashboard sections.

## Marketplace platform

Current local-collector direction:

- run one paced nightly refresh cycle beginning at 2:00 AM;
- use the newest exact sold listing as the current value;
- accumulate at most three confirmed sales over subsequent cycles;
- show three exact lowest active listings without treating them as sales;
- reject explicit PSA-identity conflicts and request owner confirmation only
  when a plausible listing omits identity information;
- keep the card-detail UI focused on value, evidence, correction, and history.

### Provider abstraction

The provider-neutral contract, normalization/filtering foundation, cache,
usage controls, and fixture tests are implemented. Remaining work is live
schema validation and broader provider migration.

### Bright Data adapter

The default-off Bright Data adapter, private PocketBase boundary, outbound
polling, usage dashboard, and side-by-side evaluation mode are implemented.
An owner-controlled scheduler with separate Apify sold evidence, Bright Data
active asking prices, and free-tier-aware global/per-card estimates is also
implemented but remains provider-gated.
Before rollout:

- validate current product, account, pricing, terms, and sold-listing coverage;
- compare results against manual Product Research;
- retain the local collector until accuracy is proven.

### Local sold-listing proof

Normal-Chrome transport has been validated. Guarded rollout work now includes
edition-aware matching, Best Offer verification, volatility labels, reversible
automatic values, and private collector alerts. Production remains gated on
the additive migration and a post-migration evaluation cycle.

Validate the optional Windows collector with a default evaluation-only,
three-card all-day run:

- confirm eBay exposes a trustworthy sold price and sold date;
- retain the latest three verified local sold candidates per card;
- verify the optional per-card three-lowest active asking-price view remains
  separate from sold evidence;
- verify manual sign-in/CAPTCHA pause and automatic continuation;
- review matching and rejection behavior before importing observations;
- keep trusted values unchanged throughout the proof.

### Hidden Index

An owner-private normalized observation store with deduplication and bounded
retention is implemented as the foundation. Remaining work:

- deduplicate listings and identical slab searches;
- re-run local filtering without new provider calls;
- support trends and provider comparison;
- bound retention and protect access;
- never expose it publicly.

### Search-quality tooling

- Persist explicit rejection reasons.
- Version matching/valuation algorithms.
- Build a private gold-standard fixture set from manually reviewed cards.
- Report precision/recall-style quality measures and provider cost per useful
  comparable.

## Portfolio intelligence

- Separate collection-value change caused by purchases/sales from true market
  movement.
- Add 7-, 30-, and 90-day changes.
- Show largest gainers/losers and stale valuations.
- Retain explainable source/history for every plotted value.
- Add storage/location metadata when inventory size makes it useful.

## Decision support

Add a private buy/grade calculator:

- raw purchase cost;
- grading, shipping, and insurance;
- expected grade probabilities;
- expected selling price by grade;
- fees;
- break-even price;
- expected profit and ROI.

It should be a planning tool, not a promise or automated purchasing system.

## Show mode

Consider a phone-friendly selling view:

- large photo/name/grade/asking price;
- quick discount and minimum-price calculator;
- cash/electronic price;
- fast mark-sold flow;
- cost/profit hidden by default.

This remains private to the signed-in owner.

## Future AI architecture

AI is a later, assistive layer—not an authority and not a reason to expose
private records externally.

### Appropriate uses

- suggest normalized marketplace keywords from PSA/card fields;
- explain why candidates were rejected;
- flag likely duplicates or inconsistent records;
- summarize portfolio changes;
- suggest ledger categories for owner confirmation;
- extract draft fields from receipts locally or through an explicitly approved
  private service;
- identify missing data and next actions.

### Required architecture

- an `AIProvider` abstraction separate from marketplace providers;
- server-side credentials only;
- minimum necessary input;
- explicit owner action for sending private data;
- no receipts, credentials, financial notes, or full collection export by
  default;
- structured outputs validated against schemas;
- human confirmation before writes;
- stored provenance: model/provider, prompt/version, timestamp, input scope, and
  accepted/rejected result;
- cost/usage budgets and a kill switch;
- a deterministic non-AI fallback for core workflows.

### Prohibited default behavior

- autonomous buying, listing, pricing, or messaging;
- changing financial/tax records without confirmation;
- training a public model on private collection data;
- granting an AI direct PocketBase superuser access;
- exposing NAS resources to make an AI integration easier.

## Security and operations

- Make the frontend PocketBase URL configurable without complicating normal
  setup.
- Add automated checks for committed secrets and forbidden network binds.
- Add hook tests for authentication, input validation, image allowlisting, size,
  and provider failures.
- Add a documented restore drill and backup-health checklist.
- Add structured server/provider logs with redaction.
- Review dependency pinning and Content Security Policy.
- Consider encrypted-at-rest provider caches for the Hidden Index.

## Explicitly out of scope unless reconsidered

- public collection pages;
- social/community features;
- direct buyer messaging;
- automated marketplace listings;
- bank-account connections;
- public PocketBase/NAS exposure;
- Tailscale Funnel;
- stealth scraping or anti-bot bypass;
- barcode-first camera UX;
- removal of manual entry or manual comps.
