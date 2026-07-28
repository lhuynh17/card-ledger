"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  REJECTION,
  filterCandidates,
  normalizeRequest,
  valuationFromCandidates,
} = require("./pb_hooks/lib/marketplace-provider");
const {
  ProviderError,
  createBrightDataAdapter,
  normalizeRawRecord,
} = require("./pb_hooks/lib/bright-data-adapter");
const {
  configFromEnvironment,
  evaluateBudget,
  queryHash,
  usageProjection,
} = require("./pb_hooks/lib/marketplace-policy");

const request = {
  query: "2023 Pokemon Charizard 199 PSA 10",
  card_identity: "2023 Pokemon Charizard 199",
  grader: "PSA",
  grade: "10",
  result_limit: 50,
};

function raw(overrides) {
  return {
    listing_id: "123",
    title: "2023 Pokemon Charizard 199 PSA 10",
    sold_price: 100,
    shipping_cost: 5,
    sold_date: "2026-07-01",
    listing_url: "https://www.ebay.com/itm/123",
    ...overrides,
  };
}

test("normalizes a provider-neutral request", () => {
  const normalized = normalizeRequest(request);
  assert.equal(normalized.marketplace, "ebay");
  assert.equal(normalized.grader, "PSA");
  assert.equal(normalized.grade, "10");
});

test("Bright Data aliases stay inside the adapter", () => {
  const candidate = normalizeRawRecord(raw(), "2026-07-28T00:00:00.000Z");
  assert.equal(candidate.provider, "bright_data");
  assert.equal(candidate.provider_listing_id, "123");
  assert.equal(candidate.total, 105);
  assert.equal(candidate.sold_at, "2026-07-01");
});

test("rejects malformed and changed Bright Data records", () => {
  assert.throws(
    () => normalizeRawRecord({ unexpected: true }, "2026-07-28T00:00:00.000Z"),
    (error) => error instanceof ProviderError && error.code === "schema_changed"
  );
});

test("rejects wrong grade, replicas, duplicates, and identity mismatches", () => {
  const candidates = [
    normalizeRawRecord(raw(), "2026-07-28T00:00:00.000Z"),
    normalizeRawRecord(raw({ listing_id: "124", title: "2023 Pokemon Charizard 199 PSA 9" }), "2026-07-28T00:00:00.000Z"),
    normalizeRawRecord(raw({ listing_id: "125", title: "2023 Pokemon Charizard 199 PSA 10 replica" }), "2026-07-28T00:00:00.000Z"),
    normalizeRawRecord(raw({ listing_id: "126", title: "2023 Pokemon Pikachu 025 PSA 10" }), "2026-07-28T00:00:00.000Z"),
    normalizeRawRecord(raw(), "2026-07-28T00:00:00.000Z"),
  ];
  const result = filterCandidates(candidates, request);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejection_counts[REJECTION.WRONG_GRADE], 1);
  assert.equal(result.rejection_counts[REJECTION.REPLICA_OR_REPRINT], 1);
  assert.equal(result.rejection_counts[REJECTION.CARD_IDENTITY_MISMATCH], 1);
  assert.equal(result.rejection_counts[REJECTION.DUPLICATE], 1);
});

test("empty candidates do not produce a zero valuation", () => {
  assert.equal(valuationFromCandidates([]), null);
});

test("valuation uses recent accepted candidates", () => {
  const candidates = [90, 100, 110].map((total, index) => ({
    total,
    sold_at: `2026-07-0${index + 1}`,
  }));
  assert.deepEqual(valuationFromCandidates(candidates), {
    market_value: 100,
    low: 90,
    high: 110,
    confidence: "high",
    comparables: candidates,
  });
});

test("adapter cannot call live API until schema confirmation", () => {
  let called = false;
  const adapter = createBrightDataAdapter({
    httpSend() {
      called = true;
      return { statusCode: 200, json: [] };
    },
  });
  assert.throws(
    () => adapter.search({ ...request, search_url: "https://www.ebay.com/sch/i.html?_nkw=test" }, {
      enabled: true,
      schemaConfirmed: false,
      apiToken: "not-a-real-token",
      datasetId: "not-confirmed",
      requestMode: "sync",
    }),
    (error) => error.code === "schema_unconfirmed"
  );
  assert.equal(called, false);
});

test("adapter reports authentication, timeout, and empty results safely", () => {
  const baseConfig = {
    enabled: true,
    schemaConfirmed: true,
    apiToken: "fixture-token",
    datasetId: "fixture-dataset",
    requestMode: "sync",
    inputField: "url",
    resultLimit: 50,
    pageLimit: 1,
    timeoutSeconds: 25,
  };
  const search = { ...request, search_url: "https://www.ebay.com/sch/i.html?_nkw=test" };
  const unauthorized = createBrightDataAdapter({
    httpSend: () => ({ statusCode: 401, json: {} }),
  });
  assert.throws(() => unauthorized.search(search, baseConfig), (error) => error.code === "authentication");

  const timedOut = createBrightDataAdapter({
    httpSend: () => {
      throw new ProviderError("timeout", "Provider timed out.", true);
    },
  });
  assert.throws(() => timedOut.search(search, baseConfig), (error) => error.code === "timeout");

  const empty = createBrightDataAdapter({
    httpSend: () => ({ statusCode: 200, json: [] }),
  });
  const result = empty.search(search, baseConfig);
  assert.equal(result.records_returned, 0);
  assert.deepEqual(result.candidates, []);
});

test("budget defaults are conservative and configurable", () => {
  const values = {
    BRIGHT_DATA_ENABLED: "1",
    BRIGHT_DATA_KILL_SWITCH: "0",
    BRIGHT_DATA_MONTHLY_ALLOWANCE: "5000",
    BRIGHT_DATA_DAILY_CEILING: "250",
  };
  const config = configFromEnvironment((name) => values[name]);
  assert.equal(config.monthlyAllowance, 5000);
  assert.equal(config.dailyCeiling, 250);
  assert.equal(config.hardStop, true);
  assert.equal(config.resultLimit, 50);
});

test("kill switch, monthly allowance, and daily ceiling stop requests", () => {
  const base = configFromEnvironment(() => "");
  assert.equal(evaluateBudget(base, { monthRecords: 0, todayRecords: 0 }, 50).allowed, false);

  const enabled = { ...base, enabled: true, killSwitch: false };
  assert.deepEqual(
    evaluateBudget(enabled, { monthRecords: 5000, todayRecords: 0 }, 50).blockedReasons,
    ["monthly_allowance"]
  );
  assert.deepEqual(
    evaluateBudget(enabled, { monthRecords: 0, todayRecords: 250 }, 50).blockedReasons,
    ["daily_ceiling"]
  );
  assert.deepEqual(
    evaluateBudget(enabled, { monthRecords: 4975, todayRecords: 0 }, 50).blockedReasons,
    ["monthly_allowance"]
  );
});

test("hard stop can warn without blocking after explicit configuration", () => {
  const config = {
    ...configFromEnvironment(() => ""),
    enabled: true,
    killSwitch: false,
    hardStop: false,
  };
  const result = evaluateBudget(config, { monthRecords: 5000, todayRecords: 250 }, 50);
  assert.equal(result.allowed, true);
  assert.equal(result.percentConsumed, 100);
  assert.equal(result.warningThreshold, 90);
});

test("usage projection and query hashes are deterministic", () => {
  assert.deepEqual(usageProjection(280, new Date("2026-07-28T00:00:00Z")), {
    averageDailyUsage: 10,
    projectedMonthEndUsage: 310,
  });
  assert.equal(queryHash(normalizeRequest(request)), queryHash(normalizeRequest(request)));
});

test("marketplace routes require app-user authentication and add no listener", () => {
  const hook = fs.readFileSync(path.join(
    __dirname, "pb_hooks", "slab_ledger_marketplace.pb.js"
  ), "utf8");
  const routes = [...hook.matchAll(/routerAdd\(([\s\S]*?)\$apis\.requireAuth\("users"\)\);/g)];
  assert.equal(routes.length, 2);
  assert.doesNotMatch(hook, /webhook|0\.0\.0\.0|ThreadingHTTPServer|listen\(/i);
});
