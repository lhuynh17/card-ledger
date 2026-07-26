(function () {
  "use strict";

  const chart = document.getElementById("portfolioChart");
  const overview = document.getElementById("portfolioOverview");
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:0
  }).format(Number(value) || 0);

  function acquiredTime(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    const iso = /^\d{4}-\d{2}-\d{2}/.test(text) ? text : "";
    const date = new Date(iso || text);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  function shortDate(time) {
    return new Intl.DateTimeFormat("en-US", { month:"short", year:"2-digit" }).format(new Date(time));
  }

  function smoothPath(points) {
    if (points.length < 2) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index++) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const after = points[index + 2] || next;
      const firstX = current.x + (next.x - previous.x) / 6;
      const firstY = current.y + (next.y - previous.y) / 6;
      const secondX = next.x - (after.x - current.x) / 6;
      const secondY = next.y - (after.y - current.y) / 6;
      path += ` C ${firstX} ${firstY}, ${secondX} ${secondY}, ${next.x} ${next.y}`;
    }
    return path;
  }

  function render() {
    if (!chart || !overview) return;
    const soldView = currentTab === "sold";
    chart.hidden = soldView;
    overview.classList.toggle("sold-overview", soldView);
    if (soldView) return;

    const cards = inventory.filter((card) => !card.sold).map((card) => {
      const market = window.slabMarketByCard?.get(String(card.remoteId || card.id));
      return {
        time:acquiredTime(card.added),
        value:numberValue(market?.marketValue)
      };
    }).filter((item) => item.time > 0).sort((a, b) => a.time - b.time);

    if (!cards.length || !cards.some((item) => item.value > 0)) {
      chart.innerHTML = `<div class="portfolio-chart-head"><div><strong>Current market value by acquisition date</strong><span>Saved market values as the collection was acquired</span></div></div>
        <div class="portfolio-chart-empty">Add saved market values to see your collection curve.</div>`;
      return;
    }

    let running = 0;
    const grouped = [];
    for (const card of cards) {
      running += card.value;
      const day = new Date(card.time).toISOString().slice(0, 10);
      const last = grouped[grouped.length - 1];
      if (last?.day === day) {
        last.value = running;
      } else {
        grouped.push({ day, time:card.time, value:running });
      }
    }

    const width = 900;
    const height = 150;
    const pad = { left:58, right:14, top:10, bottom:24 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const minTime = grouped[0].time;
    const maxTime = grouped[grouped.length - 1].time;
    const span = Math.max(1, maxTime - minTime);
    const maxValue = Math.max(1, ...grouped.map((item) => item.value));
    const points = grouped.map((item, index) => ({
      ...item,
      x:grouped.length === 1 ? pad.left + plotWidth / 2 : pad.left + (item.time - minTime) / span * plotWidth,
      y:pad.top + plotHeight - item.value / maxValue * plotHeight,
      index
    }));
    if (points.length === 1) {
      points.unshift({ ...points[0], x:pad.left, value:0, y:pad.top + plotHeight, index:-1 });
    }
    const line = smoothPath(points);
    const area = `${line} L ${points[points.length - 1].x} ${pad.top + plotHeight} L ${points[0].x} ${pad.top + plotHeight} Z`;
    const labels = [0, .5, 1].map((ratio) => {
      const y = pad.top + plotHeight - ratio * plotHeight;
      return `<line class="grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line>
        <text class="axis-label" x="${pad.left - 7}" y="${y + 3}" text-anchor="end">${cash(maxValue * ratio)}</text>`;
    }).join("");
    const dateLabels = [
      { x:pad.left, text:shortDate(minTime), anchor:"start" },
      { x:width - pad.right, text:shortDate(maxTime), anchor:"end" }
    ].map((item) => `<text class="axis-label" x="${item.x}" y="${height - 5}" text-anchor="${item.anchor}">${item.text}</text>`).join("");
    const dots = points.filter((point) => point.index >= 0).map((point) =>
      `<circle class="dot" cx="${point.x}" cy="${point.y}" r="3"><title>${point.day}: ${cash(point.value)}</title></circle>`
    ).join("");

    chart.innerHTML = `<div class="portfolio-chart-head"><div><strong>Current market value by acquisition date</strong><span>Saved market values as the collection was acquired</span></div><div class="portfolio-chart-value">${cash(running)}</div></div>
      <svg class="portfolio-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Current inventory market value accumulated by acquisition date">
        <defs><linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55c98b"></stop><stop offset="1" stop-color="#55c98b" stop-opacity="0"></stop></linearGradient></defs>
        ${labels}<path class="area" d="${area}"></path><path class="line" d="${line}"></path>${dots}${dateLabels}
      </svg>`;
  }

  window.renderPortfolioChart = render;
  window.addEventListener("slab-market-updated", render);
  window.addEventListener("slab-cloud-synced", render);
  render();
})();
