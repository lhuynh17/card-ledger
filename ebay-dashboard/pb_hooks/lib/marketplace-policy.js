"use strict";

function positiveInteger(value, fallback, maximum) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum || Number.MAX_SAFE_INTEGER, parsed);
}

function boolValue(value, fallback) {
  if (value == null || value === "") return Boolean(fallback);
  return /^(1|true|yes|on)$/i.test(String(value));
}

function warningThresholds(value) {
  const values = String(value || "50,75,90")
    .split(",")
    .map((item) => parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0 && item < 100);
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function configFromEnvironment(env) {
  const get = (name) => String(env(name) || "");
  return {
    enabled: boolValue(get("BRIGHT_DATA_ENABLED"), false),
    killSwitch: boolValue(get("BRIGHT_DATA_KILL_SWITCH"), true),
    schemaConfirmed: boolValue(get("BRIGHT_DATA_SCHEMA_CONFIRMED"), false),
    apiToken: get("BRIGHT_DATA_API_TOKEN"),
    datasetId: get("BRIGHT_DATA_DATASET_ID"),
    requestMode: get("BRIGHT_DATA_REQUEST_MODE") || "sync",
    inputField: get("BRIGHT_DATA_INPUT_FIELD") || "url",
    monthlyAllowance: positiveInteger(get("BRIGHT_DATA_MONTHLY_ALLOWANCE"), 5000, 1000000),
    dailyCeiling: positiveInteger(get("BRIGHT_DATA_DAILY_CEILING"), 250, 100000),
    hardStop: boolValue(get("BRIGHT_DATA_HARD_STOP"), true),
    warningThresholds: warningThresholds(get("BRIGHT_DATA_WARNING_THRESHOLDS")),
    resultLimit: positiveInteger(get("BRIGHT_DATA_RESULT_LIMIT"), 50, 100),
    pageLimit: positiveInteger(get("BRIGHT_DATA_PAGE_LIMIT"), 1, 5),
    timeoutSeconds: positiveInteger(get("BRIGHT_DATA_TIMEOUT_SECONDS"), 25, 60),
    maxRetries: positiveInteger(get("BRIGHT_DATA_MAX_RETRIES"), 1, 2),
    pollIntervalSeconds: positiveInteger(
      get("BRIGHT_DATA_POLL_INTERVAL_SECONDS"), 5, 30
    ),
    maxPolls: positiveInteger(get("BRIGHT_DATA_MAX_POLLS"), 10, 24),
    cacheHours: positiveInteger(get("BRIGHT_DATA_CACHE_HOURS"), 22, 168),
    cooldownMinutes: positiveInteger(get("BRIGHT_DATA_COOLDOWN_MINUTES"), 15, 1440),
    retentionDays: positiveInteger(get("BRIGHT_DATA_RETENTION_DAYS"), 90, 365),
  };
}

function evaluateBudget(config, usage, requestedLimit) {
  const monthUsed = Math.max(0, Number(usage.monthRecords) || 0);
  const todayUsed = Math.max(0, Number(usage.todayRecords) || 0);
  const requested = Math.max(1, Number(requestedLimit) || config.resultLimit);
  const remainingMonth = Math.max(0, config.monthlyAllowance - monthUsed);
  const remainingToday = Math.max(0, config.dailyCeiling - todayUsed);
  const blockedReasons = [];
  if (config.killSwitch) blockedReasons.push("kill_switch");
  if (!config.enabled) blockedReasons.push("feature_disabled");
  if (config.hardStop && remainingMonth < requested) blockedReasons.push("monthly_allowance");
  if (config.hardStop && remainingToday < requested) blockedReasons.push("daily_ceiling");
  const percent = config.monthlyAllowance
    ? Math.round(monthUsed / config.monthlyAllowance * 1000) / 10
    : 0;
  const warning = config.warningThresholds
    .filter((threshold) => percent >= threshold)
    .slice(-1)[0] || null;
  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    requestedRecords: requested,
    remainingMonth,
    remainingToday,
    warningThreshold: warning,
    percentConsumed: percent,
  };
}

function usageProjection(monthRecords, now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  const day = Math.max(1, date.getUTCDate());
  const daysInMonth = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth() + 1, 0
  )).getUTCDate();
  const average = Math.round((Number(monthRecords) || 0) / day * 100) / 100;
  return {
    averageDailyUsage: average,
    projectedMonthEndUsage: Math.round(average * daysInMonth),
  };
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
}

function queryHash(request) {
  return fnv1a([
    request.marketplace,
    request.query,
    request.grader,
    request.grade,
    request.card_identity,
    request.sold_only,
    request.completed_only,
  ].join("|").toLowerCase());
}

module.exports = {
  boolValue,
  configFromEnvironment,
  evaluateBudget,
  fnv1a,
  positiveInteger,
  queryHash,
  usageProjection,
  warningThresholds,
};
