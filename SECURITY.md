# Security Policy

Slab Ledger contains private collection, financial, receipt, and account data.
Its security model assumes a private personal deployment, not a public SaaS
service.

## Supported deployment

The supported deployment is:

- the static Slab Ledger frontend served from GitHub Pages or another trusted
  static origin;
- PocketBase running on the owner's Synology NAS;
- access to PocketBase through private Tailscale networking and Tailscale
  Serve;
- no Tailscale Funnel;
- no public router port forwarding to PocketBase, DSM, Container Manager, or
  the PocketBase admin UI;
- the optional marketplace collector running on a trusted personal computer;
- the collector dashboard bound only to `127.0.0.1`.

If a public PocketBase deployment is introduced later, it requires a new threat
model, reverse-proxy hardening, TLS and origin review, monitoring, secret
rotation, abuse controls, and a documented migration. It is not an incremental
configuration change.

## Trust boundaries

1. **Browser/PWA**
   - Holds the signed-in user's PocketBase auth token in browser storage.
   - Holds an offline IndexedDB cache of inventory and limited local
     preferences/fallbacks.
   - Is an untrusted client for authorization purposes.

2. **PocketBase**
   - Is the authoritative synced datastore.
   - Enforces user ownership rules independently of the browser.
   - Issues short-lived file tokens for protected uploads.
   - Hosts authenticated hook routes for PSA data and image import.

3. **Third-party providers**
   - Parse.bot and Bright Data are untrusted external
     dependencies.
   - Provider credentials remain server-side.
   - Provider payloads must be validated and normalized.

4. **Local marketplace collector**
   - Uses a PocketBase app-user credential (never a superuser credential) from
     ignored local configuration.
   - Keeps its browser profile, cache, logs, and failure artifacts local.
   - Exposes its dashboard only on loopback.

## Authentication model

- App users authenticate through the PocketBase `users` collection.
- Administrative schema setup authenticates through `_superusers`.
- The setup utility supports PocketBase MFA: password authentication triggers
  the normal OTP flow and the user supplies the one-time code.
- Superuser MFA should remain enabled.
- Use a unique, strong app-user password and a separate strong superuser
  password.
- Do not reuse NAS administrator credentials for Slab Ledger accounts.
- Restrict superuser access by IP/device where practical.
- Signing out removes the cached app auth session and invalidates the local
  file-token cache. PocketBase token revocation and password rotation remain
  the server-side response to suspected compromise.

## Authorization model

Every user-owned collection must have an `owner` relation to `users` and these
rules:

```text
List/View/Update/Delete:
@request.auth.id != "" && owner = @request.auth.id

Create:
@request.auth.id != "" && @request.body.owner = @request.auth.id
```

The setup utility audits the owner field and checks for unowned records before
repairing rules. If ownership is missing, invalid, or incomplete, it stops
instead of risking lockout or cross-user access.

Hook routes use `requireAuth("users")` and repeat server-side owner filtering
where appropriate. Client-side filtering is never an authorization control.

## Protected files

Inventory photos, grading photos, profile logos, and business receipts are
private:

- PocketBase file fields are marked `protected`;
- the browser requests a short-lived file token;
- tokens are cached only briefly;
- receipt uploads are limited to supported image/PDF types and 10 MB;
- profile logos are limited to supported image types and 2 MB;
- card and grading photos are limited to supported image types and 10 MB.

Do not change a protected field to public to work around an image-loading bug.
Fix token acquisition, authorization, caching, or object-URL lifecycle instead.

## Third-party API and SSRF safeguards

`PARSE_BOT_API_KEY` is read only by PocketBase hooks and must never be included
in frontend code, Git, logs, screenshots, or support messages.

The PSA image relay:

- requires an authenticated user;
- accepts only HTTPS URLs;
- allows only explicit PSA/Collectors/CDN hostname families;
- enforces a timeout;
- requires an image response content type;
- rejects responses larger than 10 MB.

Any future relay or provider adapter must preserve equivalent controls. Never
accept arbitrary URLs from the browser and fetch them from the NAS. Block
loopback, link-local, RFC1918/private, NAS, metadata-service, and non-HTTPS
targets unless a narrowly reviewed internal use case explicitly requires them.

### Bright Data boundary

- Bright Data requests originate only from an authenticated PocketBase hook.
- The integration makes outbound HTTPS requests only to
  `api.brightdata.com`; it creates no listener, public route, webhook, Funnel,
  or router forwarding rule.
- Every marketplace route requires an authenticated `users` record. Searches
  referencing a card also verify that the card belongs to that user.
- `BRIGHT_DATA_API_TOKEN` exists only in the PocketBase/container environment.
  It is never returned to the browser, written to PocketBase, or logged.
- The adapter cannot make a live request unless the feature flag is enabled,
  the kill switch is off, and account/schema confirmation is explicit.
- Async jobs use bounded outbound polling. No inbound callback is accepted.
- The optional automatic scheduler runs inside PocketBase every 15 minutes,
  selects only owner-private due settings and active owner cards, and starts no
  inbound service. It processes a bounded number of cards per tick.
- Apify sold evidence and Bright Data active listings remain separate outbound
  adapters. Asking prices can never be promoted to completed-sale evidence.
- Provider response aliases are confined to the Bright Data adapter. Only
  strictly validated, normalized candidates cross into the domain layer.
- Empty, malformed, timed-out, blocked, or failed results return a safe error
  and never replace a last known good value.

## Network restrictions

- Keep Tailscale Serve private to the tailnet.
- Never enable Tailscale Funnel for Slab Ledger.
- Do not publish ports `8090`, DSM management ports, Container Manager ports,
  or collector port `8000` to the internet.
- Configure PocketBase allowed origins to the actual frontend origin, for
  example the GitHub Pages site, rather than allowing arbitrary origins.
- Enable PocketBase rate limiting.
- The PocketBase process may listen inside its container as required, but the
  NAS exposure path must remain private.
- Local companion HTTP servers must bind to `127.0.0.1`; a change to
  `0.0.0.0` is security-sensitive and prohibited by default.

## Secret and environment strategy

Never commit:

- `collector.env`;
- `pocketbase-setup.env`;
- API keys or auth tokens;
- passwords or MFA codes;
- live `data.json`;
- browser profiles;
- `collector.lock`;
- logs and browser failure diagnostics;
- PocketBase database files or backups.

Supported configuration:

| Variable | Location | Purpose |
| --- | --- | --- |
| `PARSE_BOT_API_KEY` | PocketBase/container environment | Parse.bot server credential |
| `PARSE_BOT_MONTHLY_CREDITS` | PocketBase/container environment | Optional monthly allowance override |
| `BRIGHT_DATA_API_TOKEN` | PocketBase/container environment | Server-only Bright Data bearer token |
| `BRIGHT_DATA_DATASET_ID` | PocketBase/container environment | Account-validated eBay scraper ID |
| `BRIGHT_DATA_ENABLED` | PocketBase/container environment | Default-off feature flag |
| `BRIGHT_DATA_KILL_SWITCH` | PocketBase/container environment | Immediate provider stop; defaults on |
| `SLAB_POCKETBASE_URL` | ignored collector/setup env | PocketBase address |
| `SLAB_POCKETBASE_EMAIL` | ignored collector env | collector app-user email |
| `SLAB_POCKETBASE_PASSWORD` | ignored collector env | collector app-user password |
| `SLAB_POCKETBASE_SUPERUSER_EMAIL` | ignored setup env | non-secret setup convenience |
| `SLAB_SCRAPER_BACKEND` | ignored collector env | `browser` normally; `requests` for troubleshooting |
| `SLAB_BROWSER_HEADLESS` | ignored collector env | background or visible diagnostic browser |

The setup utility saves only the PocketBase URL and superuser email. It never
saves the superuser password or MFA code.

## Marketplace collection safeguards

The optional eBay collector intentionally:

- processes one due unique query every 12–20 minutes;
- uses an owner-configured local collection window, defaulting to 2 AM–7 AM
  for the three-card proof;
- treats results as fresh for 22 hours;
- caps requests at 72 per rolling 24 hours;
- shares one cached result among identical searches;
- uses a single-instance lock;
- increases cooldowns after HTTP 403/429 or verification responses;
- uses standard Chromium without stealth, fingerprint disguise, proxy
  rotation, CAPTCHA solving, or challenge bypass.
- pauses visibly for manual owner completion when eBay requests a sign-in or
  CAPTCHA, then resumes the same queue without automating the challenge;
- defaults to evaluation-only so proof results remain local and cannot replace
  a trusted PocketBase market value.
- makes a separate optional active-listing request only for cards the owner
  selects, retains at most the three lowest matching asking prices, and never
  treats those prices as sold evidence.

Preserve these limits. A provider abstraction may change transport, but it must
retain budgets, rate controls, observability, and an immediate kill switch.

## Logging and privacy

Logs may contain:

- timestamp and severity;
- subsystem and operation;
- safe card/record identifier;
- normalized search summary;
- result counts;
- provider status code/category;
- retry, rate-budget, and cooldown state.

Logs must not contain:

- passwords, API keys, MFA codes, bearer tokens, cookies, or full auth payloads;
- receipt contents or personal financial notes;
- unnecessary full provider responses;
- arbitrary HTML from authenticated private pages.

Collector diagnostics are local, ignored, bounded, and intended only for
troubleshooting. Review them before sharing because captured marketplace HTML
may contain session or account context.

## Error handling and safe degradation

- Set explicit timeouts on every network call.
- Treat provider outages, quota exhaustion, offline devices, and changed
  marketplace HTML as expected failures.
- Retain the last known good valuation instead of replacing it with zero solely
  because a refresh failed.
- Keep manual inventory entry and manual market comps available.
- Show users an actionable message without revealing server internals.
- Stop or cool down after a block signal; never retry aggressively.
- Bound stored error history.
- Use atomic replacement for collector JSON.
- Do not weaken authorization or file protection to resolve availability bugs.

## Backups and recovery

- Enable PocketBase automatic backups.
- Maintain an encrypted off-NAS backup, currently through Synology Hyper Backup
  to Google Drive.
- Retain multiple versions and periodically run integrity checks.
- Before schema changes, create a PocketBase backup.
- Periodically test restoration; a successful upload is not proof of a usable
  restore.
- Backups and encryption passwords must not be committed to Git.

## Existing safeguards

- owner-only collection rules;
- non-destructive, idempotent schema setup;
- ownership audit before rule repair;
- protected file fields and short-lived file tokens;
- authenticated hook routes;
- strict PSA image-relay allowlist, size, type, HTTPS, and timeout checks;
- server-only provider credentials;
- PocketBase MFA-compatible setup;
- rate limiting verified in deployment;
- private Tailscale-only access;
- collector loopback binding;
- request pacing, daily budget, cooldowns, and single-instance lock;
- default-off Bright Data feature flag and default-on kill switch;
- monthly/daily returned-record limits, warnings, hard stop, bounded retries,
  timeouts, polling, cooldowns, cache reuse, and duplicate-operation blocking;
- owner-only marketplace usage, activity, cache, and normalized observation
  collections with scheduled retention cleanup;
- side-by-side managed-provider evaluation with explicit owner save;
- default-off owner schedule, per-card due state, monthly cost projection, and
  a bounded cards-per-tick limit;
- ignored secrets, caches, logs, and diagnostics;
- local/offline fallbacks that do not replace server authorization;
- automatic local and off-site backups.

## Reporting a vulnerability

Do not open a public issue containing credentials, private URLs, screenshots of
admin pages, database records, or exploit details. Use a private GitHub security
advisory for the repository or contact the repository owner privately.

Include:

- affected component and version/commit;
- reproduction steps with secrets removed;
- expected and actual behavior;
- impact;
- any temporary mitigation already applied.

Rotate exposed credentials immediately and review PocketBase logs, Tailscale
devices, NAS sessions, and Git history.
