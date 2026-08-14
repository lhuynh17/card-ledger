# Alt Price Scraper

Reads active Slab Ledger inventory, searches Alt by exact certification number, and appends matched values through the scoped PocketBase hook.

1. Copy `.env.example` to `.env` and fill in the existing PocketBase URL and hook token.
2. Run `npm install`, then `npm test`.
3. Optionally run `npm run alt:login` to create a dedicated authenticated Chrome profile.
4. Run `npm run scrape`, or `npm run schedule` for recurring collection.

Secrets, output, and browser profiles are excluded from Git. Alt may reject automation-controlled authentication; do not bypass access controls. The collector records `auth_required` and writes no observation when pricing is gated.
