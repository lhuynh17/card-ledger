import fs from "node:fs";
import { config } from "./config.js";

const MONEY = /\$([\d,]+(?:\.\d{2})?)/;
const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

/** Browse result titles use this MUI class; filter/chrome buttons do not. */
const BROWSE_RESULT_BUTTON =
  "main button:has(.MuiTypography-vegaButton1), [role='main'] button:has(.MuiTypography-vegaButton1)";

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

export function normalizeBrowseResultLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_INPUT =
  '#universal-search-autocomplete, input[name="universal-search"], input[placeholder*="cert" i]';

async function readBrowseResultLabels(page) {
  return page.locator(BROWSE_RESULT_BUTTON).evaluateAll((buttons) =>
    buttons.map((button) =>
      (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim(),
    ),
  );
}

async function waitForBrowseResultButtons(page, timeoutMs = 8_000) {
  try {
    await page
      .locator(BROWSE_RESULT_BUTTON)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return [];
  }
  return readBrowseResultLabels(page);
}

async function waitForSearchShell(page, navigationTimeoutMs) {
  const searchInput = page.locator(SEARCH_INPUT).first();
  await searchInput.waitFor({
    state: "visible",
    timeout: navigationTimeoutMs,
  });
  return searchInput;
}

/**
 * Open Alt browse for a cert via the search box.
 *
 * Cold starts often strip `?query=` and bounce `/browse?query=…` back to
 * `/browse`. Driving the universal search input is more reliable than the URL.
 */
async function openBrowseSearch(page, cert, searchUrl, navigationTimeoutMs, logPrefix) {
  const certDigits = onlyDigits(cert);
  await page.goto(`${config.altBaseUrl}/browse`, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeoutMs,
  });
  const searchInput = await waitForSearchShell(page, navigationTimeoutMs);

  const alreadyReady =
    onlyDigits(await searchInput.inputValue().catch(() => "")) === certDigits;
  if (!alreadyReady) {
    console.log(`${logPrefix} Entering cert ${cert} into search…`);
    await searchInput.click({ timeout: navigationTimeoutMs });
    await searchInput.fill("");
    await searchInput.fill(cert);
    await searchInput.press("Enter");
  }

  const deadline = Date.now() + navigationTimeoutMs;
  while (Date.now() < deadline) {
    const value = onlyDigits(await searchInput.inputValue().catch(() => ""));
    const query = onlyDigits(
      new URL(page.url()).searchParams.get("query") || "",
    );
    if (value === certDigits || query === certDigits) {
      console.log(`${logPrefix} Browse ready: ${page.url()}`);
      return;
    }
    await page.waitForTimeout(300);
  }

  console.warn(
    `${logPrefix} Search still not settled for ${cert} (at ${page.url()}); continuing`,
  );
}

async function pageMentionsCert(page, cert) {
  const certDigits = onlyDigits(cert);
  if (!certDigits) return false;
  return page.evaluate((digits) => {
    const bodyText = (document.body?.innerText || "").replace(/\D/g, "");
    if (bodyText.includes(digits)) return true;
    const bodyHtml = (document.body?.innerHTML || "").replace(/\D/g, "");
    if (bodyHtml.includes(digits)) return true;
    return [...document.querySelectorAll("script")].some((script) =>
      new RegExp(
        `(?:Certification Number|certificationNumber|certNumber)[^0-9]{0,80}${digits}`,
        "i",
      ).test(script.textContent || ""),
    );
  }, certDigits);
}

async function waitForDetailReady(page, cert, timeoutMs) {
  const certDigits = onlyDigits(cert);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (/\/browse/i.test(url)) {
      await page.waitForTimeout(400);
      continue;
    }
    const state = await page.evaluate((digits) => {
      const text = document.body?.innerText || "";
      const altValueNode = document.querySelector('[data-testid="alt-value"]');
      return {
        hasCert: text.replace(/\D/g, "").includes(digits),
        hasPriceUi: Boolean(
          document.querySelector('[data-testid="current-bid-price"]'),
        ),
        hasSold: /sold on (auctions|fixed price)/i.test(text),
        // Alt renders the leading "A" as an SVG, so visible text is "LT Value".
        hasAltValue: Boolean(altValueNode) || /(?:^|\s)(?:alt\s+)?lt\s+value/i.test(text),
        hasMoney: /\$[\d,]+/.test(text) || Boolean(altValueNode),
        title: document.title || "",
      };
    }, certDigits);
    if (
      state.hasCert &&
      (state.hasPriceUi || state.hasSold || state.hasAltValue || state.hasMoney)
    ) {
      return state;
    }
    if (state.hasPriceUi || state.hasSold || state.hasAltValue) {
      // Price chrome is up; cert may live in HTML/scripts only.
      if (await pageMentionsCert(page, cert)) return state;
    }
    await page.waitForTimeout(400);
  }
  return null;
}

async function openBrowseResultAtIndex(
  context,
  page,
  searchUrl,
  cert,
  resultIndex,
  navigationTimeoutMs,
  logPrefix,
) {
  if (!/\/browse/i.test(page.url())) {
    await openBrowseSearch(
      page,
      cert,
      searchUrl,
      navigationTimeoutMs,
      logPrefix,
    );
    await waitForBrowseResultButtons(page, navigationTimeoutMs);
  }
  const buttons = page.locator(BROWSE_RESULT_BUTTON);
  await buttons
    .nth(resultIndex)
    .waitFor({ state: "visible", timeout: navigationTimeoutMs });

  // User-observed path is same-tab navigation. Briefly allow a popup too.
  const popupPromise = context
    .waitForEvent("page", { timeout: 2_000 })
    .catch(() => null);
  const sameTabPromise = page
    .waitForURL((url) => !/\/browse/i.test(url.pathname), {
      timeout: navigationTimeoutMs,
    })
    .catch(() => null);

  await buttons.nth(resultIndex).click({ timeout: navigationTimeoutMs });

  const popup = await popupPromise;
  let detailPage = page;
  if (popup) {
    detailPage = popup;
    await detailPage.waitForLoadState("domcontentloaded", {
      timeout: navigationTimeoutMs,
    });
    console.log(`${logPrefix} Opened detail tab: ${detailPage.url()}`);
  } else {
    await sameTabPromise;
    console.log(`${logPrefix} Detail URL after click: ${page.url()}`);
  }

  const ready = await waitForDetailReady(
    detailPage,
    cert,
    navigationTimeoutMs,
  );
  if (!ready) {
    console.warn(
      `${logPrefix} Detail page not ready after click (${detailPage.url()})`,
    );
  } else {
    console.log(
      `${logPrefix} Detail ready (${detailPage.url()}) title="${ready.title}"` +
        ` cert=${ready.hasCert} bid=${ready.hasPriceUi} sold=${ready.hasSold} altValue=${ready.hasAltValue}`,
    );
  }

  return {
    detailPage,
    sourceUrl: detailPage.url().split("?")[0],
    openedNewTab: detailPage !== page,
  };
}

async function extractItemPrice(page, cert, navigationTimeoutMs = 45_000) {
  await waitForDetailReady(page, cert, Math.min(navigationTimeoutMs, 15_000));

  const text = await page.locator("body").innerText();
  if (
    /access all of the market data.+free account|sign up for free/i.test(text)
  ) {
    return { authRequired: true };
  }

  if (!(await pageMentionsCert(page, cert))) {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 240);
    console.warn(
      `Cert ${cert} not found on detail page ${page.url()}; refusing price. Snippet: ${snippet}`,
    );
    return null;
  }

  // Research pages expose Alt Value via test id. The heading text is often
  // "LT Value" because the leading "A" is an SVG logo, not a text node.
  const altValue = page.locator('[data-testid="alt-value"]').first();
  if (await altValue.isVisible().catch(() => false)) {
    const fromAlt = parseMoney(await altValue.textContent().catch(() => null));
    if (fromAlt > 0) {
      return { value: fromAlt, valueType: "alt_value" };
    }
  }

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

  const fromText = extractCertPrice(text, cert);
  if (fromText) return fromText;

  console.warn(
    `Cert ${cert} present on ${page.url()} but no recognized price UI/text`,
  );
  return null;
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

    // Warm the SPA shell so the first cert search is not racing initial boot.
    console.log("Waiting for Alt browse shell…");
    await page.goto(`${config.altBaseUrl}/browse`, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await waitForSearchShell(page, navigationTimeoutMs);
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
      const logPrefix = `[${index}/${total}]`;
      console.log(`${logPrefix} Searching ${company} ${cert}…`);
      try {
        await openBrowseSearch(
          page,
          cert,
          searchUrl,
          navigationTimeoutMs,
          logPrefix,
        );
        const resultLabels = await waitForBrowseResultButtons(page);
        console.log(
          `${logPrefix} Found ${resultLabels.length} browse result candidate(s) for ${cert}` +
            (resultLabels.length ? `: ${resultLabels.join(" | ")}` : ""),
        );
        const matches = [];
        let authRequired = false;
        for (
          let resultIndex = 0;
          resultIndex < resultLabels.length;
          resultIndex += 1
        ) {
          const label = resultLabels[resultIndex];
          console.log(
            `${logPrefix} Opening candidate ${resultIndex + 1}/${resultLabels.length}: ${label}`,
          );
          const opened = await openBrowseResultAtIndex(
            context,
            page,
            searchUrl,
            cert,
            resultIndex,
            navigationTimeoutMs,
            logPrefix,
          );
          let price = null;
          try {
            price = await extractItemPrice(
              opened.detailPage,
              cert,
              navigationTimeoutMs,
            );
          } finally {
            if (opened.openedNewTab && !opened.detailPage.isClosed()) {
              await opened.detailPage.close().catch(() => {});
            }
          }
          if (price?.authRequired) {
            authRequired = true;
            console.warn(
              `${logPrefix} Auth wall on candidate for ${cert}; skipping`,
            );
            continue;
          }
          if (price?.value > 0) {
            matches.push({
              ...price,
              itemUrl: opened.sourceUrl,
              label,
            });
            console.log(
              `${logPrefix} Candidate ${price.valueType}=$${price.value} for ${cert}`,
            );
          } else {
            console.warn(
              `${logPrefix} No cert-matched price on candidate for ${cert} (${opened.sourceUrl})`,
            );
          }
        }
        if (matches.length === 1) {
          const match = matches[0];
          const sourcePath = String(match.itemUrl || "")
            .split("/")
            .filter(Boolean);
          observations.push({
            card_id: card.id,
            cert_number: cert,
            value: match.value,
            currency: "USD",
            observed_at: new Date().toISOString(),
            source_url: match.itemUrl,
            source_item_id: sourcePath.at(-1) || "",
            metadata: {
              value_type: match.valueType,
              query_url: searchUrl,
              grader: company,
              result_label: match.label,
              ...(match.soldOn ? { sold_on: match.soldOn } : {}),
            },
          });
          results.push({ cardId: card.id, cert, status: "matched", ...match });
          console.log(
            `${logPrefix} Matched ${cert}: $${match.value} (${match.valueType})` +
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
            resultCount: resultLabels.length,
          });
          console.warn(
            `${logPrefix} ${status} for ${cert}` +
              (matches.length ? ` (${matches.length} priced candidates)` : "") +
              (resultLabels.length
                ? ` from ${resultLabels.length} browse result(s)`
                : ""),
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
        console.error(`${logPrefix} Error for ${cert}: ${message}`);
      }
      if (delayMs > 0 && index < total && !page.isClosed()) {
        console.log(`${logPrefix} Waiting ${delayMs}ms before next cert…`);
        try {
          await page.waitForTimeout(delayMs);
        } catch (error) {
          console.warn(
            `${logPrefix} Delay interrupted: ${String(error.message || error)}`,
          );
          break;
        }
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
