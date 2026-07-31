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
    const history = jsonArray(record.history);
    const marketValue = Number(record.market_value) || 0;
    const previousDifferent = history.slice().reverse().find((item) =>
      Number(item?.value) > 0 && Number(item.value) !== marketValue
    );
    const previousValue = Number(previousDifferent?.value) || 0;
    return {
      recordId:record.id, cardId:String(record.card_id),
      marketValue,
      lastChecked:record.checked_at || record.updated || "",
      source:record.source || "eBay Product Research",
      notes:record.notes || "", comparables,
      pendingBestOffers:jsonArray(record.pending_best_offers),
      activeListings:jsonArray(record.active_listings),
      history, searchUrl:record.search_url || "",
      confidence:record.confidence || "low",
      identityConfidence:record.identity_confidence || record.confidence || "low",
      volatility:record.volatility || "unknown",
      autoStatus:record.auto_status || "manual",
      suggestedValue:Number(record.suggested_value) || 0,
      algorithmVersion:record.algorithm_version || "",
      dramaticChange:Boolean(previousValue && (
        marketValue < previousValue * 0.5 || marketValue > previousValue * 1.5
      ))
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
      .market-modal.open{display:grid}.market-panel{display:flex;width:min(760px,100%);max-height:94vh;flex-direction:column;overflow:hidden;border-radius:17px;background:#fff;color:#17211b;color-scheme:light;box-shadow:0 28px 90px #0006}
      .market-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px;border-bottom:1px solid #e2e8e3;background:#fff}.market-head h2{margin:4px 0 0;font-size:20px}
      .market-kicker{color:#52705d;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.market-close,.market-back{min-height:42px;border:1px solid #dce3dd;border-radius:10px;background:#f5f7f4;color:#17462f;font-weight:800;cursor:pointer}.market-close{padding:9px 13px;font-size:13px}
      .market-body{padding:22px;overflow:auto;overscroll-behavior:contain;background:#f7f9f7}.market-summary{display:flex;justify-content:space-between;gap:15px;padding:18px;border:1px solid #dbe6de;border-radius:13px;background:#eaf2ed}
      .market-footer{display:flex;flex:none;justify-content:flex-end;padding:11px 18px;border-top:1px solid #e2e8e3;background:#fff}.market-back{padding:9px 16px}
      .market-page-message{display:none;margin-top:12px;padding:11px 13px;border-radius:9px;font-size:12px}.market-page-message.error{display:block;background:#ffe5e1;color:#8a332a}.market-page-message.ok{display:block;background:#e3f5e9;color:#24633d}
      .market-summary small{display:block;color:#5e6d63;font-weight:750;text-transform:uppercase}.market-price{color:#17663e;font-size:36px;font-weight:850}.market-status{text-align:right;color:#52675a;font-size:12px}.market-review-alert{margin-top:12px;padding:12px 14px;border:1px solid #e7c968;border-radius:10px;background:#fff7dd;color:#684d00;font-size:12px;line-height:1.45}
      .market-section{margin-top:15px;padding:17px;border:1px solid #dfe6e1;border-radius:13px;background:#fff}.market-section>h3{margin:0;font-size:15px}.market-section-intro{margin:5px 0 13px;color:#607067;font-size:12px;line-height:1.45}.market-subsection{margin-top:14px}.market-subsection h4{margin:0 0 8px;color:#405248;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
      .market-disclosure{margin-top:15px;border:1px solid #dfe6e1;border-radius:13px;background:#fff}.market-disclosure>summary{display:flex;min-height:50px;align-items:center;justify-content:space-between;padding:0 16px;color:#17462f;font-weight:800;cursor:pointer;list-style:none}.market-disclosure>summary::-webkit-details-marker{display:none}.market-disclosure>summary::after{content:"+";font-size:20px}.market-disclosure[open]>summary::after{content:"−"}.market-disclosure-body{padding:0 16px 16px;border-top:1px solid #edf0ed}
      .manual-comps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:11px;margin-top:15px}.market-help{grid-column:1/-1;margin:0;color:#52675a;font-size:12px}.comp-row{grid-column:1/-1;display:grid;grid-template-columns:minmax(120px,140px) minmax(0,1fr);align-items:start;gap:11px;padding:11px;border:1px solid #e1e7e2;border-radius:11px;background:#fafbfa}.mf{display:grid;min-width:0;grid-template-rows:minmax(28px,auto) auto;align-content:start;gap:5px}.mf.full{grid-column:1/-1}.mf label{display:flex;min-height:28px;align-items:flex-end;margin:0;font-size:11px;font-weight:750;line-height:1.2;color:#536159}
      .market-panel .mf input,.market-panel .mf select,.market-panel .mf textarea{box-sizing:border-box;width:100%;min-height:42px;padding:9px;border:1px solid #bfcac2!important;border-radius:9px;background:#fff!important;color:#17211b!important;-webkit-text-fill-color:#17211b;color-scheme:light;font:inherit}.market-panel .mf select option{background:#fff!important;color:#17211b!important}.market-panel .mf textarea{min-height:70px}.market-panel .mf input:focus,.market-panel .mf select:focus,.market-panel .mf textarea:focus{outline:3px solid rgba(23,102,62,.18);border-color:#17663e!important}
      .market-research-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:9px}.market-research-actions a,.market-research-actions button,.market-actions button{box-sizing:border-box;min-height:42px;padding:10px 13px;border:1px solid #cbd6ce;border-radius:9px;appearance:none;background:#f5f7f4;color:#17462f;font-weight:750;text-decoration:none;cursor:pointer}.market-research-actions a:hover,.market-research-actions button:hover,.market-actions button:hover{border-color:#17663e;background:#eaf2ed}.market-research-actions .primary,.market-actions .primary{background:#17663e;color:#fff}.market-research-actions button:disabled,.market-actions button:disabled{opacity:.55;cursor:wait}
      .market-actions{grid-column:1/-1;display:flex;justify-content:flex-end}.market-message{grid-column:1/-1;min-height:17px;color:#52675a;font-size:12px}.market-message.error{color:#8a332a}.market-message.ok{color:#24633d}.market-history{margin-top:20px;padding-top:16px;border-top:1px solid #e3e8e4}.market-history h3{font-size:14px}.history-row{display:grid;grid-template-columns:105px 100px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #edf0ed;font-size:12px}
      .market-signals{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.market-signal{padding:5px 8px;border-radius:999px;background:#f0f3f0;color:#405248;font-size:11px;font-weight:750}.market-signal.warn{background:#fff1c9;color:#785500}.market-signal.bad{background:#ffe1dc;color:#8a332a}
      .market-evidence-list{display:grid;gap:8px}.market-evidence-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:11px;border:1px solid #e1e7e2;border-radius:10px;background:#fafbfa}.market-evidence-row strong,.market-evidence-row span{display:block}.market-evidence-row strong{overflow-wrap:anywhere}.market-evidence-row small{color:#617067}.market-evidence-row a{color:#17663e;font-weight:750;text-decoration:none}.market-evidence-row.attention{border-color:#e8c96e;background:#fffaf0}.market-evidence-row button,.history-row button{margin-top:5px;padding:6px 8px;border:1px solid #d5ddd7;border-radius:7px;background:#fff;color:#17462f;font-weight:750;cursor:pointer}.market-empty{margin:0;color:#617067;font-size:12px}.market-preview{grid-column:1/-1;padding:10px 12px;border-radius:9px;background:#eaf2ed;color:#17462f;font-size:13px;font-weight:800}
      @media(max-width:620px){.market-modal{padding:0}.market-panel{width:100%;max-height:100vh;height:100%;border-radius:0}.market-head{padding:12px 14px}.market-head h2{font-size:17px}.market-body{padding:12px}.market-footer{padding:10px 14px}.market-back{width:100%}.market-section{padding:14px}.manual-comps{grid-template-columns:1fr}.mf.full{grid-column:1}.comp-row{grid-template-columns:1fr}.market-summary{display:block}.market-status{text-align:left;margin-top:8px}.history-row{grid-template-columns:88px 82px 1fr}.market-evidence-row{grid-template-columns:1fr}.market-evidence-row>div:last-child{display:flex;align-items:center;justify-content:space-between;gap:10px}}
    `;
    document.head.appendChild(style);
    const modal = document.createElement("div");
    modal.id = "marketModal"; modal.className = "market-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<section class="market-panel"><header class="market-head">
      <div><div class="market-kicker">Inventory card details</div><h2 id="marketModalTitle">Market details</h2></div>
      <button class="market-close" type="button" aria-label="Back to inventory">← Back</button>
      </header><div class="market-body" id="marketModalBody"></div>
      <footer class="market-footer"><button class="market-back" type="button">Back to inventory</button></footer></section>`;
    document.body.appendChild(modal);
    let returnFocus = null;
    const close = () => {
      modal.classList.remove("open");
      document.body.style.overflow = "";
      if (returnFocus?.isConnected) returnFocus.focus();
    };
    modal.closeMarketDetails = close;
    modal.rememberMarketFocus = () => { returnFocus = document.activeElement; };
    modal.querySelector(".market-close").addEventListener("click", close);
    modal.querySelector(".market-back").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  }

  function show(card, value = values.get(idFor(card))) {
    const modal = document.getElementById("marketModal");
    modal.rememberMarketFocus?.();
    const desiredComps = Math.max(3, Math.min(
      5, Number(window.slabManagedMarketplace?.schedule?.active?.listing_count) || 3
    ));
    const comps = value?.autoStatus === "provisional"
      ? [] : (value?.comparables || []).slice(0, desiredComps);
    const history = (value?.history || []).slice().reverse().slice(0, 8);
    const previousTrustedIndex = history.findIndex((item) => {
      const previous = Number(item?.value) || 0;
      return value?.marketValue && previous && previous !== value.marketValue
        && (value.marketValue < previous * 0.5 || value.marketValue > previous * 1.5);
    });
    const state = age(value);
    const query = ebaySearchTerms(card);
    const evidenceRows = (items, kind) => items.map((item, index) => {
      const pending = kind === "pending";
      const active = kind === "active";
      const amount = pending ? "Price unknown" : cash(item.total || item.price);
      const detail = pending ? "Best Offer · verify in Product Research"
        : active ? "Active asking price—not a completed sale"
          : `Sold ${safe(shortDate(item.soldAt) || "date unavailable")}`;
      return `<div class="market-evidence-row${pending ? " attention" : ""}><div><strong>${safe(item.title || "eBay listing")}</strong><small>${detail}</small></div><div><span>${amount}</span>${pending ? `<button class="verify-best-offer" type="button" data-index="${index}">Verify price</button>` : item.url ? `<a href="${safe(item.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</div></div>`;
    }).join("");
    const soldUrl = "https://www.ebay.com/sch/i.html?" + new URLSearchParams({
      _nkw:query, LH_Sold:"1", LH_Complete:"1", LH_TitleDesc:"1", _ipg:"240", _sop:"13"
    });
    document.getElementById("marketModalTitle").textContent = card.name || "Market details";
    document.getElementById("marketModalBody").innerHTML = `
      <div class="market-summary"><div><small>Current saved market value</small><div class="market-price">${value?.marketValue ? cash(value.marketValue) : "Not set"}</div></div>
      <div class="market-status">${safe(state.text)}<br>${safe(value?.source || "No trusted value saved")}</div></div>
      ${value?.autoStatus === "provisional" ? `<div class="market-review-alert"><strong>Needs review${value.suggestedValue ? `: ${cash(value.suggestedValue)}` : ""}</strong><br>This result did not replace your saved value because its match, evidence, or price movement needs confirmation.</div>` : ""}
      ${value?.dramaticChange ? `<div class="market-review-alert"><strong>This saved value is far from its previous value.</strong><br>It may have come from an incorrect match.${previousTrustedIndex >= 0 ? ` <button class="rollback-market-value" type="button" data-index="${previousTrustedIndex}">Restore previous ${cash(history[previousTrustedIndex].value)}</button>` : ""}</div>` : ""}
      <div class="market-page-message" id="marketPageMessage" role="status"></div>
      <div class="market-signals">
      <span class="market-signal">Match ${safe(value?.identityConfidence || "unknown")}</span>
      <span class="market-signal${value?.confidence === "low" ? " warn" : ""}">Evidence ${safe(value?.confidence || "low")}</span>
      <span class="market-signal${value?.volatility === "high" ? " warn" : ""}">Volatility ${safe(value?.volatility || "unknown")}</span>
      </div>
      <section class="market-section"><h3>Market evidence</h3><p class="market-section-intro">Sold results support valuation. Active listings are shown separately and never count as sales.</p>
      <div class="market-subsection"><h4>Recent matched sales</h4><div class="market-evidence-list">${evidenceRows(value?.comparables || [], "sold") || "<p class='market-empty'>No reliable sold matches yet.</p>"}</div></div>
      ${value?.pendingBestOffers?.length ? `<div class="market-subsection"><h4>Best Offers needing a price</h4><div class="market-evidence-list">${evidenceRows(value.pendingBestOffers, "pending")}</div><div class="market-research-actions"><a href="${safe(ebayResearchUrl(card))}" target="_blank" rel="noopener noreferrer">Verify in Product Research ↗</a></div></div>` : ""}
      ${value?.activeListings?.length ? `<div class="market-subsection"><h4>Lowest active asking prices</h4><div class="market-evidence-list">${evidenceRows(value.activeListings, "active")}</div></div>` : ""}
      <div class="market-research-actions"><a href="${safe(soldUrl)}" target="_blank" rel="noopener noreferrer">Open current eBay sold search ↗</a></div></section>
      ${card.remoteId ? `<details class="market-disclosure"><summary>Automatic check settings</summary><div class="market-disclosure-body"><p class="market-section-intro">Choose how often this card is checked. These settings do not change matching safeguards.</p>
      <div class="mf"><label>Sold-listing schedule</label><select id="cardSoldSchedule">
      <option value="inherit">Use inventory default</option><option value="off">Off</option>
      <option value="daily">Daily</option><option value="three_days">Every 3 days</option>
      <option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
      <div class="mf"><label>Active asking-price check</label><select id="cardActiveSchedule">
      <option value="off">Off</option><option value="three">Include 3 lowest active listings</option></select></div>
      <p class="market-status" id="cardScheduleEstimate" style="text-align:left"></p>
      <div class="market-actions"><button id="saveCardSchedule" type="button">Save card schedule</button></div>
      <div class="market-message" id="cardScheduleMessage"></div></div></details>` : ""}
      <details class="market-disclosure"><summary>Correct or enter a value manually</summary><div class="market-disclosure-body"><form id="manualCompForm" class="manual-comps">
      <p class="market-help">Use this only when automatic evidence is missing or wrong. Review the listings, enter the prices you trust, then save.</p>
      <div class="market-research-actions">${String(card.company || "PSA").toUpperCase() === "PSA" && card.cert ? `<button class="primary" id="loadPsaSales" type="button">Fill from PSA sales <small>(1 API credit)</small></button>` : ""}
      <a href="${safe(soldUrl)}" target="_blank" rel="noopener noreferrer">Research on eBay ↗</a></div>
      ${Array.from({length:desiredComps}, (_, i) => `<div class="comp-row"><div class="mf"><label>Trusted sold price ${i + 1}</label><input class="comp-price" type="number" min="0" step="0.01" inputmode="decimal" value="${safe(comps[i]?.price || comps[i]?.total || "")}" placeholder="$0.00"></div>
      <div class="mf"><label>Listing link ${i + 1} (optional)</label><input class="comp-url" type="url" value="${safe(comps[i]?.url || "")}" placeholder="Paste the sold-listing link"></div></div>`).join("")}
      <div class="market-preview" id="manualPreview">Manual average: —</div>
      <div class="mf"><label>Source</label><select id="marketSource">${["PSA recent eBay sales","eBay Product Research","eBay sold listings","130point","PriceCharting","Card show comps","Other"].map((source) => `<option${source === (value?.source || "eBay Product Research") ? " selected" : ""}>${source}</option>`).join("")}</select></div>
      <div class="mf"><label>Research date</label><input id="marketDate" type="date" value="${shortDate(value?.lastChecked) || new Date().toISOString().slice(0,10)}"></div>
      <div class="mf full"><label>Notes</label><textarea id="marketNotes" placeholder="Why these listings are trustworthy…">${safe(value?.notes || "")}</textarea></div>
      <div class="market-actions"><button class="primary" type="submit">Save manual market value</button></div>
      <div class="market-message" id="marketMessage"></div></form></div></details>
      <details class="market-disclosure"><summary>Value history</summary><div class="market-disclosure-body">${history.length ? history.map((item, index) => `<div class="history-row"><span>${safe(shortDate(item.date))}</span><strong>${cash(item.value)}</strong><span>${safe(item.source || "")}<button class="rollback-market-value" type="button" data-index="${index}">Restore</button></span></div>`).join("") : "<p class='market-empty'>No saved history yet.</p>"}</div></details>`;
    modal.classList.add("open"); document.body.style.overflow = "hidden";
    modal.querySelector(".market-close")?.focus();
    const priceInputs = [...document.querySelectorAll(".comp-price")];
    const recalc = () => {
      const valid = priceInputs.map((input) => Number(input.value)).filter((n) => n > 0);
      document.getElementById("manualPreview").textContent = valid.length
        ? "Manual average: " + cash(valid.reduce((sum, n) => sum + n, 0) / valid.length)
        : "Manual average: —";
    };
    priceInputs.forEach((input) => input.addEventListener("input", recalc));
    document.querySelectorAll(".verify-best-offer").forEach((button) => {
      button.addEventListener("click", () => {
        const pending = value?.pendingBestOffers?.[Number(button.dataset.index)];
        if (!pending) return;
        window.open(ebayResearchUrl(card), "_blank", "noopener,noreferrer");
        const target = priceInputs.findIndex((input) => !Number(input.value));
        const index = target >= 0 ? target : 0;
        const urlInputs = [...document.querySelectorAll(".comp-url")];
        priceInputs[index].value = "";
        priceInputs[index].dataset.title = pending.title || "";
        urlInputs[index].value = pending.url || "";
        priceInputs[index].placeholder = "Enter actual Product Research price";
        priceInputs[index].focus();
        document.getElementById("marketMessage").textContent =
          "Enter the actual accepted price from Product Research, then save.";
      });
    });
    document.querySelectorAll(".rollback-market-value").forEach((button) => {
      button.addEventListener("click", async () => {
        const selected = history[Number(button.dataset.index)];
        if (!selected || !value?.recordId) return;
        button.disabled = true;
        try {
          const checked = new Date().toISOString();
          const nextHistory = [...(value.history || []), {
            date:checked, value:Number(selected.value),
            source:"History rollback", restoredFrom:selected.date || ""
          }].slice(-100);
          const row = await pbRequest(
            `/api/collections/market_values/records/${value.recordId}`,
            {
              method:"PATCH", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({
                market_value:Number(selected.value), source:"History rollback",
                checked_at:checked, auto_status:"manual", history:nextHistory
              })
            }
          );
          const restored = fromRecord(row);
          values.set(restored.cardId, restored);
          render();
          show(card, restored);
        } catch (error) {
          button.disabled = false;
          const message = document.getElementById("marketPageMessage");
          message.className = "market-page-message error";
          message.textContent = error.message || "The previous value could not be restored.";
        }
      });
    });
    const cardSchedule = document.getElementById("cardSoldSchedule");
    if (cardSchedule) {
      const activeSchedule = document.getElementById("cardActiveSchedule");
      const scheduleDetails = {
        inherit:{label:"Uses the inventory default shown in Marketplace Usage."},
        off:{label:"No automatic sold checks for this card."},
        daily:{label:"About 61 sold records/month · about $0.21."},
        three_days:{label:"About 21 sold records/month · about $0.07."},
        weekly:{label:"About 9 sold records/month · about $0.03."},
        monthly:{label:"2 sold records/month · under $0.01."},
      };
      const estimate = document.getElementById("cardScheduleEstimate");
      const updateCardEstimate = () => {
        const activeNote = activeSchedule.value === "three"
          ? " Also runs one active search and retains the 3 lowest matching asking prices."
          : "";
        estimate.textContent = (scheduleDetails[cardSchedule.value]?.label || "") + activeNote;
      };
      cardSchedule.addEventListener("change", updateCardEstimate);
      activeSchedule.addEventListener("change", updateCardEstimate);
      updateCardEstimate();
      pbRequest(
        "/api/slab-ledger/marketplace/schedule/card/" + encodeURIComponent(card.remoteId)
      ).then((result) => {
        const sold = result?.override?.sold || {};
        const active = result?.override?.active || {};
        if (sold.mode === "off") cardSchedule.value = "off";
        else if (sold.mode === "custom") {
          if (sold.interval_unit === "days" && sold.interval_value === 1) {
            cardSchedule.value = "daily";
          } else if (sold.interval_unit === "days" && sold.interval_value === 3) {
            cardSchedule.value = "three_days";
          } else if (sold.interval_unit === "weeks" && sold.interval_value === 1) {
            cardSchedule.value = "weekly";
          } else if (sold.interval_unit === "months" && sold.interval_value === 1) {
            cardSchedule.value = "monthly";
          }
        }
        activeSchedule.value = active.mode === "custom" && active.enabled
          ? "three" : "off";
        updateCardEstimate();
      }).catch(() => {});
      document.getElementById("saveCardSchedule").addEventListener("click", async () => {
        const message = document.getElementById("cardScheduleMessage");
        const presets = {
          daily:{mode:"custom", enabled:true, listing_count:2, interval_unit:"days", interval_value:1},
          three_days:{mode:"custom", enabled:true, listing_count:2, interval_unit:"days", interval_value:3},
          weekly:{mode:"custom", enabled:true, listing_count:2, interval_unit:"weeks", interval_value:1},
          monthly:{mode:"custom", enabled:true, listing_count:2, interval_unit:"months", interval_value:1},
        };
        const sold = cardSchedule.value === "inherit" ? {mode:"inherit"}
          : cardSchedule.value === "off" ? {mode:"off"}
            : presets[cardSchedule.value];
        const active = activeSchedule.value === "three"
          ? {
              mode:"custom", enabled:true, listing_count:3,
              interval_unit:"days", interval_value:1
            }
          : {mode:"off"};
        try {
          await pbRequest(
            "/api/slab-ledger/marketplace/schedule/card/" + encodeURIComponent(card.remoteId),
            {
              method:"PUT",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({sold, active})
            }
          );
          message.className = "market-message ok";
          message.textContent = "Card schedule preference saved.";
          await window.slabManagedMarketplace?.refresh?.(true);
        } catch (error) {
          message.className = "market-message error";
          message.textContent = error.message || "Card schedule could not be saved.";
        }
      });
    }
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
    const managedButton = document.getElementById("loadManagedSales");
    if (managedButton) managedButton.addEventListener("click", async () => {
      const message = document.getElementById("marketMessage");
      const listingCount = Math.max(3, Math.min(
        5, Number(window.slabManagedMarketplace?.schedule?.active?.listing_count) || 3
      ));
      managedButton.disabled = true;
      message.className = "market-message";
      message.textContent = "Running a private side-by-side marketplace evaluation…";
      try {
        const result = await window.slabManagedMarketplace.search({
          card_id:String(card.remoteId || ""),
          query,
          card_identity:card.name || query,
          grader:String(card.company || "PSA").toUpperCase(),
          grade:String(card.grade || ""),
          marketplace:"ebay",
          sold_only:true,
          completed_only:true,
          sort:"sold_desc",
          search_url:soldUrl,
          result_limit:listingCount,
          feature:"market_modal"
        });
        const candidates = Array.isArray(result?.candidates)
          ? result.candidates.slice(0, listingCount)
          : [];
        if (!result?.valuation || !candidates.length) {
          throw new Error("No usable managed-provider comparables were returned. Your saved value was not changed.");
        }
        const urlInputs = [...document.querySelectorAll(".comp-url")];
        candidates.forEach((candidate, index) => {
          priceInputs[index].value = Number(candidate.total).toFixed(2);
          priceInputs[index].dataset.title = candidate.title || "";
          urlInputs[index].value = candidate.listing_url || "";
        });
        document.getElementById("marketSource").value = "Bright Data evaluation";
        document.getElementById("marketDate").value = new Date().toISOString().slice(0, 10);
        recalc();
        message.className = "market-message ok";
        message.textContent = `Evaluation filled ${candidates.length} comparable${candidates.length === 1 ? "" : "s"} for review. Nothing is saved until you choose Save average.`;
      } catch (error) {
        message.className = "market-message error";
        message.textContent = error.message || "Managed marketplace evaluation is unavailable. Your saved value was not changed.";
      } finally {
        managedButton.disabled = false;
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
    const verifiedUrls = new Set(comps.map((comp) => comp.url).filter(Boolean));
    const payload = {
      owner:cloudSession.record.id, card_id:String(card.remoteId), query:ebaySearchTerms(card),
      search_url:comps.find((comp) => comp.url)?.url || "", market_value:average,
      confidence:comps.length >= 3 ? "high" : comps.length === 2 ? "medium" : "low",
      checked_at:checked, comparable_count:comps.length, rejected_count:0,
      low:Math.min(...comps.map((comp) => comp.price)), high:Math.max(...comps.map((comp) => comp.price)),
      comparables:comps, source, notes:document.getElementById("marketNotes").value.trim(),
      pending_best_offers:(previous?.pendingBestOffers || [])
        .filter((offer) => !verifiedUrls.has(offer.url)),
      active_listings:previous?.activeListings || [],
      identity_confidence:previous?.identityConfidence || (comps.length >= 3 ? "high" : comps.length === 2 ? "medium" : "low"),
      volatility:previous?.volatility || "unknown", auto_status:"manual",
      suggested_value:average, algorithm_version:previous?.algorithmVersion || "manual",
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
      const value = values.get(idFor(card));
      const status = age(value);
      tile.dataset.marketCard = idFor(card);
      const main = tile.querySelector(".slab-main");
      if (main && !main.querySelector(".market-age")) {
        const badge = document.createElement("div");
        badge.className = "market-age " + status.kind;
        badge.textContent = value?.marketValue
          ? `${value.dramaticChange ? "Review" : "Market"} ${cash(value.marketValue)} · ${status.text}`
          : value?.suggestedValue
            ? `Review ${cash(value.suggestedValue)} · ${status.text}`
            : status.text;
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
