import path from "node:path";
const interval = Number.parseInt(
  process.env.SCRAPE_INTERVAL_MINUTES ?? "1440",
  10,
);
export const config = {
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? "output"),
  navigationTimeoutMs: 45_000,
  browserChannel: process.env.ALT_BROWSER_CHANNEL ?? "chrome",
  browserProfilePath: path.resolve(
    process.env.ALT_BROWSER_PROFILE_PATH ?? ".auth/alt-chrome-profile",
  ),
};
