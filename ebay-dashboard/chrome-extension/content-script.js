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

function collect() {
  return [...document.querySelectorAll("li.s-item")].map((row) => {
    const link = row.querySelector("a.s-item__link");
    const url = link?.href || "";
    return {
      id:itemId(url),
      title:text(row, ".s-item__title"),
      priceText:text(row, ".s-item__price"),
      shippingText:text(row, ".s-item__shipping, .s-item__logisticsCost"),
      condition:text(row, ".SECONDARY_INFO"),
      soldText:text(row, ".s-item__title--tagblock, .s-item__caption"),
      url,
    };
  }).filter((item) => item.id && item.title && item.priceText);
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
