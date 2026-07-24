(function () {
  "use strict";

  const MARKET_BASE = "http://127.0.0.1:8000";
  let syncTimer = null;

  function marketId(card) {
    return String(card.remoteId || card.id);
  }

  function activeInventoryPayload() {
    return inventory.filter((card) => !card.sold).map((card) => ({
      id: marketId(card),
      company: card.company || "PSA",
      cert: card.cert || "",
      name: card.name || "",
      grade: card.grade || "",
      cost: Number(card.cost) || 0
    }));
  }

  async function syncMarketInventory() {
    // Cloud-signed-in apps already write inventory to PocketBase. The Windows
    // collector reads it there, so phones never need to contact localhost.
    if (cloudSession?.token) return;
    try {
      await fetch(MARKET_BASE + "/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory: activeInventoryPayload() })
      });
    } catch (error) {
      // The market collector is optional. Slab Ledger continues normally when
      // run.bat is closed or the local bridge is unavailable.
    }
  }

  function syncSoon() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncMarketInventory, 1200);
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function addInterface() {
    const style = document.createElement("style");
    style.textContent = `
      .slab[data-market-card] { cursor:pointer; }
      .slab[data-market-card]:hover { border-color:#9fb6a6; }
      .market-modal {
        position:fixed; inset:0; z-index:1200; display:none; place-items:center;
        padding:20px; background:rgba(8,16,11,.68); backdrop-filter:blur(5px);
      }
      .market-modal.open { display:grid; }
      .market-panel {
        width:min(760px,100%); max-height:min(760px,90vh); overflow:auto;
        border:1px solid #dce5de; border-radius:18px; background:#fff;
        color:#17211b; box-shadow:0 28px 90px rgba(0,0,0,.28);
      }
      .market-head { display:flex; justify-content:space-between; gap:20px; padding:22px 24px; border-bottom:1px solid #e3e8e4; }
      .market-kicker { color:#52705d; font-size:11px; font-weight:800; letter-spacing:.11em; text-transform:uppercase; }
      .market-title { margin:5px 0 0; font-size:20px; line-height:1.25; }
      .market-close { width:36px; height:36px; border:1px solid #dce3dd; border-radius:10px; background:#f5f7f4; cursor:pointer; font-size:20px; }
      .market-body { padding:24px; }
      .market-value-box { display:grid; grid-template-columns:1fr auto; align-items:end; gap:18px; padding:19px; border-radius:14px; background:#eaf2ed; }
      .market-label { color:#5e6d63; font-size:11px; font-weight:750; letter-spacing:.09em; text-transform:uppercase; }
      .market-value { margin-top:3px; font-size:38px; font-weight:850; letter-spacing:-.05em; }
      .market-confidence { color:#46614f; font-size:12px; text-align:right; }
      .market-method { margin:10px 2px 22px; color:#6d776f; font-size:12px; }
      .market-sales { display:grid; gap:9px; }
      .market-sale { display:grid; grid-template-columns:1fr auto; gap:16px; padding:14px 0; border-bottom:1px solid #e7ebe8; }
      .market-sale-title { color:#17211b; font-weight:700; text-decoration:none; }
      .market-sale-title:hover { color:#17663e; text-decoration:underline; }
      .market-sale-meta { margin-top:4px; color:#758078; font-size:11px; }
      .market-sale-price { font-size:18px; font-weight:800; white-space:nowrap; }
      .market-empty { padding:30px 12px; color:#6d776f; text-align:center; }
      .market-error { padding:15px; border-radius:10px; background:#fff0ee; color:#8a332a; }
      .market-search { display:inline-block; margin-top:18px; color:#175b39; font-weight:750; }
      @media(max-width:560px) {
        .market-modal { padding:8px; }
        .market-panel { max-height:96vh; border-radius:14px; }
        .market-value-box { grid-template-columns:1fr; }
        .market-confidence { text-align:left; }
      }
    `;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "marketModal";
    modal.className = "market-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "marketModalTitle");
    modal.innerHTML = `
      <section class="market-panel">
        <header class="market-head">
          <div><div class="market-kicker">eBay sold market</div><h2 class="market-title" id="marketModalTitle">Market details</h2></div>
          <button class="market-close" type="button" aria-label="Close market details">×</button>
        </header>
        <div class="market-body" id="marketModalBody"></div>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector(".market-close").addEventListener("click", closeMarket);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeMarket(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) closeMarket();
    });

    const syncButton = document.getElementById("syncBtn");
    if (syncButton && !document.getElementById("cloudLogoutBtn")) {
      const logout = document.createElement("button");
      logout.id = "cloudLogoutBtn";
      logout.type = "button";
      logout.className = "sync-btn";
      logout.textContent = "Sign out";
      logout.title = "Sign out of PocketBase on this device";
      logout.style.display = cloudSession?.token ? "" : "none";
      logout.addEventListener("click", () => {
        if (!confirm("Sign out of cloud sync on this device? Your local inventory will remain here.")) return;
        cloudSession = null;
        localStorage.removeItem(PB_AUTH_KEY);
        sessionStorage.removeItem("slabLedgerOfflineChosen");
        setSyncStatus("Sign in to sync");
        logout.style.display = "none";
        document.getElementById("cloudPassword").value = "";
        document.getElementById("cloudMessage").textContent = "";
        document.getElementById("cloudModal").classList.add("open");
        document.getElementById("cloudEmail").focus();
      });
      syncButton.insertAdjacentElement("afterend", logout);
    }
  }

  function updateLogoutButton() {
    const logout = document.getElementById("cloudLogoutBtn");
    if (logout) logout.style.display = cloudSession?.token ? "" : "none";
  }

  function closeMarket() {
    document.getElementById("marketModal").classList.remove("open");
    document.body.style.overflow = "";
  }

  async function cloudMarketValue(card) {
    if (!cloudSession?.token || !card.remoteId) return undefined;
    const filter = `card_id = "${String(card.remoteId).replaceAll('"', '\\"')}"`;
    const data = await pbRequest(
      "/api/collections/market_values/records?perPage=1&filter=" + encodeURIComponent(filter)
    );
    const record = data?.items?.[0];
    if (!record) return null;
    let comparables = record.comparables || [];
    if (typeof comparables === "string") {
      try { comparables = JSON.parse(comparables); } catch (error) { comparables = []; }
    }
    return {
      cardId: record.card_id,
      query: record.query || "",
      searchUrl: record.search_url || "",
      marketValue: Number(record.market_value) || 0,
      confidence: record.confidence || "low",
      lastChecked: record.checked_at || record.updated || "",
      comparableCount: Number(record.comparable_count) || 0,
      rejectedCount: Number(record.rejected_count) || 0,
      low: Number(record.low) || 0,
      high: Number(record.high) || 0,
      recentComparables: Array.isArray(comparables) ? comparables : [],
      comparables: Array.isArray(comparables) ? comparables : [],
      error: record.error || ""
    };
  }

  async function localMarketValue(card) {
    const response = await fetch(MARKET_BASE + "/data.json?time=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Market collector did not respond.");
    const data = await response.json();
    return (data.valuations || []).find((item) => String(item.cardId) === marketId(card)) || null;
  }

  async function openMarket(card) {
    const modal = document.getElementById("marketModal");
    const body = document.getElementById("marketModalBody");
    document.getElementById("marketModalTitle").textContent = card.name || "Market details";
    body.innerHTML = '<div class="market-empty">Loading recent sold listings…</div>';
    modal.classList.add("open");
    document.body.style.overflow = "hidden";

    try {
      const cloudValue = await cloudMarketValue(card);
      const value = cloudValue === undefined ? await localMarketValue(card) : cloudValue;
      if (!value) {
        body.innerHTML = `
          <div class="market-empty">
            <strong>No market lookup yet.</strong><br>
            This card is in the paced collection queue. Keep the Windows collector running.
          </div>`;
        return;
      }

      const recent = (value.recentComparables || value.comparables || []).slice(0, 3);
      const sales = recent.map((sale, index) => `
        <article class="market-sale">
          <div>
            <a class="market-sale-title" href="${escapeHtml(sale.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sale.title || "eBay sold listing")}</a>
            <div class="market-sale-meta">Sale ${index + 1}${sale.soldText ? " · " + escapeHtml(sale.soldText) : ""}</div>
          </div>
          <div class="market-sale-price">${money(sale.total || sale.price)}</div>
        </article>`).join("");

      body.innerHTML = `
        <div class="market-value-box">
          <div>
            <div class="market-label">Assumed market price</div>
            <div class="market-value">${value.marketValue ? money(value.marketValue) : "—"}</div>
          </div>
          <div class="market-confidence">
            ${recent.length} recent accepted sale${recent.length === 1 ? "" : "s"}<br>
            ${value.confidence || "low"} confidence
          </div>
        </div>
        <div class="market-method">Average of the latest ${recent.length || 3} accepted sold listing${recent.length === 1 ? "" : "s"}. Obvious title mismatches and price outliers are excluded.</div>
        <div class="market-sales">${sales || '<div class="market-empty">No accepted sold listings were returned yet.</div>'}</div>
        ${value.error ? `<div class="market-error">${escapeHtml(value.error)}</div>` : ""}
        <a class="market-search" href="${escapeHtml(value.searchUrl)}" target="_blank" rel="noopener noreferrer">Review the eBay sold search ↗</a>`;
    } catch (error) {
      body.innerHTML = `
        <div class="market-error">
          The local market collector is not available. Double-click run.bat and leave its window open, then try again.
        </div>`;
    }
  }

  function attachTiles() {
    const shown = visibleInventory();
    const tiles = [...document.querySelectorAll("#inventoryList > .slab:not(.editing)")];
    tiles.forEach((tile, index) => {
      const card = shown[index];
      if (!card || card.sold) return;
      tile.dataset.marketCard = marketId(card);
      tile.title = "Click the card tile for recent eBay sold listings";
      tile.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea, .slab-thumb")) return;
        openMarket(card);
      });
    });
  }

  addInterface();
  const originalRender = render;
  render = function () {
    originalRender();
    attachTiles();
    updateLogoutButton();
    syncSoon();
  };
  setInterval(updateLogoutButton, 2000);
  setInterval(syncMarketInventory, 5 * 60 * 1000);
  window.addEventListener("focus", syncSoon);
  syncSoon();
})();
