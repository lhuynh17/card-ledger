"use strict";

const PROVIDER = "bright_data";
const API_ORIGIN = "https://api.brightdata.com";

class ProviderError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = Boolean(retryable);
  }
}

function first(source, names) {
  for (const name of names) {
    if (source[name] != null && source[name] !== "") return source[name];
  }
  return null;
}

function arrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["results", "records", "data", "items"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return null;
}

function normalizeRawRecord(record, nowIso) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new ProviderError("malformed_record", "Bright Data returned a malformed record.", false);
  }
  const title = first(record, ["title", "name", "listing_title"]);
  const listingId = first(record, ["listing_id", "item_id", "product_id", "id"]);
  const listingUrl = first(record, ["url", "listing_url", "product_url"]);
  const price = first(record, ["price", "sold_price", "final_price", "sale_price"]);
  const shipping = first(record, ["shipping", "shipping_price", "shipping_cost"]) || 0;
  const soldAt = first(record, ["sold_at", "sold_date", "date_sold", "ended_at"]);
  const currency = first(record, ["currency", "currency_code"]) || "USD";
  if (!title || (!listingId && !listingUrl) || Number(price) <= 0) {
    throw new ProviderError(
      "schema_changed",
      "Bright Data returned a record that does not match the confirmed eBay schema.",
      false
    );
  }
  return {
    provider: PROVIDER,
    provider_listing_id: String(listingId || ""),
    marketplace: "ebay",
    title: String(title),
    sold_at: soldAt ? String(soldAt) : "",
    price: Number(price),
    shipping: Math.max(0, Number(shipping) || 0),
    total: Math.max(0, (Number(price) || 0) + (Number(shipping) || 0)),
    currency: String(currency),
    condition: String(first(record, ["condition", "item_condition"]) || ""),
    seller_summary: String(first(record, ["seller", "seller_name", "seller_username"]) || ""),
    image_url: String(first(record, ["image", "image_url", "thumbnail"]) || ""),
    listing_url: String(listingUrl || ""),
    retrieved_at: nowIso,
    raw_reference: String(listingId || listingUrl || ""),
  };
}

function inputFor(request, config) {
  if (config.inputField === "keyword") {
    return [{ keyword: request.query, pages_to_search: config.pageLimit }];
  }
  if (!request.search_url || !/^https:\/\/([a-z0-9-]+\.)*ebay\.com\//i.test(request.search_url)) {
    throw new ProviderError("invalid_search_url", "A valid HTTPS eBay search URL is required.", false);
  }
  return [{ url: request.search_url }];
}

function parseResponse(response, nowIso, resultLimit) {
  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    const status = response ? Number(response.statusCode) : 0;
    if (status === 401 || status === 403) {
      throw new ProviderError("authentication", "Bright Data authentication failed.", false);
    }
    if (status === 429) {
      throw new ProviderError("rate_limited", "Bright Data rate limited the request.", true);
    }
    throw new ProviderError("provider_unavailable", "Bright Data is temporarily unavailable.", status >= 500 || !status);
  }
  const records = arrayPayload(response.json);
  if (!records) {
    throw new ProviderError("schema_changed", "Bright Data returned an unexpected response shape.", false);
  }
  const candidates = [];
  for (const record of records.slice(0, resultLimit)) {
    try {
      candidates.push(normalizeRawRecord(record, nowIso));
    } catch (error) {
      error.recordsReturned = records.length;
      throw error;
    }
  }
  return { candidates, recordsReturned: records.length };
}

function snapshotId(response) {
  const payload = response && response.json;
  return String(payload && (payload.snapshot_id || payload.id || payload.collection_id) || "");
}

function providerResponseError(response) {
  const status = response ? Number(response.statusCode) : 0;
  if (status === 401 || status === 403) {
    return new ProviderError("authentication", "Bright Data authentication failed.", false);
  }
  if (status === 429) {
    return new ProviderError("rate_limited", "Bright Data rate limited the request.", true);
  }
  return new ProviderError(
    "provider_unavailable",
    "Bright Data is temporarily unavailable.",
    status >= 500 || !status
  );
}

function createBrightDataAdapter(options) {
  const httpSend = options.httpSend;
  const now = options.now || (() => new Date());
  const wait = options.sleep || (() => {});
  if (typeof httpSend !== "function") throw new Error("httpSend is required.");
  function authHeaders(config, json) {
    const headers = {
      Authorization: "Bearer " + config.apiToken,
      Accept: "application/json",
    };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }
  function pollSnapshot(id, config) {
    for (let attempt = 0; attempt < config.maxPolls; attempt += 1) {
      const progress = httpSend({
        url: API_ORIGIN + "/datasets/v3/progress/" + encodeURIComponent(id),
        method: "GET",
        headers: authHeaders(config, false),
        timeout: config.timeoutSeconds,
      });
      if (!progress || progress.statusCode < 200 || progress.statusCode >= 300) {
        throw providerResponseError(progress);
      }
      const state = String(progress.json && progress.json.status || "").toLowerCase();
      if (state === "failed" || state === "canceled" || state === "cancelled") {
        throw new ProviderError(
          "provider_failed",
          "Bright Data could not complete the collection.",
          false
        );
      }
      if (state === "ready" || state === "done" || state === "complete") {
        const download = httpSend({
          url: API_ORIGIN + "/datasets/v3/snapshot/" + encodeURIComponent(id) + "?format=json",
          method: "GET",
          headers: authHeaders(config, false),
          timeout: config.timeoutSeconds,
        });
        return parseResponse(download, now().toISOString(), config.resultLimit);
      }
      if (attempt + 1 < config.maxPolls) wait(config.pollIntervalSeconds * 1000);
    }
    throw new ProviderError(
      "timeout",
      "Bright Data did not finish before the polling limit.",
      true
    );
  }
  return {
    name: PROVIDER,
    health(config) {
      return {
        provider: PROVIDER,
        enabled: Boolean(config.enabled),
        configured: Boolean(config.apiToken && config.datasetId && config.schemaConfirmed),
        requestMode: config.requestMode,
      };
    },
    search(request, config) {
      if (!config.enabled) throw new ProviderError("disabled", "Bright Data is disabled.", false);
      if (!config.schemaConfirmed) {
        throw new ProviderError(
          "schema_unconfirmed",
          "Bright Data account and eBay schema validation must be completed before live requests.",
          false
        );
      }
      if (!config.apiToken || !config.datasetId) {
        throw new ProviderError("not_configured", "Bright Data is not configured.", false);
      }
      if (config.requestMode !== "sync" && config.requestMode !== "async") {
        throw new ProviderError(
          "unsupported_request_mode",
          "Bright Data request mode must be sync or async.",
          false
        );
      }
      const endpoint = API_ORIGIN + "/datasets/v3/" +
        (config.requestMode === "async" ? "trigger" : "scrape") + "?dataset_id=" +
        encodeURIComponent(config.datasetId) + "&format=json";
      const response = httpSend({
        url: endpoint,
        method: "POST",
        headers: authHeaders(config, true),
        body: JSON.stringify(inputFor(request, config)),
        timeout: config.timeoutSeconds,
      });
      let parsed;
      const id = snapshotId(response);
      if (config.requestMode === "async" || id) {
        if (!response || response.statusCode < 200 || response.statusCode >= 300) {
          throw providerResponseError(response);
        }
        if (!id) {
          throw new ProviderError(
            "schema_changed",
            "Bright Data did not return a snapshot ID.",
            false
          );
        }
        parsed = pollSnapshot(id, config);
      } else {
        parsed = parseResponse(response, now().toISOString(), config.resultLimit);
      }
      return {
        candidates: parsed.candidates,
        retrieved_at: now().toISOString(),
        request_count: 1,
        records_returned: parsed.recordsReturned,
        provider_usage: { billing_unit: "returned_record", records: parsed.recordsReturned },
        warnings: [],
        next_cursor: null,
      };
    },
  };
}

module.exports = {
  API_ORIGIN,
  PROVIDER,
  ProviderError,
  createBrightDataAdapter,
  normalizeRawRecord,
  parseResponse,
  snapshotId,
};
