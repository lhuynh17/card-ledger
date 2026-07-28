"use strict";

const API_ORIGIN = "https://api.apify.com";
const ACTOR_ID = "automation-lab~ebay-sold-scraper";

class ApifyError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.name = "ApifyError";
    this.code = code;
    this.retryable = Boolean(retryable);
  }
}

function money(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function normalizeRecord(record, nowIso) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new ApifyError("malformed_record", "Apify returned a malformed record.", false);
  }
  const price = money(record.soldPrice);
  const shipping = /free/i.test(String(record.shippingCost || ""))
    ? 0
    : money(record.shippingCost);
  if (!record.itemId || !record.title || !price || !record.soldDate || !record.url) {
    throw new ApifyError(
      "schema_changed",
      "Apify returned a record that does not match the confirmed sold schema.",
      false
    );
  }
  return {
    provider: "apify",
    provider_listing_id: String(record.itemId),
    marketplace: "ebay",
    title: String(record.title),
    sold_at: String(record.soldDate),
    price,
    shipping,
    total: Math.round((price + shipping) * 100) / 100,
    currency: String(record.currency || "USD"),
    condition: String(record.condition || ""),
    seller_summary: "",
    image_url: String(record.thumbnail || ""),
    listing_url: String(record.url),
    retrieved_at: String(record.scrapedAt || nowIso),
    raw_reference: String(record.itemId),
  };
}

function providerError(response) {
  const status = response ? Number(response.statusCode) : 0;
  if (status === 401 || status === 403) {
    return new ApifyError("authentication", "Apify authentication failed.", false);
  }
  if (status === 429) {
    return new ApifyError("rate_limited", "Apify temporarily limited requests.", true);
  }
  return new ApifyError(
    "provider_unavailable", "Apify is temporarily unavailable.", status >= 500 || !status
  );
}

function adapter(httpSend, wait, now) {
  function send(options) {
    const response = httpSend(options);
    if (!response || response.statusCode < 200 || response.statusCode >= 300) {
      throw providerError(response);
    }
    return response;
  }

  return {
    name: "apify",
    search(request, config) {
      if (!config.enabled) throw new ApifyError("disabled", "Apify is disabled.", false);
      if (!config.schemaConfirmed) {
        throw new ApifyError(
          "schema_unconfirmed", "Apify sold schema validation is incomplete.", false
        );
      }
      if (!config.apiToken) {
        throw new ApifyError("not_configured", "Apify is not configured.", false);
      }
      const auth = { Authorization: "Bearer " + config.apiToken };
      const started = send({
        url: API_ORIGIN + "/v2/acts/" + ACTOR_ID + "/runs",
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, auth),
        body: JSON.stringify({
          searchQueries: [request.query],
          maxListingsPerSearch: request.result_limit,
          maxSearchPages: 1,
          sort: "newly_listed",
        }),
        timeout: config.timeoutSeconds,
      });
      const run = started.json && started.json.data;
      if (!run || !run.id) {
        throw new ApifyError("schema_changed", "Apify returned no run identifier.", false);
      }
      let completed = run;
      for (let attempt = 0; attempt < config.maxPolls; attempt += 1) {
        if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(completed.status)) {
          break;
        }
        if (attempt) wait(config.pollIntervalSeconds * 1000);
        const status = send({
          url: API_ORIGIN + "/v2/actor-runs/" + encodeURIComponent(run.id),
          method: "GET",
          headers: auth,
          timeout: config.timeoutSeconds,
        });
        completed = status.json && status.json.data || {};
      }
      if (completed.status !== "SUCCEEDED") {
        throw new ApifyError(
          completed.status ? "provider_failed" : "timeout",
          "Apify did not complete the sold-listing collection.",
          !completed.status || completed.status === "TIMED-OUT"
        );
      }
      const datasetId = completed.defaultDatasetId || run.defaultDatasetId;
      if (!datasetId) {
        throw new ApifyError("schema_changed", "Apify returned no result dataset.", false);
      }
      const results = send({
        url: API_ORIGIN + "/v2/datasets/" + encodeURIComponent(datasetId) +
          "/items?clean=true&format=json&limit=" + request.result_limit,
        method: "GET",
        headers: auth,
        timeout: config.timeoutSeconds,
      });
      if (!Array.isArray(results.json)) {
        throw new ApifyError("schema_changed", "Apify returned unexpected results.", false);
      }
      const candidates = results.json.map((record) => normalizeRecord(
        record, now().toISOString()
      ));
      if (!candidates.length) {
        throw new ApifyError("empty_results", "Apify returned no sold listings.", false);
      }
      return { candidates, records_returned: results.json.length };
    },
  };
}

module.exports = { ACTOR_ID, ApifyError, adapter, normalizeRecord };
