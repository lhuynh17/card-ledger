(function () {
  "use strict";

  const chart = document.getElementById("portfolioChart");
  const overview = document.getElementById("portfolioOverview");
  const cash = (value) => new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:0
  }).format(Number(value) || 0);

  function dateTime(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), 12);
    const date = new Date(text);
    return Number.isFinite(date.getTime())
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
      : 0;
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

  function valueSeries(card) {
    const market = window.slabMarketByCard?.get(String(card.remoteId || card.id));
    if (!market) return [];
    const entries = Array.isArray(market.history) ? market.history.slice() : [];
    if (numberValue(market.marketValue) && market.lastChecked) {
      entries.push({ date:market.lastChecked, value:market.marketValue });
    }
    const byDay = new Map();
    for (const entry of entries) {
      const time = dateTime(entry.date);
      const value = numberValue(entry.value);
      if (time && value) byDay.set(time, value);
    }
    return [...byDay].map(([time, value]) => ({ time, value }))
      .sort((a, b) => a.time - b.time);
  }

  function buildHistory() {
    const cards = inventory.map((card) => {
      const values = valueSeries(card);
      const firstValueTime = values[0]?.time || 0;
      return {
        acquired:dateTime(card.added) || firstValueTime,
        sold:card.sold ? dateTime(card.soldDate) : 0,
        values
      };
    }).filter((card) => card.values.length);

    const eventTimes = new Set();
    cards.forEach((card) => {
      if (card.acquired) eventTimes.add(card.acquired);
      if (card.sold) eventTimes.add(card.sold);
      card.values.forEach((entry) => eventTimes.add(entry.time));
    });

    const totals = [...eventTimes].sort((a, b) => a - b).map((time) => {
      let value = 0;
      for (const card of cards) {
        if (card.acquired && time < card.acquired) continue;
        if (card.sold && time >= card.sold) continue;
        const known = card.values.filter((entry) => entry.time <= time).at(-1);
        if (known) value += known.value;
      }
      return { time, day:new Date(time).toISOString().slice(0, 10), value };
    });

    return totals.filter((item, index) =>
      index === 0 || index === totals.length - 1 || item.value !== totals[index - 1].value
    );
  }

  function render() {
    if (!chart || !overview) return;
    const soldView = currentTab === "sold";
    chart.hidden = soldView;
    overview.classList.toggle("sold-overview", soldView);
    if (soldView) return;

    const grouped = buildHistory();
    if (!grouped.length || !grouped.some((item) => item.value > 0)) {
      chart.innerHTML = `<div class="portfolio-chart-head"><div><strong>Total collection market value over time</strong><span>Built from each card’s saved market-value history</span></div></div>
        <div class="portfolio-chart-empty">Update at least one card’s market value to begin your collection history.</div>`;
      return;
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

    chart.innerHTML = `<div class="portfolio-chart-head"><div><strong>Total collection market value over time</strong><span>Built from each card’s saved market-value history</span></div><div class="portfolio-chart-value">${cash(grouped[grouped.length - 1].value)}</div></div>
      <svg class="portfolio-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Total collection market value over time">
        <defs><linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55c98b"></stop><stop offset="1" stop-color="#55c98b" stop-opacity="0"></stop></linearGradient></defs>
        ${labels}<path class="area" d="${area}"></path><path class="line" d="${line}"></path>${dots}${dateLabels}
      </svg>`;
  }

  window.renderPortfolioChart = render;
  window.buildPortfolioValueHistory = buildHistory;
  window.addEventListener("slab-market-updated", render);
  window.addEventListener("slab-cloud-synced", render);
  render();
})();
