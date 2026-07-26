(function () {
  "use strict";

  let plays = [];
  let cards = [];
  let sales = [];
  let editingPlayId = "";
  let editingCardId = "";
  let activePlayId = "";
  let activeCardId = "";
  const n = (value) => Math.max(0, Number(value) || 0);
  const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const today = () => new Date().toISOString().slice(0, 10);
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);
  const statusNames = {
    planning:"Planning", submitted:"At grading", returned:"Returned",
    selling:"Selling", complete:"Complete"
  };

  function install() {
    const style = document.createElement("style");
    style.textContent = `
      .grading-section{margin-top:28px;padding-top:2px}.grading-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:0 2px 11px;border-bottom:1px solid var(--line)}.grading-head::before{content:"03";display:grid;place-items:center;width:31px;height:31px;flex:0 0 auto;border-radius:9px;background:rgba(53,179,126,.14);color:#6fd5a4;font:800 11px var(--font-mono)}.grading-head h2{margin:0;font:650 17px var(--font-display);letter-spacing:.05em;text-transform:uppercase}.grading-head p{margin:2px 0 0;color:var(--muted);font-size:11px}
      .grading-new{position:relative;padding:17px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,var(--surface),rgba(14,20,32,.82));box-shadow:0 10px 28px rgba(0,0,0,.16);overflow:hidden}.grading-new::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#35b37e}.grading-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start;gap:10px}.grading-field{display:grid;min-width:0;grid-template-rows:minmax(30px,auto) auto;align-content:start;gap:5px}.grading-field.wide{grid-column:span 2}.grading-field.full{grid-column:1/-1}.grading-field label{display:flex;min-height:30px;align-items:flex-end;font-size:11px;line-height:1.2;color:var(--muted);font-weight:750}.grading-field input,.grading-field select,.grading-field textarea{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px;font:inherit}.grading-field textarea{min-height:62px;resize:vertical}
      .grading-form-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px}.grading-button{min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:7px 11px;font-weight:800;cursor:pointer}.grading-button.primary{border-color:var(--accent);background:var(--accent);color:#fff}.grading-button.danger,.sale-delete{border-color:rgba(255,120,133,.35);color:#ff7885}.grading-message{color:var(--muted);font-size:11px}
      .grading-list{display:grid;gap:12px;margin-top:14px}.play-card{padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.play-top{display:flex;justify-content:space-between;gap:12px}.play-top h3{margin:0;font-size:15px}.play-status{display:inline-flex;margin-top:5px;padding:4px 7px;border-radius:999px;background:var(--surface-2);color:var(--muted);font-size:10px;font-weight:800}
      .play-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.play-metric{padding:9px;border-radius:9px;background:var(--surface-2)}.play-metric span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.play-metric strong{display:block;margin-top:3px;font:750 14px var(--font-mono)}.positive{color:#4cba78!important}.negative{color:#ff7885!important}
      .play-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}.play-notes{margin-top:9px;color:var(--muted);font-size:11px}.play-card-lines{display:grid;gap:8px;margin-top:12px}.grading-card-row{padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2)}.grading-card-head{display:flex;justify-content:space-between;gap:8px}.grading-card-head strong{font-size:12px}.grading-card-stats{margin-top:4px;color:var(--muted);font-size:10px}.grading-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .play-sales{margin-top:8px;padding-top:7px;border-top:1px solid var(--line)}.play-sale{display:grid;grid-template-columns:85px minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:5px 0;font-size:10px}.play-sale strong{font-family:var(--font-mono)}.sale-delete{border:1px solid rgba(255,120,133,.35);border-radius:6px;background:transparent;padding:4px 6px;font-size:9px;font-weight:800;cursor:pointer}
      .grading-modal{position:fixed;inset:0;z-index:1300;display:none;place-items:center;padding:14px;background:rgba(2,5,11,.8)}.grading-modal.open{display:grid}.grading-modal-card{width:min(640px,100%);max-height:92vh;overflow:auto;padding:18px;border:1px solid var(--line);border-radius:15px;background:var(--surface);box-shadow:0 22px 80px #0008}.grading-modal-card h3{margin:0 0 13px}.grading-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
      @media(max-width:760px){.grading-form{grid-template-columns:1fr 1fr}.grading-field.wide{grid-column:1/-1}.play-metrics{grid-template-columns:1fr 1fr}.play-sale{grid-template-columns:70px 1fr auto}}
      @media(max-width:460px){.grading-form{grid-template-columns:1fr}.grading-field.wide,.grading-field.full{grid-column:1}.play-top{display:block}.play-sale{grid-template-columns:1fr auto}.play-sale>span:first-child{grid-column:1/-1;color:var(--muted)}.sale-delete{grid-column:1/-1;justify-self:end}}
    `;
    document.head.appendChild(style);

    const section = document.createElement("div");
    section.className = "grading-section";
    section.innerHTML = `
      <div class="grading-head"><div><h2>Grading pipeline</h2><p>Build multi-card submissions, record results, and follow sales.</p></div></div>
      <div class="grading-new"><form id="gradingPlayForm" class="grading-form">
        <div class="grading-field wide"><label for="playName">Play / submission name</label><input id="playName" required placeholder="July PSA Pokémon submission"></div>
        <div class="grading-field"><label for="playSubmitted">Submitted date</label><input id="playSubmitted" type="date"></div>
        <div class="grading-field"><label for="playStatus">Status</label><select id="playStatus">${Object.entries(statusNames).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
        <div class="grading-field full"><label for="playNotes">Play notes</label><textarea id="playNotes" placeholder="Submission number, strategy, expected turnaround…"></textarea></div>
        <div class="grading-form-actions"><button class="grading-button primary" id="playSave" type="submit">Create grading play</button><button class="grading-button" id="playCancel" type="button" hidden>Cancel edit</button><span class="grading-message" id="playMessage"></span></div>
      </form></div>
      <div class="grading-list" id="gradingPlayList"></div>`;
    document.querySelector(".tools-section").appendChild(section);

    document.body.insertAdjacentHTML("beforeend", `
      <div class="grading-modal" id="gradingCardModal"><div class="grading-modal-card"><h3 id="gradingCardTitle">Add card</h3>
        <form id="gradingCardForm" class="grading-form">
          <div class="grading-field wide"><label for="gradingCardName">Card</label><input id="gradingCardName" required placeholder="Card name, set, number, variation"></div>
          <div class="grading-field"><label for="gradingCardQuantity">Quantity</label><input id="gradingCardQuantity" type="number" min="1" step="1" value="1" required></div>
          <div class="grading-field"><label for="gradingCardTens">Number of 10s</label><input id="gradingCardTens" type="number" min="0" step="1" value="0"></div>
          <div class="grading-field"><label for="gradingCardRawCost">Raw cost each</label><input id="gradingCardRawCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-field"><label for="gradingCardGradingCost">Grading cost each</label><input id="gradingCardGradingCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-field full"><label for="gradingCardNotes">Card notes</label><textarea id="gradingCardNotes" placeholder="Condition notes, expected grade, cert range…"></textarea></div>
          <div class="grading-message" id="gradingCardMessage"></div>
          <div class="grading-modal-actions"><button class="grading-button" id="gradingCardCancel" type="button">Cancel</button><button class="grading-button primary" type="submit">Save card</button></div>
        </form></div></div>
      <div class="grading-modal" id="gradingSaleModal"><div class="grading-modal-card"><h3 id="gradingSaleTitle">Add sale</h3>
        <form id="gradingSaleForm" class="grading-form">
          <div class="grading-field"><label for="gradingSaleDate">Sale date</label><input id="gradingSaleDate" type="date" required></div>
          <div class="grading-field"><label for="gradingSaleQuantity">Quantity sold</label><input id="gradingSaleQuantity" type="number" min="1" step="1" value="1" required></div>
          <div class="grading-field"><label for="gradingSaleGross">Total sale amount</label><input id="gradingSaleGross" type="number" min="0" step="0.01" inputmode="decimal" required placeholder="0.00"></div>
          <div class="grading-field"><label for="gradingSaleFees">Total fees</label><input id="gradingSaleFees" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-field"><label for="gradingSaleShipping">Total shipping cost</label><input id="gradingSaleShipping" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-field full"><label for="gradingSaleNotes">Sale note</label><textarea id="gradingSaleNotes" placeholder="Buyer, platform, grades sold…"></textarea></div>
          <div class="grading-message" id="gradingSaleMessage"></div>
          <div class="grading-modal-actions"><button class="grading-button" id="gradingSaleCancel" type="button">Cancel</button><button class="grading-button primary" type="submit">Save sale</button></div>
        </form></div></div>`);

    document.getElementById("gradingPlayForm").addEventListener("submit", savePlay);
    document.getElementById("playCancel").addEventListener("click", resetPlayForm);
    document.getElementById("gradingCardForm").addEventListener("submit", saveCard);
    document.getElementById("gradingCardCancel").addEventListener("click", closeCard);
    document.getElementById("gradingSaleForm").addEventListener("submit", saveSale);
    document.getElementById("gradingSaleCancel").addEventListener("click", closeSale);
    ["gradingCardModal","gradingSaleModal"].forEach((id) => {
      document.getElementById(id).addEventListener("click", (event) => {
        if (event.target.id === id) id === "gradingCardModal" ? closeCard() : closeSale();
      });
    });
    render();
  }

  async function load() {
    if (!cloudSession?.token) { plays = []; cards = []; sales = []; render(); return; }
    try {
      const [playData, cardData, saleData] = await Promise.all([
        pbRequest("/api/collections/grading_plays/records?perPage=500&sort=-created"),
        pbRequest("/api/collections/grading_play_cards/records?perPage=500&sort=created"),
        pbRequest("/api/collections/grading_play_sales/records?perPage=500&sort=-sale_date")
      ]);
      plays = playData?.items || []; cards = cardData?.items || []; sales = saleData?.items || [];
      render();
    } catch (error) {
      document.getElementById("playMessage").textContent = error.status === 404
        ? "Run the PocketBase setup tool to enable grading plays."
        : "Grading plays could not be loaded.";
    }
  }

  function cardMath(card) {
    const cardSales = sales.filter((sale) => sale.card === card.id);
    const quantity = whole(card.quantity);
    const unitCost = n(card.raw_cost_each) + n(card.grading_cost_each);
    const invested = unitCost * quantity;
    const sold = cardSales.reduce((sum, sale) => sum + whole(sale.quantity), 0);
    const net = cardSales.reduce((sum, sale) =>
      sum + n(sale.gross_amount) - n(sale.fees) - n(sale.shipping), 0);
    return { cardSales, quantity, unitCost, invested, sold, net,
      remaining:Math.max(0, quantity - sold), realized:net - unitCost * sold };
  }

  function playMath(play) {
    const playCards = cards.filter((card) => card.play === play.id);
    const cardResults = playCards.map((card) => ({ card, ...cardMath(card) }));
    const sum = (field) => cardResults.reduce((total, item) => total + n(item[field]), 0);
    const quantity = sum("quantity"), sold = sum("sold"), invested = sum("invested"), net = sum("net");
    return { cardResults, quantity, sold, invested, net,
      remaining:Math.max(0, quantity - sold), tens:playCards.reduce((total, card) => total + whole(card.tens_count), 0),
      realized:cardResults.reduce((total, item) => total + item.realized, 0),
      cashPosition:net - invested };
  }

  function metric(label, value, signed) {
    const box = document.createElement("div"); box.className = "play-metric";
    const name = document.createElement("span"); name.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value;
    if (signed !== undefined) strong.className = Number(signed) >= 0 ? "positive" : "negative";
    box.append(name, strong); return box;
  }

  function button(label, primary, action, danger = false) {
    const result = document.createElement("button"); result.type = "button";
    result.className = "grading-button" + (primary ? " primary" : "") + (danger ? " danger" : "");
    result.textContent = label; result.addEventListener("click", action); return result;
  }

  function render() {
    const list = document.getElementById("gradingPlayList"); if (!list) return;
    list.textContent = "";
    if (!cloudSession?.token) { list.innerHTML = "<div class='empty'>Sign in to sync and manage grading plays.</div>"; return; }
    if (!plays.length) { list.innerHTML = "<div class='empty'>No grading plays yet.</div>"; return; }
    for (const play of plays) {
      const math = playMath(play);
      const article = document.createElement("article"); article.className = "play-card";
      const top = document.createElement("div"); top.className = "play-top";
      const heading = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = play.play_name;
      const status = document.createElement("span"); status.className = "play-status"; status.textContent = statusNames[play.status] || play.status;
      heading.append(title, status);
      const date = document.createElement("span"); date.className = "grading-message";
      date.textContent = play.submitted_date ? "Submitted " + String(play.submitted_date).slice(0, 10) : "";
      top.append(heading, date);
      const metrics = document.createElement("div"); metrics.className = "play-metrics";
      metrics.append(
        metric("Cards submitted", math.quantity), metric("PSA 10s", `${math.tens} / ${math.quantity}`),
        metric("Total invested", cash(math.invested), math.invested), metric("Units remaining", math.remaining),
        metric("Net sales", cash(math.net), math.net), metric("Realized P/L", cash(math.realized), math.realized),
        metric(math.remaining ? "Cash position" : "Final play P/L", cash(math.cashPosition), math.cashPosition),
        metric("Different cards", math.cardResults.length)
      );
      const actions = document.createElement("div"); actions.className = "play-actions";
      actions.append(
        button("Add card", true, () => openCard(play)),
        button("Edit play", false, () => editPlay(play)),
        button("Delete play", false, () => deletePlay(play), true)
      );
      article.append(top, metrics, actions);
      if (play.notes) { const notes = document.createElement("div"); notes.className = "play-notes"; notes.textContent = play.notes; article.appendChild(notes); }
      const lines = document.createElement("div"); lines.className = "play-card-lines";
      if (!math.cardResults.length) { const empty = document.createElement("div"); empty.className = "grading-message"; empty.textContent = "Add the first card to this play."; lines.appendChild(empty); }
      for (const item of math.cardResults) {
        const row = document.createElement("div"); row.className = "grading-card-row";
        const head = document.createElement("div"); head.className = "grading-card-head";
        const name = document.createElement("strong"); name.textContent = item.card.card_name;
        const cost = document.createElement("strong"); cost.className = "positive"; cost.textContent = `${cash(item.unitCost)} each`;
        head.append(name, cost);
        const stats = document.createElement("div"); stats.className = "grading-card-stats";
        stats.textContent = `${item.quantity} submitted · ${whole(item.card.tens_count)} tens · ${item.sold} sold · ${item.remaining} remaining · realized ${cash(item.realized)}`;
        const cardActions = document.createElement("div"); cardActions.className = "grading-card-actions";
        cardActions.append(
          button("Add sale", true, () => openSale(play, item.card)),
          button("Edit card / results", false, () => openCard(play, item.card)),
          button("Delete card", false, () => deleteCard(item.card), true)
        );
        row.append(head, stats, cardActions);
        if (item.card.notes) { const note = document.createElement("div"); note.className = "play-notes"; note.textContent = item.card.notes; row.appendChild(note); }
        if (item.cardSales.length) {
          const saleList = document.createElement("div"); saleList.className = "play-sales";
          for (const sale of item.cardSales) {
            const saleRow = document.createElement("div"); saleRow.className = "play-sale";
            const saleDate = document.createElement("span"); saleDate.textContent = String(sale.sale_date || "").slice(0, 10);
            const detail = document.createElement("span"); detail.textContent = `${whole(sale.quantity)} sold${sale.notes ? " · " + sale.notes : ""}`;
            const value = document.createElement("strong"); value.className = "positive"; value.textContent = cash(n(sale.gross_amount) - n(sale.fees) - n(sale.shipping));
            const removeSale = document.createElement("button"); removeSale.className = "sale-delete";
            removeSale.type = "button"; removeSale.textContent = "Delete";
            removeSale.addEventListener("click", () => deleteSale(sale));
            saleRow.append(saleDate, detail, value, removeSale); saleList.appendChild(saleRow);
          }
          row.appendChild(saleList);
        }
        lines.appendChild(row);
      }
      article.appendChild(lines); list.appendChild(article);
    }
  }

  async function savePlay(event) {
    event.preventDefault();
    const message = document.getElementById("playMessage");
    if (!cloudSession?.token) { message.textContent = "Sign in before saving a grading play."; return; }
    const payload = {
      owner:cloudSession.record.id, play_name:document.getElementById("playName").value.trim(),
      submitted_date:document.getElementById("playSubmitted").value ? document.getElementById("playSubmitted").value + " 12:00:00.000Z" : "",
      status:document.getElementById("playStatus").value, notes:document.getElementById("playNotes").value.trim()
    };
    message.textContent = "Saving…";
    try {
      const record = await pbRequest("/api/collections/grading_plays/records" + (editingPlayId ? "/" + editingPlayId : ""), {
        method:editingPlayId ? "PATCH" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });
      const created = !editingPlayId;
      if (editingPlayId) plays = plays.map((play) => play.id === record.id ? record : play); else plays.unshift(record);
      resetPlayForm(); document.getElementById("playMessage").textContent = "Grading play saved."; render();
      if (created) openCard(record);
    } catch (error) { message.textContent = error.status === 404 ? "Run the PocketBase setup tool, then retry." : "The grading play could not be saved."; }
  }

  function editPlay(play) {
    editingPlayId = play.id;
    document.getElementById("playName").value = play.play_name || "";
    document.getElementById("playSubmitted").value = String(play.submitted_date || "").slice(0, 10);
    document.getElementById("playStatus").value = play.status || "planning";
    document.getElementById("playNotes").value = play.notes || "";
    document.getElementById("playSave").textContent = "Save play changes";
    document.getElementById("playCancel").hidden = false;
    document.getElementById("gradingPlayForm").scrollIntoView({ behavior:"smooth", block:"center" });
  }

  function resetPlayForm() {
    editingPlayId = ""; document.getElementById("gradingPlayForm").reset();
    document.getElementById("playSave").textContent = "Create grading play";
    document.getElementById("playCancel").hidden = true;
  }

  async function deletePlay(play) {
    if (!confirm(`Permanently delete "${play.play_name}" and every card and sale inside it?`)) return;
    try {
      await pbRequest("/api/collections/grading_plays/records/" + play.id, { method:"DELETE" });
      const cardIds = new Set(cards.filter((card) => card.play === play.id).map((card) => card.id));
      plays = plays.filter((item) => item.id !== play.id);
      cards = cards.filter((card) => card.play !== play.id);
      sales = sales.filter((sale) => sale.play !== play.id && !cardIds.has(sale.card));
      if (editingPlayId === play.id) resetPlayForm();
      render();
    } catch (_) { alert("The grading play could not be deleted."); }
  }

  function openCard(play, card = null) {
    activePlayId = play.id; editingCardId = card?.id || "";
    document.getElementById("gradingCardTitle").textContent = (card ? "Edit card · " : "Add card · ") + play.play_name;
    document.getElementById("gradingCardName").value = card?.card_name || "";
    document.getElementById("gradingCardQuantity").value = card?.quantity || 1;
    document.getElementById("gradingCardTens").value = card?.tens_count || 0;
    document.getElementById("gradingCardRawCost").value = card?.raw_cost_each || "";
    document.getElementById("gradingCardGradingCost").value = card?.grading_cost_each || "";
    document.getElementById("gradingCardNotes").value = card?.notes || "";
    document.getElementById("gradingCardModal").classList.add("open");
  }

  function closeCard() {
    activePlayId = ""; editingCardId = ""; document.getElementById("gradingCardForm").reset();
    document.getElementById("gradingCardModal").classList.remove("open");
    document.getElementById("gradingCardMessage").textContent = "";
  }

  async function saveCard(event) {
    event.preventDefault();
    const message = document.getElementById("gradingCardMessage");
    const quantity = whole(document.getElementById("gradingCardQuantity").value);
    const tens = whole(document.getElementById("gradingCardTens").value);
    const existingSold = editingCardId ? cardMath(cards.find((card) => card.id === editingCardId)).sold : 0;
    if (quantity < 1 || tens > quantity || existingSold > quantity) {
      message.textContent = existingSold > quantity ? `Quantity cannot be below ${existingSold} already sold.` : "Check the quantity and number of 10s."; return;
    }
    try {
      const record = await pbRequest("/api/collections/grading_play_cards/records" + (editingCardId ? "/" + editingCardId : ""), {
        method:editingCardId ? "PATCH" : "POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          owner:cloudSession.record.id, play:activePlayId,
          card_name:document.getElementById("gradingCardName").value.trim(), quantity,
          raw_cost_each:n(document.getElementById("gradingCardRawCost").value),
          grading_cost_each:n(document.getElementById("gradingCardGradingCost").value),
          tens_count:tens, notes:document.getElementById("gradingCardNotes").value.trim()
        })
      });
      if (editingCardId) cards = cards.map((card) => card.id === record.id ? record : card); else cards.push(record);
      closeCard(); render();
    } catch (error) { message.textContent = error.status === 404 ? "Run the PocketBase setup tool, then retry." : "The card could not be saved."; }
  }

  async function deleteCard(card) {
    const cardSales = sales.filter((sale) => sale.card === card.id);
    const warning = cardSales.length
      ? `Permanently delete "${card.card_name}" and its ${cardSales.length} sale record(s)?`
      : `Permanently delete "${card.card_name}" from this play?`;
    if (!confirm(warning)) return;
    try {
      await pbRequest("/api/collections/grading_play_cards/records/" + card.id, { method:"DELETE" });
      cards = cards.filter((item) => item.id !== card.id);
      sales = sales.filter((sale) => sale.card !== card.id);
      if (editingCardId === card.id) closeCard();
      render();
    } catch (_) { alert("The grading card could not be deleted."); }
  }

  function openSale(play, card) {
    activePlayId = play.id; activeCardId = card.id;
    document.getElementById("gradingSaleTitle").textContent = "Add sale · " + card.card_name;
    document.getElementById("gradingSaleDate").value = today();
    document.getElementById("gradingSaleModal").classList.add("open");
  }

  function closeSale() {
    activePlayId = ""; activeCardId = ""; document.getElementById("gradingSaleForm").reset();
    document.getElementById("gradingSaleModal").classList.remove("open");
    document.getElementById("gradingSaleMessage").textContent = "";
  }

  async function saveSale(event) {
    event.preventDefault();
    const message = document.getElementById("gradingSaleMessage");
    const card = cards.find((item) => item.id === activeCardId);
    if (!card) { message.textContent = "The card could not be found."; return; }
    const quantity = whole(document.getElementById("gradingSaleQuantity").value);
    const math = cardMath(card);
    if (quantity < 1 || quantity > math.remaining) { message.textContent = `Enter a quantity from 1 to ${math.remaining}.`; return; }
    try {
      const record = await pbRequest("/api/collections/grading_play_sales/records", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          owner:cloudSession.record.id, play:activePlayId, card:activeCardId,
          sale_date:document.getElementById("gradingSaleDate").value + " 12:00:00.000Z",
          quantity, gross_amount:n(document.getElementById("gradingSaleGross").value),
          fees:n(document.getElementById("gradingSaleFees").value),
          shipping:n(document.getElementById("gradingSaleShipping").value),
          notes:document.getElementById("gradingSaleNotes").value.trim()
        })
      });
      sales.unshift(record); closeSale(); render();
    } catch (error) { message.textContent = error.status === 404 ? "Run the PocketBase setup tool, then retry." : "The sale could not be saved."; }
  }

  async function deleteSale(sale) {
    if (!confirm(`Permanently delete this ${whole(sale.quantity)}-card sale record?`)) return;
    try {
      await pbRequest("/api/collections/grading_play_sales/records/" + sale.id, { method:"DELETE" });
      sales = sales.filter((item) => item.id !== sale.id);
      render();
    } catch (_) { alert("The grading sale could not be deleted."); }
  }

  install();
  window.addEventListener("slab-cloud-synced", load);
  window.addEventListener("focus", load);
  load();
})();
