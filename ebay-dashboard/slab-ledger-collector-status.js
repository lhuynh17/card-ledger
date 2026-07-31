(function () {
  "use strict";

  let timer = null;
  const STALE_AFTER_MS = 15 * 60 * 1000;

  function install() {
    if (document.getElementById("collectorStatusBanner")) return;
    const style = document.createElement("style");
    style.textContent = `
      .collector-status-banner{display:none;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 auto 14px;width:min(1180px,calc(100% - 28px));padding:12px 14px;border:1px solid var(--outline);border-radius:12px;background:var(--surface);box-shadow:0 8px 24px rgba(0,0,0,.16)}
      .collector-status-banner.open{display:flex}.collector-status-banner.attention,.collector-status-banner.error{border-color:#d66b61;background:rgba(137,45,37,.12)}.collector-status-banner.cooldown,.collector-status-banner.offline{border-color:#d0a936;background:rgba(151,112,13,.12)}
      .collector-status-banner strong{display:block;font-size:13px}.collector-status-banner p{margin:3px 0 0;color:var(--muted);font-size:12px}.collector-status-banner button{min-height:36px;padding:7px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--text);font-weight:700;cursor:pointer}
      @media(max-width:620px){.collector-status-banner{align-items:stretch;flex-direction:column}.collector-status-banner button{width:100%}}
    `;
    document.head.appendChild(style);
    const banner = document.createElement("section");
    banner.id = "collectorStatusBanner";
    banner.className = "collector-status-banner";
    banner.setAttribute("role", "status");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.id = "collectorStatusTitle";
    const message = document.createElement("p");
    message.id = "collectorStatusMessage";
    copy.append(title, message);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => banner.classList.remove("open"));
    banner.append(copy, dismiss);
    document.querySelector(".account-bar")?.insertAdjacentElement("afterend", banner);
  }

  function show(status) {
    const banner = document.getElementById("collectorStatusBanner");
    if (!banner) return;
    if (!status) {
      banner.classList.remove("open");
      return;
    }
    const heartbeat = new Date(status?.heartbeat_at || "");
    const stale = !Number.isFinite(heartbeat.getTime()) ||
      Date.now() - heartbeat.getTime() > STALE_AFTER_MS;
    const state = stale ? "offline" : String(status?.status || "ready");
    const visible = ["attention", "cooldown", "offline", "error"].includes(state);
    banner.className = `collector-status-banner ${state}${visible ? " open" : ""}`;
    document.getElementById("collectorStatusTitle").textContent =
      state === "attention" ? "Market collector needs your attention"
        : state === "offline" ? "Market collector appears offline"
          : state === "cooldown" ? "Market collector is cooling down"
            : "Market collector problem";
    document.getElementById("collectorStatusMessage").textContent =
      status?.safe_message || (
        state === "offline"
          ? "The Windows collector has not checked in recently. Confirm the computer, Tailscale, Chrome, and run.bat are running."
          : "Open the card's Market details for more information."
      );
  }

  async function refresh() {
    if (!cloudSession?.token) return show(null);
    try {
      const result = await pbRequest(
        "/api/collections/marketplace_collector_status/records?perPage=1&sort=-heartbeat_at"
      );
      show(result?.items?.[0] || null);
    } catch (_) {
      document.getElementById("collectorStatusBanner")?.classList.remove("open");
    }
  }

  install();
  refresh();
  timer = setInterval(refresh, 60000);
  window.addEventListener("slab-cloud-synced", refresh);
  window.addEventListener("focus", refresh);
})();
