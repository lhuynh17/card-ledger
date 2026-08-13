"use strict";

const MAX_OBSERVATIONS = 100;
const { refreshMarketValue } = require(__hooks + "/lib/valuation-summary.js");

function configuration() {
  return {
    token: String($os.getenv("SLAB_ALT_SCRAPER_TOKEN") || ""),
    owner: String($os.getenv("SLAB_ALT_OWNER_ID") || ""),
  };
}

function bearerToken(e) {
  const headers = e.requestInfo().headers || {};
  const raw = String(headers.authorization || headers.Authorization || "");
  return raw.indexOf("Bearer ") === 0 ? raw.slice(7).trim() : "";
}

function authorize(e) {
  const config = configuration();
  const supplied = bearerToken(e);
  if (config.token.length < 32 || !config.owner || supplied !== config.token) {
    throw new UnauthorizedError("Alt collector authentication failed.");
  }
  return config;
}

function inventoryHandler(e) {
  const config = authorize(e);
  const records = $app.findRecordsByFilter(
    "cards",
    "owner = {:owner} && sold = false && cert != ''",
    "id",
    500,
    0,
    { owner: config.owner }
  );
  const items = records.map((record) => ({
    id: record.id,
    owner: record.getString("owner"),
    cert: record.getString("cert"),
    company: record.getString("company") || "PSA",
    grade: record.getString("grade"),
    name: record.getString("name"),
    psa_year: record.getString("psa_year"),
    psa_subject: record.getString("psa_subject"),
    psa_brand: record.getString("psa_brand"),
    psa_card_number: record.getString("psa_card_number"),
  }));
  return e.json(200, { items: items, count: items.length });
}

function cleanText(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

function observationsHandler(e) {
  const config = authorize(e);
  const body = e.requestInfo().body || {};
  const observations = Array.isArray(body.observations) ? body.observations : [];
  if (!observations.length || observations.length > MAX_OBSERVATIONS) {
    throw new BadRequestError("Submit between 1 and 100 Alt observations.");
  }

  let saved = 0;
  const touchedCards = {};
  for (const item of observations) {
    const cardId = cleanText(item.card_id, 100);
    const value = Number(item.value);
    const cert = cleanText(item.cert_number, 100);
    if (!cardId || !cert || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestError("Every observation requires card_id, cert_number, and a positive value.");
    }
    let card;
    try {
      card = $app.findFirstRecordByFilter(
        "cards",
        "id = {:id} && owner = {:owner} && cert = {:cert}",
        { id: cardId, owner: config.owner, cert: cert }
      );
    } catch (_) {
      throw new BadRequestError("An observation did not match the configured owner's inventory.");
    }

    const sourceItemId = cleanText(item.source_item_id, 500);
    if (sourceItemId) {
      try {
        $app.findFirstRecordByFilter(
          "market_value_observations",
          "owner = {:owner} && source = 'alt' && source_item_id = {:sourceItemId}",
          { owner: config.owner, sourceItemId: sourceItemId }
        );
        continue;
      } catch (_) {}
    }
    const record = new Record($app.findCollectionByNameOrId("market_value_observations"));
    record.set("owner", config.owner);
    record.set("card_id", card.id);
    record.set("source", "alt");
    record.set("value", value);
    record.set("currency", cleanText(item.currency || "USD", 10));
    record.set("observed_at", cleanText(item.observed_at || new Date().toISOString(), 50));
    record.set("source_url", cleanText(item.source_url, 2000));
    record.set("source_item_id", sourceItemId);
    record.set("cert_number", cert);
    record.set("match_status", "matched");
    record.set("metadata", item.metadata || {});
    $app.save(record);
    touchedCards[card.id] = true;
    saved += 1;
  }
  Object.keys(touchedCards).forEach((cardId) => refreshMarketValue(config.owner, cardId));
  return e.json(201, { saved: saved, summaries_updated: Object.keys(touchedCards).length });
}

module.exports = { authorize, bearerToken, inventoryHandler, observationsHandler };
