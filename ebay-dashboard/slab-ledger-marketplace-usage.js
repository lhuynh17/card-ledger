(function () {
  "use strict";

  let usage = null;
  let installed = false;

  const number = (value) => new Intl.NumberFormat("en-US").format(Number(value) || 0);
  const percent = (value) => `${Math.max(0, Number(value) || 0).toFixed(1)}%`;
  const shortTime = (value) => {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime())
      ? date.toLocaleString([], { dateStyle:"short", timeStyle:"short" })
      : "";
  };

  function addMetric(container, label, value) {
    const card = document.createElement("div");
    card.className = "market-usage-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(caption, strong);
    container.appendChild(card);
  }

  function addRows(container, rows, emptyText, errorRows) {
    container.textContent = "";
    if (!rows?.length) {
      const empty = document.createElement("p");
      empty.className = "market-usage-empty";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }
    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "market-usage-row" + (errorRows ? " error" : "");
      const heading = document.createElement("div");
      const status = document.createElement("strong");
      status.textContent = String(item.status || "activity").replaceAll("_", " ");
      const when = document.createElement("time");
      when.textContent = shortTime(item.at);
      heading.append(status, when);
      const message = document.createElement("p");
      message.textContent = item.message || (
        item.cache_hit ? "Private cache result reused." : `${number(item.records_used)} records used.`
      );
      row.append(heading, message);
      container.appendChild(row);
    }
  }

  function render() {
    const button = document.getElementById("marketUsageButton");
    if (!button) return;
    const visible = Boolean(cloudSession?.token && usage?.enabled);
    button.hidden = !visible;
    if (!usage) return;
    button.textContent = `Marketplace ${number(usage.remaining_month)} left`;
    const grid = document.getElementById("marketUsageMetrics");
    if (!grid) return;
    grid.textContent = "";
    addMetric(grid, "Records used today", number(usage.records_used_today));
    addMetric(grid, "Records used this month", number(usage.records_used_month));
    addMetric(grid, "Remaining allowance", number(usage.remaining_month));
    addMetric(grid, "Monthly allowance used", percent(usage.percent_consumed));
    addMetric(grid, "Average daily usage", number(usage.average_daily_usage));
    addMetric(grid, "Projected month end", number(usage.projected_month_end_usage));
    addMetric(grid, "Live API operations", number(usage.live_api_operations));
    addMetric(grid, "Records per operation", number(usage.records_per_operation));
    addMetric(grid, "Cache hits this month", number(usage.cache_hits_month));

    const status = document.getElementById("marketUsageStatus");
    const state = usage.kill_switch
      ? "Kill switch is on. No live requests can run."
      : usage.configured
        ? "Evaluation mode is ready. Results never overwrite saved values automatically."
        : "Live account validation and secure server configuration are still required.";
    status.textContent = state;
    status.className = "market-usage-status" + (
      usage.kill_switch || !usage.configured ? " warning" : " ok"
    );

    const features = document.getElementById("marketUsageFeatures");
    features.textContent = "";
    const entries = Object.entries(usage.usage_by_feature || {});
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "market-usage-empty";
      empty.textContent = "No managed-provider usage yet.";
      features.appendChild(empty);
    } else {
      for (const [feature, count] of entries.sort((left, right) => right[1] - left[1])) {
        const row = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = feature.replaceAll("_", " ");
        const value = document.createElement("strong");
        value.textContent = number(count);
        row.append(label, value);
        features.appendChild(row);
      }
    }
    addRows(
      document.getElementById("marketUsageActivity"),
      usage.recent_activity,
      "No managed marketplace activity yet.",
      false
    );
    addRows(
      document.getElementById("marketUsageErrors"),
      usage.recent_errors,
      "No recent provider errors.",
      true
    );
  }

  async function refresh(force = false) {
    if (!cloudSession?.token) {
      usage = null;
      render();
      return null;
    }
    if (!force && usage) return usage;
    try {
      usage = await pbRequest("/api/slab-ledger/marketplace/usage");
    } catch (error) {
      if (error.status !== 404 && error.status !== 503) {
        console.warn("Marketplace usage unavailable:", error);
      }
      usage = null;
    }
    render();
    return usage;
  }

  async function search(payload) {
    const result = await pbRequest("/api/slab-ledger/marketplace/search", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    if (result?.usage) usage = result.usage;
    render();
    return result;
  }

  function install() {
    if (installed) return;
    installed = true;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "marketUsageButton";
    button.className = "parse-credit-chip marketplace-usage-chip";
    button.hidden = true;
    button.textContent = "Marketplace usage";
    document.getElementById("accountBar").appendChild(button);

    const modal = document.createElement("div");
    modal.id = "marketUsageModal";
    modal.className = "market-usage-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "marketUsageTitle");
    modal.innerHTML = `<section class="market-usage-panel">
      <header><div><small>Private provider controls</small><h2 id="marketUsageTitle">Marketplace Usage</h2></div>
      <button type="button" aria-label="Close marketplace usage">×</button></header>
      <div class="market-usage-body">
        <p id="marketUsageStatus" class="market-usage-status"></p>
        <div id="marketUsageMetrics" class="market-usage-metrics"></div>
        <div class="market-usage-columns">
          <section><h3>Usage by feature</h3><div id="marketUsageFeatures" class="market-usage-features"></div></section>
          <section><h3>Recent activity</h3><div id="marketUsageActivity"></div></section>
        </div>
        <section><h3>Recent errors</h3><div id="marketUsageErrors"></div></section>
      </div></section>`;
    document.body.appendChild(modal);

    const style = document.createElement("style");
    style.textContent = `
      .marketplace-usage-chip{cursor:pointer}.market-usage-modal{position:fixed;inset:0;z-index:1300;display:none;place-items:center;padding:14px;background:rgba(3,8,5,.78);backdrop-filter:blur(5px)}
      .market-usage-modal.open{display:grid}.market-usage-panel{width:min(980px,100%);max-height:94vh;overflow:auto;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--text);box-shadow:0 28px 90px #0008}
      .market-usage-panel>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:19px 21px;border-bottom:1px solid var(--line)}.market-usage-panel h2{margin:3px 0 0}.market-usage-panel header small{color:var(--muted);font-weight:750;text-transform:uppercase;letter-spacing:.08em}.market-usage-panel header button{width:40px;height:40px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:23px;cursor:pointer}
      .market-usage-body{padding:20px}.market-usage-status{margin:0 0 15px;padding:11px 13px;border-radius:10px;background:var(--surface-2);color:var(--muted)}.market-usage-status.ok{color:var(--ok)}.market-usage-status.warning{color:#d9a942}
      .market-usage-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.market-usage-metric{padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2)}.market-usage-metric span{display:block;color:var(--muted);font-size:11px}.market-usage-metric strong{display:block;margin-top:5px;font-size:21px}
      .market-usage-columns{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:18px;margin-top:20px}.market-usage-body h3{margin:18px 0 9px;font-size:14px}.market-usage-features>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
      .market-usage-row{padding:10px 0;border-bottom:1px solid var(--line)}.market-usage-row>div{display:flex;justify-content:space-between;gap:12px}.market-usage-row strong{text-transform:capitalize}.market-usage-row time{color:var(--muted);font-size:11px}.market-usage-row p{margin:4px 0 0;color:var(--muted);font-size:12px}.market-usage-row.error strong{color:#e57c70}.market-usage-empty{color:var(--muted);font-size:12px}
      @media(max-width:680px){.market-usage-modal{padding:5px}.market-usage-body{padding:14px}.market-usage-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.market-usage-columns{grid-template-columns:1fr}.market-usage-metric strong{font-size:17px}}
    `;
    document.head.appendChild(style);

    const close = () => {
      modal.classList.remove("open");
      document.body.style.overflow = "";
    };
    button.addEventListener("click", async () => {
      await refresh(true);
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    });
    modal.querySelector("header button").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) close();
    });
  }

  install();
  window.slabManagedMarketplace = {
    get state() { return usage; },
    refresh,
    search,
  };
  window.addEventListener("slab-cloud-synced", () => refresh(true));
  window.addEventListener("focus", () => refresh(true));
  refresh();
})();
