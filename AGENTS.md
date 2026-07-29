# Slab Ledger Repository Instructions

This file is the durable operating guide for contributors and future Codex
conversations. The repository is the source of truth; do not rely on prior chat
history when the code or documentation answers a question.

## Read first

Before making changes, inspect:

1. `README.md`
2. `SECURITY.md`
3. `docs/Architecture.md`
4. `docs/Marketplace.md`
5. `docs/Roadmap.md`
6. `docs/Decision Log.md`
7. `ebay-dashboard/POCKETBASE_SETUP.md` for schema or deployment work
8. recent Git history and the current working tree

If documentation and implementation disagree, verify the implementation, fix
the stale documentation in the same change, and call out the discrepancy.

## Product boundaries

Slab Ledger is a private, mobile-first graded-card inventory and small-business
recordkeeping app. It is not:

- a public social collection;
- an accounting or tax-determination service;
- a bank connection;
- an automated marketplace listing or messaging system;
- permission to expose the NAS, PocketBase admin UI, or private APIs publicly.

Preserve the user's ability to operate the core inventory manually when an
optional provider, collector, or network connection is unavailable.

## Architecture rules

- The root `index.html` is the main application shell and inventory client.
- Feature modules live in `ebay-dashboard/*.js`.
- PocketBase is the authoritative synced store for signed-in users.
- IndexedDB is the offline inventory cache and optimistic working store.
- Local storage is limited to small preferences, cached authentication state,
  migration compatibility, and offline fallbacks. Do not put provider secrets
  there.
- PocketBase hooks in `ebay-dashboard/pb_hooks/` are the server boundary for
  third-party APIs and protected relays.
- The optional eBay collector is a separate Python companion. It must remain
  optional and localhost-only.
- The collector uses installed Google Chrome with an ignored dedicated profile
  so the owner can complete normal browser verification. Do not attach it to
  the owner's everyday Chrome profile.
- Do not silently remove legacy PocketBase collections or user records.
  Migrations must be additive and non-destructive unless the user explicitly
  authorizes a separately backed-up destructive migration.
- Keep provider-specific payloads behind adapters. UI and domain records should
  consume normalized data, not raw provider response shapes.

See `docs/Architecture.md` and `docs/Marketplace.md` for full details.

## Security invariants

These rules are mandatory:

- Keep PocketBase and its admin UI private behind Tailscale. Do not enable
  Tailscale Funnel or add public router port forwarding.
- Bind local companion dashboards to `127.0.0.1`, never `0.0.0.0`.
- Never commit passwords, tokens, API keys, live collector data, browser
  profiles, diagnostic HTML/screenshots, or local setup files.
- Third-party API keys belong only in the PocketBase/container environment.
- Browser requests to private data require an authenticated PocketBase user.
- Every user-owned collection must enforce owner-only list, view, create,
  update, and delete rules.
- Protected files must be fetched with short-lived PocketBase file tokens.
- Any server-side URL relay must use HTTPS, an explicit hostname allowlist,
  content-type checks, response-size limits, and timeouts. It must not be usable
  for SSRF into the NAS or private network.
- Preserve rate limiting, request pacing, cooldowns, single-instance locks, and
  bounded caches.
- Do not add CAPTCHA solvers, stealth plugins, fingerprint spoofing, proxy
  rotation, or challenge bypasses.
- Never log credentials, bearer tokens, provider keys, complete authentication
  responses, or sensitive personal financial notes.
- Review `SECURITY.md` before changing authentication, networking, file access,
  hooks, collectors, or environment handling.

## Authentication and environment conventions

- End users authenticate against the PocketBase `users` collection.
- Administrative setup authenticates against `_superusers` and supports MFA.
- The setup utility may store only the non-secret PocketBase URL and superuser
  email in ignored `pocketbase-setup.env`; it must never store the superuser
  password or MFA code.
- The optional collector reads `collector.env`, which is ignored. Maintain
  `collector.env.example` with placeholders only.
- Current server variables include:
  - `PARSE_BOT_API_KEY`
  - `PARSE_BOT_MONTHLY_CREDITS` (optional; defaults to 200)
  - `BRIGHT_DATA_API_TOKEN` (server-only; never persist in PocketBase)
  - `BRIGHT_DATA_DATASET_ID` (set only after account metadata validation)
  - `BRIGHT_DATA_ENABLED` and `BRIGHT_DATA_KILL_SWITCH`
  - the remaining `BRIGHT_DATA_*` budget, polling, cache, and retention
    controls documented in `ebay-dashboard/POCKETBASE_SETUP.md`
- Never place those variables or their values in frontend code.
- Prefer environment variables or ignored local configuration over new
  hard-coded deployment values. If the current PocketBase URL is ever made
  configurable, preserve a simple non-technical setup path.

## Coding standards

### General

- Make the smallest change that fully solves the request.
- Preserve existing user data and unrelated worktree changes.
- Prefer plain language in UI copy and documentation.
- Treat network and provider failures as expected degraded states.
- Keep the app usable when offline wherever the existing architecture permits.
- Update cache-busting script query versions when a changed external module is
  referenced by `index.html`.

### Frontend

- Use semantic HTML, accessible labels, keyboard-capable controls, and
  touch-friendly target sizes.
- Reuse CSS design tokens; do not scatter one-off theme colors.
- Test both light and dark themes and mobile widths.
- Avoid unsafe `innerHTML` for provider- or user-controlled data. Prefer DOM
  creation and `textContent`.
- Use `rel="noopener noreferrer"` for external links opened in a new tab.
- Show specific, actionable errors without exposing internals or secrets.
- Do not make the page depend on the optional market collector.

### JavaScript

- Follow the existing dependency-light browser JavaScript style.
- Normalize numeric and date values at boundaries.
- Keep state transitions explicit and guard asynchronous refreshes against
  duplication or stale writes.
- Revoke object URLs and stop camera/media resources when no longer needed.
- Preserve local fallback copies for synced features where already supported.

### Python

- Use type hints where practical, `pathlib`, explicit timeouts, and atomic file
  replacement for mutable local JSON.
- Use the standard `logging` module for persistent diagnostics.
- Bound retained errors and diagnostics.
- Keep network collectors paced and transparent about their identity.

### PocketBase

- Schema setup must be idempotent.
- Add missing fields without deleting records.
- Audit owner fields and unowned records before repairing API rules.
- Stop safely when ownership cannot be proven.
- Add or preserve indexes for owner/date and owner/record lookup patterns.
- Keep hook routes authenticated and validate all path/query inputs.

## UI and design conventions

- Mobile-first, compact, calm, and businesslike.
- Dark theme is the default; light theme must remain fully legible.
- Use the shared outline token for section and primary navigation borders.
- Keep related fields aligned, equal-sized, and on one line when space allows;
  stack cleanly on small screens.
- Reduce empty space inside forms without making reminder/result cards visually
  smaller than neighboring sections.
- Use green for non-negative money, red for negative money and amounts owed.
- Inventory list and grid views must both remain readable.
- Grid cards should be close to square; detailed actions belong in the expanded
  card menu rather than being squeezed into the tile.
- QR scanning is the primary camera flow. Manual cert entry remains available
  as a fallback. Do not reintroduce barcode-first UI without a proven reliable
  implementation.
- Hide advanced/manual entry fields until autofill fails or the user asks for
  them.
- Keep the owner identity and provider-credit status visible but subordinate to
  the app name and primary navigation.
- Avoid flicker: do not clear useful cached content while a refresh is pending.

## Marketplace and search conventions

- Preserve structured, editable `ebay_search` keywords separately from the full
  card name.
- Human-facing eBay Product Research links should open with sold results sorted
  most recent first.
- Automated valuation must be two-stage:
  1. retrieve a broad but structured candidate set;
  2. normalize and filter locally for grader, grade, card identity, replicas,
     and price outliers.
- Never treat provider results as automatically authoritative. Store source,
  query, timestamps, accepted/rejected counts, confidence, and comparables.
- Manual market values and comps must remain available.
- Future managed marketplace providers must implement the provider contract in
  `docs/Marketplace.md`. Bright Data is the intended first managed provider,
  but the UI and domain model must not depend on Bright Data-specific fields.
- Bright Data remains disabled until its account-available eBay dataset,
  request inputs, response fields, sold/completed semantics, billing unit, and
  limits are confirmed. Never guess or copy a dataset ID from public examples.
- Managed-provider results run in side-by-side evaluation mode. They may fill a
  review form but must not overwrite a saved value without explicit owner
  action.
- Automatic managed-provider checks are owner-configured and default off. The
  15-minute scheduler only finds due private work; each card keeps its own next
  run time. Budget limits, cache reuse, provider cooldowns, the feature flag,
  and the kill switch always take precedence over the schedule.
- Provider roles are now distinct: Apify is limited to one or two verified
  sold observations, while Bright Data is limited to three to five active
  asking-price observations. Show both forecasts and include per-card schedule
  overrides; never represent an active asking price as a completed sale.
- The planned Hidden Index is private normalized marketplace data, not a public
  search engine and not permission to collect unrelated data.
- The Windows local sold-listing proof is evaluation-only by default: three
  unique searches in an owner-configured window that defaults to all day on a
  dedicated computer, one or two strictly
  dated sold candidates for hosted providers or three for the local collector,
  visible manual sign-in/CAPTCHA handling, and no
  trusted-value replacement. It must not automate or route around challenges.
- Optional local active checks are per-card, use a separate active-results
  request, retain at most the three lowest locally matched asking prices, and
  never contribute sold evidence.

## Logging and error handling

- User messages: concise, actionable, and non-technical.
- Persistent logs: timestamp, severity, subsystem, operation, safe record or
  query identifier, outcome, and retry/cooldown information.
- Redact secrets and minimize personal data.
- Network calls require timeouts and bounded retries or cooldowns.
- On failure, retain the last known good data when safe.
- Collector blocks or verification responses must stop/cool down rather than
  intensify traffic.
- Store browser failure screenshots/HTML only locally in ignored directories.

## Validation expectations

Run checks proportional to the change:

- `git diff --check`
- JavaScript syntax checks for changed external modules
- inline-script syntax validation when editing root `index.html`
- `python3 ebay-dashboard/test_setup_pocketbase.py` for schema/security changes
- Python compilation/tests for collector changes
- responsive/light/dark visual checks for meaningful UI changes

For security-sensitive changes, explicitly test the unauthorized case as well
as the successful case.

## Git and publishing workflow

- Start from the current `main` and inspect `git status`.
- Do not stage unrelated user changes.
- Use a short-lived branch, focused commit, GitHub pull request, and squash
  merge into `main`.
- The user has authorized routine completed Slab Ledger changes to be merged
  automatically after relevant checks pass. Stop for confirmation only when a
  change is destructive, expands network exposure, requires a new paid service,
  changes authentication/security posture materially, or needs an unresolved
  product choice.
- Keep documentation synchronized with architectural or security changes.

## Roadmap discipline

`docs/Roadmap.md` separates committed direction from ideas. Do not present a
roadmap item as implemented. Do not build public exposure, banking connections,
social features, buyer messaging, or automated marketplace listing unless the
roadmap and security model are deliberately revised first.
