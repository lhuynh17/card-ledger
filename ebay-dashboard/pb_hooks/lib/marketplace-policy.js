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
    scheduleMaxCardsPerTick: positiveInteger(
      get("BRIGHT_DATA_SCHEDULE_MAX_CARDS_PER_TICK"), 3, 25
    ),
  };
}

function apifyConfigFromEnvironment(env) {
  const get = (name) => String(env(name) || "");
  return {
    enabled: boolValue(get("APIFY_SOLD_ENABLED"), false),
    killSwitch: boolValue(get("APIFY_SOLD_KILL_SWITCH"), true),
    schemaConfirmed: boolValue(get("APIFY_SOLD_SCHEMA_CONFIRMED"), false),
    apiToken: get("APIFY_API_TOKEN"),
    monthlyAllowance: positiveInteger(get("APIFY_SOLD_MONTHLY_ALLOWANCE"), 1400, 100000),
    dailyCeiling: positiveInteger(get("APIFY_SOLD_DAILY_CEILING"), 100, 10000),
    hardStop: boolValue(get("APIFY_SOLD_HARD_STOP"), true),
    timeoutSeconds: positiveInteger(get("APIFY_SOLD_TIMEOUT_SECONDS"), 30, 90),
    maxRetries: positiveInteger(get("APIFY_SOLD_MAX_RETRIES"), 1, 2),
    pollIntervalSeconds: positiveInteger(
      get("APIFY_SOLD_POLL_INTERVAL_SECONDS"), 3, 30
    ),
    maxPolls: positiveInteger(get("APIFY_SOLD_MAX_POLLS"), 20, 40),
    unitCostUsd: Math.max(0, Number(get("APIFY_SOLD_UNIT_COST_USD")) || 0.00345),
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
    request.result_limit,
  ].join("|").toLowerCase());
}

function normalizeSchedule(input) {
  const schedule = input || {};
  const listingCount = Math.max(3, Math.min(5, parseInt(
    schedule.listing_count, 10
  ) || 3));
  const unit = String(schedule.interval_unit || "days").toLowerCase();
  const limits = {
    hours: 720,
    days: 31,
    weeks: 12,
    months: 12,
  };
  if (!limits[unit]) throw new Error("Schedule interval unit is invalid.");
  const value = parseInt(schedule.interval_value, 10);
  if (!Number.isFinite(value) || value < 1 || value > limits[unit]) {
    throw new Error("Schedule interval value is invalid.");
  }
  return {
    enabled: Boolean(schedule.enabled),
    listing_count: listingCount,
    interval_unit: unit,
    interval_value: value,
  };
}

function nextScheduleAt(scheduleInput, from) {
  const schedule = normalizeSchedule(scheduleInput);
  const date = from instanceof Date ? new Date(from.getTime()) : new Date(from);
  if (!Number.isFinite(date.getTime())) throw new Error("Schedule date is invalid.");
  if (schedule.interval_unit === "months") {
    date.setUTCMonth(date.getUTCMonth() + schedule.interval_value);
  } else {
    const hours = schedule.interval_unit === "hours"
      ? schedule.interval_value
      : schedule.interval_unit === "days"
        ? schedule.interval_value * 24
        : schedule.interval_value * 24 * 7;
    date.setTime(date.getTime() + hours * 3600000);
  }
  return date.toISOString();
}

function scheduleProjection(scheduleInput, activeCardCount) {
  const schedule = normalizeSchedule(scheduleInput);
  const cards = Math.max(0, parseInt(activeCardCount, 10) || 0);
  const hours = schedule.interval_unit === "hours"
    ? schedule.interval_value
    : schedule.interval_unit === "days"
      ? schedule.interval_value * 24
      : schedule.interval_unit === "weeks"
        ? schedule.interval_value * 24 * 7
        : schedule.interval_value * 24 * 30.4375;
  const operations = cards
    ? Math.ceil(cards * (24 * 30.4375) / hours)
    : 0;
  return {
    estimated_monthly_operations: operations,
    estimated_monthly_records: operations * schedule.listing_count,
  };
}

function normalizeProviderSchedule(input, role) {
  const schedule = input || {};
  const sold = role === "sold";
  const minimum = sold ? 1 : 3;
  const maximum = sold ? 2 : 5;
  const listingCount = Math.max(minimum, Math.min(maximum, parseInt(
    schedule.listing_count, 10
  ) || minimum));
  const normalized = normalizeSchedule({
    enabled: schedule.enabled,
    listing_count: Math.max(3, listingCount),
    interval_unit: schedule.interval_unit,
    interval_value: schedule.interval_value,
  });
  normalized.listing_count = listingCount;
  return normalized;
}

function providerScheduleProjection(scheduleInput, activeCardCount, options) {
  const settings = options || {};
  const role = settings.role === "active" ? "active" : "sold";
  const schedule = normalizeProviderSchedule(scheduleInput, role);
  const cards = Math.max(0, parseInt(activeCardCount, 10) || 0);
  const hours = schedule.interval_unit === "hours"
    ? schedule.interval_value
    : schedule.interval_unit === "days"
      ? schedule.interval_value * 24
      : schedule.interval_unit === "weeks"
        ? schedule.interval_value * 24 * 7
        : schedule.interval_value * 24 * 30.4375;
  const operations = schedule.enabled && cards
    ? Math.ceil(cards * (24 * 30.4375) / hours)
    : 0;
  const records = operations * schedule.listing_count;
  const unitCost = Math.max(0, Number(settings.unitCostUsd) || 0);
  const freeAllowance = Math.max(0, Number(settings.freeAllowance) || 0);
  const projectedCost = Math.round(records * unitCost * 100) / 100;
  return {
    role,
    estimated_monthly_operations: operations,
    estimated_monthly_records: records,
    estimated_monthly_cost_usd: projectedCost,
    free_allowance: freeAllowance,
    free_remaining: Math.max(0, freeAllowance - records),
    percent_of_free_allowance: freeAllowance
      ? Math.round(records / freeAllowance * 1000) / 10
      : 0,
    fits_free_allowance: !freeAllowance || records <= freeAllowance,
  };
}

module.exports = {
  apifyConfigFromEnvironment,
  boolValue,
  configFromEnvironment,
  evaluateBudget,
  fnv1a,
  positiveInteger,
  queryHash,
  normalizeSchedule,
  normalizeProviderSchedule,
  nextScheduleAt,
  providerScheduleProjection,
  scheduleProjection,
  usageProjection,
  warningThresholds,
};
