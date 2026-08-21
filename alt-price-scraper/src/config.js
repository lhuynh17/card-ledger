import path from "node:path";

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? "output"),
  navigationTimeoutMs: 45_000,
  scrapeDelayMs: envInt("SCRAPE_DELAY_MS", 500),
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
