"use strict";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summaryFromObservations(observations, previous) {
  const latest = {};
  observations.slice().sort((left, right) =>
    String(right.observed_at || "").localeCompare(String(left.observed_at || ""))
  ).forEach((item) => {
    const source = String(item.source || "").toLowerCase();
    if (source && number(item.value) > 0 && !latest[source]) latest[source] = item;
  });
  const sources = Object.keys(latest).sort();
  if (!sources.length) return {};
  const values = sources.map((source) => number(latest[source].value)).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const composite = values.length % 2
    ? values[middle]
    : Math.round(((values[middle - 1] + values[middle]) / 2) * 100) / 100;
  const spread = values[0] ? values[values.length - 1] / values[0] : 99;
  const manual = String(previous?.auto_status || "") === "manual";
  const summary = {
    suggested_value: composite,
    checked_at: sources.reduce((latestDate, source) =>
      String(latest[source].observed_at || "") > latestDate
        ? String(latest[source].observed_at || "") : latestDate, ""),
    confidence: spread <= 1.15 ? "high" : (spread <= 1.30 ? "medium" : "low"),
    low: values[0],
    high: values[values.length - 1],
    comparable_count: values.length,
    algorithm_version: "multi-source-latest-median-v1",
  };
  if (!manual) {
    summary.market_value = composite;
    summary.source = sources.length === 1
      ? `Latest ${displayName(sources[0])} observation`
      : `Composite: ${sources.map(displayName).join(" + ")}`;
    summary.auto_status = "automatic";
  }
  return summary;
}

function displayName(source) {
  return source === "ebay" ? "eBay" : source[0].toUpperCase() + source.slice(1);
}

function refreshMarketValue(owner, cardId) {
  const records = $app.findRecordsByFilter(
    "market_value_observations",
    "owner = {:owner} && card_id = {:card} && match_status = 'matched'",
    "-observed_at",
    500,
    0,
    { owner: owner, card: cardId }
  );
  let market;
  try {
    market = $app.findFirstRecordByFilter(
      "market_values", "owner = {:owner} && card_id = {:card}",
      { owner: owner, card: cardId }
    );
  } catch (_) {
    market = new Record($app.findCollectionByNameOrId("market_values"));
    market.set("owner", owner);
    market.set("card_id", cardId);
  }
  const observations = records.map((record) => ({
    source: record.getString("source"),
    value: record.getFloat("value"),
    observed_at: record.getString("observed_at"),
  }));
  const summary = summaryFromObservations(observations, {
    auto_status: market.getString("auto_status"),
  });
  Object.keys(summary).forEach((field) => market.set(field, summary[field]));
  $app.save(market);
  return summary;
}

module.exports = { refreshMarketValue, summaryFromObservations };
