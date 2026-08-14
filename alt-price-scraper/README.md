# Alt Price Scraper

Reads active Slab Ledger inventory, searches Alt by exact certification number, and appends matched values through the scoped PocketBase hook.

Alt (and many marketplaces) detect default Playwright/Chromium and block automated login. The durable approach is:

1. **Log in once** in a real headed Chrome window (you handle CAPTCHA / 2FA)
2. **Reuse that browser profile** for scraping so you skip the login wall

## Setup

1. Copy `.env.example` to `.env` and fill in the existing PocketBase URL and hook token.
2. Run `npm install`, then `npx playwright install chrome`, then `npm test`.

## 1. Save a login session

```bash
npm run alt:login
```

A real Chrome window opens with a persistent profile under `.auth/alt-chrome-profile`.

1. Log into https://alt.xyz yourself
2. Finish any challenge / 2FA
3. Confirm you’re in the app
4. Press **Enter** in the terminal

That writes:

- `.auth/alt-chrome-profile/` — full Chrome profile (primary)
- `.auth/storage-state.json` — cookie/localStorage snapshot

Confirm the session later with:

```bash
npm run alt:session
```

## 2. Scrape inventory

```bash
npm run scrape
```

Scrapes run **headed** by default (same as the working login profile). Use `npm run scrape:headless` only if you need it. `npm run schedule` repeats collection.

If a later scrape says the session expired, run `npm run alt:login` again.

Secrets, output, and browser profiles are excluded from Git. Alt may reject automation-controlled authentication; do not bypass access controls. The collector records `auth_required` and writes no observation when pricing is gated.

Close other Chrome windows using the same profile if you see profile-lock errors.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run alt:login` | Manual login + save session |
| `npm run alt:session` | Open the profile so you can verify you’re still logged in |
| `npm run scrape` | Reuse session, search inventory certs, append observations |
| `npm run scrape:headless` | Same scrape in headless Chrome (often blocked) |
| `npm run db:check` | PocketBase hook/admin connectivity check |
