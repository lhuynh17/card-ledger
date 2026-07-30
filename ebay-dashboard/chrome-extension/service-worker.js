"use strict";

const BRIDGE = "http://127.0.0.1:8000";
const ALARM = "slab-ledger-poll";

async function settings() {
  return chrome.storage.local.get({ pairingKey:"", enabled:false });
}

async function bridge(path, options = {}) {
  const config = await settings();
  if (!config.pairingKey) throw new Error("pairing_required");
  const headers = {
    ...(options.headers || {}),
    "X-Slab-Collector-Key":config.pairingKey,
  };
  const response = await fetch(BRIDGE + path, { ...options, headers });
  if (!response.ok) throw new Error(`bridge_${response.status}`);
  return response.json();
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function poll() {
  const config = await settings();
  if (!config.enabled || !config.pairingKey) return;
  const active = await chrome.storage.session.get({ activeJob:null });
  if (active.activeJob) return;
  try {
    const result = await bridge("/api/extension/next");
    if (!result.job) {
      await setBadge("", "#357a50");
      return;
    }
    const tab = await chrome.tabs.create({ url:result.job.url, active:false });
    await chrome.storage.session.set({
      activeJob:{ ...result.job, tabId:tab.id },
    });
    await setBadge("1", "#357a50");
  } catch (_) {
    await setBadge("!", "#b42318");
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(ALARM, { periodInMinutes:1 });
  await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes:1 });
  poll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) poll();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SLAB_LEDGER_PAGE_RESULT") return;
  (async () => {
    const stored = await chrome.storage.session.get({ activeJob:null });
    const job = stored.activeJob;
    if (!job || sender.tab?.id !== job.tabId) return;
    await bridge("/api/extension/result", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        jobId:job.id,
        status:message.status,
        items:message.items || [],
        error:message.error || "",
      }),
    });
    if (message.status === "operator_required") {
      await chrome.tabs.update(job.tabId, { active:true });
      await setBadge("!", "#b54708");
      return;
    }
    await chrome.storage.session.remove("activeJob");
    if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {});
    await setBadge("", "#357a50");
    setTimeout(poll, 3000);
  })().then(() => sendResponse({ ok:true })).catch(() => {
    setBadge("!", "#b42318");
    sendResponse({ ok:false });
  });
  return true;
});

poll();
