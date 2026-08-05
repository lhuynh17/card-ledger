"use strict";

const BRIDGE = "http://127.0.0.1:8000";
const ALARM = "slab-ledger-poll";
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

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

async function closeJobTab(tabId) {
  if (!tabId) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    await chrome.tabs.remove(tabId).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function poll() {
  const config = await settings();
  if (!config.enabled || !config.pairingKey) return;
  const active = await chrome.storage.session.get({ activeJob:null });
  if (active.activeJob) {
    const claimedAt = Number(active.activeJob.claimedAt || 0);
    if (claimedAt && Date.now() - claimedAt < JOB_TIMEOUT_MS) return;
    await bridge("/api/extension/result", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        jobId:active.activeJob.id,
        status:"failed",
        error:"Chrome lookup timed out; existing market data was preserved.",
      }),
    }).catch(() => {});
    await closeJobTab(active.activeJob.tabId);
    await chrome.storage.session.remove("activeJob");
    await setBadge("!", "#b42318");
  }
  try {
    const result = await bridge("/api/extension/next");
    if (!result.job) {
      await setBadge("", "#357a50");
      return;
    }
    const tab = await chrome.tabs.create({ url:result.job.url, active:false });
    await chrome.storage.session.set({
      activeJob:{ ...result.job, tabId:tab.id, claimedAt:Date.now() },
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
  if (message?.type === "SLAB_LEDGER_GET_ACTIVE_JOB") {
    chrome.storage.session.get({ activeJob:null }).then(({ activeJob }) => {
      sendResponse({ job:activeJob });
    });
    return true;
  }
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
        soldItems:message.soldItems || [],
        activeItems:message.activeItems || [],
        identity:message.identity || {},
        error:message.error || "",
      }),
    });
    if (message.status === "operator_required") {
      await chrome.tabs.update(job.tabId, { active:true });
      await setBadge("!", "#b54708");
      return;
    }
    await chrome.storage.session.remove("activeJob");
    await closeJobTab(job.tabId);
    await setBadge("", "#357a50");
    setTimeout(poll, 3000);
  })().then(() => sendResponse({ ok:true })).catch(() => {
    setBadge("!", "#b42318");
    sendResponse({ ok:false });
  });
  return true;
});

poll();
