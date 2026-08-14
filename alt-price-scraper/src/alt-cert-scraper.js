import { chromium } from "playwright";
const MONEY = /\$([\d,]+(?:\.\d{2})?)/;
const digits = (value) => String(value || "").replace(/\D/g, "");
export function extractCertPrice(text, cert) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const certDigits = digits(cert);
  if (!certDigits || !digits(normalized).includes(certDigits)) return null;
  for (const candidate of [
    {
      type: "alt_value",
      regex: /(?:ALT\s+VALUE|ALT\s+ESTIMATE)[^$]{0,80}\$([\d,]+(?:\.\d{2})?)/i,
    },
    {
      type: "last_sale",
      regex: /(?:LAST\s+SALE|LAST\s+SOLD)[^$]{0,80}\$([\d,]+(?:\.\d{2})?)/i,
    },
    {
      type: "listed_price",
      regex:
        /(?:BUY\s+NOW|BUY\s*\/\s*OFFER|CURRENT\s+BID)[^$]{0,80}\$([\d,]+(?:\.\d{2})?)/i,
    },
  ]) {
    const match = normalized.match(candidate.regex);
    if (match)
      return {
        value: Number(match[1].replaceAll(",", "")),
        valueType: candidate.type,
      };
  }
  const fallback = normalized.match(MONEY);
  return fallback
    ? {
        value: Number(fallback[1].replaceAll(",", "")),
        valueType: "displayed_price",
      }
    : null;
}
export function renderedResultText(values) {
  return (
    [
      ...new Set(
        values.map((value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim(),
        ),
      ),
    ]
      .filter(
        (value) =>
          /^(?:19|20)\d{2}\s/.test(value) &&
          value.length >= 20 &&
          value.length <= 300,
      )
      .sort((a, b) => a.length - b.length)[0] || ""
  );
}
export async function scrapeInventoryFromAlt(
  cards,
  {
    headed = false,
    navigationTimeoutMs = 45_000,
    delayMs = 500,
    browserChannel = "chrome",
    browserProfilePath = "",
  } = {},
) {
  const context = await chromium.launchPersistentContext(browserProfilePath, {
    channel: browserChannel,
    chromiumSandbox: true,
    headless: !headed,
    viewport: { width: 1440, height: 1000 },
  });
  const page = context.pages()[0] || (await context.newPage());
  const observations = [];
  const results = [];
  try {
    for (const card of cards) {
      const cert = String(card.cert || "").trim();
      if (!cert) continue;
      const company = String(card.company || "PSA").trim();
      const searchUrl = `https://alt.xyz/browse?query=${encodeURIComponent(cert)}`;
      try {
        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: navigationTimeoutMs,
        });
        await page
          .locator("body")
          .waitFor({ state: "visible", timeout: navigationTimeoutMs });
        await page.waitForTimeout(1500);
        const itemUrls = [
          ...new Set(
            await page
              .locator('a[href*="/itm/"]')
              .evaluateAll((links) =>
                links.map((link) => link.href.split("?")[0]),
              ),
          ),
        ].slice(0, 10);
        if (!itemUrls.length) {
          const text = renderedResultText(
            await page
              .locator("main div, main article, main li, [role=main] div")
              .allTextContents(),
          );
          if (text) {
            await page.getByText(text, { exact: true }).first().click();
            await page.waitForTimeout(1500);
            if (/\/itm\//.test(page.url()))
              itemUrls.push(page.url().split("?")[0]);
          }
        }
        const matches = [];
        let authRequired = false;
        for (const itemUrl of itemUrls) {
          await page.goto(itemUrl, {
            waitUntil: "domcontentloaded",
            timeout: navigationTimeoutMs,
          });
          await page
            .locator("body")
            .waitFor({ state: "visible", timeout: navigationTimeoutMs });
          const text = await page.locator("body").innerText();
          if (
            /access all of the market data.+free account|sign up for free/i.test(
              text,
            )
          ) {
            authRequired = true;
            continue;
          }
          const price = extractCertPrice(text, cert);
          if (price?.value > 0) matches.push({ ...price, itemUrl });
        }
        if (matches.length === 1) {
          const match = matches[0];
          observations.push({
            card_id: card.id,
            cert_number: cert,
            value: match.value,
            currency: "USD",
            observed_at: new Date().toISOString(),
            source_url: match.itemUrl,
            source_item_id: match.itemUrl.split("/itm/")[1] || "",
            metadata: {
              value_type: match.valueType,
              query_url: searchUrl,
              grader: company,
            },
          });
          results.push({ cardId: card.id, cert, status: "matched", ...match });
        } else
          results.push({
            cardId: card.id,
            cert,
            status: authRequired
              ? "auth_required"
              : matches.length
                ? "ambiguous"
                : "unmatched",
            candidateCount: matches.length,
          });
      } catch (error) {
        results.push({
          cardId: card.id,
          cert,
          status: "error",
          error: String(error.message || error),
        });
      }
      if (delayMs > 0) await page.waitForTimeout(delayMs);
    }
  } finally {
    await context.close();
  }
  return { observations, results };
}
