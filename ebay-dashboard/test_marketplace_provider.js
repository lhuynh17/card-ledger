"use strict";

const assert = require("node:assert/strict");
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
