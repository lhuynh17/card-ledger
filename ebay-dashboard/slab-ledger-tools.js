(function () {
  "use strict";

  const STORAGE_KEY = "slabLedgerBuyingCapital";
  const VIEW_KEY = "slabLedgerAppView";
  const THEME_KEY = "slabLedgerTheme";
  let preferenceId = "";
  let debtReminders = [];
  let editingDebtId = "";
  let calculatorMode = "portion";
  let capitalSaveTimer = null;

  const amount = (value) => Math.max(0, Number.parseFloat(value) || 0);
  const money = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);

  function install() {
    const style = document.createElement("style");
    style.textContent = `
      .app-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;max-width:1180px;margin:14px auto 2px;padding:6px;border:2px solid var(--outline);border-radius:18px;background:color-mix(in srgb,var(--surface) 84%,transparent);box-shadow:0 14px 38px rgba(0,0,0,.18);backdrop-filter:blur(12px)}
      .app-nav button{position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;gap:9px;min-height:54px;overflow:hidden;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--muted);font:750 13px var(--font-body);letter-spacing:.02em;cursor:pointer;transition:transform .18s ease,color .18s ease,border-color .18s ease,box-shadow .18s ease}
      .app-nav button::after{content:"";position:absolute;z-index:-1;inset:0;background:linear-gradient(115deg,transparent 10%,rgba(255,255,255,.16) 45%,transparent 70%);transform:translateX(-120%);transition:transform .45s ease}.app-nav button:hover{color:var(--text);border-color:var(--line);transform:translateY(-1px)}.app-nav button:hover::after{transform:translateX(120%)}.app-nav button.active{border-color:rgba(131,166,246,.72);background:linear-gradient(135deg,var(--accent-grad-a),var(--accent),var(--accent-grad-b));color:#fff;box-shadow:0 9px 24px rgba(45,82,175,.38),inset 0 1px rgba(255,255,255,.24);transform:translateY(-1px)}.app-nav-icon{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border:1px solid currentColor;border-radius:9px;opacity:.88}.app-nav-icon svg{display:block;width:15px;height:15px}
      .tools-section{margin-top:22px}.tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tool-group-label{grid-column:1/-1;display:flex;align-items:center;gap:12px;margin:18px 0 0;padding:0 2px 11px;border-bottom:1px solid var(--line)}.tool-group-label:first-child{margin-top:0}.tool-group-number{display:grid;place-items:center;width:31px;height:31px;flex:0 0 auto;border-radius:9px;background:var(--accent-soft);color:var(--accent-readable);font:800 11px var(--font-mono)}.tool-group-label h2{margin:0;font:650 17px var(--font-display);letter-spacing:.05em;text-transform:uppercase}.tool-group-label p{margin:2px 0 0;color:var(--muted);font-size:11px}.tool-card{position:relative;padding:18px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,var(--surface),var(--surface-end));box-shadow:0 10px 28px rgba(0,0,0,.16);overflow:hidden}.tool-card::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--tool-tone,#4B7BE5)}
      .tool-card.tone-green{--tool-tone:#35b37e}.tool-card.tone-blue{--tool-tone:#4b7be5}.tool-card.tone-violet{--tool-tone:#9b7bea}.tool-card.tone-amber{--tool-tone:#e9b949}
      .tool-card{border-color:var(--outline)}.tool-card h2{margin:0 0 5px;font-size:16px}.tool-card p{margin:0 0 14px;color:var(--muted);font-size:12px;line-height:1.45}
      .tool-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px}.tool-field{display:grid;min-width:0;grid-template-rows:minmax(28px,auto) auto;align-content:start;gap:5px}.tool-field.full{grid-column:1/-1}.tool-field label{display:flex;min-height:28px;align-items:flex-end;font-size:11px;line-height:1.2;color:var(--muted);font-weight:750}
      .tool-field input,.tool-field select,.tool-field textarea{box-sizing:border-box;width:100%;min-height:43px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px;font:inherit}.tool-field textarea{min-height:65px;resize:vertical}
      .capital-total,.calculator-result{margin-top:13px;padding:13px;border-radius:10px;background:var(--surface-2)}.capital-total span,.calculator-result span{display:block;color:var(--muted);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.capital-total strong,.calculator-result strong{display:block;margin-top:3px;font:800 24px var(--font-mono)}
      .capital-save{margin-top:11px;min-height:42px;border:0;border-radius:9px;background:var(--accent);color:#fff;padding:9px 14px;font-weight:800;cursor:pointer}.capital-status{margin-left:9px;color:var(--muted);font-size:11px}.capital-card .capital-status{display:block;min-height:16px;margin:7px 0 0}
      .calculator-clear{width:100%;margin-top:9px;min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);font-weight:750;cursor:pointer}
      .calculator-mode,.theme-options{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:12px;padding:4px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)}.calculator-mode button,.theme-options button{min-height:38px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:11px;font-weight:800;cursor:pointer}.calculator-mode button.active,.theme-options button.active{background:var(--accent);color:#fff}.tools-head{align-items:center}.tools-head .theme-options{width:180px;flex:0 0 auto;margin:0}.tools-head .theme-options button{min-height:34px}
      .debt-card{grid-column:1/-1}.debt-layout{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(360px,1.3fr);gap:14px}.debt-form{padding:13px;border:1px solid var(--outline);border-radius:10px;background:var(--surface-2)}.debt-form .tool-fields{gap:7px}.debt-form .tool-field{grid-template-rows:minmax(24px,auto) auto;gap:3px}.debt-form .tool-field label{min-height:24px}.debt-form .tool-field input,.debt-form .tool-field select{min-height:43px;padding:9px}.debt-form .tool-field textarea{min-height:65px;padding:9px}.debt-form .capital-save{width:100%;min-height:42px;margin-top:7px}.debt-date-amount{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .debt-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.debt-list{display:grid;gap:7px}.debt-column{padding:13px;border:1px solid var(--outline);border-radius:10px;background:var(--surface-2)}.debt-column h3{display:flex;justify-content:space-between;gap:8px;margin:0 0 10px;font-size:14px}.debt-column h3 span{font-family:var(--font-mono)}
      .debt-row{padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}.debt-row-head{display:flex;justify-content:space-between;gap:8px}.debt-row strong{font-size:12px}.debt-row .debt-amount{font:800 13px var(--font-mono)}.debt-detail{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}.debt-row-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.debt-settle,.debt-edit,.debt-cancel,.debt-delete{border:1px solid var(--line);border-radius:7px;background:var(--surface-2);color:var(--text);padding:6px 8px;font-size:10px;font-weight:800;cursor:pointer}.debt-delete{border-color:rgba(255,120,133,.35);color:#ff7885}.debt-empty{color:var(--muted);font-size:11px}
      @media(max-width:700px){.app-nav{width:100vw;max-width:none;margin-inline:calc(50% - 50vw);padding:5px max(5px,env(safe-area-inset-right)) 5px max(5px,env(safe-area-inset-left));gap:5px;border-left:0;border-right:0;border-radius:0}.app-nav button{width:100%;min-width:0;min-height:49px;gap:5px;font-size:11px}.app-nav-icon{width:24px;height:24px;border-radius:7px}.app-nav-icon svg{width:13px;height:13px}.tools-grid{grid-template-columns:1fr}.tool-group-label,.debt-card{grid-column:auto}.tool-group-label{align-items:flex-start;margin-top:18px}.debt-layout,.debt-columns{grid-template-columns:1fr}.tools-head .theme-options{width:154px}.tools-head .theme-options button{font-size:10px}}
      @media(max-width:430px){.tool-fields:not(.compact-fields){grid-template-columns:1fr}.tool-field.full{grid-column:auto}.compact-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.compact-fields .tool-field label{font-size:10px}.compact-fields .tool-field.full{grid-column:1/-1}}
    `;
    document.head.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "app-nav"; nav.setAttribute("aria-label", "Slab Ledger pages");
    nav.innerHTML = `
      <button type="button" data-view="inventory"><span class="app-nav-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span>Inventory</span></button>
      <button type="button" data-view="ledger"><span class="app-nav-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M4 18h16M6 16V9m4 7V5m4 11v-4m4 4V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span>Ledger</span></button>
      <button type="button" data-view="tools"><span class="app-nav-icon"><svg viewBox="0 0 24 24" fill="none"><path d="m14.7 6.3 3-3 3 3-3 3m-8.4 8.4-3 3-3-3 3-3M13 7l4 4M7 13l4 4M9.5 4.5l10 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Tools</span></button>`;
    const accountBar = document.getElementById("accountBar");
    (accountBar || document.querySelector(".app-header")).insertAdjacentElement("afterend", nav);

    const finance = document.querySelector(".finance-section");
    finance.dataset.appView = "ledger";
    const tools = document.createElement("section");
    tools.className = "tools-section"; tools.dataset.appView = "tools";
    tools.innerHTML = `
      <div class="panel-head tools-head"><div class="panel-title">Tools</div>
        <div class="theme-options" role="group" aria-label="App theme">
          <button type="button" data-theme-choice="light">Light</button>
          <button type="button" data-theme-choice="dark">Dark</button>
        </div>
      </div>
      <div class="tools-grid">
        <div class="tool-group-label"><span class="tool-group-number">01</span><div><h2>Buying & deal math</h2><p>Quick numbers for decisions at shows, shops, and online.</p></div></div>
        <div class="tool-card capital-card tone-green">
          <h2>Capital</h2>
          <p>A personal reminder of what you currently have available to spend. It is not included in exports, profit, or tax calculations.</p>
          <div class="tool-fields compact-fields">
            <div class="tool-field"><label for="capitalBank">Available in bank</label><input id="capitalBank" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
            <div class="tool-field"><label for="capitalCash">Available in cash</label><input id="capitalCash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          </div>
          <div class="capital-total"><span>Total available to spend</span><strong id="capitalTotal">$0.00</strong></div>
          <span class="capital-status" id="capitalStatus"></span>
        </div>
        <div class="tool-card tone-blue">
          <h2>Percentage calculator</h2>
          <p>Switch between finding a percentage of an amount and comparing two amounts.</p>
          <div class="calculator-mode" role="group" aria-label="Percentage calculation">
            <button class="active" type="button" data-calculator-mode="portion">Percent of amount</button>
            <button type="button" data-calculator-mode="ratio">What percent?</button>
          </div>
          <div class="tool-fields compact-fields">
            <div class="tool-field"><label id="calculatorFirstLabel" for="calculatorFirst">Amount</label><input id="calculatorFirst" type="number" min="0" step="0.01" inputmode="decimal" placeholder="100.00"></div>
            <div class="tool-field"><label id="calculatorSecondLabel" for="calculatorSecond">Percent</label><input id="calculatorSecond" type="number" min="0" step="0.01" inputmode="decimal" placeholder="70"></div>
          </div>
          <div class="calculator-result"><span id="calculatorResultLabel">Calculated value</span><strong id="calculatorResult">$0.00</strong></div>
          <button class="calculator-clear" id="calculatorClear" type="button">Clear form</button>
        </div>
        <div class="tool-group-label"><span class="tool-group-number">02</span><div><h2>Balances</h2><p>Private reminders for short-term money shared with other vendors.</p></div></div>
        <div class="tool-card debt-card tone-amber">
          <h2>Money owed reminders</h2>
          <p>Keep track of informal vendor-to-vendor loans. These reminders are private and are not included in tax calculations or exports.</p>
          <div class="debt-layout">
            <form id="debtForm" class="debt-form">
              <div class="tool-fields">
                <div class="tool-field"><label for="debtDirection">Reminder type</label><select id="debtDirection"><option value="owed_to_me">Owed to me</option><option value="i_owe">I owe</option></select></div>
                <div class="tool-field"><label for="debtPerson">Person</label><input id="debtPerson" type="text" required placeholder="Vendor or friend"></div>
                <div class="debt-date-amount">
                  <div class="tool-field"><label for="debtDate">Date</label><input id="debtDate" type="date" required></div>
                  <div class="tool-field"><label for="debtAmount">Amount</label><input id="debtAmount" type="number" min="0" step="0.01" inputmode="decimal" required placeholder="0.00"></div>
                </div>
                <div class="tool-field full"><label for="debtNotes">Note (optional)</label><textarea id="debtNotes" placeholder="What the money was for"></textarea></div>
              </div>
              <button class="capital-save" id="debtSaveButton" type="submit">Add reminder</button>
              <button class="debt-cancel" id="debtCancelEdit" type="button" hidden>Cancel edit</button>
              <span class="capital-status" id="debtStatus"></span>
            </form>
            <div class="debt-columns">
              <div class="debt-column"><h3>Owed to me <span id="owedToMeTotal">$0.00</span></h3><div class="debt-list" id="owedToMeList"></div></div>
              <div class="debt-column"><h3>I owe <span id="iOweTotal">$0.00</span></h3><div class="debt-list" id="iOweList"></div></div>
            </div>
          </div>
        </div>
      </div>`;
    finance.insertAdjacentElement("afterend", tools);

    document.getElementById("inventoryAddSection").dataset.appView = "inventory";
    document.getElementById("inventoryPortfolioSection").dataset.appView = "inventory";
    nav.querySelectorAll("button").forEach((button) =>
      button.addEventListener("click", () => showView(button.dataset.view)));
    ["capitalBank","capitalCash"].forEach((id) =>
      document.getElementById(id).addEventListener("input", () => {
        updateCapitalTotal();
        clearTimeout(capitalSaveTimer);
        capitalSaveTimer = setTimeout(saveCapital, 500);
      }));
    ["calculatorFirst","calculatorSecond"].forEach((id) =>
      document.getElementById(id).addEventListener("input", updateCalculator));
    document.querySelectorAll("[data-calculator-mode]").forEach((button) =>
      button.addEventListener("click", () => setCalculatorMode(button.dataset.calculatorMode)));
    document.getElementById("calculatorClear").addEventListener("click", clearCalculator);
    document.querySelectorAll("[data-theme-choice]").forEach((button) =>
      button.addEventListener("click", () => applyTheme(button.dataset.themeChoice)));
    document.getElementById("debtDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("debtForm").addEventListener("submit", saveDebtReminder);
    document.getElementById("debtCancelEdit").addEventListener("click", resetDebtForm);

    loadLocalCapital();
    applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
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
    const total = document.getElementById("capitalTotal");
    total.textContent = money(
      amount(document.getElementById("capitalBank").value) +
      amount(document.getElementById("capitalCash").value)
    );
    total.className = "money-positive";
  }

  function applyTheme(theme) {
    const selected = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = selected;
    localStorage.setItem(THEME_KEY, selected);
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const active = button.dataset.themeChoice === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = selected === "light" ? "#F3F6FA" : "#060A13";
  }

  function setCalculatorMode(mode) {
    calculatorMode = mode === "ratio" ? "ratio" : "portion";
    document.querySelectorAll("[data-calculator-mode]").forEach((button) => {
      const active = button.dataset.calculatorMode === calculatorMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const first = document.getElementById("calculatorFirst");
    const second = document.getElementById("calculatorSecond");
    if (calculatorMode === "portion") {
      document.getElementById("calculatorFirstLabel").textContent = "Amount";
      document.getElementById("calculatorSecondLabel").textContent = "Percent";
      document.getElementById("calculatorResultLabel").textContent = "Calculated value";
      first.placeholder = "100.00";
      second.placeholder = "70";
    } else {
      document.getElementById("calculatorFirstLabel").textContent = "Part amount";
      document.getElementById("calculatorSecondLabel").textContent = "Total amount";
      document.getElementById("calculatorResultLabel").textContent = "Part is";
      first.placeholder = "70.00";
      second.placeholder = "100.00";
    }
    clearCalculator(false);
  }

  function clearCalculator(focus = true) {
    document.getElementById("calculatorFirst").value = "";
    document.getElementById("calculatorSecond").value = "";
    updateCalculator();
    if (focus) document.getElementById("calculatorFirst").focus();
  }

  function updateCalculator() {
    const first = amount(document.getElementById("calculatorFirst").value);
    const second = amount(document.getElementById("calculatorSecond").value);
    const result = document.getElementById("calculatorResult");
    result.textContent = calculatorMode === "portion"
      ? money(first * second / 100)
      : second > 0
        ? (first / second * 100).toFixed(1).replace(/\.0$/, "") + "%"
        : "0%";
    result.className = "money-positive";
  }

  function capitalData() {
    return {
      bank_capital:amount(document.getElementById("capitalBank").value),
      cash_capital:amount(document.getElementById("capitalCash").value)
    };
  }

  function populateCapital(data) {
    document.getElementById("capitalBank").value = data.bank_capital || "";
    document.getElementById("capitalCash").value = data.cash_capital || "";
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

  async function loadDebtReminders() {
    if (!cloudSession?.token) {
      debtReminders = [];
      renderDebtReminders();
      return;
    }
    try {
      const result = await pbRequest("/api/collections/debt_reminders/records?perPage=500&sort=-reminder_date");
      debtReminders = (result?.items || []).filter((item) => !item.settled);
      renderDebtReminders();
    } catch (error) {
      document.getElementById("debtStatus").textContent = error.status === 404
        ? "Run the PocketBase setup tool to enable synced reminders"
        : "Reminders could not be loaded";
    }
  }

  function renderDebtReminders() {
    const directions = [
      ["owed_to_me", "owedToMeList", "owedToMeTotal"],
      ["i_owe", "iOweList", "iOweTotal"]
    ];
    for (const [direction, listId, totalId] of directions) {
      const rows = debtReminders.filter((item) => item.direction === direction);
      const total = document.getElementById(totalId);
      total.textContent = money(
        rows.reduce((sum, item) => sum + amount(item.amount), 0)
      );
      total.className = direction === "i_owe" ? "money-negative" : "money-positive";
      const list = document.getElementById(listId);
      list.textContent = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "debt-empty";
        empty.textContent = cloudSession?.token ? "No open reminders." : "Sign in to view synced reminders.";
        list.appendChild(empty);
        continue;
      }
      for (const item of rows) {
        const row = document.createElement("div"); row.className = "debt-row";
        const head = document.createElement("div"); head.className = "debt-row-head";
        const person = document.createElement("strong"); person.textContent = item.person;
        const value = document.createElement("span");
        value.className = "debt-amount " + (direction === "i_owe" ? "money-negative" : "money-positive");
        value.textContent = money(item.amount);
        head.append(person, value);
        const detail = document.createElement("div"); detail.className = "debt-detail";
        detail.textContent = [String(item.reminder_date || "").slice(0, 10), item.notes].filter(Boolean).join(" · ");
        const settle = document.createElement("button"); settle.className = "debt-settle";
        settle.type = "button"; settle.textContent = "Mark settled";
        settle.addEventListener("click", () => settleDebtReminder(item));
        const edit = document.createElement("button"); edit.className = "debt-edit";
        edit.type = "button"; edit.textContent = "Edit";
        edit.addEventListener("click", () => editDebtReminder(item));
        const remove = document.createElement("button"); remove.className = "debt-delete";
        remove.type = "button"; remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteDebtReminder(item));
        const actions = document.createElement("div"); actions.className = "debt-row-actions";
        actions.append(edit, settle, remove);
        row.append(head, detail, actions); list.appendChild(row);
      }
    }
  }

  function editDebtReminder(item) {
    editingDebtId = item.id;
    document.getElementById("debtDirection").value = item.direction;
    document.getElementById("debtDate").value = String(item.reminder_date || "").slice(0, 10);
    document.getElementById("debtPerson").value = item.person || "";
    document.getElementById("debtAmount").value = item.amount || "";
    document.getElementById("debtNotes").value = item.notes || "";
    document.getElementById("debtSaveButton").textContent = "Save changes";
    document.getElementById("debtCancelEdit").hidden = false;
    document.getElementById("debtStatus").textContent = "Editing reminder";
    document.getElementById("debtForm").scrollIntoView({ behavior:"smooth", block:"center" });
    document.getElementById("debtPerson").focus({ preventScroll:true });
  }

  function resetDebtForm() {
    editingDebtId = "";
    document.getElementById("debtForm").reset();
    document.getElementById("debtDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("debtSaveButton").textContent = "Add reminder";
    document.getElementById("debtCancelEdit").hidden = true;
    document.getElementById("debtStatus").textContent = "";
  }

  async function saveDebtReminder(event) {
    event.preventDefault();
    const status = document.getElementById("debtStatus");
    if (!cloudSession?.token) {
      status.textContent = "Sign in before saving a reminder";
      return;
    }
    const value = amount(document.getElementById("debtAmount").value);
    if (!value) {
      status.textContent = "Enter an amount greater than zero";
      return;
    }
    status.textContent = "Saving…";
    try {
      const record = await pbRequest("/api/collections/debt_reminders/records" +
        (editingDebtId ? "/" + editingDebtId : ""), {
        method:editingDebtId ? "PATCH" : "POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          owner:cloudSession.record.id,
          direction:document.getElementById("debtDirection").value,
          person:document.getElementById("debtPerson").value.trim(),
          amount:value,
          reminder_date:document.getElementById("debtDate").value + " 12:00:00.000Z",
          notes:document.getElementById("debtNotes").value.trim(),
          settled:false
        })
      });
      const wasEditing = Boolean(editingDebtId);
      if (wasEditing) {
        debtReminders = debtReminders.map((item) => item.id === record.id ? record : item);
      } else {
        debtReminders.unshift(record);
      }
      resetDebtForm();
      status.textContent = wasEditing ? "Changes saved" : "Reminder saved";
      renderDebtReminders();
    } catch (error) {
      status.textContent = error.status === 404
        ? "Run the PocketBase setup tool, then retry"
        : "The reminder could not be saved";
    }
  }

  async function settleDebtReminder(item) {
    if (!confirm(`Mark the ${money(item.amount)} reminder for ${item.person} as settled?`)) return;
    try {
      await pbRequest("/api/collections/debt_reminders/records/" + item.id, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ settled:true })
      });
      debtReminders = debtReminders.filter((row) => row.id !== item.id);
      renderDebtReminders();
    } catch (_) {
      alert("The reminder could not be marked settled.");
    }
  }

  async function deleteDebtReminder(item) {
    if (!confirm(`Permanently delete the ${money(item.amount)} reminder for ${item.person}?`)) return;
    try {
      await pbRequest("/api/collections/debt_reminders/records/" + item.id, { method:"DELETE" });
      debtReminders = debtReminders.filter((row) => row.id !== item.id);
      if (editingDebtId === item.id) resetDebtForm();
      renderDebtReminders();
    } catch (_) {
      alert("The reminder could not be deleted.");
    }
  }

  install();
  window.addEventListener("slab-cloud-synced", () => {
    loadCapital();
    loadDebtReminders();
  });
  loadCapital();
  loadDebtReminders();
})();
