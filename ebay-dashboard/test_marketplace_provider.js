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
const apifySold = require("./pb_hooks/lib/apify-sold-adapter");
const {
  apifyConfigFromEnvironment,
  configFromEnvironment,
  evaluateBudget,
  nextScheduleAt,
  normalizeSchedule,
  normalizeProviderSchedule,
  providerScheduleProjection,
  queryHash,
  scheduleProjection,
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

test("schema failures preserve returned-record usage for accounting", () => {
  const adapter = createBrightDataAdapter({
    httpSend: () => ({
      statusCode:200,
      json:[raw(), { unexpected:true }],
    }),
  });
  assert.throws(() => adapter.search(
    { ...request, search_url:"https://www.ebay.com/sch/i.html?_nkw=test" },
    {
      enabled:true,
      schemaConfirmed:true,
      apiToken:"fixture-token",
      datasetId:"fixture-dataset",
      requestMode:"sync",
      inputField:"url",
      resultLimit:50,
      pageLimit:1,
      timeoutSeconds:25,
    }
  ), (error) => error.code === "schema_changed" && error.recordsReturned === 2);
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

test("asynchronous adapter polls and downloads without a webhook", () => {
  const calls = [];
  const responses = [
    { statusCode: 200, json: { snapshot_id:"s_fixture" } },
    { statusCode: 200, json: { status:"running" } },
    { statusCode: 200, json: { status:"ready" } },
    { statusCode: 200, json: [raw()] },
  ];
  const adapter = createBrightDataAdapter({
    httpSend(options) {
      calls.push(options);
      return responses.shift();
    },
    sleep() {},
  });
  const result = adapter.search(
    { ...request, search_url:"https://www.ebay.com/sch/i.html?_nkw=test" },
    {
      enabled:true,
      schemaConfirmed:true,
      apiToken:"fixture-token",
      datasetId:"fixture-dataset",
      requestMode:"async",
      inputField:"url",
      resultLimit:50,
      pageLimit:1,
      timeoutSeconds:25,
      maxPolls:3,
      pollIntervalSeconds:1,
    }
  );

  assert.equal(result.records_returned, 1);
  assert.match(calls[0].url, /\/trigger\?/);
  assert.match(calls[1].url, /\/progress\/s_fixture$/);
  assert.match(calls[3].url, /\/snapshot\/s_fixture\?format=json$/);
  assert.equal(calls.some((call) => /webhook/i.test(JSON.stringify(call))), false);
});

test("asynchronous polling has a bounded timeout", () => {
  const adapter = createBrightDataAdapter({
    httpSend(options) {
      return /\/trigger\?/.test(options.url)
        ? { statusCode:200, json:{ snapshot_id:"s_fixture" } }
        : { statusCode:200, json:{ status:"running" } };
    },
    sleep() {},
  });
  assert.throws(() => adapter.search(
    { ...request, search_url:"https://www.ebay.com/sch/i.html?_nkw=test" },
    {
      enabled:true,
      schemaConfirmed:true,
      apiToken:"fixture-token",
      datasetId:"fixture-dataset",
      requestMode:"async",
      inputField:"url",
      resultLimit:50,
      pageLimit:1,
      timeoutSeconds:25,
      maxPolls:2,
      pollIntervalSeconds:1,
    }
  ), (error) => error.code === "timeout" && error.retryable);
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

test("Apify sold configuration defaults off with a free-tier safety cap", () => {
  const config = apifyConfigFromEnvironment(() => "");
  assert.equal(config.enabled, false);
  assert.equal(config.killSwitch, true);
  assert.equal(config.schemaConfirmed, false);
  assert.equal(config.monthlyAllowance, 1400);
  assert.equal(config.unitCostUsd, 0.00345);
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

test("schedule supports three to five listings and hour to month intervals", () => {
  assert.deepEqual(normalizeSchedule({
    enabled:true,
    listing_count:5,
    interval_unit:"hours",
    interval_value:12,
  }), {
    enabled:true,
    listing_count:5,
    interval_unit:"hours",
    interval_value:12,
  });
  assert.equal(nextScheduleAt({
    listing_count:3,
    interval_unit:"days",
    interval_value:1,
  }, new Date("2026-07-28T00:00:00Z")), "2026-07-29T00:00:00.000Z");
  assert.equal(nextScheduleAt({
    listing_count:3,
    interval_unit:"months",
    interval_value:1,
  }, new Date("2026-07-28T00:00:00Z")), "2026-08-28T00:00:00.000Z");
});

test("schedule projection exposes the monthly budget impact", () => {
  assert.deepEqual(scheduleProjection({
    listing_count:5,
    interval_unit:"hours",
    interval_value:12,
  }, 10), {
    estimated_monthly_operations:609,
    estimated_monthly_records:3045,
  });
});

test("sold and active provider schedules enforce separate result limits", () => {
  assert.equal(normalizeProviderSchedule({
    listing_count:5, interval_unit:"days", interval_value:1,
  }, "sold").listing_count, 2);
  assert.equal(normalizeProviderSchedule({
    listing_count:1, interval_unit:"weeks", interval_value:1,
  }, "active").listing_count, 3);
});

test("provider schedule projection shows free-tier fit before enabling", () => {
  assert.deepEqual(providerScheduleProjection({
    enabled:true,
    listing_count:2,
    interval_unit:"days",
    interval_value:3,
  }, 60, {
    role:"sold",
    unitCostUsd:0.00345,
    freeAllowance:1400,
  }), {
    role:"sold",
    estimated_monthly_operations:609,
    estimated_monthly_records:1218,
    estimated_monthly_cost_usd:4.2,
    free_allowance:1400,
    free_remaining:182,
    percent_of_free_allowance:87,
    fits_free_allowance:true,
  });
});

test("Apify sold aliases stay inside its adapter", () => {
  const normalized = apifySold.normalizeRecord({
    itemId:"123",
    title:"2023 Pokemon Charizard PSA 10",
    soldPrice:25,
    soldDate:"Jul 27, 2026",
    shippingCost:"+$5.00 delivery",
    condition:"Graded",
    thumbnail:"https://i.ebayimg.com/example.jpg",
    url:"https://www.ebay.com/itm/123",
    scrapedAt:"2026-07-28T00:00:00Z",
  }, "2026-07-28T00:00:00Z");
  assert.equal(normalized.provider, "apify");
  assert.equal(normalized.total, 30);
  assert.equal(normalized.sold_at, "Jul 27, 2026");
  assert.throws(() => apifySold.normalizeRecord({
    itemId:"123", title:"No sold date", soldPrice:25, url:"https://ebay.com/itm/123",
  }, "2026-07-28T00:00:00Z"), /confirmed sold schema/);
});

test("Apify adapter uses bounded outbound polling without a webhook", () => {
  const calls = [];
  const responses = [
    {statusCode:201, json:{data:{id:"run-1", status:"RUNNING"}}},
    {statusCode:200, json:{data:{
      id:"run-1", status:"SUCCEEDED", defaultDatasetId:"data-1",
    }}},
    {statusCode:200, json:[{
      itemId:"123", title:"2023 Pokemon Charizard PSA 10", soldPrice:25,
      soldDate:"Jul 27, 2026", shippingCost:"Free shipping",
      url:"https://www.ebay.com/itm/123",
    }]},
  ];
  const adapter = apifySold.adapter(
    (options) => { calls.push(options); return responses.shift(); },
    () => {},
    () => new Date("2026-07-28T00:00:00Z")
  );
  const result = adapter.search(normalizeRequest({
    query:"2023 Pokemon Charizard PSA 10",
    grader:"PSA",
    grade:"10",
    result_limit:2,
  }), {
    enabled:true,
    schemaConfirmed:true,
    apiToken:"secret",
    timeoutSeconds:25,
    maxPolls:3,
    pollIntervalSeconds:1,
  });
  assert.equal(result.records_returned, 1);
  assert.equal(result.candidates[0].sold_at, "Jul 27, 2026");
  assert.equal(calls.some((call) => /webhook/i.test(JSON.stringify(call))), false);
  assert.match(calls[0].url, /api\.apify\.com\/v2\/acts\//);
});

test("marketplace routes require app-user authentication and add no listener", () => {
  const hook = fs.readFileSync(path.join(
    __dirname, "pb_hooks", "slab_ledger_marketplace.pb.js"
  ), "utf8");
  const service = fs.readFileSync(path.join(
    __dirname, "pb_hooks", "lib", "marketplace-service.js"
  ), "utf8");
  const routes = [...hook.matchAll(/routerAdd\(([\s\S]*?)\$apis\.requireAuth\("users"\)\);/g)];
  assert.equal(routes.length, 6);
  assert.doesNotMatch(hook, /^const .*require\(/m);
  assert.equal(
    [...hook.matchAll(/require\(`\$\{__hooks\}\/lib\/marketplace-service\.js`\)/g)].length,
    8
  );
  assert.match(service, /module\.exports = \{/);
  assert.doesNotMatch(hook, /webhook|0\.0\.0\.0|ThreadingHTTPServer|listen\(/i);
  assert.doesNotMatch(service, /webhook|0\.0\.0\.0|ThreadingHTTPServer|listen\(/i);
  assert.match(
    hook,
    /cronAdd\("slab-ledger-marketplace-schedule", "\*\/15 \* \* \* \*"/
  );
});
