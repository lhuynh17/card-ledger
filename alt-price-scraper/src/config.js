import path from "node:path";

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const legacyDelayMs = process.env.SCRAPE_DELAY_MS;
const scrapeDelayMinMs = envInt(
  "SCRAPE_DELAY_MIN_MS",
  legacyDelayMs != null ? envInt("SCRAPE_DELAY_MS", 500) : 500,
);
const scrapeDelayMaxMs = envInt(
  "SCRAPE_DELAY_MAX_MS",
  legacyDelayMs != null ? envInt("SCRAPE_DELAY_MS", 500) : 1_500,
);

export const config = {
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? "output"),
  navigationTimeoutMs: 45_000,
  scrapeDelayMinMs: Math.min(scrapeDelayMinMs, scrapeDelayMaxMs),
  scrapeDelayMaxMs: Math.max(scrapeDelayMinMs, scrapeDelayMaxMs),
  intervalMinutes: envInt("SCRAPE_INTERVAL_MINUTES", 1440),
  altBaseUrl: process.env.ALT_BASE_URL ?? "https://alt.xyz",
  browserChannel: process.env.ALT_BROWSER_CHANNEL ?? "chrome",
  browserProfilePath: path.resolve(
    process.env.ALT_BROWSER_PROFILE_PATH ?? ".auth/alt-chrome-profile",
  ),
  storageStatePath: path.resolve(
    process.env.ALT_STORAGE_STATE_PATH ?? ".auth/storage-state.json",
  ),
};

export function randomScrapeDelayMs(
  minMs = config.scrapeDelayMinMs,
  maxMs = config.scrapeDelayMaxMs,
) {
  const min = Math.max(0, Math.min(minMs, maxMs));
  const max = Math.max(0, Math.max(minMs, maxMs));
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}
