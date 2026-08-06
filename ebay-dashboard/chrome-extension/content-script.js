"use strict";

let lastStatus = "";
const startedAt = Date.now();

function text(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function pageNeedsOwner() {
  const body = document.body?.innerText?.toLowerCase() || "";
  return [
    "please verify yourself",
    "pardon our interruption",
    "security check",
    "are you a human",
    "unusual activity",
    "sign in to your account",
    "hcaptcha",
  ].some((marker) => body.includes(marker));
}

function altPageNeedsOwner() {
  const body = document.body?.innerText?.toLowerCase() || "";
  return [
    "verify you are human", "security check", "unusual activity", "captcha",
  ].some((marker) => body.includes(marker));
}

function itemId(url) {
  return url.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1] || "";
}

function firstText(node, selectors) {
  for (const selector of selectors) {
    const value = text(node, selector);
    if (value) return value;
  }
  return "";
}

function listingCard(link) {
  return link.closest(
    "li.s-item, li.s-card, li[class*='s-card'], div.s-card, div[class*='s-card'], article"
  ) || link.parentElement;
}

function soldLabel(row) {
  const labeled = firstText(row, [
    ".s-item__title--tagblock",
    ".s-item__caption",
    ".s-card__caption",
    "[class*='caption']",
  ]);
  if (/\bsold\b/i.test(labeled)) return labeled;
  return row.innerText?.match(/\bSold\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/i)?.[0] || "";
}

function collect() {
  const seen = new Set();
  return [...document.querySelectorAll("a[href*='/itm/']")].map((link) => {
    const url = link?.href || "";
    const id = itemId(url);
    if (!id || seen.has(id)) return null;
    const row = listingCard(link);
    if (!row) return null;
    const title = firstText(row, [
      ".s-item__title",
      ".s-card__title",
      "[class*='card__title']",
      "[class*='item__title']",
    ]) || link.getAttribute("aria-label") || link.querySelector("img")?.alt?.trim() || "";
    const priceText = firstText(row, [
      ".s-item__price",
      ".s-card__price",
      "[class*='card__price']",
      "[class*='item__price']",
    ]);
    if (!title || !priceText) return null;
    seen.add(id);
    return {
      id,
      title,
      priceText,
      shippingText:firstText(row, [
        ".s-item__shipping",
        ".s-item__logisticsCost",
        ".s-card__shipping",
        "[class*='shipping']",
      ]),
      condition:firstText(row, [
        ".SECONDARY_INFO",
        ".s-card__condition",
        "[class*='condition']",
      ]),
      soldText:soldLabel(row),
      bestOfferAccepted:/\b(?:or\s+)?best offer(?:\s+accepted)?\b/i.test(
        row.innerText || ""
      ),
      url,
    };
  }).filter(Boolean);
}

function report(status, payload = {}) {
  if (lastStatus === status) return;
  lastStatus = status;
  chrome.runtime.sendMessage({
    type:"SLAB_LEDGER_PAGE_RESULT",
    status,
    ...payload,
  }).catch(() => {});
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function typeNormally(input, value) {
  input.focus();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;
  if (setValue) setValue.call(input, "");
  else input.value = "";
  input.dispatchEvent(new Event("input", { bubbles:true }));
  for (const character of value) {
    const nextValue = input.value + character;
    if (setValue) setValue.call(input, nextValue);
    else input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles:true }));
    await wait(120 + Math.floor(Math.random() * 140));
  }
  input.dispatchEvent(new Event("change", { bubbles:true }));
}

function altSearchInput() {
  return [...document.querySelectorAll("input")].find((input) => {
    const label = `${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`;
    return /name\s+or\s+cert|cert\s*#/i.test(label);
  }) || null;
}

function altExactResultButton(job) {
  const expected = job.expectedIdentity || {};
  const normalize = SlabAltAdapter.normalized;
  const year = normalize(expected.year);
  const number = normalize(expected.cardNumber).replace(/^0+/, "");
  const subjectTokens = normalize(expected.subject || expected.name)
    .split(" ").filter((token) => token.length >= 3 && ![
      "POKEMON", "JAPANESE", "ENGLISH", "HOLO", "CARD", "THE",
      "PROMO", "PSA", "GEM", "MINT",
    ].includes(token)).slice(0, 5);
  const candidates = [...document.querySelectorAll("main button")].filter((button) => {
    const value = normalize(button.innerText || button.textContent || "");
    if (value.length < 12) return false;
    const yearMatches = !year || value.includes(year);
    const numberMatches = !number || new RegExp(
      `(?:^| )0*${number}(?:[A-Z]*)(?: |$)`
    ).test(value);
    const subjectMatches = subjectTokens.length === 0 || subjectTokens.some(
      (token) => value.includes(token)
    );
    return yearMatches && numberMatches && subjectMatches;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function altRow(anchor) {
  return anchor.closest(
    "article, li, [role='listitem'], [class*='listing'], [class*='result'], [class*='card']"
  ) || anchor.parentElement;
}

function altPriceText(row) {
  return row?.innerText?.match(/(?:US\s*)?\$[\d,]+(?:\.\d{2})?/i)?.[0] || "";
}

function altSoldDate(rowText) {
  return rowText.match(/\b(?:Sold\s+(?:on\s+)?)?([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})\b/i)?.[1] || "";
}

function altPageTitle() {
  return [...document.querySelectorAll("main h1, main h2, h1, h2")]
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
    .find((value) => /\b(?:PSA|BGS|CGC|SGC)\b/i.test(value) || /#\w+/.test(value))
    || document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim()
    || "Alt card";
}

function altCompactRow(priceNode) {
  let row = priceNode;
  for (let depth = 0; row?.parentElement && depth < 12; depth += 1) {
    const text = row.innerText?.replace(/\s+/g, " ").trim() || "";
    const hasContext = /\b(?:fixed price|auction|buy now|offer|bid|listing)\b/i.test(text)
      || Boolean(altSoldDate(text));
    if (hasContext && text.length <= 1500) return row;
    row = row.parentElement;
  }
  return priceNode.parentElement;
}

function altRowUrl(row) {
  const link = row?.closest?.("a[href]") || row?.querySelector?.("a[href]");
  return link?.href || location.href;
}

function collectAltResearchRows() {
  const soldItems = [];
  const activeItems = [];
  const seen = new Set();
  const pageTitle = altPageTitle();
  // Alt's research screen currently has no semantic <main> wrapper. Search
  // the rendered page, then keep only compact rows with transaction/listing
  // context so the Alt Value and unrelated recommendations are ignored.
  const priceNodes = [...document.querySelectorAll("body *")].filter((node) => {
    if (node.children.length > 0) return false;
    return /^(?:US\s*)?\$[\d,]+(?:\.\d{2})?$/.test(
      node.textContent?.replace(/\s+/g, " ").trim() || ""
    );
  });
  priceNodes.forEach((priceNode, index) => {
    const row = altCompactRow(priceNode);
    const rowText = row?.innerText?.replace(/\s+/g, " ").trim() || "";
    const priceText = priceNode.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!rowText || !priceText) return;
    const soldAt = altSoldDate(rowText);
    const role = soldAt ? "sold" : (
      /\b(?:fixed price|buy now|offer|listing)\b/i.test(rowText) ? "active" : ""
    );
    if (!role) return;
    const url = altRowUrl(row);
    const key = `${role}|${soldAt}|${priceText}|${rowText}`;
    if (seen.has(key)) return;
    seen.add(key);
    const marketplace = rowText.match(/\b(?:eBay|Card Hobby|Heritage|Goldin|PWCC|Alt)\b/i)?.[0] || "Alt";
    const item = {
      id:`alt-${role}-${index}-${soldAt || priceText}`,
      title:`${pageTitle} — ${marketplace} ${role === "sold" ? "sale" : "listing"}`,
      priceText,
      url,
    };
    if (role === "sold") {
      soldItems.push({ ...item, soldText:`Sold ${soldAt}`, soldAt });
    } else {
      activeItems.push(item);
    }
  });
  return { soldItems, activeItems };
}

function collectAltRows() {
  const seen = new Set();
  const soldItems = [];
  const activeItems = [];
  for (const anchor of document.querySelectorAll("a[href]")) {
    const url = anchor.href || "";
    const allowedUrl = (
      /^https:\/\/(?:[a-z0-9-]+\.)?alt\.xyz\//i.test(url)
      || /^https:\/\/www\.ebay\.com\/itm\//i.test(url)
    );
    if (!allowedUrl || seen.has(url)) continue;
    const row = altRow(anchor);
    const rowText = row?.innerText?.replace(/\s+/g, " ").trim() || "";
    const priceText = altPriceText(row);
    if (!rowText || !priceText) continue;
    let title = (
      anchor.getAttribute("aria-label") || anchor.textContent ||
      row.querySelector("h1,h2,h3,h4,[class*='title']")?.textContent || ""
    ).replace(/\s+/g, " ").trim();
    if (!title) continue;
    seen.add(url);
    const raw = {
      id:url.match(/(?:asset|listing|item|card)[\/-]([A-Za-z0-9_-]+)/i)?.[1] || url,
      title, priceText, url,
    };
    const soldAt = altSoldDate(rowText);
    if (soldAt && (/\bsold\b/i.test(rowText) || (
      /^https:\/\/www\.ebay\.com\/itm\//i.test(url)
      && /\b(?:auction|sale|fixed price)\b/i.test(rowText)
    ))) {
      const assetTitle = document.querySelector("main h1")?.textContent
        ?.replace(/\s+/g, " ").trim();
      if (assetTitle && !title.includes(assetTitle)) {
        title = `${assetTitle} — ${title}`;
        raw.title = title;
      }
      soldItems.push({ ...raw, soldText:`Sold ${soldAt}`, soldAt });
    } else if (/\b(?:available|active|listing|buy now|buy\s*\/\s*offer|for sale|bid)\b/i.test(rowText)) {
      activeItems.push(raw);
    }
  }
  const research = collectAltResearchRows();
  return {
    soldItems:[...soldItems, ...research.soldItems],
    activeItems:[...activeItems, ...research.activeItems],
  };
}

function altIdentityText(cert) {
  const exact = String(cert || "").replace(/\D/g, "");
  const candidates = [...document.querySelectorAll(
    "article, li, [role='listitem'], [class*='asset'], [class*='result'], [class*='card'], main"
  )];
  const match = candidates.find((node) => {
    return (node.innerText || "").replace(/\D/g, "").includes(exact);
  });
  const rendered = match?.innerText || "";
  const structured = [...document.querySelectorAll("script")].find((script) => {
    const value = script.textContent || "";
    return new RegExp(
      `(?:Certification Number|certificationNumber|certNumber)[^0-9]{0,80}${exact}(?:\\D|$)`,
      "i"
    ).test(value);
  });
  if (!structured) return "";
  const mainText = document.querySelector("main")?.innerText || rendered;
  return `${mainText} PSA Certification Number ${exact}`;
}

async function inspectAlt(job) {
  if (altPageNeedsOwner()) {
    report("operator_required");
    return;
  }
  const cert = String(job.cert || "").replace(/\D/g, "");
  if (!cert || job.provider !== "alt") return;
  const input = altSearchInput();
  const pageText = document.body?.innerText || "";
  const inputHasCert = String(input?.value || "").replace(/\D/g, "") === cert;
  if (!pageText.replace(/\D/g, "").includes(cert) && input && !inputHasCert) {
    if (sessionStorage.getItem(`slab-alt-search-${job.id}`) !== "started") {
      sessionStorage.setItem(`slab-alt-search-${job.id}`, "started");
      await typeNormally(input, cert);
      await wait(500 + Math.floor(Math.random() * 700));
      const form = input.closest("form");
      if (form?.requestSubmit) form.requestSubmit();
      else input.dispatchEvent(new KeyboardEvent("keydown", {
        key:"Enter", code:"Enter", bubbles:true,
      }));
    }
    return;
  }
  const identityText = altIdentityText(cert);
  if (!identityText && inputHasCert) {
    const itemUrls = [...new Set(
      [...document.querySelectorAll("a[href^='/itm/']")].map((link) => link.href)
    )];
    const resultButton = altExactResultButton(job);
    if (
      (itemUrls.length === 1 || resultButton)
      && sessionStorage.getItem(`slab-alt-detail-${job.id}`) !== "opened"
    ) {
      sessionStorage.setItem(`slab-alt-detail-${job.id}`, "opened");
      sessionStorage.setItem(
        `slab-alt-active-${job.id}`,
        JSON.stringify(collectAltRows().activeItems.slice(0, 3))
      );
      await wait(700 + Math.floor(Math.random() * 900));
      if (resultButton) resultButton.click();
      else location.href = itemUrls[0];
      return;
    }
  }
  if (identityText) {
    const collected = collectAltRows();
    let browseActive = [];
    try {
      browseActive = JSON.parse(
        sessionStorage.getItem(`slab-alt-active-${job.id}`) || "[]"
      );
    } catch (_) {
      browseActive = [];
    }
    const normalized = SlabAltAdapter.normalizeResult(
      {
        identityText,
        soldItems:collected.soldItems,
        activeItems:[...browseActive, ...collected.activeItems],
      },
      job.expectedIdentity || {}
    );
    report("complete", {
      identity:{
        exact:normalized.exact,
        checks:normalized.checks,
        text:identityText.replace(/\s+/g, " ").trim().slice(0, 4000),
      },
      soldItems:normalized.soldItems,
      activeItems:normalized.activeItems,
    });
    return;
  }
  if (Date.now() - startedAt > 15000) {
    report("complete", {
      identity:{ exact:false, reason:"exact_cert_not_found" },
      soldItems:[], activeItems:[],
    });
  }
}

function inspectEbay() {
  if (pageNeedsOwner()) {
    report("operator_required");
    return;
  }
  const items = collect();
  if (items.length) {
    report("complete", { items });
  }
}

async function inspect() {
  if (/(?:^|\.)alt\.xyz$/i.test(location.hostname)) {
    const response = await chrome.runtime.sendMessage({
      type:"SLAB_LEDGER_GET_ACTIVE_JOB",
    }).catch(() => null);
    if (response?.job) await inspectAlt(response.job);
    return;
  }
  inspectEbay();
}

function runInspectSafely() {
  inspect().catch(() => {});
}

runInspectSafely();
const observer = new MutationObserver(runInspectSafely);
observer.observe(document.documentElement, { childList:true, subtree:true });
setInterval(runInspectSafely, 5000);
