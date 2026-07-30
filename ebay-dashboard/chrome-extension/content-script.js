"use strict";

let lastStatus = "";

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
      bestOfferAccepted:/\bbest offer accepted\b/i.test(row.innerText || ""),
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

function inspect() {
  if (pageNeedsOwner()) {
    report("operator_required");
    return;
  }
  const items = collect();
  if (items.length) {
    report("complete", { items });
  }
}

inspect();
const observer = new MutationObserver(() => inspect());
observer.observe(document.documentElement, { childList:true, subtree:true });
setInterval(inspect, 5000);
