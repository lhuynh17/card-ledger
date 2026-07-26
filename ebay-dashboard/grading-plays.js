(function () {
  "use strict";

  let items = [];
  let editingId = "";
  let pendingPhoto = "";
  let removeExistingPhoto = false;
  const photoUrls = new Map();
  const n = (value) => Math.max(0, Number(value) || 0);
  const whole = (value) => Math.max(1, Math.floor(Number(value) || 1));
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:2
  }).format(Number(value) || 0);

  function totals(record) {
    const quantity = whole(record.quantity);
    const raw = n(record.raw_cost_each) * quantity;
    const grading = n(record.grading_cost_each) * quantity;
    return { quantity, raw, grading, allIn:raw + grading };
  }

  function install() {
    const style = document.createElement("style");
    style.textContent = `
      .grading-section{margin-top:28px;padding-top:2px}.grading-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:0 2px 11px;border-bottom:1px solid var(--line)}.grading-head::before{content:"04";display:grid;place-items:center;width:31px;height:31px;flex:0 0 auto;border-radius:9px;background:rgba(53,179,126,.14);color:#6fd5a4;font:800 11px var(--font-mono)}.grading-head h2{margin:0;font:650 17px var(--font-display);letter-spacing:.05em;text-transform:uppercase}.grading-head p{margin:2px 0 0;color:var(--muted);font-size:11px}
      .grading-new{position:relative;padding:17px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,var(--surface),var(--surface-end));box-shadow:0 10px 28px rgba(0,0,0,.16);overflow:hidden}.grading-new::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#35b37e}.grading-form{display:grid;grid-template-columns:minmax(180px,2fr) repeat(3,minmax(120px,1fr));align-items:start;gap:10px}.grading-field{display:grid;min-width:0;grid-template-rows:minmax(30px,auto) auto;align-content:start;gap:5px}.grading-field.full{grid-column:1/-1}.grading-field label{display:flex;min-height:30px;align-items:flex-end;font-size:11px;line-height:1.2;color:var(--muted);font-weight:750}.grading-field input,.grading-field textarea{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:9px;font:inherit}.grading-field textarea{min-height:62px;resize:vertical}
      .grading-photo-line{grid-column:1/-1;display:flex;align-items:center;gap:12px;min-width:0}.grading-photo-preview{width:72px;height:72px;display:grid;place-items:center;flex:0 0 auto;overflow:hidden;border:1px dashed var(--line);border-radius:10px;background:var(--surface-2);color:var(--muted);font-size:10px;text-align:center}.grading-photo-preview img{width:100%;height:100%;object-fit:cover}.grading-photo-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.grading-photo-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
      .grading-estimate{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);border-radius:11px;background:var(--surface-2);overflow:hidden}.grading-estimate div{padding:11px 13px;border-right:1px solid var(--line)}.grading-estimate div:last-child{border-right:0}.grading-estimate span{display:block;min-height:26px;color:var(--muted);font-size:9px;font-weight:750;letter-spacing:.05em;text-transform:uppercase}.grading-estimate strong{display:block;font:750 16px var(--font-mono)}.grading-estimate div:last-child strong{color:var(--ok)}
      .grading-form-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px}.grading-button{min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);padding:7px 11px;font-weight:800;cursor:pointer}.grading-button.primary{border-color:var(--accent);background:var(--accent);color:#fff}.grading-button.danger{border-color:rgba(255,120,133,.35);color:#ff7885}.grading-message{color:var(--muted);font-size:11px}
      .grading-list{display:grid;gap:10px;margin-top:14px}.grading-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.grading-item-photo{width:70px;height:70px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--muted);font-size:9px;text-align:center}.grading-item-photo img{width:100%;height:100%;object-fit:cover}.grading-item h3{margin:0;font-size:14px}.grading-item-detail{margin-top:4px;color:var(--muted);font-size:10px;line-height:1.45}.grading-item-note{margin-top:4px;color:var(--muted);font-size:10px}.grading-item-total{text-align:right}.grading-item-total span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase}.grading-item-total strong{display:block;color:var(--ok);font:800 17px var(--font-mono)}.grading-item-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:7px}
      @media(max-width:760px){.grading-form{grid-template-columns:1fr 1fr}.grading-field:first-child{grid-column:1/-1}.grading-item{grid-template-columns:auto minmax(0,1fr)}.grading-item-total{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;text-align:left;padding-top:9px;border-top:1px solid var(--line)}}
      @media(max-width:460px){.grading-form{grid-template-columns:1fr}.grading-field:first-child,.grading-field.full{grid-column:1}.grading-estimate{grid-template-columns:1fr}.grading-estimate div{border-right:0;border-bottom:1px solid var(--line)}.grading-estimate div:last-child{border-bottom:0}.grading-item{grid-template-columns:1fr}.grading-item-photo{width:100%;height:150px}.grading-item-total{grid-column:1}}
    `;
    document.head.appendChild(style);

    const section = document.createElement("div");
    section.className = "grading-section";
    section.innerHTML = `
      <div class="grading-head"><div><h2>Grading tracker</h2><p>Remember which raw cards you decided to grade and what you have invested in them.</p></div></div>
      <div class="grading-new">
        <form id="gradingItemForm" class="grading-form">
          <div class="grading-field"><label for="gradingItemName">Raw card name</label><input id="gradingItemName" required placeholder="Card, set, number, variation"></div>
          <div class="grading-field"><label for="gradingItemQuantity">Quantity</label><input id="gradingItemQuantity" type="number" min="1" step="1" value="1" required></div>
          <div class="grading-field"><label for="gradingItemRawCost">Cost paid per card</label><input id="gradingItemRawCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-field"><label for="gradingItemGradingCost">Grading cost per card</label><input id="gradingItemGradingCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div class="grading-photo-line">
            <div class="grading-photo-preview" id="gradingPhotoPreview">No photo</div>
            <div class="grading-photo-controls">
              <input class="grading-photo-input" id="gradingPhotoInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">
              <button class="grading-button" id="gradingPhotoChoose" type="button">Add card photo</button>
              <button class="grading-button" id="gradingPhotoRemove" type="button" hidden>Remove photo</button>
              <span class="grading-message">Optional</span>
            </div>
          </div>
          <div class="grading-field full"><label for="gradingItemNotes">Note (optional)</label><textarea id="gradingItemNotes" placeholder="Condition, expected grade, or submission reminder"></textarea></div>
          <div class="grading-estimate">
            <div><span>Raw card total</span><strong id="gradingRawTotal">$0.00</strong></div>
            <div><span>Grading total</span><strong id="gradingFeeTotal">$0.00</strong></div>
            <div><span>Estimated all-in cost</span><strong id="gradingAllInTotal">$0.00</strong></div>
          </div>
          <div class="grading-form-actions">
            <button class="grading-button primary" id="gradingItemSave" type="submit">Add to grading tracker</button>
            <button class="grading-button" id="gradingItemCancel" type="button" hidden>Cancel edit</button>
            <span class="grading-message" id="gradingItemMessage"></span>
          </div>
        </form>
      </div>
      <div class="grading-list" id="gradingItemList"></div>`;
    document.querySelector(".tools-section").appendChild(section);

    document.getElementById("gradingItemForm").addEventListener("submit", save);
    document.getElementById("gradingItemCancel").addEventListener("click", resetForm);
    document.getElementById("gradingPhotoChoose").addEventListener("click", () =>
      document.getElementById("gradingPhotoInput").click());
    document.getElementById("gradingPhotoRemove").addEventListener("click", () => {
      pendingPhoto = "";
      removeExistingPhoto = true;
      document.getElementById("gradingPhotoInput").value = "";
      renderPreview();
    });
    document.getElementById("gradingPhotoInput").addEventListener("change", selectPhoto);
    ["gradingItemQuantity","gradingItemRawCost","gradingItemGradingCost"].forEach((id) =>
      document.getElementById(id).addEventListener("input", updateEstimate));
    render();
  }

  function formTotals() {
    return totals({
      quantity:document.getElementById("gradingItemQuantity").value,
      raw_cost_each:document.getElementById("gradingItemRawCost").value,
      grading_cost_each:document.getElementById("gradingItemGradingCost").value
    });
  }

  function updateEstimate() {
    const value = formTotals();
    document.getElementById("gradingRawTotal").textContent = cash(value.raw);
    document.getElementById("gradingFeeTotal").textContent = cash(value.grading);
    document.getElementById("gradingAllInTotal").textContent = cash(value.allIn);
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const message = document.getElementById("gradingItemMessage");
    message.textContent = "Preparing photo…";
    try {
      pendingPhoto = await shrinkImage(file, 1000, 0.78);
      removeExistingPhoto = false;
      renderPreview();
      message.textContent = "";
    } catch (_) {
      message.textContent = "That photo could not be prepared. Try a JPG or PNG.";
    }
  }

  function renderPreview(existingUrl = "") {
    const preview = document.getElementById("gradingPhotoPreview");
    const src = pendingPhoto || existingUrl;
    preview.textContent = "";
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "Selected raw card";
      preview.appendChild(image);
    } else {
      preview.textContent = "No photo";
    }
    document.getElementById("gradingPhotoRemove").hidden = !src;
  }

  async function load() {
    if (!cloudSession?.token) {
      items = [];
      render();
      return;
    }
    try {
      const data = await pbRequest("/api/collections/grading_items/records?perPage=500&sort=-created");
      items = data?.items || [];
      render();
      loadPhotos();
    } catch (error) {
      document.getElementById("gradingItemMessage").textContent = error.status === 404
        ? "Run the PocketBase setup tool once to enable the new grading tracker."
        : "The grading tracker could not be loaded.";
    }
  }

  async function loadPhotos() {
    const withPhotos = items.filter((item) => item.photo && !photoUrls.has(item.id));
    if (!withPhotos.length) return;
    try {
      const token = await protectedFileToken();
      await Promise.all(withPhotos.map(async (item) => {
        const response = await fetch(PB_URL + "/api/files/" + item.collectionId + "/" +
          item.id + "/" + encodeURIComponent(item.photo) + "?token=" + encodeURIComponent(token));
        if (!response.ok) return;
        photoUrls.set(item.id, URL.createObjectURL(await response.blob()));
      }));
      render();
    } catch (_) {}
  }

  function render() {
    const list = document.getElementById("gradingItemList");
    if (!list) return;
    list.textContent = "";
    if (!cloudSession?.token) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Sign in to sync and manage your grading tracker.";
      list.appendChild(empty);
      return;
    }
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No cards in your grading tracker yet.";
      list.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const value = totals(item);
      const article = document.createElement("article");
      article.className = "grading-item";
      const photo = document.createElement("div");
      photo.className = "grading-item-photo";
      const src = photoUrls.get(item.id);
      if (src) {
        const image = document.createElement("img");
        image.src = src;
        image.alt = item.card_name;
        photo.appendChild(image);
      } else {
        photo.textContent = item.photo ? "Loading photo…" : "No photo";
      }
      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.card_name;
      const detail = document.createElement("div");
      detail.className = "grading-item-detail";
      detail.textContent = `${value.quantity} card${value.quantity === 1 ? "" : "s"} · ${cash(item.raw_cost_each)} raw each · ${cash(item.grading_cost_each)} grading each · Raw total ${cash(value.raw)} · Grading total ${cash(value.grading)}`;
      body.append(title, detail);
      if (item.notes) {
        const note = document.createElement("div");
        note.className = "grading-item-note";
        note.textContent = item.notes;
        body.appendChild(note);
      }
      const total = document.createElement("div");
      total.className = "grading-item-total";
      const label = document.createElement("span");
      label.textContent = "Estimated all-in";
      const amount = document.createElement("strong");
      amount.textContent = cash(value.allIn);
      const actions = document.createElement("div");
      actions.className = "grading-item-actions";
      actions.append(makeButton("Edit", () => edit(item)), makeButton("Delete", () => remove(item), true));
      total.append(label, amount, actions);
      article.append(photo, body, total);
      list.appendChild(article);
    });
  }

  function makeButton(label, action, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "grading-button" + (danger ? " danger" : "");
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function edit(item) {
    editingId = item.id;
    pendingPhoto = "";
    removeExistingPhoto = false;
    document.getElementById("gradingItemName").value = item.card_name || "";
    document.getElementById("gradingItemQuantity").value = item.quantity || 1;
    document.getElementById("gradingItemRawCost").value = item.raw_cost_each || "";
    document.getElementById("gradingItemGradingCost").value = item.grading_cost_each || "";
    document.getElementById("gradingItemNotes").value = item.notes || "";
    document.getElementById("gradingItemSave").textContent = "Save tracker changes";
    document.getElementById("gradingItemCancel").hidden = false;
    document.getElementById("gradingItemMessage").textContent = "Editing tracker item";
    renderPreview(photoUrls.get(item.id) || "");
    updateEstimate();
    document.getElementById("gradingItemForm").scrollIntoView({ behavior:"smooth", block:"center" });
    document.getElementById("gradingItemName").focus({ preventScroll:true });
  }

  function resetForm() {
    editingId = "";
    pendingPhoto = "";
    removeExistingPhoto = false;
    document.getElementById("gradingItemForm").reset();
    document.getElementById("gradingItemQuantity").value = 1;
    document.getElementById("gradingItemSave").textContent = "Add to grading tracker";
    document.getElementById("gradingItemCancel").hidden = true;
    document.getElementById("gradingItemMessage").textContent = "";
    renderPreview();
    updateEstimate();
  }

  async function save(event) {
    event.preventDefault();
    const message = document.getElementById("gradingItemMessage");
    if (!cloudSession?.token) {
      message.textContent = "Sign in before saving a grading item.";
      return;
    }
    message.textContent = "Saving…";
    const form = new FormData();
    form.append("owner", cloudSession.record.id);
    form.append("card_name", document.getElementById("gradingItemName").value.trim());
    form.append("quantity", String(whole(document.getElementById("gradingItemQuantity").value)));
    form.append("raw_cost_each", String(n(document.getElementById("gradingItemRawCost").value)));
    form.append("grading_cost_each", String(n(document.getElementById("gradingItemGradingCost").value)));
    form.append("notes", document.getElementById("gradingItemNotes").value.trim());
    if (pendingPhoto) form.append("photo", dataUrlBlob(pendingPhoto), "raw-card.jpg");
    if (editingId && removeExistingPhoto) form.append("photo", "");
    try {
      const record = await pbRequest("/api/collections/grading_items/records" +
        (editingId ? "/" + editingId : ""), {
        method:editingId ? "PATCH" : "POST",
        body:form
      });
      if (editingId) {
        const oldUrl = photoUrls.get(editingId);
        if ((pendingPhoto || removeExistingPhoto) && oldUrl) {
          URL.revokeObjectURL(oldUrl);
          photoUrls.delete(editingId);
        }
        items = items.map((item) => item.id === record.id ? record : item);
      } else {
        items.unshift(record);
      }
      resetForm();
      document.getElementById("gradingItemMessage").textContent = "Grading tracker saved.";
      render();
      loadPhotos();
    } catch (error) {
      message.textContent = error.status === 404
        ? "Run the PocketBase setup tool once, then retry."
        : "The grading item could not be saved.";
    }
  }

  async function remove(item) {
    if (!confirm(`Permanently delete "${item.card_name}" from the grading tracker?`)) return;
    try {
      await pbRequest("/api/collections/grading_items/records/" + item.id, { method:"DELETE" });
      const url = photoUrls.get(item.id);
      if (url) URL.revokeObjectURL(url);
      photoUrls.delete(item.id);
      items = items.filter((row) => row.id !== item.id);
      if (editingId === item.id) resetForm();
      render();
    } catch (_) {
      alert("The grading item could not be deleted.");
    }
  }

  install();
  window.gradingItemTotals = totals;
  window.addEventListener("slab-cloud-synced", load);
  window.addEventListener("focus", load);
  load();
})();
