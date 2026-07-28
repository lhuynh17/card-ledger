/// <reference path="../pb_data/types.d.ts" />

// Bright Data is outbound-only from this authenticated PocketBase boundary.
// Copy the lib directory beside this hook. Never put provider credentials in
// frontend code, PocketBase records, logs, or committed files.
const providerCore = require(`${__hooks}/lib/marketplace-provider.js`);
const brightData = require(`${__hooks}/lib/bright-data-adapter.js`);
const policy = require(`${__hooks}/lib/marketplace-policy.js`);

const activeOperations = {};
let providerCooldownUntil = 0;

function marketplaceConfig() {
  return policy.configFromEnvironment((name) => $os.getenv(name));
}

function nowIso() {
  return new Date().toISOString();
}

function dayKey() {
  return nowIso().slice(0, 10);
}

function monthKey() {
  return nowIso().slice(0, 7);
}

function jsonValue(record, field, fallback) {
  try {
    const value = record.get(field);
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function findOwnerRecord(collection, owner, filter, params) {
  try {
    return $app.findFirstRecordByFilter(
      collection,
      "owner = {:owner}" + (filter ? " && " + filter : ""),
      Object.assign({ owner: owner }, params || {})
    );
  } catch (_) {
    return null;
  }
}

function usageRecord(owner, periodType, period) {
  let record = findOwnerRecord(
    "marketplace_usage",
    owner,
    "period_type = {:type} && period = {:period}",
    { type: periodType, period: period }
  );
  if (!record) {
    record = new Record($app.findCollectionByNameOrId("marketplace_usage"));
    record.set("owner", owner);
    record.set("period_type", periodType);
    record.set("period", period);
    record.set("records_used", 0);
    record.set("operations", 0);
    record.set("cache_hits", 0);
    record.set("usage_by_feature", {});
  }
  return record;
}

function usageSnapshot(owner) {
  const daily = usageRecord(owner, "day", dayKey());
  const monthly = usageRecord(owner, "month", monthKey());
  return {
    todayRecord: daily,
    monthRecord: monthly,
    todayRecords: daily.getInt("records_used"),
    monthRecords: monthly.getInt("records_used"),
    operations: monthly.getInt("operations"),
    cacheHits: monthly.getInt("cache_hits"),
    usageByFeature: jsonValue(monthly, "usage_by_feature", {}),
  };
}

function incrementUsage(owner, feature, records, cacheHit) {
  const snapshots = [
    usageRecord(owner, "day", dayKey()),
    usageRecord(owner, "month", monthKey()),
  ];
  for (const record of snapshots) {
    record.set("records_used", Math.max(0, record.getInt("records_used") + records));
    record.set("operations", Math.max(0, record.getInt("operations") + (cacheHit ? 0 : 1)));
    record.set("cache_hits", Math.max(0, record.getInt("cache_hits") + (cacheHit ? 1 : 0)));
    const byFeature = jsonValue(record, "usage_by_feature", {});
    byFeature[feature] = Math.max(0, Number(byFeature[feature]) || 0) + records;
    record.set("usage_by_feature", byFeature);
    $app.save(record);
  }
}

function recordActivity(owner, fields) {
  try {
    const record = new Record($app.findCollectionByNameOrId("marketplace_activity"));
    record.set("owner", owner);
    record.set("provider", "bright_data");
    record.set("operation_id", String(fields.operation_id || "").slice(0, 100));
    record.set("feature", String(fields.feature || "").slice(0, 80));
    record.set("status", String(fields.status || "").slice(0, 40));
    record.set("records_used", Math.max(0, Number(fields.records_used) || 0));
    record.set("cache_hit", Boolean(fields.cache_hit));
    record.set("safe_message", String(fields.safe_message || "").slice(0, 500));
    record.set("expires_at", new Date(
      Date.now() + marketplaceConfig().retentionDays * 86400000
    ).toISOString());
    $app.save(record);
  } catch (_) {
    // Usage diagnostics must never expose secrets or break the core fallback.
  }
}

function recentActivity(owner, errorsOnly) {
  const filter = errorsOnly ? " && status != 'success' && status != 'cache_hit'" : "";
  try {
    return $app.findRecordsByFilter(
      "marketplace_activity",
      "owner = {:owner}" + filter,
      "-created",
      errorsOnly ? 10 : 20,
      0,
      { owner: owner }
    ).map((record) => ({
      at: record.getString("created"),
      operation_id: record.getString("operation_id"),
      feature: record.getString("feature"),
      status: record.getString("status"),
      records_used: record.getInt("records_used"),
      cache_hit: record.getBool("cache_hit"),
      message: record.getString("safe_message"),
    }));
  } catch (_) {
    return [];
  }
}

function cacheRecord(owner, hash) {
  const record = findOwnerRecord(
    "marketplace_search_cache",
    owner,
    "provider = 'bright_data' && query_hash = {:hash}",
    { hash: hash }
  );
  if (!record) return null;
  const expires = new Date(record.getString("expires_at")).getTime();
  return Number.isFinite(expires) && expires > Date.now() ? record : null;
}

function saveCache(owner, hash, request, result, config) {
  let record = findOwnerRecord(
    "marketplace_search_cache",
    owner,
    "provider = 'bright_data' && query_hash = {:hash}",
    { hash: hash }
  );
  if (!record) {
    record = new Record($app.findCollectionByNameOrId("marketplace_search_cache"));
    record.set("owner", owner);
    record.set("provider", "bright_data");
    record.set("query_hash", hash);
  }
  record.set("query_summary", request.query.slice(0, 300));
  record.set("results", result.accepted);
  record.set("rejection_counts", result.rejection_counts);
  record.set("records_returned", result.records_returned);
  record.set("retrieved_at", nowIso());
  record.set("expires_at", new Date(Date.now() + config.cacheHours * 3600000).toISOString());
  $app.save(record);
}

function saveObservations(owner, hash, cardId, filtered, config) {
  const expires = new Date(Date.now() + config.retentionDays * 86400000).toISOString();
  const rows = filtered.accepted.map((candidate) => ({
    candidate: candidate,
    match_status: "accepted",
    rejection_reason: "",
  })).concat(filtered.rejected.filter((item) => item.candidate).map((item) => ({
    candidate: item.candidate,
    match_status: "rejected",
    rejection_reason: item.reason,
  })));
  for (const row of rows.slice(0, config.resultLimit * 2)) {
    const candidate = row.candidate;
    let record = findOwnerRecord(
      "marketplace_observations",
      owner,
      "provider = 'bright_data' && listing_id = {:listing}",
      { listing: candidate.provider_listing_id || candidate.listing_url }
    );
    if (!record) {
      record = new Record($app.findCollectionByNameOrId("marketplace_observations"));
      record.set("owner", owner);
      record.set("provider", "bright_data");
      record.set("listing_id", candidate.provider_listing_id || candidate.listing_url);
    }
    record.set("query_hash", hash);
    record.set("card_id", String(cardId || ""));
    record.set("marketplace", candidate.marketplace);
    record.set("title", candidate.title);
    record.set("sold_at", candidate.sold_at || null);
    record.set("price", candidate.price);
    record.set("shipping", candidate.shipping);
    record.set("total", candidate.total);
    record.set("currency", candidate.currency);
    record.set("condition", candidate.condition);
    record.set("listing_url", candidate.listing_url);
    record.set("retrieved_at", candidate.retrieved_at || nowIso());
    record.set("match_status", row.match_status);
    record.set("rejection_reason", row.rejection_reason);
    record.set("algorithm_version", filtered.algorithm_version);
    record.set("expires_at", expires);
    $app.save(record);
  }
}

function safeError(error) {
  const code = String(error && error.code || "provider_error");
  const allowed = {
    authentication: "Bright Data authentication needs operator attention.",
    rate_limited: "Bright Data temporarily limited requests.",
    timeout: "Bright Data did not respond before the timeout.",
    schema_changed: "Bright Data returned an unrecognized eBay record format.",
    schema_unconfirmed: "Bright Data account and eBay schema validation are incomplete.",
    provider_unavailable: "Bright Data is temporarily unavailable.",
    provider_failed: "Bright Data could not complete the collection.",
    empty_results: "Bright Data returned no usable comparable listings.",
  };
  return { code: code, message: allowed[code] || "Marketplace refresh is temporarily unavailable." };
}

function usageResponse(owner, config) {
  const usage = usageSnapshot(owner);
  const projection = policy.usageProjection(usage.monthRecords, new Date());
  const budget = policy.evaluateBudget(config, usage, config.resultLimit);
  return {
    provider: "bright_data",
    enabled: config.enabled,
    kill_switch: config.killSwitch,
    configured: Boolean(config.apiToken && config.datasetId && config.schemaConfirmed),
    schema_confirmed: config.schemaConfirmed,
    records_used_today: usage.todayRecords,
    records_used_month: usage.monthRecords,
    remaining_month: Math.max(0, config.monthlyAllowance - usage.monthRecords),
    monthly_allowance: config.monthlyAllowance,
    percent_consumed: budget.percentConsumed,
    average_daily_usage: projection.averageDailyUsage,
    projected_month_end_usage: projection.projectedMonthEndUsage,
    live_api_operations: Object.keys(activeOperations).length,
    operations_month: usage.operations,
    records_per_operation: usage.operations
      ? Math.round(usage.monthRecords / usage.operations * 100) / 100
      : 0,
    cache_hits_month: usage.cacheHits,
    usage_by_feature: usage.usageByFeature,
    warning_threshold: budget.warningThreshold,
    recent_activity: recentActivity(owner, false),
    recent_errors: recentActivity(owner, true),
  };
}

function ensureOwnedCard(owner, cardId) {
  if (!cardId) return;
  let card;
  try {
    card = $app.findRecordById("cards", cardId);
  } catch (_) {
    throw new Error("card_not_found");
  }
  if (card.getString("owner") !== owner) throw new Error("card_not_found");
}

routerAdd("GET", "/api/slab-ledger/marketplace/usage", (e) => {
  try {
    return e.json(200, usageResponse(e.auth.id, marketplaceConfig()));
  } catch (_) {
    return e.json(503, {
      message: "Run the latest PocketBase setup tool to enable marketplace usage tracking.",
    });
  }
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/slab-ledger/marketplace/search", (e) => {
  const owner = e.auth.id;
  const config = marketplaceConfig();
  let request;
  try {
    const body = e.requestInfo().body || {};
    ensureOwnedCard(owner, String(body.card_id || ""));
    request = providerCore.normalizeRequest(body);
    request.search_url = String(body.search_url || "");
    request.result_limit = Math.min(request.result_limit, config.resultLimit);
  } catch (_) {
    return e.json(400, { message: "The marketplace search request is invalid." });
  }

  const hash = policy.queryHash(request);
  const operationId = hash + "-" + Date.now().toString(36);
  const cached = cacheRecord(owner, hash);
  if (cached) {
    incrementUsage(owner, request.feature, 0, true);
    recordActivity(owner, {
      operation_id: operationId,
      feature: request.feature,
      status: "cache_hit",
      records_used: 0,
      cache_hit: true,
      safe_message: "Reused a recent private marketplace result.",
    });
    const candidates = jsonValue(cached, "results", []);
    return e.json(200, {
      mode: "evaluation",
      provider: "bright_data",
      cache_hit: true,
      records_used: 0,
      candidates: candidates,
      rejection_counts: jsonValue(cached, "rejection_counts", {}),
      valuation: providerCore.valuationFromCandidates(candidates),
      usage: usageResponse(owner, config),
    });
  }

  const usage = usageSnapshot(owner);
  const budget = policy.evaluateBudget(config, usage, request.result_limit);
  if (!budget.allowed) {
    recordActivity(owner, {
      operation_id: operationId,
      feature: request.feature,
      status: "budget_blocked",
      records_used: 0,
      safe_message: "Marketplace refresh was stopped by its private usage controls.",
    });
    return e.json(429, {
      message: "Managed marketplace refresh is disabled or its usage limit has been reached.",
      reasons: budget.blockedReasons,
      usage: usageResponse(owner, config),
    });
  }
  if (providerCooldownUntil > Date.now()) {
    return e.json(429, {
      message: "Managed marketplace refresh is cooling down after a provider error.",
      retry_at: new Date(providerCooldownUntil).toISOString(),
    });
  }
  const activeKey = owner + ":" + hash;
  if (activeOperations[activeKey]) {
    return e.json(409, { message: "This marketplace search is already running." });
  }

  activeOperations[activeKey] = operationId;
  try {
    const adapter = brightData.createBrightDataAdapter({
      httpSend: (options) => {
        try {
          return $http.send(options);
        } catch (_) {
          throw new brightData.ProviderError(
            "timeout",
            "Bright Data did not respond before the timeout.",
            true
          );
        }
      },
      sleep: (milliseconds) => sleep(milliseconds),
    });
    let providerResult;
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        providerResult = adapter.search(request, config);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt >= config.maxRetries) break;
      }
    }
    if (lastError) throw lastError;

    const filtered = providerCore.filterCandidates(providerResult.candidates, request);
    filtered.records_returned = Math.max(0, Number(providerResult.records_returned) || 0);
    incrementUsage(owner, request.feature, filtered.records_returned, false);
    saveObservations(owner, hash, e.requestInfo().body.card_id, filtered, config);
    saveCache(owner, hash, request, filtered, config);
    const valuation = providerCore.valuationFromCandidates(filtered.accepted);
    recordActivity(owner, {
      operation_id: operationId,
      feature: request.feature,
      status: valuation ? "success" : "empty_results",
      records_used: filtered.records_returned,
      safe_message: valuation
        ? "Managed marketplace evaluation completed."
        : "No trusted value was changed because no usable comparables were returned.",
    });
    return e.json(200, {
      mode: "evaluation",
      provider: "bright_data",
      cache_hit: false,
      records_used: filtered.records_returned,
      candidates: filtered.accepted,
      rejection_counts: filtered.rejection_counts,
      algorithm_version: filtered.algorithm_version,
      valuation: valuation,
      usage: usageResponse(owner, config),
    });
  } catch (error) {
    const safe = safeError(error);
    if (error && error.retryable) {
      providerCooldownUntil = Date.now() + config.cooldownMinutes * 60000;
    }
    recordActivity(owner, {
      operation_id: operationId,
      feature: request.feature,
      status: safe.code,
      records_used: 0,
      safe_message: safe.message,
    });
    return e.json(safe.code === "authentication" ? 503 : 502, {
      message: safe.message,
      code: safe.code,
      usage: usageResponse(owner, config),
    });
  } finally {
    delete activeOperations[activeKey];
  }
}, $apis.requireAuth("users"));

cronAdd("slab-ledger-marketplace-retention", "17 3 * * *", () => {
  const expired = new Date().toISOString();
  for (const collection of [
    "marketplace_search_cache",
    "marketplace_observations",
    "marketplace_activity",
  ]) {
    try {
      const records = $app.findRecordsByFilter(
        collection,
        "expires_at != '' && expires_at < {:expired}",
        "",
        500,
        0,
        { expired: expired }
      );
      for (const record of records) $app.delete(record);
    } catch (_) {
      // Setup may not have created the optional collections yet.
    }
  }
});
