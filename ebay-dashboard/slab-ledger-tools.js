(function () {
  "use strict";

  const STORAGE_KEY = "slabLedgerBuyingCapital";
  const VIEW_KEY = "slabLedgerAppView";
  let preferenceId = "";

  const amount = (value) => Math.max(0, Number.parseFloat(value) || 0);
  const money = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);

  function install() {
    const style = document.createElement("style");
    style.textContent = `
      .app-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:1180px;margin:14px auto 2px;padding:0 22px}
      .app-nav button{min-height:44px;border:1px solid var(--line);border-radius:11px;background:var(--surface);color:var(--muted);font:750 13px var(--font-sans);cursor:pointer}
      .app-nav button.active{border-color:var(--accent);background:var(--accent);color:#fff}
      .tools-section{margin-top:22px}.tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tool-card{padding:17px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .tool-card.capital-card{grid-column:1/-1}.tool-card h2{margin:0 0 5px;font-size:16px}.tool-card p{margin:0 0 14px;color:var(--muted);font-size:12px;line-height:1.45}
      .tool-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tool-field{display:grid;gap:5px}.tool-field.full{grid-column:1/-1}.tool-field label{font-size:11px;color:var(--muted);font-weight:750}
      .tool-field input,.tool-field textarea{box-sizing:border-box;width:100%;min-height:43px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px;font:inherit}.tool-field textarea{min-height:65px;resize:vertical}
      .capital-total,.calculator-result{margin-top:13px;padding:13px;border-radius:10px;background:var(--surface-2)}.capital-total span,.calculator-result span{display:block;color:var(--muted);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.capital-total strong,.calculator-result strong{display:block;margin-top:3px;font:800 24px var(--font-mono)}
      .capital-save{margin-top:11px;min-height:42px;border:0;border-radius:9px;background:var(--accent);color:#fff;padding:9px 14px;font-weight:800;cursor:pointer}.capital-status{margin-left:9px;color:var(--muted);font-size:11px}
      @media(max-width:700px){.app-nav{padding:0 14px}.tools-grid{grid-template-columns:1fr}.tool-card.capital-card{grid-column:auto}.tool-fields{grid-template-columns:1fr}.tool-field.full{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "app-nav"; nav.setAttribute("aria-label", "Slab Ledger pages");
    nav.innerHTML = `
      <button type="button" data-view="inventory">Inventory</button>
      <button type="button" data-view="ledger">Business Ledger</button>
      <button type="button" data-view="tools">Tools</button>`;
    document.querySelector(".app-header").insertAdjacentElement("afterend", nav);

    const finance = document.querySelector(".finance-section");
    finance.dataset.appView = "ledger";
    const tools = document.createElement("section");
    tools.className = "tools-section"; tools.dataset.appView = "tools";
    tools.innerHTML = `
      <div class="panel-head"><div class="panel-title">Tools</div></div>
      <div class="tools-grid">
        <div class="tool-card capital-card">
          <h2>Inventory buying capital</h2>
          <p>A personal reminder of what you currently have available to spend. It is not included in exports, profit, or tax calculations.</p>
          <div class="tool-fields">
            <div class="tool-field"><label for="capitalBank">Available in bank</label><input id="capitalBank" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
            <div class="tool-field"><label for="capitalCash">Available in cash</label><input id="capitalCash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
            <div class="tool-field full"><label for="capitalNote">Reminder note (optional)</label><textarea id="capitalNote" placeholder="For example: keep $200 reserved for show expenses"></textarea></div>
          </div>
          <div class="capital-total"><span>Total available to spend</span><strong id="capitalTotal">$0.00</strong></div>
          <button class="capital-save" id="capitalSave" type="button">Save reminder</button><span class="capital-status" id="capitalStatus"></span>
        </div>
        <div class="tool-card">
          <h2>Percentage of an amount</h2>
          <p>Enter an amount and a percentage to calculate that portion.</p>
          <div class="tool-fields">
            <div class="tool-field"><label for="percentAmount">Amount</label><input id="percentAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="100.00"></div>
            <div class="tool-field"><label for="percentRate">Percent</label><input id="percentRate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="70"></div>
          </div>
          <div class="calculator-result"><span>Calculated value</span><strong id="percentResult">$0.00</strong></div>
        </div>
        <div class="tool-card">
          <h2>What percent am I paying?</h2>
          <p>Compare your purchase price with the asking or market value.</p>
          <div class="tool-fields">
            <div class="tool-field"><label for="marketAmount">Asking / market value</label><input id="marketAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="100.00"></div>
            <div class="tool-field"><label for="payingAmount">Price I would pay</label><input id="payingAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="70.00"></div>
          </div>
          <div class="calculator-result"><span>You are paying</span><strong id="payingResult">0%</strong></div>
        </div>
      </div>`;
    finance.insertAdjacentElement("afterend", tools);

    document.getElementById("inventoryAddSection").dataset.appView = "inventory";
    document.getElementById("inventoryPortfolioSection").dataset.appView = "inventory";
    nav.querySelectorAll("button").forEach((button) =>
      button.addEventListener("click", () => showView(button.dataset.view)));
    ["capitalBank","capitalCash"].forEach((id) =>
      document.getElementById(id).addEventListener("input", updateCapitalTotal));
    ["percentAmount","percentRate"].forEach((id) =>
      document.getElementById(id).addEventListener("input", updateCalculators));
    ["marketAmount","payingAmount"].forEach((id) =>
      document.getElementById(id).addEventListener("input", updateCalculators));
    document.getElementById("capitalSave").addEventListener("click", saveCapital);

    loadLocalCapital();
    showView(localStorage.getItem(VIEW_KEY) || "inventory");
  }

  function showView(view) {
    if (!["inventory","ledger","tools"].includes(view)) view = "inventory";
    document.querySelectorAll("[data-app-view]").forEach((section) => {
      section.hidden = section.dataset.appView !== view;
    });
    document.querySelectorAll(".app-nav button").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    localStorage.setItem(VIEW_KEY, view);
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function updateCapitalTotal() {
    document.getElementById("capitalTotal").textContent = money(
      amount(document.getElementById("capitalBank").value) +
      amount(document.getElementById("capitalCash").value)
    );
  }

  function updateCalculators() {
    const base = amount(document.getElementById("percentAmount").value);
    const rate = amount(document.getElementById("percentRate").value);
    document.getElementById("percentResult").textContent = money(base * rate / 100);
    const market = amount(document.getElementById("marketAmount").value);
    const paying = amount(document.getElementById("payingAmount").value);
    document.getElementById("payingResult").textContent =
      market > 0 ? (paying / market * 100).toFixed(1).replace(/\.0$/, "") + "%" : "0%";
  }

  function capitalData() {
    return {
      bank_capital:amount(document.getElementById("capitalBank").value),
      cash_capital:amount(document.getElementById("capitalCash").value),
      capital_note:document.getElementById("capitalNote").value.trim()
    };
  }

  function populateCapital(data) {
    document.getElementById("capitalBank").value = data.bank_capital || "";
    document.getElementById("capitalCash").value = data.cash_capital || "";
    document.getElementById("capitalNote").value = data.capital_note || "";
    updateCapitalTotal();
  }

  function loadLocalCapital() {
    try { populateCapital(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}); }
    catch (_) { populateCapital({}); }
  }

  async function loadCapital() {
    if (!cloudSession?.token) return;
    try {
      const result = await pbRequest("/api/collections/app_preferences/records?perPage=1");
      const record = result?.items?.[0];
      if (!record) return;
      preferenceId = record.id;
      populateCapital(record);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capitalData()));
    } catch (_) {}
  }

  async function saveCapital() {
    const status = document.getElementById("capitalStatus");
    const data = capitalData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateCapitalTotal();
    if (!cloudSession?.token) {
      status.textContent = "Saved on this device";
      return;
    }
    status.textContent = "Saving…";
    try {
      const payload = { ...data, owner:cloudSession.record.id };
      const record = await pbRequest("/api/collections/app_preferences/records" +
        (preferenceId ? "/" + preferenceId : ""), {
        method:preferenceId ? "PATCH" : "POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      preferenceId = record.id;
      status.textContent = "Saved and synced";
    } catch (error) {
      status.textContent = error.status === 404
        ? "Run the PocketBase setup tool, then retry"
        : "Saved on this device; cloud sync failed";
    }
  }

  install();
  window.addEventListener("slab-cloud-synced", loadCapital);
  loadCapital();
})();
