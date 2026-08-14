#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { config } from "./config.js";
const context = await chromium.launchPersistentContext(
  config.browserProfilePath,
  {
    channel: config.browserChannel,
    chromiumSandbox: true,
    headless: false,
    viewport: { width: 1440, height: 1000 },
  },
);
const page = context.pages()[0] || (await context.newPage());
const prompt = readline.createInterface({ input, output });
try {
  await page.goto("https://alt.xyz/browse?query=68410100", {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  console.log("Sign in to Alt. Complete MFA if requested.");
  await prompt.question("When signed in, return here and press Enter: ");
  console.log(`Alt profile saved in ${config.browserProfilePath}`);
} finally {
  prompt.close();
  await context.close();
}
