#!/usr/bin/env node
import { config } from "./config.js";
import { altHookFromEnvironment } from "./alt-hook-client.js";
import { scrapeInventoryFromAlt } from "./alt-cert-scraper.js";
import { saveSnapshot } from "./storage.js";
const args = new Set(process.argv.slice(2));
const headed = !args.has("--headless");
const scheduled = args.has("--schedule");
let running = false;
async function run() {
  if (running) return console.warn("Skipping overlapping run.");
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const hook = altHookFromEnvironment();
    const inventory = await hook.inventory();
    const scraped = await scrapeInventoryFromAlt(inventory.items || [], {
      headed,
      navigationTimeoutMs: config.navigationTimeoutMs,
      delayMinMs: config.scrapeDelayMinMs,
      delayMaxMs: config.scrapeDelayMaxMs,
      browserChannel: config.browserChannel,
      browserProfilePath: config.browserProfilePath,
    });
    let saved = 0;
    let updated = 0;
    let skipped = 0;
    const batchSize = 100;
    for (let offset = 0; offset < scraped.observations.length; offset += batchSize) {
      const batch = scraped.observations.slice(offset, offset + batchSize);
      const posted = await hook.appendObservations(batch);
      saved += posted.saved || 0;
      updated += posted.updated || 0;
      skipped += posted.skipped || 0;
    }
    const snapshot = {
      source: "alt.xyz",
      sourceUrl: "https://alt.xyz/browse",
      scrapedAt: startedAt,
      inventoryCount: inventory.count ?? inventory.items?.length ?? 0,
      listingCount: scraped.observations.length,
      savedCount: saved,
      updatedCount: updated,
      skippedCount: skipped,
      results: scraped.results,
    };
    const paths = await saveSnapshot(snapshot, config.outputDir);
    console.log(
      `[${startedAt}] Checked ${snapshot.inventoryCount} items; saved ${saved}` +
        (updated ? `, updated ${updated}` : "") +
        (skipped ? `, skipped ${skipped} unchanged` : "") +
        ` observation(s) to ${paths.latestPath}`,
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Inventory scrape failed:`,
      error,
    );
    if (!scheduled) process.exitCode = 1;
  } finally {
    running = false;
  }
}
await run();
if (scheduled) {
  console.log(`Scheduling every ${config.intervalMinutes} minute(s).`);
  setInterval(run, config.intervalMinutes * 60_000);
}
