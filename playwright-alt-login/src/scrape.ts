import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { launchPersistentBrowser } from "./browser.js";

/**
 * Example inventory targets — replace with card/listing URLs or search terms
 * you care about. Prefer specific listing or card detail pages over homepage.
 */
const INVENTORY: Array<{ id: string; url: string; note?: string }> = [
  // Example placeholders — swap for real Alt card/listing URLs:
  // { id: "psa10-example", url: "https://app.alt.xyz/...", note: "Jordan PSA 10" },
  {
    id: "2c18278c-606a-4789-8266-0aa458427cac",
    url: "https://alt.xyz/itm/2c18278c-606a-4789-8266-0aa458427cac",
    note: "1997 Metal Universe Precious Metal Gems Michael Jordan #23",
  },
];

type PriceRow = {
  id: string;
  url: string;
  note?: string;
  title?: string;
  priceText?: string;
  bidCount?: string;
  scrapedAt: string;
  error?: string;
};

async function main() {
  if (!fs.existsSync(config.profileDir)) {
    console.error(
      "No browser profile found. Run `npm run login` first and complete login manually.",
    );
    process.exit(1);
  }

  if (INVENTORY.length === 0) {
    console.warn(
      "INVENTORY in src/scrape.ts is empty. Add listing URLs, then re-run.",
    );
  }

  const { context, page } = await launchPersistentBrowser();

  // Sanity-check that the saved session still looks logged in.
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
  await delay(2000);

  const looksLoggedOut = await page
    .getByRole("link", { name: /log ?in|sign ?in/i })
    .first()
    .isVisible()
    .catch(() => false);

  if (looksLoggedOut) {
    console.error(
      "Session appears expired or logged out. Run `npm run login` again.",
    );
    await context.close();
    process.exit(1);
  }

  const rows: PriceRow[] = [];

  for (const item of INVENTORY) {
    const scrapedAt = new Date().toISOString();
    try {
      console.log(`Fetching ${item.id}: ${item.url}`);
      await page.goto(item.url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // Small human-like pause between navigations
      await delay(1500 + Math.floor(Math.random() * 1500));

      // Wait for auction/listing price (Alt uses data-testid on MUI spans)
      const priceLocator = page.locator('[data-testid="current-bid-price"]');
      await priceLocator.waitFor({ state: "visible", timeout: 30_000 });

      const title =
        (
          await page
            .locator("h1")
            .first()
            .textContent()
            .catch(() => null)
        )?.trim() ?? undefined;

      const priceText =
        (await priceLocator.textContent().catch(() => null))?.trim() ??
        undefined;

      const bidCount =
        (
          await page
            .locator('[data-testid="bid-count"]')
            .textContent()
            .catch(() => null)
        )?.trim() ?? undefined;

      rows.push({
        id: item.id,
        url: item.url,
        note: item.note,
        title,
        priceText,
        bidCount,
        scrapedAt,
      });

      console.log(
        `  → ${title ?? "(no title)"} | ${priceText ?? "(no price found)"} | bids: ${bidCount ?? "?"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        id: item.id,
        url: item.url,
        note: item.note,
        scrapedAt,
        error: message,
      });
      console.error(`  ✗ ${item.id}: ${message}`);
    }
  }

  fs.mkdirSync(config.outputDir, { recursive: true });
  const outPath = path.join(
    config.outputDir,
    `prices-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nWrote ${rows.length} row(s) to ${outPath}`);

  await context.close();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
