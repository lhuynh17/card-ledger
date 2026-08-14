#!/usr/bin/env node
import { config } from "./config.js";
import { launchPersistentBrowser, saveStorageState } from "./browser.js";

/**
 * Interactive login flow.
 *
 * Bot detection is usually fiercest on the login page. Fighting that every run
 * is brittle. Instead:
 *  1. Open real Chrome with a persistent profile
 *  2. You log in manually (CAPTCHA / 2FA / email magic link all fine)
 *  3. Press Enter in the terminal once you're fully logged in
 *  4. Session is saved in .auth/ for later scrape runs
 */
const { context, page } = await launchPersistentBrowser({ headed: true });

try {
  console.log("Opening Alt…");
  await page.goto(config.altBaseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });

  console.log(`
============================================================
  MANUAL LOGIN
============================================================
  1. Complete login in the Chrome window that just opened.
  2. Finish any CAPTCHA / 2FA / email verification.
  3. Confirm you can see your account (collection / nav).
  4. Come back here and press Enter to save the session.
============================================================
`);

  await waitForEnter();
  await saveStorageState(context);
  console.log(`Session saved to ${config.storageStatePath}`);
  console.log(`Persistent profile kept at ${config.browserProfilePath}`);
  console.log("You can close the browser. Next: npm run scrape");
} finally {
  await context.close();
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}
