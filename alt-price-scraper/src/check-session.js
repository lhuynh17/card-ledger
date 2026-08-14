#!/usr/bin/env node
import fs from "node:fs";
import { config } from "./config.js";
import { launchPersistentBrowser } from "./browser.js";

if (!fs.existsSync(config.browserProfilePath)) {
  console.error(
    "No browser profile found. Run `npm run alt:login` first and complete login manually.",
  );
  process.exit(1);
}

const { context, page } = await launchPersistentBrowser({ headed: true });

try {
  await page.goto(config.altBaseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  console.log(
    "Browser open with saved profile. Inspect login state, then Ctrl+C to quit.",
  );
  await new Promise(() => {});
} finally {
  await context.close();
}
