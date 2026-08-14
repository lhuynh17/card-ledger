import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import { config } from "./config.js";

/**
 * Launch real installed Chrome with a persistent profile.
 *
 * Why this beats default Playwright Chromium for login walls:
 * - Real Chrome channel (not bundled Chromium)
 * - Headed mode (headless is heavily fingerprinted)
 * - Persistent profile = real cookies / localStorage / device signals
 * - Manual login once; later runs reuse the same session
 */
export async function launchPersistentBrowser(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  fs.mkdirSync(config.profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(config.profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null, // use the real window size
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "en-US",
    timezoneId: "America/Chicago",
  });

  // Soften the most obvious webdriver flag for naive checks.
  // Persistent real Chrome + manual login is still the main strategy.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function saveStorageState(context: BrowserContext): Promise<void> {
  fs.mkdirSync(pathDir(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });
}

function pathDir(filePath: string): string {
  return filePath.replace(/[/\\][^/\\]+$/, "");
}
