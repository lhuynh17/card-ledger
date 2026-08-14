import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { launchPersistentBrowser } from "./browser.js";

const URL =
  "https://alt.xyz/itm/2c18278c-606a-4789-8266-0aa458427cac";

async function main() {
  const { context, page } = await launchPersistentBrowser();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(4000);

  // Dump candidates that look like money / value labels
  const findings = await page.evaluate(() => {
    const moneyRe = /\$[\d,]+(?:\.\d{2})?/;
    const valueRe = /alt\s*value|market|price|ask|bid|sold|comp/i;

    const nodes = Array.from(document.querySelectorAll("body *"));
    const hits: Array<{
      tag: string;
      id: string;
      className: string;
      testId: string | null;
      text: string;
      attrs: Record<string, string>;
    }> = [];

    for (const el of nodes) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 120) continue;
      const className = typeof el.className === "string" ? el.className : "";
      const testId = el.getAttribute("data-testid");
      const interesting =
        moneyRe.test(text) ||
        valueRe.test(text) ||
        valueRe.test(className) ||
        (testId ? valueRe.test(testId) : false);
      if (!interesting) continue;

      // Prefer leaf-ish nodes
      const childTextLen = Array.from(el.children)
        .map((c) => (c.textContent || "").trim().length)
        .reduce((a, b) => a + b, 0);
      if (childTextLen > text.length * 0.8 && el.children.length > 0) continue;

      const attrs: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) {
        if (
          /^(id|class|data-|aria-|itemprop|role)/i.test(a.name) ||
          a.name.includes("price") ||
          a.name.includes("value")
        ) {
          attrs[a.name] = a.value.slice(0, 200);
        }
      }

      hits.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        className: className.slice(0, 200),
        testId,
        text: text.slice(0, 160),
        attrs,
      });
    }

    // Also grab JSON-LD / next data if present
    const jsonLd = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    ).map((s) => (s.textContent || "").slice(0, 2000));

    const nextData = document.getElementById("__NEXT_DATA__")?.textContent?.slice(0, 5000) ?? null;

    return {
      url: location.href,
      title: document.title,
      hits: hits.slice(0, 80),
      jsonLd,
      hasNextData: Boolean(nextData),
      nextDataSnippet: nextData,
    };
  });

  fs.mkdirSync(config.outputDir, { recursive: true });
  const out = path.join(config.outputDir, "inspect-price.json");
  fs.writeFileSync(out, JSON.stringify(findings, null, 2));
  console.log(`Wrote ${findings.hits.length} candidate nodes to ${out}`);
  console.log("Sample hits:");
  for (const h of findings.hits.slice(0, 25)) {
    console.log(`- <${h.tag} class="${h.className}" testid="${h.testId}"> ${h.text}`);
  }

  // Keep browser open briefly so you can see the page
  console.log("Leaving browser open 20s for visual check…");
  await page.waitForTimeout(20_000);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
