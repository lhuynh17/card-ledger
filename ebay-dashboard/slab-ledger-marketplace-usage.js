(function () {
  "use strict";

  let usage = null;
  let schedule = null;
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
    renderSchedule();

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

  function renderSchedule() {
    const form = document.getElementById("marketScheduleForm");
    if (!form || !schedule) return;
    for (const role of ["sold", "active"]) {
      const value = schedule[role] || {};
      document.getElementById(`marketSchedule${role}Enabled`).checked = Boolean(
        value.enabled
      );
      document.getElementById(`marketSchedule${role}Listings`).value = String(
        value.listing_count || (role === "sold" ? 2 : 3)
      );
      document.getElementById(`marketSchedule${role}Value`).value = String(
        value.interval_value || (role === "sold" ? 3 : 1)
      );
      document.getElementById(`marketSchedule${role}Unit`).value =
        value.interval_unit || (role === "sold" ? "days" : "weeks");
    }
    updateScheduleEstimate();
    document.getElementById("marketScheduleNext").textContent =
      "Schedules remain gated until each provider passes live schema validation.";
  }

  function localProjection(role) {
    const enabled = document.getElementById(`marketSchedule${role}Enabled`).checked;
    const listings = Number(
      document.getElementById(`marketSchedule${role}Listings`).value
    );
    const value = Number(document.getElementById(`marketSchedule${role}Value`).value);
    const unit = document.getElementById(`marketSchedule${role}Unit`).value;
    const hours = unit === "hours" ? value
      : unit === "days" ? value * 24
        : unit === "weeks" ? value * 24 * 7
          : value * 24 * 30.4375;
    const savedProjection = schedule?.[role]?.projection || {};
    const inheritedCards = Number(
      savedProjection.inherited_cards ?? schedule?.active_card_count ?? 0
    );
    const operations = (enabled && hours > 0
      ? Math.ceil(inheritedCards * 24 * 30.4375 / hours)
      : 0) + Number(savedProjection.override_operations || 0);
    const records = operations * listings;
    const correctedRecords = records - (
      Number(savedProjection.override_operations || 0) * listings
    ) + Number(savedProjection.override_records || 0);
    const allowance = Number(savedProjection.free_allowance) || (
      role === "sold" ? 1400 : 5000
    );
    return {
      operations,
      records: correctedRecords,
      allowance,
      percent: allowance ? correctedRecords / allowance * 100 : 0,
      cost: role === "sold"
        ? correctedRecords * Number(schedule?.sold?.unit_cost_usd || 0.00345)
        : 0,
    };
  }

  function updateScheduleEstimate() {
    if (!schedule) return;
    const sold = localProjection("sold");
    const active = localProjection("active");
    const soldSummary = document.getElementById("marketScheduleSoldSummary");
    soldSummary.textContent = `About ${number(sold.records)} sold records/month · $${sold.cost.toFixed(
      2
    )} estimated · ${sold.percent.toFixed(1)}% of the 1,400-record free-tier safety cap.`;
    soldSummary.className = "market-schedule-summary" + (
      sold.records > sold.allowance ? " warning" : " ok"
    );
    const activeSummary = document.getElementById("marketScheduleActiveSummary");
    activeSummary.textContent = `About ${number(active.records)} active records/month · ${
      active.percent.toFixed(1)
    }% of the 5,000-record Bright Data allowance.`;
    activeSummary.className = "market-schedule-summary" + (
      active.records > active.allowance ? " warning" : " ok"
    );
  }

  async function refresh(force = false) {
    if (!cloudSession?.token) {
      usage = null;
      render();
      return null;
    }
    if (!force && usage && schedule) return usage;
    try {
      [usage, schedule] = await Promise.all([
        pbRequest("/api/slab-ledger/marketplace/usage"),
        pbRequest("/api/slab-ledger/marketplace/schedule")
      ]);
    } catch (error) {
      if (error.status !== 404 && error.status !== 503) {
        console.warn("Marketplace usage unavailable:", error);
      }
      usage = null;
      schedule = null;
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
        <section class="market-schedule">
          <h3>Automatic marketplace checks</h3>
          <p class="market-schedule-help">Estimates update before you save. Provider results remain separate and never overwrite a trusted value automatically.</p>
          <form id="marketScheduleForm">
            <fieldset><legend>Apify sold evidence</legend>
              <label class="market-schedule-toggle"><input id="marketSchedulesoldEnabled" type="checkbox"><span>Enable sold checks</span></label>
              <label><span>Sold listings per card</span><select id="marketSchedulesoldListings"><option>1</option><option>2</option></select></label>
              <label><span>Check every</span><span class="market-schedule-interval"><input id="marketSchedulesoldValue" type="number" min="1" max="720" inputmode="numeric" value="3"><select id="marketSchedulesoldUnit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select></span></label>
              <p id="marketScheduleSoldSummary" class="market-schedule-summary"></p>
            </fieldset>
            <fieldset><legend>Bright Data active listings</legend>
              <label class="market-schedule-toggle"><input id="marketScheduleactiveEnabled" type="checkbox"><span>Enable active checks</span></label>
              <label><span>Lowest active listings per card</span><select id="marketScheduleactiveListings"><option>3</option><option>4</option><option>5</option></select></label>
              <label><span>Check every</span><span class="market-schedule-interval"><input id="marketScheduleactiveValue" type="number" min="1" max="720" inputmode="numeric" value="1"><select id="marketScheduleactiveUnit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select></span></label>
              <p id="marketScheduleActiveSummary" class="market-schedule-summary"></p>
            </fieldset>
            <button type="submit">Save schedule</button>
          </form>
          <p id="marketScheduleNext" class="market-schedule-next"></p>
          <p id="marketScheduleMessage" class="market-schedule-message" role="status"></p>
        </section>
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
      .market-schedule{margin-bottom:18px;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}.market-schedule h3{margin:0 0 8px}.market-schedule form{display:grid;grid-template-columns:1fr 1fr;align-items:start;gap:12px}.market-schedule fieldset{display:grid;gap:9px;margin:0;padding:12px;border:1px solid var(--line);border-radius:10px}.market-schedule legend{padding:0 5px;font-weight:750}.market-schedule label>span:first-child{display:block;margin-bottom:5px;color:var(--muted);font-size:11px}.market-schedule-toggle{display:flex;align-items:center;gap:8px;min-height:42px}.market-schedule-toggle span{margin:0!important;color:var(--text)!important;font-size:13px!important}.market-schedule select,.market-schedule input[type=number]{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);padding:8px}.market-schedule form>button{grid-column:1/-1;min-height:42px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-weight:750;cursor:pointer}.market-schedule-interval{display:grid;grid-template-columns:70px 1fr;gap:6px}.market-schedule-help,.market-schedule-summary,.market-schedule-next,.market-schedule-message{margin:8px 0 0;color:var(--muted);font-size:12px}.market-schedule-summary.warning,.market-schedule-message.error{color:#e5a24a}.market-schedule-summary.ok,.market-schedule-message.ok{color:var(--ok)}
      .market-usage-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.market-usage-metric{padding:13px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2)}.market-usage-metric span{display:block;color:var(--muted);font-size:11px}.market-usage-metric strong{display:block;margin-top:5px;font-size:21px}
      .market-usage-columns{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:18px;margin-top:20px}.market-usage-body h3{margin:18px 0 9px;font-size:14px}.market-usage-features>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
      .market-usage-row{padding:10px 0;border-bottom:1px solid var(--line)}.market-usage-row>div{display:flex;justify-content:space-between;gap:12px}.market-usage-row strong{text-transform:capitalize}.market-usage-row time{color:var(--muted);font-size:11px}.market-usage-row p{margin:4px 0 0;color:var(--muted);font-size:12px}.market-usage-row.error strong{color:#e57c70}.market-usage-empty{color:var(--muted);font-size:12px}
      @media(max-width:680px){.market-usage-modal{padding:5px}.market-usage-body{padding:14px}.market-schedule form{grid-template-columns:1fr}.market-schedule form>button{grid-column:1}.market-usage-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.market-usage-columns{grid-template-columns:1fr}.market-usage-metric strong{font-size:17px}}
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
    document.getElementById("marketScheduleForm").addEventListener(
      "input", updateScheduleEstimate
    );
    document.getElementById("marketScheduleForm").addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const message = document.getElementById("marketScheduleMessage");
        message.className = "market-schedule-message";
        message.textContent = "Saving schedule…";
        try {
          schedule = await pbRequest("/api/slab-ledger/marketplace/schedule", {
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              sold:{
                enabled:document.getElementById("marketSchedulesoldEnabled").checked,
                listing_count:Number(document.getElementById("marketSchedulesoldListings").value),
                interval_value:Number(document.getElementById("marketSchedulesoldValue").value),
                interval_unit:document.getElementById("marketSchedulesoldUnit").value
              },
              active:{
                enabled:document.getElementById("marketScheduleactiveEnabled").checked,
                listing_count:Number(document.getElementById("marketScheduleactiveListings").value),
                interval_value:Number(document.getElementById("marketScheduleactiveValue").value),
                interval_unit:document.getElementById("marketScheduleactiveUnit").value
              }
            })
          });
          renderSchedule();
          message.className = "market-schedule-message ok";
          message.textContent = schedule.sold?.enabled || schedule.active?.enabled
            ? "Schedule preferences saved. Live checks remain gated until provider validation."
            : "Automatic checks are off.";
        } catch (error) {
          message.className = "market-schedule-message error";
          message.textContent = error.message || "The schedule could not be saved.";
        }
      }
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("open")) close();
    });
  }

  install();
  window.slabManagedMarketplace = {
    get state() { return usage; },
    get schedule() { return schedule; },
    refresh,
    search,
  };
  window.addEventListener("slab-cloud-synced", () => refresh(true));
  window.addEventListener("focus", () => refresh(true));
  refresh();
})();
