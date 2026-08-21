import fs from "node:fs";
import { config } from "./config.js";

const MONEY = /\$([\d,]+(?:\.\d{2})?)/;
const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export function parseMoney(text) {
  const match = String(text || "")
    .replace(/\u00a0/g, " ")
    .match(MONEY);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

export function extractCertPrice(text, cert) {
  const normalized = String(text || "").replace(/\u00a0/g, " ");
  const certDigits = onlyDigits(cert);
  if (!certDigits || !onlyDigits(normalized).includes(certDigits)) return null;
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
  const fallback = parseMoney(normalized);
  return fallback
    ? {
        value: fallback,
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

async function extractItemPrice(page, cert) {
  const text = await page.locator("body").innerText();
  if (
    /access all of the market data.+free account|sign up for free/i.test(text)
  ) {
    return { authRequired: true };
  }

  const certDigits = onlyDigits(cert);
  if (!certDigits || !onlyDigits(text).includes(certDigits)) return null;

  const livePrice = page.locator('[data-testid="current-bid-price"]').first();
  if (await livePrice.isVisible().catch(() => false)) {
    const fromLive = parseMoney(
      await livePrice.textContent().catch(() => null),
    );
    if (fromLive > 0) {
      return { value: fromLive, valueType: "current_bid" };
    }
  }

  // Sold listings drop current-bid-price. The hammer price is the vegaH5
  // sibling above "Sold on Auctions" / "Sold on Fixed Price".
  const soldLabel = page.getByText(/sold on (auctions|fixed price)/i).first();
  if (await soldLabel.isVisible().catch(() => false)) {
    const soldPrice = soldLabel.locator(
      'xpath=../preceding-sibling::span[contains(@class, "MuiTypography-vegaH5")]',
    );
    const fromSold = parseMoney(
      await soldPrice.textContent().catch(() => null),
    );
    if (fromSold > 0) {
      const soldOn =
        (
          await soldLabel
            .locator("xpath=following-sibling::span")
            .first()
            .textContent()
            .catch(() => null)
        )?.trim() || undefined;
      return {
        value: fromSold,
        valueType: "last_sale",
        ...(soldOn ? { soldOn } : {}),
      };
    }
  }

  return extractCertPrice(text, cert);
}

export async function scrapeInventoryFromAlt(
  cards,
  {
    headed = true,
    navigationTimeoutMs = config.navigationTimeoutMs,
    delayMs = config.scrapeDelayMs,
    browserChannel = config.browserChannel,
    browserProfilePath = config.browserProfilePath,
  } = {},
) {
  if (!fs.existsSync(browserProfilePath)) {
    throw new Error(
      "No browser profile found. Run `npm run alt:login` first and complete login manually.",
    );
  }

  const { launchPersistentBrowser, sessionLooksLoggedOut } =
    await import("./browser.js");
  const { context, page } = await launchPersistentBrowser({
    headed,
    browserChannel,
    browserProfilePath,
  });
  const observations = [];
  const results = [];
  const total = cards.filter((card) => String(card.cert || "").trim()).length;
  let index = 0;
  try {
    if (await sessionLooksLoggedOut(page)) {
      throw new Error(
        "Session appears expired or logged out. Run `npm run alt:login` again.",
      );
    }

    console.log(`Scraping ${total} cert(s) from Alt…`);
    for (const card of cards) {
      const cert = String(card.cert || "").trim();
      if (!cert) {
        console.warn(`Skipping card ${card.id || "?"}: missing cert`);
        continue;
      }
      index += 1;
      const company = String(card.company || "PSA").trim();
      const searchUrl = `${config.altBaseUrl}/browse?query=${encodeURIComponent(cert)}`;
      console.log(`[${index}/${total}] Searching ${company} ${cert}…`);
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
        console.log(
          `[${index}/${total}] Found ${itemUrls.length} item candidate(s) for ${cert}`,
        );
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
          await page.waitForTimeout(1500 + Math.floor(Math.random() * 1500));
          const price = await extractItemPrice(page, cert);
          if (price?.authRequired) {
            authRequired = true;
            console.warn(
              `[${index}/${total}] Auth wall on item for ${cert}; skipping candidate`,
            );
            continue;
          }
          if (price?.value > 0) {
            matches.push({ ...price, itemUrl });
            console.log(
              `[${index}/${total}] Candidate ${price.valueType}=$${price.value} for ${cert}`,
            );
          }
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
              ...(match.soldOn ? { sold_on: match.soldOn } : {}),
            },
          });
          results.push({ cardId: card.id, cert, status: "matched", ...match });
          console.log(
            `[${index}/${total}] Matched ${cert}: $${match.value} (${match.valueType})` +
              (match.soldOn ? ` sold ${match.soldOn}` : ""),
          );
        } else {
          const status = authRequired
            ? "auth_required"
            : matches.length
              ? "ambiguous"
              : "unmatched";
          results.push({
            cardId: card.id,
            cert,
            status,
            candidateCount: matches.length,
          });
          console.warn(
            `[${index}/${total}] ${status} for ${cert}` +
              (matches.length ? ` (${matches.length} priced candidates)` : ""),
          );
        }
      } catch (error) {
        const message = String(error.message || error);
        results.push({
          cardId: card.id,
          cert,
          status: "error",
          error: message,
        });
        console.error(`[${index}/${total}] Error for ${cert}: ${message}`);
      }
      if (delayMs > 0) {
        console.log(
          `[${index}/${total}] Waiting ${delayMs}ms before next cert…`,
        );
        await page.waitForTimeout(delayMs);
      }
    }
  } finally {
    await context.close();
  }
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `Scrape finished: ${observations.length} observation(s) from ${results.length} cert(s)` +
      (Object.keys(counts).length
        ? ` (${Object.entries(counts)
            .map(([status, count]) => `${status}=${count}`)
            .join(", ")})`
        : ""),
  );
  return { observations, results };
}
