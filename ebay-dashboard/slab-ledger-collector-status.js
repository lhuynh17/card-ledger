(function () {
  "use strict";

  let currentStatus = null;
  const STALE_AFTER_MS = 45 * 60 * 1000;
  const ATTENTION_STATES = new Set(["attention", "cooldown", "offline", "error"]);

  function statusState(status) {
    if (!status) return "ready";
    const heartbeat = new Date(status.heartbeat_at || "");
    const stale = !Number.isFinite(heartbeat.getTime()) || Date.now() - heartbeat.getTime() > STALE_AFTER_MS;
    return stale ? "offline" : String(status.status || "ready");
  }

  function statusCopy(status) {
    const state = statusState(status);
    if (!ATTENTION_STATES.has(state)) return null;
    const title = state === "attention" ? "Market price needs review"
      : state === "offline" ? "Windows collector is offline"
        : state === "cooldown" ? "Windows collector is paused"
          : "Windows collector needs attention";
    const fallback = state === "offline"
      ? "On the Windows computer, confirm Tailscale, Chrome, and the Slab Ledger collector window are running."
      : state === "cooldown"
        ? "The collector paused after an eBay block or verification page. Check Chrome on the Windows computer."
        : "Open this card's Market details to verify the proposed sale. Nothing changes until you choose Use or Reject.";
    return { state, title, message:String(status?.safe_message || fallback) };
  }

  function reviewCopy(cardId) {
    const value = window.slabMarketByCard?.get(String(cardId));
    if (value?.pendingBestOffers?.length) return {
      state:"attention", title:"Best Offer price needs review",
      message:"Open this card's Market details and Product Research to enter the actual accepted price."
    };
    if (value?.reviewCandidates?.length) return {
      state:"attention", title:"Possible sale needs review",
      message:"Open this card's Market details to check the listing, then choose Use this sale or Reject."
    };
    return null;
  }

  function closePopover() {
    document.getElementById("collectorStatusPopover")?.classList.remove("open");
    document.querySelectorAll(".collector-alert-dot[aria-expanded=true]")
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function openPopover(button, copy) {
    const popover = document.getElementById("collectorStatusPopover");
    if (!popover) return;
    document.getElementById("collectorStatusPopoverTitle").textContent = copy.title;
    document.getElementById("collectorStatusPopoverMessage").textContent = copy.message;
    document.querySelectorAll(".collector-alert-dot[aria-expanded=true]")
      .forEach((item) => item.setAttribute("aria-expanded", "false"));
    button.setAttribute("aria-expanded", "true");
    popover.className = `collector-status-popover ${copy.state} open`;
    const rect = button.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const below = rect.bottom + 8;
    const top = below + 180 < window.innerHeight ? below : Math.max(12, rect.top - 188);
    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function addBadge(target, copy, global = false) {
    if (!target || target.querySelector(":scope > .collector-alert-dot")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "collector-alert-dot" + (global ? " global" : "");
    button.textContent = "!";
    button.setAttribute("aria-label", copy.title);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.getAttribute("aria-expanded") === "true") closePopover();
      else openPopover(button, copy);
    });
    target.appendChild(button);
  }

  function decorate() {
    document.querySelectorAll(".collector-alert-dot").forEach((button) => button.remove());
    const status = statusCopy(currentStatus);
    const statusCardId = String(currentStatus?.card_id || "");
    let statusPlaced = false;
    document.querySelectorAll("#inventoryList > .slab[data-market-card]").forEach((tile) => {
      const cardId = String(tile.dataset.marketCard || "");
      const copy = reviewCopy(cardId) || (statusCardId === cardId ? status : null);
      if (copy) {
        addBadge(tile, copy);
        if (statusCardId === cardId) statusPlaced = true;
      }
    });
    if (status && !statusPlaced) addBadge(document.getElementById("activeTab"), status, true);
  }

  function install() {
    if (document.getElementById("collectorStatusPopover")) return;
    const style = document.createElement("style");
    style.textContent = `
      #inventoryList>.slab[data-market-card]{position:relative}
      .collector-alert-dot{position:absolute;z-index:4;top:8px;right:8px;display:grid;width:24px;height:24px;min-width:24px;min-height:24px;place-items:center;padding:0;border:2px solid var(--surface);border-radius:50%;background:#e5484d;color:#fff;font:850 14px/1 var(--font-body);box-shadow:0 2px 9px rgba(0,0,0,.34);cursor:pointer}
      .collector-alert-dot.global{top:-8px;right:-8px;width:20px;height:20px;min-width:20px;min-height:20px;font-size:12px}
      #activeTab{position:relative}
      .collector-status-popover{position:fixed;z-index:1500;display:none;box-sizing:border-box;padding:13px 36px 13px 14px;border:1px solid #d85d61;border-radius:12px;background:var(--surface);color:var(--text);box-shadow:0 14px 45px rgba(0,0,0,.42)}
      .collector-status-popover.open{display:block}.collector-status-popover.cooldown,.collector-status-popover.offline{border-color:#d0a936}
      .collector-status-popover strong{display:block;font-size:13px}.collector-status-popover p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      .collector-status-popover button{position:absolute;top:7px;right:7px;width:28px;height:28px;padding:0;border:0;background:transparent;color:var(--muted);font-size:20px;cursor:pointer}
    `;
    document.head.appendChild(style);
    const popover = document.createElement("aside");
    popover.id = "collectorStatusPopover";
    popover.className = "collector-status-popover";
    popover.setAttribute("role", "status");
    popover.innerHTML = `<button type="button" aria-label="Close notification">×</button><strong id="collectorStatusPopoverTitle"></strong><p id="collectorStatusPopoverMessage"></p>`;
    popover.querySelector("button").addEventListener("click", closePopover);
    document.body.appendChild(popover);
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#collectorStatusPopover,.collector-alert-dot")) closePopover();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });
    // Watch only tile replacement. Badge insertion happens inside a tile and
    // must not recursively trigger another decoration pass.
    new MutationObserver(decorate).observe(document.getElementById("inventoryList"), { childList:true });
  }

  async function refresh() {
    if (!cloudSession?.token) {
      currentStatus = null;
      decorate();
      return;
    }
    try {
      const result = await pbRequest("/api/collections/marketplace_collector_status/records?perPage=1&sort=-heartbeat_at");
      currentStatus = result?.items?.[0] || null;
    } catch (_) {
      currentStatus = null;
    }
    decorate();
  }

  install();
  refresh();
  setInterval(refresh, 60000);
  window.addEventListener("slab-cloud-synced", refresh);
  window.addEventListener("slab-market-updated", decorate);
  window.addEventListener("focus", refresh);
})();
