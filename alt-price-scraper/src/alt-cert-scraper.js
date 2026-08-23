import fs from "node:fs";
import { config, randomScrapeDelayMs } from "./config.js";

const MONEY = /\$([\d,]+(?:\.\d{2})?)/;
const UNRESOLVED_STATUSES = new Set(["pending", "unpaid", "relisted"]);
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

/** Prefer /itm/{id} over a trailing path like /research. */
export function sourceItemIdFromAltUrl(url) {
  const match = String(url || "").match(/\/itm\/([^/?#]+)/i);
  return match ? match[1] : "";
}

export function isUnresolvedTransactionStatus(status) {
  return UNRESOLVED_STATUSES.has(String(status || "").trim().toLowerCase());
}

export function transactionObservedAt(dateText) {
  const parsed = new Date(String(dateText || "").trim());
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function unwrapAffiliateDestination(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""), "https://alt.xyz");
    const nested = url.searchParams.get("u");
    if (nested && /^https?:\/\//i.test(nested)) return nested;
  } catch {
    // fall through
  }
  return String(rawUrl || "");
}

/**
 * Durable venue listing id for Recent Transactions rows.
 * Collector channel remains source=alt; this id is the sale/listing identity.
 */
export function sourceItemIdFromTransactionUrl(rawUrl) {
  const absolute = unwrapAffiliateDestination(rawUrl);
  let url;
  try {
    url = new URL(absolute, "https://alt.xyz");
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname;

  const ebay = path.match(/\/itm\/(\d+)\b/i);
  if (ebay && /(^|\.)ebay\.com$/i.test(host)) {
    return `ebay:itm:${ebay[1]}`;
  }

  const fanatics = path.match(/\/weekly\/([0-9a-f-]{36})\b/i);
  if (
    fanatics &&
    /(fanaticscollect\.com|pwccmarketplace\.com)$/i.test(host)
  ) {
    return `fanatics:weekly:${fanatics[1]}`;
  }

  const goldin = path.match(/\/item\/([^/?#]+)/i);
  if (goldin && /(^|\.)goldin\.(co|com)$/i.test(host)) {
    return `goldin:item:${goldin[1]}`;
  }

  const altItem = path.match(/\/item\/([0-9a-f-]{36})\b/i);
  if (altItem && /(^|\.)alt\.xyz$/i.test(host)) {
    return `alt:item:${altItem[1]}`;
  }

  return "";
}

export function marketplaceFromTransaction(url, label) {
  const id = sourceItemIdFromTransactionUrl(url);
  if (id.startsWith("ebay:")) return "ebay";
  if (id.startsWith("fanatics:")) return "fanatics";
  if (id.startsWith("goldin:")) return "goldin";
  if (id.startsWith("alt:")) return "alt";
  const fromLabel = String(label || "").trim();
  if (/ebay/i.test(fromLabel)) return "ebay";
  if (/fanatics|pwcc/i.test(fromLabel)) return "fanatics";
  if (/goldin/i.test(fromLabel)) return "goldin";
  if (/^alt$/i.test(fromLabel)) return "alt";
  return fromLabel ? fromLabel.toLowerCase() : "unknown";
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

async function ensureResearchPage(page, navigationTimeoutMs) {
  const current = page.url();
  const match = current.match(/^(https?:\/\/[^/?#]+\/itm\/[^/?#]+)/i);
  if (!match) return current;
  if (/\/research(?:\/|$|\?|#)/i.test(current)) return current;
  const researchUrl = `${match[1]}/research`;
  await page.goto(researchUrl, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeoutMs,
  });
  return page.url();
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
      const hasRecentHeading = [...document.querySelectorAll("h2, h3, h4")].some(
        (node) =>
          /^\s*recent transactions\s*$/i.test(
            (node.textContent || "").replace(/\s+/g, " ").trim(),
          ),
      );
      return {
        hasCert: text.replace(/\D/g, "").includes(digits),
        hasRecentHeading,
        hasNoTransactions: /\bno (?:recent )?transactions\b/i.test(text),
        hasPriceUi: Boolean(
          document.querySelector('[data-testid="current-bid-price"]'),
        ),
        hasSold: /sold on (auctions|fixed price)/i.test(text),
        hasAltValue:
          Boolean(document.querySelector('[data-testid="alt-value"]')) ||
          /(?:^|\s)(?:alt\s+)?lt\s+value/i.test(text),
        hasMoney: /\$[\d,]+/.test(text),
        title: document.title || "",
      };
    }, certDigits);
    if (
      state.hasCert &&
      (state.hasRecentHeading ||
        state.hasNoTransactions ||
        state.hasPriceUi ||
        state.hasSold ||
        state.hasAltValue ||
        state.hasMoney)
    ) {
      return state;
    }
    if (
      state.hasRecentHeading ||
      state.hasNoTransactions ||
      state.hasPriceUi ||
      state.hasSold ||
      state.hasAltValue
    ) {
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

  const researchUrl = await ensureResearchPage(
    detailPage,
    navigationTimeoutMs,
  );
  console.log(`${logPrefix} Research URL: ${researchUrl}`);

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
        ` cert=${ready.hasCert} recent=${ready.hasRecentHeading}` +
        ` none=${ready.hasNoTransactions}`,
    );
  }

  return {
    detailPage,
    sourceUrl: detailPage.url().split("?")[0],
    openedNewTab: detailPage !== page,
  };
}

/**
 * Visible Recent Transactions preview only (no View All drawer).
 */
async function extractRecentTransactions(page, cert, navigationTimeoutMs = 45_000) {
  await ensureResearchPage(page, navigationTimeoutMs);
  await waitForDetailReady(page, cert, Math.min(navigationTimeoutMs, 15_000));

  const text = await page.locator("body").innerText();
  if (
    /access all of the market data.+free account|sign up for free/i.test(text)
  ) {
    return { authRequired: true, present: false, rows: [] };
  }

  if (!(await pageMentionsCert(page, cert))) {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 240);
    console.warn(
      `Cert ${cert} not found on detail page ${page.url()}; refusing transactions. Snippet: ${snippet}`,
    );
    return { present: false, rows: [], certMissing: true };
  }

  const extracted = await page.evaluate(() => {
    const normalize = (value) =>
      String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const heading = [...document.querySelectorAll("h2, h3, h4")].find((node) =>
      /^recent transactions$/i.test(normalize(node.textContent)),
    );
    if (!heading) {
      const body = normalize(document.body?.innerText || "");
      if (/\bno (?:recent )?transactions\b/i.test(body)) {
        return { present: true, rows: [] };
      }
      return { present: false, rows: [] };
    }

    let section = heading.parentElement;
    for (let depth = 0; depth < 6 && section; depth += 1) {
      if (section.querySelector("a[href]")) break;
      section = section.parentElement;
    }
    if (!section) return { present: true, rows: [] };

    const rows = [];
    const seen = new Set();
    for (const anchor of section.querySelectorAll("a[href]")) {
      const href = anchor.href || anchor.getAttribute("href") || "";
      if (!href || seen.has(href)) continue;
      const rowText = normalize(anchor.innerText || anchor.textContent || "");
      if (!rowText) continue;
      const priceMatch = rowText.match(/\$([\d,]+(?:\.\d{2})?)/);
      const dateMatch = rowText.match(
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i,
      );
      if (!priceMatch || !dateMatch) continue;
      const saleTypeMatch = rowText.match(
        /\b(Auction|Best offer|Buy now)\b/i,
      );
      const statusMatch = rowText.match(/\b(Pending|Unpaid|Relisted)\b/i);
      const img = anchor.querySelector("img[alt]");
      seen.add(href);
      rows.push({
        href,
        marketplaceLabel: img?.getAttribute("alt") || "",
        saleType: saleTypeMatch?.[1] || "",
        dateText: dateMatch[0],
        price: Number(priceMatch[1].replaceAll(",", "")),
        status: statusMatch?.[1] || "",
      });
    }
    return { present: true, rows };
  });

  return extracted;
}

function absoluteSourceUrl(href) {
  try {
    return new URL(String(href || ""), config.altBaseUrl).toString().split("#")[0];
  } catch {
    return String(href || "").split("#")[0];
  }
}

function observationFromTransaction(card, cert, company, searchUrl, itemUrl, row) {
  const sourceUrl = absoluteSourceUrl(row.href);
  const sourceItemId = sourceItemIdFromTransactionUrl(sourceUrl);
  const marketplace = marketplaceFromTransaction(
    sourceUrl,
    row.marketplaceLabel,
  );
  const unresolved = isUnresolvedTransactionStatus(row.status);
  return {
    card_id: card.id,
    cert_number: cert,
    value: row.price,
    currency: "USD",
    observed_at: transactionObservedAt(row.dateText),
    source_url: sourceUrl,
    source_item_id: sourceItemId,
    match_status: unresolved ? "unmatched" : "matched",
    metadata: {
      value_type: "recent_transaction",
      query_url: searchUrl,
      research_url: itemUrl,
      grader: company,
      marketplace,
      marketplace_label: row.marketplaceLabel || undefined,
      sale_type: row.saleType || undefined,
      sold_on: row.dateText,
      transaction_status: row.status || "",
      counts_toward_valuation: !unresolved,
    },
  };
}

export async function scrapeInventoryFromAlt(
  cards,
  {
    headed = true,
    navigationTimeoutMs = config.navigationTimeoutMs,
    delayMinMs = config.scrapeDelayMinMs,
    delayMaxMs = config.scrapeDelayMaxMs,
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
    console.log(`Scraping ${total} cert(s) from Alt Recent Transactions…`);
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
          let extracted = null;
          try {
            extracted = await extractRecentTransactions(
              opened.detailPage,
              cert,
              navigationTimeoutMs,
            );
          } finally {
            if (opened.openedNewTab && !opened.detailPage.isClosed()) {
              await opened.detailPage.close().catch(() => {});
            }
          }
          if (extracted?.authRequired) {
            authRequired = true;
            console.warn(
              `${logPrefix} Auth wall on candidate for ${cert}; skipping`,
            );
            continue;
          }
          if (extracted?.certMissing) {
            console.warn(
              `${logPrefix} Cert not on candidate for ${cert} (${opened.sourceUrl})`,
            );
            continue;
          }
          matches.push({
            itemUrl: opened.sourceUrl,
            label,
            present: Boolean(extracted?.present),
            rows: Array.isArray(extracted?.rows) ? extracted.rows : [],
          });
          console.log(
            `${logPrefix} Candidate recent transactions: present=${Boolean(extracted?.present)} rows=${extracted?.rows?.length || 0}`,
          );
        }
        if (matches.length === 1) {
          const match = matches[0];
          const usableRows = match.rows.filter((row) => row.price > 0);
          for (const row of usableRows) {
            const observation = observationFromTransaction(
              card,
              cert,
              company,
              searchUrl,
              match.itemUrl,
              row,
            );
            if (!observation.source_item_id) {
              console.warn(
                `${logPrefix} Skipping row without durable id (${row.href})`,
              );
              continue;
            }
            observations.push(observation);
          }
          const status = !match.present
            ? "no_transactions_section"
            : usableRows.length
              ? "matched"
              : "no_transactions";
          results.push({
            cardId: card.id,
            cert,
            status,
            transactionCount: usableRows.length,
            itemUrl: match.itemUrl,
          });
          console.log(
            `${logPrefix} ${status} for ${cert}: ${usableRows.length} visible transaction(s)`,
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
              (matches.length ? ` (${matches.length} cert-matched candidates)` : "") +
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
      if (delayMaxMs > 0 && index < total && !page.isClosed()) {
        const delayMs = randomScrapeDelayMs(delayMinMs, delayMaxMs);
        console.log(
          `${logPrefix} Waiting ${delayMs}ms before next cert (${delayMinMs}-${delayMaxMs}ms)…`,
        );
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
