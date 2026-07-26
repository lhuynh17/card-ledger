(function () {
  "use strict";

  let entries = [];
  let exceptions = [];
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);
  const n = (value) => Math.max(0, Number(value) || 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const typeNames = {
    expense:"Business expense", contribution:"Owner contribution",
    draw:"Owner draw", other_income:"Other business income",
    loan_in:"Business loan received", loan_payment:"Loan principal payment"
  };
  const exceptionNames = {
    personal_paid_business:"Business purchase paid from personal account",
    business_received_personal:"Business payment received in personal account",
    personal_reimbursement:"Personal/business reimbursement",
    other:"Other exception"
  };
  const categories = [
    "Advertising","Card show / booth fees","Commissions and fees","Insurance",
    "Legal and professional","Meals","Office expense","Postage and shipping supplies",
    "Rent or lease","Repairs and maintenance","Software and subscriptions",
    "Supplies","Taxes and licenses","Travel","Vehicle / mileage","Utilities","Other"
  ];

  function install() {
    const style = document.createElement("style");
    style.textContent = `
      .finance-section{width:100%;max-width:100%;min-width:0;margin-top:22px;overflow:hidden}.finance-section *{min-width:0}.finance-note{margin:0;color:var(--muted);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
      .finance-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:14px 0}
      .finance-toolbar select,.ledger-form input,.ledger-form select,.ledger-form textarea,.exception-form input,.exception-form select,.exception-form textarea{box-sizing:border-box;width:100%;max-width:100%;min-height:42px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px;font:inherit}
      .ledger-form input[type="file"]{display:block;overflow:hidden;font-size:12px}
      .finance-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.finance-card{padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2);overflow:hidden}
      .finance-card span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.finance-card strong{display:block;margin-top:4px;font:700 20px var(--font-mono)}
      .finance-card small{display:block;margin-top:4px;color:var(--muted);font-size:10px}.finance-card.featured{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 9%,var(--surface-2))}
      .ledger-layout{display:grid;grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:14px;margin-top:15px}.ledger-box{max-width:100%;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}
      .ledger-box h3{margin:0 0 12px;font-size:15px}.ledger-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ledger-field{display:grid;gap:5px}.ledger-field.full{grid-column:1/-1}.ledger-field label{font-size:11px;color:var(--muted);font-weight:700}.ledger-field textarea{min-height:66px;resize:vertical}
      .ledger-actions{grid-column:1/-1;display:flex;gap:8px}.ledger-actions button,.ledger-export{min-height:42px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px 12px;font-weight:750;cursor:pointer}.ledger-actions .primary{background:var(--accent);border-color:var(--accent);color:#fff}
      .ledger-message{grid-column:1/-1;min-height:17px;color:#ff7885;font-size:11px}.ledger-list{display:grid;gap:7px;max-width:100%;max-height:430px;overflow-x:hidden;overflow-y:auto}.ledger-row{display:grid;grid-template-columns:86px minmax(0,1fr) auto auto;gap:9px;align-items:center;max-width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);font-size:11px}
      .ledger-row>div,.exception-row>div{overflow-wrap:anywhere}.ledger-row strong{font-size:12px}.ledger-row .amount{font:700 13px var(--font-mono);white-space:nowrap}.ledger-row-actions{display:flex;align-items:center;gap:6px}.receipt-open{border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--text);padding:6px 8px;cursor:pointer;font-size:10px;font-weight:800}.ledger-delete{border:0;background:transparent;color:#ff7885;cursor:pointer;font-weight:800}.tax-caption{margin-top:9px;color:var(--muted-2);font-size:10px;line-height:1.4;overflow-wrap:anywhere}
      .exception-box{max-width:100%;margin-top:15px;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}.exception-box h3{margin:0 0 5px;font-size:15px}.exception-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:13px}.exception-field{display:grid;gap:5px}.exception-field.full{grid-column:1/-1}.exception-field label{font-size:11px;color:var(--muted);font-weight:700}.exception-field textarea{min-height:66px;resize:vertical}.exception-list{display:grid;gap:7px;max-width:100%;margin-top:14px}.exception-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto auto;gap:9px;align-items:center;max-width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);font-size:11px}.exception-row strong{display:block;font-size:12px}.exception-row .amount{font:700 13px var(--font-mono)}.exception-review{border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--text);padding:6px 8px;cursor:pointer;font-size:10px;font-weight:800}
      @media(max-width:720px){.finance-section{margin-inline:auto}.finance-section .panel-head{flex-direction:column;align-items:stretch}.finance-section .ledger-export{width:100%}.finance-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.ledger-layout{grid-template-columns:minmax(0,1fr)}.ledger-form,.exception-form{grid-template-columns:minmax(0,1fr)}.ledger-field.full,.exception-field.full{grid-column:1}.ledger-row,.exception-row{grid-template-columns:72px minmax(0,1fr) auto}.ledger-row-actions,.exception-review{grid-column:1/-1;justify-self:end}.finance-card strong{font-size:17px}}
      @media(max-width:460px){.finance-cards{grid-template-columns:minmax(0,1fr)}.finance-card{text-align:center}.ledger-box,.exception-box{padding:12px}.ledger-row,.exception-row{grid-template-columns:1fr auto}.ledger-row>span:first-child,.exception-row>span:first-child{grid-column:1/-1;color:var(--muted)}.ledger-row-actions,.exception-review{grid-column:1/-1;width:100%;justify-content:flex-end}.exception-review{justify-self:stretch}.ledger-actions button{width:100%}}
    `;
    document.head.appendChild(style);

    const section = document.createElement("section");
    section.className = "finance-section";
    section.setAttribute("aria-labelledby", "financeTitle");
    section.innerHTML = `
      <div class="panel-head"><div class="panel-title" id="financeTitle">Business finances</div>
      <button class="ledger-export" id="ledgerExportBtn" type="button">Export tax-year CSV</button></div>
      <p class="finance-note">Organize business income, COGS, selling costs, operating expenses, and owner activity. Use these records with your receipts, bank statements, and tax professional.</p>
      <div class="finance-toolbar"><label for="financeYear">Tax year</label><select id="financeYear"></select></div>
      <div class="finance-cards">
        <div class="finance-card"><span>Gross receipts</span><strong id="fGross">$0.00</strong></div>
        <div class="finance-card"><span>Cost of goods sold</span><strong id="fCogs">$0.00</strong></div>
        <div class="finance-card"><span>Selling costs</span><strong id="fSelling">$0.00</strong></div>
        <div class="finance-card"><span>Operating expenses</span><strong id="fExpenses">$0.00</strong></div>
        <div class="finance-card featured"><span>Estimated business profit</span><strong id="fProfit">$0.00</strong><small>Before income/self-employment tax</small></div>
        <div class="finance-card featured"><span>Estimated available capital</span><strong id="fCapital">$0.00</strong><small>Not a reconciled bank balance</small></div>
      </div>
      <div class="ledger-layout">
        <div class="ledger-box"><h3>Add ledger entry</h3><form id="ledgerForm" class="ledger-form">
          <div class="ledger-field"><label for="ledgerType">Entry type</label><select id="ledgerType">
            ${Object.entries(typeNames).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}
          </select></div>
          <div class="ledger-field"><label for="ledgerDate">Date</label><input id="ledgerDate" type="date" value="${today()}" required></div>
          <div class="ledger-field"><label for="ledgerAmount">Amount</label><input id="ledgerAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required></div>
          <div class="ledger-field"><label for="ledgerCategory">Category</label><select id="ledgerCategory">${categories.map((category) => `<option>${category}</option>`).join("")}</select></div>
          <div class="ledger-field"><label for="ledgerVendor">Vendor / source</label><input id="ledgerVendor" type="text" placeholder="eBay, card show, office store…"></div>
          <div class="ledger-field"><label for="ledgerDeductible">Business-use %</label><input id="ledgerDeductible" type="number" min="0" max="100" step="1" value="100"></div>
          <div class="ledger-field full"><label for="ledgerNotes">Description / receipt note</label><textarea id="ledgerNotes" placeholder="What was purchased or why money entered/left the business"></textarea></div>
          <div class="ledger-field full"><label for="ledgerReceipt">Receipt or invoice (optional)</label><input id="ledgerReceipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"><small>Photo, screenshot, or PDF · maximum 10 MB</small></div>
          <div class="ledger-actions"><button class="primary" type="submit">Save entry</button></div><div class="ledger-message" id="ledgerMessage"></div>
        </form></div>
        <div class="ledger-box"><h3>Entries for selected year</h3><div class="ledger-list" id="ledgerList"></div>
        <p class="tax-caption">Owner contributions, draws, and loan principal affect estimated capital but are not included in estimated business profit. Confirm tax treatment and your inventory accounting method with a qualified tax professional.</p></div>
      </div>
      <div class="exception-box"><h3>Exceptions log</h3>
        <p class="finance-note">Document business money that moved through a personal account or another unusual situation. These reminders are included in the annual CSV but do not change financial totals automatically.</p>
        <form id="exceptionForm" class="exception-form">
          <div class="exception-field"><label for="exceptionType">Exception type</label><select id="exceptionType">${Object.entries(exceptionNames).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
          <div class="exception-field"><label for="exceptionDate">Date</label><input id="exceptionDate" type="date" value="${today()}" required></div>
          <div class="exception-field"><label for="exceptionAmount">Amount (optional)</label><input id="exceptionAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="exception-field full"><label for="exceptionSource">Account, payment method, or source</label><input id="exceptionSource" type="text" placeholder="Personal checking, Venmo, specific card…"></div>
          <div class="exception-field full"><label for="exceptionNotes">What happened and why?</label><textarea id="exceptionNotes" required placeholder="Explain what the transaction was for and why it used the unusual account"></textarea></div>
          <div class="ledger-actions"><button class="primary" type="submit">Save exception note</button></div><div class="ledger-message" id="exceptionMessage"></div>
        </form>
        <div class="exception-list" id="exceptionList"></div>
        <p class="tax-caption">When appropriate, also enter the actual income or expense in the main ledger. The exception note alone does not add it to profit or deductions.</p>
      </div>`;
    document.querySelector("section[aria-labelledby='invTitle']").insertAdjacentElement("afterend", section);

    const year = document.getElementById("financeYear");
    const current = new Date().getFullYear();
    for (let value = current; value >= current - 6; value--) {
      const option = document.createElement("option");
      option.value = value; option.textContent = value; year.appendChild(option);
    }
    year.addEventListener("change", renderFinance);
    document.getElementById("ledgerType").addEventListener("change", updateFormForType);
    document.getElementById("ledgerForm").addEventListener("submit", saveEntry);
    document.getElementById("exceptionForm").addEventListener("submit", saveException);
    document.getElementById("ledgerExportBtn").addEventListener("click", exportYear);
    updateFormForType();
  }

  function updateFormForType() {
    const expense = document.getElementById("ledgerType").value === "expense";
    document.getElementById("ledgerCategory").disabled = !expense;
    document.getElementById("ledgerDeductible").disabled = !expense;
  }

  async function loadEntries() {
    if (!cloudSession?.token) { entries = []; renderFinance(); return; }
    try {
      const data = await pbRequest("/api/collections/business_entries/records?perPage=500&sort=-entry_date");
      entries = data?.items || [];
      renderFinance();
    } catch (error) {
      document.getElementById("ledgerMessage").textContent =
        error.status === 404 ? "Run the PocketBase setup tool once to add the business ledger." : "Business entries could not be loaded.";
    }
  }

  async function loadExceptions() {
    if (!cloudSession?.token) { exceptions = []; renderExceptions(); return; }
    try {
      const data = await pbRequest("/api/collections/business_exceptions/records?perPage=500&sort=-exception_date");
      exceptions = data?.items || [];
      renderExceptions();
    } catch (error) {
      document.getElementById("exceptionMessage").textContent = error.status === 404
        ? "Run the PocketBase setup tool once to add the exceptions log."
        : "Exception notes could not be loaded.";
    }
  }

  function selectedYear() {
    return Number(document.getElementById("financeYear").value);
  }

  function yearOf(value) {
    return Number(String(value || "").slice(0, 4));
  }

  function financials(year) {
    const sold = inventory.filter((card) => card.sold && yearOf(card.soldDate) === year);
    const yearEntries = entries.filter((entry) => yearOf(entry.entry_date) === year);
    const otherIncome = yearEntries.filter((entry) => entry.entry_type === "other_income")
      .reduce((sum, entry) => sum + n(entry.amount), 0);
    const gross = sold.reduce((sum, card) => sum + n(card.soldPrice), 0) + otherIncome;
    const cogs = sold.reduce((sum, card) => sum + n(card.cost), 0);
    const selling = sold.reduce((sum, card) => sum + n(card.sellingFees) + n(card.shippingCost), 0);
    const expenses = yearEntries.filter((entry) => entry.entry_type === "expense")
      .reduce((sum, entry) => {
        const percent = entry.deductible_percent == null ? 100 : n(entry.deductible_percent);
        return sum + n(entry.amount) * Math.min(100, percent) / 100;
      }, 0);
    const allGross = inventory.filter((card) => card.sold).reduce((sum, card) => sum + n(card.soldPrice), 0)
      + entries.filter((entry) => entry.entry_type === "other_income").reduce((sum, entry) => sum + n(entry.amount), 0);
    const purchases = inventory.reduce((sum, card) => sum + n(card.cost), 0);
    const allSelling = inventory.filter((card) => card.sold).reduce((sum, card) => sum + n(card.sellingFees) + n(card.shippingCost), 0);
    const paidExpenses = entries.filter((entry) => entry.entry_type === "expense").reduce((sum, entry) => sum + n(entry.amount), 0);
    const contributions = entries.filter((entry) => ["contribution","loan_in"].includes(entry.entry_type)).reduce((sum, entry) => sum + n(entry.amount), 0);
    const withdrawals = entries.filter((entry) => ["draw","loan_payment"].includes(entry.entry_type)).reduce((sum, entry) => sum + n(entry.amount), 0);
    return { gross, cogs, selling, expenses, profit:gross - cogs - selling - expenses,
      capital:contributions + allGross - purchases - allSelling - paidExpenses - withdrawals,
      sold, yearEntries };
  }

  function renderFinance() {
    if (!document.getElementById("financeYear")) return;
    const result = financials(selectedYear());
    document.getElementById("fGross").textContent = cash(result.gross);
    document.getElementById("fCogs").textContent = cash(result.cogs);
    document.getElementById("fSelling").textContent = cash(result.selling);
    document.getElementById("fExpenses").textContent = cash(result.expenses);
    document.getElementById("fProfit").textContent = cash(result.profit);
    document.getElementById("fCapital").textContent = cash(result.capital);
    renderExceptions();
    const list = document.getElementById("ledgerList");
    list.textContent = "";
    if (!cloudSession?.token) {
      list.innerHTML = "<div class='empty'>Sign in to sync and manage business entries.</div>";
      return;
    }
    if (!result.yearEntries.length) {
      list.innerHTML = "<div class='empty'>No ledger entries for this year.</div>";
      return;
    }
    for (const entry of result.yearEntries) {
      const row = document.createElement("div"); row.className = "ledger-row";
      const date = document.createElement("span"); date.textContent = String(entry.entry_date || "").slice(0, 10);
      const detail = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = typeNames[entry.entry_type] || entry.entry_type;
      const description = document.createElement("div");
      description.textContent = [entry.category, entry.vendor, entry.notes].filter(Boolean).join(" · ");
      detail.append(title, description);
      const amount = document.createElement("span"); amount.className = "amount"; amount.textContent = cash(entry.amount);
      const actions = document.createElement("div"); actions.className = "ledger-row-actions";
      if (entry.receipt) {
        const receipt = document.createElement("button"); receipt.className = "receipt-open";
        receipt.type = "button"; receipt.textContent = "Receipt";
        receipt.addEventListener("click", () => openReceipt(entry));
        actions.appendChild(receipt);
      } else {
        const attach = document.createElement("button"); attach.className = "receipt-open";
        attach.type = "button"; attach.textContent = "Add receipt";
        attach.addEventListener("click", () => attachReceipt(entry));
        actions.appendChild(attach);
      }
      const remove = document.createElement("button"); remove.className = "ledger-delete"; remove.type = "button"; remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteEntry(entry));
      actions.appendChild(remove);
      row.append(date, detail, amount, actions); list.appendChild(row);
    }
  }

  function renderExceptions() {
    const list = document.getElementById("exceptionList");
    if (!list) return;
    list.textContent = "";
    if (!cloudSession?.token) {
      list.innerHTML = "<div class='empty'>Sign in to sync and manage exception notes.</div>";
      return;
    }
    const rows = exceptions.filter((item) =>
      !item.reviewed && yearOf(item.exception_date) === selectedYear()
    );
    if (!rows.length) {
      list.innerHTML = "<div class='empty'>No open exception notes for this year.</div>";
      return;
    }
    for (const item of rows) {
      const row = document.createElement("div"); row.className = "exception-row";
      const date = document.createElement("span"); date.textContent = String(item.exception_date || "").slice(0, 10);
      const detail = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = exceptionNames[item.exception_type] || "Exception";
      const note = document.createElement("div"); note.textContent = [item.account_source, item.notes].filter(Boolean).join(" · ");
      detail.append(title, note);
      const value = document.createElement("span"); value.className = "amount"; value.textContent = item.amount ? cash(item.amount) : "—";
      const review = document.createElement("button"); review.className = "exception-review"; review.type = "button"; review.textContent = "Mark reviewed";
      review.addEventListener("click", () => reviewException(item));
      row.append(date, detail, value, review); list.appendChild(row);
    }
  }

  async function saveException(event) {
    event.preventDefault();
    const message = document.getElementById("exceptionMessage");
    if (!cloudSession?.token) { message.textContent = "Sign in before saving an exception note."; return; }
    message.textContent = "Saving…";
    try {
      const record = await pbRequest("/api/collections/business_exceptions/records", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          owner:cloudSession.record.id,
          exception_date:document.getElementById("exceptionDate").value + " 12:00:00.000Z",
          exception_type:document.getElementById("exceptionType").value,
          amount:n(document.getElementById("exceptionAmount").value),
          account_source:document.getElementById("exceptionSource").value.trim(),
          notes:document.getElementById("exceptionNotes").value.trim(),
          reviewed:false
        })
      });
      exceptions.unshift(record); event.target.reset();
      document.getElementById("exceptionDate").value = today();
      message.textContent = "Exception note saved."; renderExceptions();
    } catch (error) {
      message.textContent = error.status === 404
        ? "Run the PocketBase setup tool, then retry."
        : "The exception note could not be saved.";
    }
  }

  async function reviewException(item) {
    if (!confirm("Mark this exception as reviewed? It will remain stored and included in its tax-year export.")) return;
    try {
      const updated = await pbRequest("/api/collections/business_exceptions/records/" + item.id, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ reviewed:true })
      });
      exceptions = exceptions.map((row) => row.id === updated.id ? updated : row);
      renderExceptions();
    } catch (_) { alert("The exception note could not be updated."); }
  }

  async function saveEntry(event) {
    event.preventDefault();
    const message = document.getElementById("ledgerMessage");
    if (!cloudSession?.token) { message.textContent = "Sign in before saving a business entry."; return; }
    const type = document.getElementById("ledgerType").value;
    const amount = n(document.getElementById("ledgerAmount").value);
    if (!amount) { message.textContent = "Enter an amount greater than zero."; return; }
    message.textContent = "Saving…";
    try {
      const receipt = document.getElementById("ledgerReceipt").files[0];
      if (receipt && receipt.size > 10 * 1024 * 1024) {
        message.textContent = "The receipt must be 10 MB or smaller.";
        return;
      }
      const form = new FormData();
      form.set("owner", cloudSession.record.id);
      form.set("entry_date", document.getElementById("ledgerDate").value + " 12:00:00.000Z");
      form.set("entry_type", type);
      form.set("category", type === "expense" ? document.getElementById("ledgerCategory").value : "");
      form.set("amount", String(amount));
      form.set("vendor", document.getElementById("ledgerVendor").value.trim());
      form.set("deductible_percent", String(type === "expense" ? n(document.getElementById("ledgerDeductible").value) : 0));
      form.set("notes", document.getElementById("ledgerNotes").value.trim());
      if (receipt) form.set("receipt", receipt, receipt.name);
      const row = await pbRequest("/api/collections/business_entries/records", {
        method:"POST", body:form
      });
      entries.unshift(row); event.target.reset();
      document.getElementById("ledgerDate").value = today();
      document.getElementById("ledgerDeductible").value = "100";
      updateFormForType(); message.textContent = "Entry saved."; renderFinance();
    } catch (error) {
      message.textContent = error.status === 404 ? "Run the PocketBase setup tool once to add the business ledger." : (error.message || "Entry could not be saved.");
    }
  }

  async function openReceipt(entry) {
    const popup = window.open("", "_blank");
    try {
      const result = await pbRequest("/api/files/token", { method:"POST" });
      const filename = Array.isArray(entry.receipt) ? entry.receipt[0] : entry.receipt;
      const url = PB_URL + "/api/files/" + entry.collectionId + "/" + entry.id + "/" +
        encodeURIComponent(filename) + "?token=" + encodeURIComponent(result.token);
      if (popup) popup.location = url;
      else window.open(url, "_blank", "noopener");
    } catch (_) {
      if (popup) popup.close();
      alert("The receipt could not be opened. Please sign in again and retry.");
    }
  }

  function attachReceipt(entry) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert("The receipt must be 10 MB or smaller.");
        return;
      }
      const form = new FormData();
      form.set("receipt", file, file.name);
      try {
        const updated = await pbRequest("/api/collections/business_entries/records/" + entry.id, {
          method:"PATCH", body:form
        });
        entries = entries.map((row) => row.id === updated.id ? updated : row);
        renderFinance();
      } catch (_) {
        alert("The receipt could not be uploaded.");
      }
    }, { once:true });
    input.click();
  }

  async function deleteEntry(entry) {
    if (!confirm("Delete this business ledger entry?")) return;
    try {
      await pbRequest("/api/collections/business_entries/records/" + entry.id, { method:"DELETE" });
      entries = entries.filter((row) => row.id !== entry.id); renderFinance();
    } catch (_) { alert("The ledger entry could not be deleted."); }
  }

  function csvCell(value) {
    return '"' + String(value ?? "").replace(/"/g, '""') + '"';
  }

  function exportYear() {
    const year = selectedYear();
    const result = financials(year);
    const rows = [["Date","Record type","Category","Description","Gross income","COGS","Selling costs","Expense paid","Business-use %","Estimated deductible expense","Owner/capital activity","Exception reminder amount","Reviewed"]];
    for (const card of result.sold) {
      rows.push([card.soldDate,"Card sale","Inventory sale",card.name,n(card.soldPrice),n(card.cost),
        n(card.sellingFees) + n(card.shippingCost),0,"",0,0,0,""]);
    }
    for (const entry of result.yearEntries) {
      const percent = entry.entry_type === "expense"
        ? Math.min(100, entry.deductible_percent == null ? 100 : n(entry.deductible_percent)) : 0;
      rows.push([String(entry.entry_date).slice(0,10),typeNames[entry.entry_type] || entry.entry_type,
        entry.category || "",[entry.vendor,entry.notes].filter(Boolean).join(" — "),
        entry.entry_type === "other_income" ? n(entry.amount) : 0,0,0,
        entry.entry_type === "expense" ? n(entry.amount) : 0,
        entry.entry_type === "expense" ? percent : "",
        entry.entry_type === "expense" ? n(entry.amount) * percent / 100 : 0,
        ["contribution","draw","loan_in","loan_payment"].includes(entry.entry_type) ? n(entry.amount) : 0,0,""]);
    }
    for (const item of exceptions.filter((row) => yearOf(row.exception_date) === year)) {
      rows.push([String(item.exception_date).slice(0,10),"Exception reminder",
        exceptionNames[item.exception_type] || item.exception_type,
        [item.account_source,item.notes].filter(Boolean).join(" — "),
        0,0,0,0,"",0,0,n(item.amount),item.reviewed ? "Yes" : "No"]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    triggerDownload(new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8" }), `slab-ledger-business-${year}.csv`);
  }

  install();
  const baseRender = render;
  render = function () { baseRender(); renderFinance(); };
  window.addEventListener("slab-cloud-synced", () => { loadEntries(); loadExceptions(); });
  window.addEventListener("slab-market-updated", renderFinance);
  window.addEventListener("focus", () => { loadEntries(); loadExceptions(); });
  loadEntries(); loadExceptions(); renderFinance();
})();
