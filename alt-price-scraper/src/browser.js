import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "./config.js";

/**
 * Launch real installed Chrome with a persistent profile.
 *
 * Why this beats default Playwright Chromium for login walls:
 * - Real Chrome channel (not bundled Chromium)
 * - Headed by default (headless is heavily fingerprinted)
 * - Persistent profile = cookies / localStorage / device signals
 * - Manual login once; later runs reuse the same session
 */
export async function launchPersistentBrowser({
  headed = true,
  browserProfilePath = config.browserProfilePath,
  browserChannel = config.browserChannel,
} = {}) {
  fs.mkdirSync(browserProfilePath, { recursive: true });

  const context = await chromium.launchPersistentContext(browserProfilePath, {
    channel: browserChannel,
    headless: !headed,
    viewport: headed ? null : { width: 1440, height: 1000 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "en-US",
    timezoneId: "America/Chicago",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function saveStorageState(context) {
  const storageStatePath = config.storageStatePath;
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
}

export async function sessionLooksLoggedOut(page, { timeoutMs = 5_000 } = {}) {
  await page.goto(config.altBaseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  await page.waitForTimeout(2_000);
  return page
    .getByRole("link", { name: /log ?in|sign ?in/i })
    .first()
    .isVisible({ timeout: timeoutMs })
    .catch(() => false);
}
