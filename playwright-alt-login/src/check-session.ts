import { launchPersistentBrowser } from "./browser.js";
import { config } from "./config.js";

async function main() {
  const { context, page } = await launchPersistentBrowser();
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
  console.log("Browser open with saved profile. Inspect login state, then Ctrl+C to quit.");
  // Keep process alive until user stops it
  await new Promise(() => {});
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
