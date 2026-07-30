"use strict";

const pairingKey = document.getElementById("pairingKey");
const enabled = document.getElementById("enabled");
const message = document.getElementById("message");

chrome.storage.local.get({ pairingKey:"", enabled:false }).then((settings) => {
  pairingKey.value = settings.pairingKey;
  enabled.checked = settings.enabled;
});

document.getElementById("save").addEventListener("click", async () => {
  const key = pairingKey.value.trim();
  message.textContent = "Testing the local collector…";
  try {
    const response = await fetch("http://127.0.0.1:8000/api/extension/health", {
      headers:{"X-Slab-Collector-Key":key},
    });
    if (!response.ok) throw new Error("not_connected");
    await chrome.storage.local.set({
      pairingKey:key,
      enabled:enabled.checked,
    });
    message.textContent = enabled.checked
      ? "Connected. Automatic searches are enabled."
      : "Connected. Turn on the checkbox when you are ready.";
  } catch (_) {
    message.textContent = "Could not connect. Start run.bat and check the pairing code.";
  }
});
