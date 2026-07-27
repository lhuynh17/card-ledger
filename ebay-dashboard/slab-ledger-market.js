(function () {
  "use strict";

  const DAY = 86400000;
  const values = window.slabMarketByCard || new Map();
  window.slabMarketByCard = values;
  const idFor = (card) => String(card.remoteId || card.id);
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const jsonArray = (value) => {
    if (Array.isArray(value)) return value;
    try { return JSON.parse(value || "[]"); } catch (_) { return []; }
  };
  const shortDate = (value) => {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  };

  function fromRecord(record) {
    const comparables = jsonArray(record.comparables);
    return {
      recordId:record.id, cardId:String(record.card_id),
      marketValue:Number(record.market_value) || 0,
      lastChecked:record.checked_at || record.updated || "",
      source:record.source || "eBay Product Research",
      notes:record.notes || "", comparables,
      history:jsonArray(record.history), searchUrl:record.search_url || "",
      confidence:record.confidence || "low"
    };
  }

  function age(value) {
    if (!value?.lastChecked) return { text:"Never valued", kind:"missing" };
    const checked = new Date(value.lastChecked);
    if (!Number.isFinite(checked.getTime())) return { text:"Never valued", kind:"missing" };
    const days = Math.max(0, Math.floor((Date.now() - checked.getTime()) / DAY));
    if (days <= 30) return { text:"Current", kind:"current" };
    if (days <= 90) return { text:`${days} days old`, kind:"aging" };
    return { text:`${days} days old`, kind:"stale" };
  }

  async function loadAll() {
    if (!cloudSession?.token) return;
    try {
      const data = await pbRequest("/api/collections/market_values/records?perPage=500&sort=-checked_at");
      values.clear();
      for (const row of data?.items || []) {
        const value = fromRecord(row);
        if (!values.has(value.cardId)) values.set(value.cardId, value);
      }
      render();
      window.dispatchEvent(new CustomEvent("slab-market-updated"));
    } catch (error) {
      console.warn("Market values unavailable:", error);
    }
  }

  function installUi() {
    const style = document.createElement("style");
    style.textContent = `
      .slab[data-market-card]{cursor:pointer}.slab[data-market-card]:hover{border-color:#8cab97}
      .market-age{display:inline-flex;margin-top:8px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:750}
      .market-age.current{background:#e3f5e9;color:#24633d}.market-age.aging{background:#fff3d2;color:#765b10}
      .market-age.stale{background:#ffe5e1;color:#8a352c}.market-age.missing{background:var(--surface-2);color:var(--muted)}
      .market-modal{position:fixed;inset:0;z-index:1200;display:none;place-items:center;padding:16px;background:rgba(7,13,10,.75);backdrop-filter:blur(5px)}
      .market-modal.open{display:grid}.market-panel{width:min(800px,100%);max-height:94vh;overflow:auto;border-radius:17px;background:#fff;color:#17211b;box-shadow:0 28px 90px #0006}
      .market-head{display:flex;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid #e2e8e3}.market-head h2{margin:4px 0 0;font-size:20px}
      .market-kicker{color:#52705d;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.market-close{width:38px;height:38px;border:1px solid #dce3dd;border-radius:10px;background:#f5f7f4;font-size:21px;cursor:pointer}
      .market-body{padding:22px}.market-summary{display:flex;justify-content:space-between;gap:15px;padding:17px;border-radius:13px;background:#eaf2ed}
      .market-summary small{display:block;color:#5e6d63;font-weight:750;text-transform:uppercase}.market-price{color:#2f8b56;font-size:36px;font-weight:850}.market-status{text-align:right;color:#52675a;font-size:12px}
      .manual-comps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:11px;margin-top:18px}.market-help{grid-column:1/-1;margin:0;color:#52675a;font-size:12px}.comp-row{grid-column:1/-1;display:grid;grid-template-columns:minmax(120px,140px) minmax(0,1fr);align-items:start;gap:11px;padding:11px;border:1px solid #e1e7e2;border-radius:11px;background:#fafbfa}.mf{display:grid;min-width:0;grid-template-rows:minmax(28px,auto) auto;align-content:start;gap:5px}.mf.full{grid-column:1/-1}.mf label{display:flex;min-height:28px;align-items:flex-end;font-size:11px;font-weight:750;line-height:1.2;color:#536159}
      .mf input,.mf select,.mf textarea{box-sizing:border-box;width:100%;min-height:42px;padding:9px;border:1px solid #d7e0d9;border-radius:9px;background:#fff;color:#17211b;font:inherit}.mf textarea{min-height:70px}
      .market-research-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:9px}.market-research-actions a,.market-research-actions button,.market-actions button{box-sizing:border-box;min-height:42px;padding:10px 13px;border:1px solid #d5ddd7;border-radius:9px;background:#f5f7f4;color:#17462f;font-weight:750;text-decoration:none;cursor:pointer}.market-research-actions .primary,.market-actions .primary{background:#17663e;color:#fff}.market-research-actions button:disabled{opacity:.55;cursor:wait}
      .market-actions{grid-column:1/-1;display:flex;justify-content:flex-end}.market-message{grid-column:1/-1;min-height:17px;color:#52675a;font-size:12px}.market-message.error{color:#8a332a}.market-message.ok{color:#24633d}.market-history{margin-top:20px;padding-top:16px;border-top:1px solid #e3e8e4}.market-history h3{font-size:14px}.history-row{display:grid;grid-template-columns:105px 100px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #edf0ed;font-size:12px}
      @media(max-width:620px){.market-modal{padding:6px}.market-body{padding:15px}.manual-comps{grid-template-columns:1fr}.mf.full{grid-column:1}.comp-row{grid-template-columns:1fr}.market-summary{display:block}.market-status{text-align:left;margin-top:8px}.history-row{grid-template-columns:88px 82px 1fr}}
    `;
    document.head.appendChild(style);
    const modal = document.createElement("div");
    modal.id = "marketModal"; modal.className = "market-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<section class="market-panel"><header class="market-head">
      <div><div class="market-kicker">Manual market research</div><h2 id="marketModalTitle">Market details</h2></div>
      <button class="market-close" type="button" aria-label="Close market details">×</button>
      </header><div class="market-body" id="marketModalBody"></div></section>`;
    document.body.appendChild(modal);
    const close = () => { modal.classList.remove("open"); document.body.style.overflow = ""; };
    modal.querySelector(".market-close").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  }

  function show(card, value = values.get(idFor(card))) {
    const modal = document.getElementById("marketModal");
    const comps = (value?.comparables || []).slice(0, 3);
    const history = (value?.history || []).slice().reverse().slice(0, 8);
    const state = age(value);
    const query = ebaySearchTerms(card);
    const soldUrl = "https://www.ebay.com/sch/i.html?" + new URLSearchParams({
      _nkw:query, LH_Sold:"1", LH_Complete:"1", LH_TitleDesc:"1", _ipg:"240", _sop:"13"
    });
    document.getElementById("marketModalTitle").textContent = card.name || "Market details";
    document.getElementById("marketModalBody").innerHTML = `
      <div class="market-summary"><div><small>Assumed market price</small><div class="market-price" id="marketAverage">${value?.marketValue ? cash(value.marketValue) : "—"}</div></div>
      <div class="market-status">${safe(state.text)}<br>${safe(value?.source || "No market value saved")}</div></div>
      <form id="manualCompForm" class="manual-comps">
      <p class="market-help">Use the PSA button to fill recent sales automatically, or enter at least one comparable price yourself. Two or three comps improve confidence.</p>
      <div class="market-research-actions">${String(card.company || "PSA").toUpperCase() === "PSA" && card.cert ? `<button class="primary" id="loadPsaSales" type="button">Fill from PSA sales <small>(1 API credit)</small></button>` : ""}
      <a href="${safe(soldUrl)}" target="_blank" rel="noopener noreferrer">Open eBay sold search ↗</a></div>
      ${[0,1,2].map((i) => `<div class="comp-row"><div class="mf"><label>Sold price ${i + 1}</label><input class="comp-price" type="number" min="0" step="0.01" inputmode="decimal" value="${safe(comps[i]?.price || comps[i]?.total || "")}" placeholder="$0.00"></div>
      <div class="mf"><label>Listing link ${i + 1} (optional)</label><input class="comp-url" type="url" value="${safe(comps[i]?.url || "")}" placeholder="Paste the sold-listing link"></div></div>`).join("")}
      <div class="mf"><label>Source</label><select id="marketSource">${["PSA recent eBay sales","eBay Product Research","eBay sold listings","130point","PriceCharting","Card show comps","Other"].map((source) => `<option${source === (value?.source || "eBay Product Research") ? " selected" : ""}>${source}</option>`).join("")}</select></div>
      <div class="mf"><label>Research date</label><input id="marketDate" type="date" value="${shortDate(value?.lastChecked) || new Date().toISOString().slice(0,10)}"></div>
      <div class="mf full"><label>Notes</label><textarea id="marketNotes" placeholder="Why these comps were selected…">${safe(value?.notes || "")}</textarea></div>
      <div class="market-actions"><button class="primary" type="submit">Save average as market value</button></div>
      <div class="market-message" id="marketMessage"></div></form>
      <div class="market-history"><h3>Value history</h3>${history.length ? history.map((item) => `<div class="history-row"><span>${safe(shortDate(item.date))}</span><strong>${cash(item.value)}</strong><span>${safe(item.source || "")}</span></div>`).join("") : "<p class='market-status' style='text-align:left'>No saved history yet.</p>"}</div>`;
    modal.classList.add("open"); document.body.style.overflow = "hidden";
    const priceInputs = [...document.querySelectorAll(".comp-price")];
    const recalc = () => {
      const valid = priceInputs.map((input) => Number(input.value)).filter((n) => n > 0);
      document.getElementById("marketAverage").textContent = valid.length
        ? cash(valid.reduce((sum, n) => sum + n, 0) / valid.length) : "—";
    };
    priceInputs.forEach((input) => input.addEventListener("input", recalc));
    const psaButton = document.getElementById("loadPsaSales");
    if (psaButton) psaButton.addEventListener("click", async () => {
      const message = document.getElementById("marketMessage");
      psaButton.disabled = true;
      message.className = "market-message";
      message.textContent = "Loading up to three recent PSA comparable sales…";
      try {
        const result = await pbRequest("/api/slab-ledger/psa/" + encodeURIComponent(card.cert) + "/sales");
        window.updateParseCreditBadge?.(result.credits);
        const sales = Array.isArray(result?.sales) ? result.sales.filter((sale) => Number(sale.price) > 0).slice(0, 3) : [];
        if (!sales.length) throw new Error("PSA did not return recent comparable sales for this card.");
        const urlInputs = [...document.querySelectorAll(".comp-url")];
        priceInputs.forEach((input, index) => {
          const sale = sales[index];
          input.value = sale ? Number(sale.price).toFixed(2) : "";
          input.dataset.title = sale?.title || "";
          urlInputs[index].value = sale?.url || "";
        });
        document.getElementById("marketSource").value = "PSA recent eBay sales";
        document.getElementById("marketDate").value = new Date().toISOString().slice(0, 10);
        recalc();
        message.className = "market-message ok";
        message.textContent = `Filled ${sales.length} recent sale${sales.length === 1 ? "" : "s"}. Review them, then save the average.`;
      } catch (error) {
        message.className = "market-message error";
        message.textContent = error.message || "Recent PSA sales could not be loaded.";
      } finally {
        psaButton.disabled = false;
      }
    });
    document.getElementById("manualCompForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.getElementById("marketMessage");
      try { await save(card, value); }
      catch (error) { message.className = "market-message error"; message.textContent = error.message || "Could not save market data."; }
    });
  }

  async function save(card, previous) {
    if (!cloudSession?.token || !card.remoteId) throw new Error("Sign in and sync this card first.");
    const prices = [...document.querySelectorAll(".comp-price")].map((input) => Number(input.value));
    const urls = [...document.querySelectorAll(".comp-url")].map((input) => input.value.trim());
    const priceInputs = [...document.querySelectorAll(".comp-price")];
    const comps = prices.map((price, index) => ({ price, total:price, url:urls[index],
      title:priceInputs[index].dataset.title || `Manual comp ${index + 1}` }))
      .filter((comp) => comp.price > 0);
    if (!comps.length) throw new Error("Enter at least one sold comp price.");
    const average = Math.round(comps.reduce((sum, comp) => sum + comp.price, 0) / comps.length * 100) / 100;
    const source = document.getElementById("marketSource").value;
    const checked = document.getElementById("marketDate").value + " 12:00:00.000Z";
    const history = [...(previous?.history || []), { date:checked, value:average, source, comparables:comps }].slice(-100);
    const payload = {
      owner:cloudSession.record.id, card_id:String(card.remoteId), query:ebaySearchTerms(card),
      search_url:comps.find((comp) => comp.url)?.url || "", market_value:average,
      confidence:comps.length >= 3 ? "high" : comps.length === 2 ? "medium" : "low",
      checked_at:checked, comparable_count:comps.length, rejected_count:0,
      low:Math.min(...comps.map((comp) => comp.price)), high:Math.max(...comps.map((comp) => comp.price)),
      comparables:comps, source, notes:document.getElementById("marketNotes").value.trim(),
      history, error:""
    };
    const row = await pbRequest("/api/collections/market_values/records" + (previous?.recordId ? "/" + previous.recordId : ""), {
      method:previous?.recordId ? "PATCH" : "POST",
      headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
    });
    const value = fromRecord(row); values.set(value.cardId, value);
    render(); window.dispatchEvent(new CustomEvent("slab-market-updated")); show(card, value);
  }

  function decorate() {
    const shown = visibleInventory();
    [...document.querySelectorAll("#inventoryList > .slab:not(.editing)")].forEach((tile, index) => {
      const card = shown[index]; if (!card || card.sold) return;
      const status = age(values.get(idFor(card)));
      tile.dataset.marketCard = idFor(card);
      const main = tile.querySelector(".slab-main");
      if (main && !main.querySelector(".market-age")) {
        const badge = document.createElement("div");
        badge.className = "market-age " + status.kind; badge.textContent = status.text;
        main.insertBefore(badge, main.querySelector(".slab-actions"));
      }
      tile.addEventListener("click", (event) => {
        if (!tile.closest(".grid-view") &&
            !event.target.closest("button,a,input,select,textarea,.slab-thumb")) show(card);
      });
    });
  }

  installUi(); window.openSlabMarket = show; window.refreshSlabMarketData = loadAll;
  const baseRender = render;
  render = function () { baseRender(); decorate(); };
  window.addEventListener("focus", loadAll);
  window.addEventListener("slab-cloud-synced", loadAll);
  decorate(); loadAll();
})();
