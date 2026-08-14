# Alt.xyz Playwright session + price scrape

Alt (and many marketplaces) detect default Playwright/Chromium and block automated login. The durable approach for personal automation is:

1. **Log in once** in a real headed Chrome window (you handle CAPTCHA / 2FA)
2. **Reuse that browser profile** for scraping so you skip the login wall

Fighting fingerprint detection on every login is brittle and usually loses to Cloudflare / similar. Session reuse is what actually sticks.

## Setup

```bash
npm install
npx playwright install chrome
cp .env.example .env
```

## 1. Save a login session

```bash
npm run login
```

A real Chrome window opens with a persistent profile under `.auth/browser-profile`.

1. Log into https://alt.xyz yourself
2. Finish any challenge / 2FA
3. Confirm you’re in the app
4. Press **Enter** in the terminal

That writes:

- `.auth/browser-profile/` — full Chrome profile (primary)
- `.auth/storage-state.json` — cookie/localStorage snapshot

## 2. Scrape prices

Edit `INVENTORY` in `src/scrape.ts` with the card/listing URLs you care about, then:

```bash
npm run scrape
```

Results land in `output/prices-*.json`.

Selectors for title/price are heuristics — once you have a real listing open, tighten them in DevTools (right-click → Inspect) and update `src/scrape.ts`.

## Why default Playwright fails on login

| Signal | Default Playwright | This project |
| --- | --- | --- |
| Browser | Bundled Chromium | Real Chrome (`channel: "chrome"`) |
| Mode | Often headless | Headed |
| Profile | Fresh every run | Persistent `.auth/browser-profile` |
| `navigator.webdriver` | `true` | Softened + automation flags reduced |
| Login | Fully scripted | Manual once, then reuse |

If a later scrape says the session expired, just run `npm run login` again.

## Tips

- Prefer **specific listing/card URLs** over crawling the whole marketplace.
- Keep a short delay between pages (already included) so you don’t hammer the site.
- Close other Chrome windows using the same profile if you see profile-lock errors.
- Respect Alt’s terms of use and only automate access to your own account / data you are allowed to use.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run login` | Manual login + save session |
| `npm run scrape` | Reuse session and pull prices |
| `npm run check-session` | Open the profile and pause so you can verify you’re still logged in |
