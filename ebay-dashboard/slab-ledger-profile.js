(function () {
  "use strict";

  const LOCAL_KEY = "slabLedgerOwnerProfile";
  let preferenceId = "";
  let savedLogoFile = "";
  let pendingLogo = "";
  let removeLogo = false;

  const safeJson = (value) => {
    try { return JSON.parse(value || "{}"); } catch (_) { return {}; }
  };
  const fallbackName = () => {
    const record = cloudSession?.record || {};
    return record.name || record.username || String(record.email || "Offline collection").split("@")[0];
  };
  const initials = (name) => String(name || "SL").trim().split(/\s+/).slice(0, 2)
    .map((part) => part.charAt(0)).join("").toUpperCase() || "SL";

  function setAvatar(container, logo, name) {
    container.textContent = "";
    if (logo && /^data:image\/(?:jpeg|png|webp);base64,/i.test(logo)) {
      const image = document.createElement("img");
      image.src = logo;
      image.alt = "";
      container.appendChild(image);
    } else {
      const text = document.createElement("span");
      text.textContent = initials(name);
      container.appendChild(text);
    }
  }

  function localProfile() {
    return safeJson(localStorage.getItem(LOCAL_KEY));
  }

  function saveLocal(profile) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(profile));
  }

  function renderProfile(profile = localProfile()) {
    const name = profile.name || fallbackName();
    const logo = profile.logo || "";
    document.getElementById("ownerName").textContent = name;
    document.getElementById("ownerStatus").textContent = cloudSession?.token
      ? "Collection owner · tap to edit" : "Offline collection · tap to edit";
    setAvatar(document.getElementById("ownerAvatar"), logo, name);
  }

  function installUi() {
    const brandText = document.querySelector(".brand > div:last-child");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "owner-chip";
    chip.id = "ownerChip";
    chip.innerHTML = `<span class="owner-avatar" id="ownerAvatar"><span>SL</span></span>
      <span><strong id="ownerName">Collection owner</strong><small id="ownerStatus">Tap to edit profile</small></span>`;
    brandText.appendChild(chip);

    const style = document.createElement("style");
    style.textContent = `
      .profile-modal{position:fixed;inset:0;z-index:10020;display:none;place-items:center;padding:18px;background:rgba(2,5,10,.82);backdrop-filter:blur(5px)}
      .profile-modal.open{display:grid}.profile-card{width:min(460px,100%);padding:22px;border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:0 24px 80px #0009}
      .profile-card h2{margin:0;font:650 21px var(--font-display)}.profile-card>p{margin:5px 0 18px;color:var(--muted);font-size:12px;line-height:1.45}
      .profile-preview{display:flex;align-items:center;gap:13px;margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2)}
      .profile-preview .owner-avatar{width:58px;height:58px;border-radius:12px;font-size:18px}.profile-preview strong{display:block}.profile-preview small{display:block;color:var(--muted);font-size:11px}
      .profile-card label{display:block;margin:12px 0 6px;font-size:12px;color:var(--muted)}.profile-card input[type=text],.profile-card input[type=file]{box-sizing:border-box;width:100%;min-height:44px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);font:inherit}
      .profile-logo-actions{display:flex;gap:8px;margin-top:8px}.profile-logo-actions button,.profile-actions button{min-height:40px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);font-weight:750;cursor:pointer}
      .profile-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.profile-actions .primary{border-color:var(--accent);background:var(--accent);color:#fff}.profile-message{min-height:18px;margin-top:10px;color:var(--muted);font-size:11px}.profile-message.error{color:#ff7885}
    `;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.className = "profile-modal";
    modal.id = "profileModal";
    modal.innerHTML = `<div class="profile-card" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
      <h2 id="profileTitle">Collection profile</h2>
      <p>This name and small logo identify who is signed in and who this collection belongs to.</p>
      <div class="profile-preview"><span class="owner-avatar" id="profilePreviewAvatar"><span>SL</span></span><span><strong id="profilePreviewName">Collection owner</strong><small>Slab Ledger collection</small></span></div>
      <label for="profileName">Display name or business name</label>
      <input id="profileName" type="text" maxlength="120" autocomplete="organization" placeholder="Your name or business">
      <label for="profileLogo">Business logo or profile picture</label>
      <input id="profileLogo" type="file" accept="image/jpeg,image/png,image/webp">
      <div class="profile-logo-actions"><button id="profileRemoveLogo" type="button">Remove picture</button></div>
      <div class="profile-message" id="profileMessage" role="status"></div>
      <div class="profile-actions"><button id="profileCancel" type="button">Cancel</button><button id="profileSave" class="primary" type="button">Save profile</button></div>
    </div>`;
    document.body.appendChild(modal);

    chip.addEventListener("click", openEditor);
    document.getElementById("profileCancel").addEventListener("click", closeEditor);
    document.getElementById("profileSave").addEventListener("click", saveProfile);
    document.getElementById("profileLogo").addEventListener("change", chooseLogo);
    document.getElementById("profileRemoveLogo").addEventListener("click", () => {
      pendingLogo = "";
      removeLogo = true;
      updateEditorPreview();
    });
    document.getElementById("profileName").addEventListener("input", updateEditorPreview);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeEditor(); });
  }

  function openEditor() {
    const profile = localProfile();
    pendingLogo = profile.logo || "";
    removeLogo = false;
    document.getElementById("profileName").value = profile.name || fallbackName();
    document.getElementById("profileLogo").value = "";
    document.getElementById("profileMessage").textContent = "";
    updateEditorPreview();
    document.getElementById("profileModal").classList.add("open");
    document.getElementById("profileName").focus();
  }

  function closeEditor() {
    document.getElementById("profileModal").classList.remove("open");
  }

  function updateEditorPreview() {
    const name = document.getElementById("profileName").value.trim() || fallbackName();
    document.getElementById("profilePreviewName").textContent = name;
    setAvatar(document.getElementById("profilePreviewAvatar"), pendingLogo, name);
  }

  async function chooseLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      pendingLogo = await resizeImage(file);
      removeLogo = false;
      updateEditorPreview();
    } catch (_) {
      const message = document.getElementById("profileMessage");
      message.textContent = "That image could not be read. Try a JPG, PNG, or WebP file.";
      message.className = "profile-message error";
    }
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", .84));
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
      image.src = url;
    });
  }

  async function loadRemoteProfile() {
    if (!cloudSession?.token) {
      preferenceId = "";
      savedLogoFile = "";
      renderProfile();
      return;
    }
    try {
      const result = await pbRequest("/api/collections/app_preferences/records?perPage=1");
      const record = result?.items?.[0];
      if (!record) {
        renderProfile({ name:fallbackName(), logo:"" });
        return;
      }
      preferenceId = record.id;
      const cached = localProfile();
      const nextLogoFile = record.profile_logo || "";
      let logo = nextLogoFile && nextLogoFile === savedLogoFile ? (cached.logo || "") : "";
      savedLogoFile = nextLogoFile;
      if (savedLogoFile) {
        if (!logo) {
          const token = await protectedFileToken();
          const response = await fetch(PB_URL + "/api/files/" + record.collectionId + "/" +
            record.id + "/" + encodeURIComponent(savedLogoFile) + "?token=" + encodeURIComponent(token), {
            headers:{ Authorization:cloudSession.token }
          });
          if (response.ok) logo = await blobDataUrl(await response.blob());
        }
      }
      const profile = { name:record.display_name || fallbackName(), logo };
      saveLocal({ ...profile, syncedLogo:logo });
      renderProfile(profile);
    } catch (_) {
      renderProfile();
    }
  }

  async function saveProfile() {
    const button = document.getElementById("profileSave");
    const message = document.getElementById("profileMessage");
    const name = document.getElementById("profileName").value.trim() || fallbackName();
    const profile = { name, logo:pendingLogo };
    const previous = localProfile();
    saveLocal(profile);
    renderProfile(profile);
    if (!cloudSession?.token) {
      message.textContent = "Saved on this device. Sign in to sync it.";
      setTimeout(closeEditor, 650);
      return;
    }
    button.disabled = true;
    message.className = "profile-message";
    message.textContent = "Saving and syncing…";
    try {
      if (!preferenceId) {
        const result = await pbRequest("/api/collections/app_preferences/records?perPage=1");
        preferenceId = result?.items?.[0]?.id || "";
        savedLogoFile = result?.items?.[0]?.profile_logo || "";
      }
      const form = new FormData();
      form.append("owner", cloudSession.record.id);
      form.append("display_name", name);
      if (pendingLogo && pendingLogo !== previous.syncedLogo) {
        form.append("profile_logo", dataUrlBlob(pendingLogo), "collection-profile.jpg");
      } else if (removeLogo && savedLogoFile) {
        form.append("profile_logo", "");
      }
      const record = await pbRequest("/api/collections/app_preferences/records" +
        (preferenceId ? "/" + preferenceId : ""), {
        method:preferenceId ? "PATCH" : "POST",
        body:form
      });
      preferenceId = record.id;
      savedLogoFile = record.profile_logo || "";
      saveLocal({ ...profile, syncedLogo:pendingLogo });
      message.textContent = "Profile saved and synced.";
      setTimeout(closeEditor, 650);
    } catch (error) {
      message.textContent = error.status === 400 || error.status === 404
        ? "Run the PocketBase setup tool once, then save again."
        : "Saved on this device, but cloud sync failed.";
      message.className = "profile-message error";
    } finally {
      button.disabled = false;
    }
  }

  window.slabProfileRefresh = loadRemoteProfile;
  installUi();
  renderProfile();
  loadRemoteProfile();
  window.addEventListener("slab-cloud-synced", loadRemoteProfile);
})();
