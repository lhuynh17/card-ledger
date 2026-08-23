import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCertPrice,
  isUnresolvedTransactionStatus,
  marketplaceFromTransaction,
  normalizeBrowseResultLabel,
  parseMoney,
  sourceItemIdFromAltUrl,
  sourceItemIdFromTransactionUrl,
  transactionObservedAt,
} from "../src/alt-cert-scraper.js";
import { randomScrapeDelayMs } from "../src/config.js";

test("parses listing price text from data-testid values", () => {
  assert.equal(parseMoney("$1,250"), 1250);
  assert.equal(parseMoney("$725.00"), 725);
  assert.equal(parseMoney("no price"), null);
});

test("extracts Alt Value only when cert matches", () => {
  assert.deepEqual(
    extractCertPrice(
      "PSA Certification Number 12345678\nALT VALUE $1,250",
      "12345678",
    ),
    { value: 1250, valueType: "alt_value" },
  );
  assert.equal(
    extractCertPrice(
      "PSA Certification Number 87654321\nALT VALUE $1,250",
      "12345678",
    ),
    null,
  );
});

test("falls back after cert verification", () =>
  assert.deepEqual(
    extractCertPrice("Cert #12 345 678\n$725\nBUY NOW", "12345678"),
    { value: 725, valueType: "displayed_price" },
  ));

test("normalizes browse result button labels without year assumptions", () => {
  assert.equal(
    normalizeBrowseResultLabel("  Charizard  Holo  #4  "),
    "Charizard Holo #4",
  );
});

test("extracts Alt item id from research URLs", () => {
  assert.equal(
    sourceItemIdFromAltUrl(
      "https://alt.xyz/itm/334a89a7-595a-440a-9c15-e76dd3de274d/research",
    ),
    "334a89a7-595a-440a-9c15-e76dd3de274d",
  );
  assert.equal(
    sourceItemIdFromAltUrl(
      "https://alt.xyz/itm/068d4726-594b-4b61-a305-638cfda914cf",
    ),
    "068d4726-594b-4b61-a305-638cfda914cf",
  );
  assert.equal(sourceItemIdFromAltUrl("https://alt.xyz/browse"), "");
});

test("random scrape delay stays within the configured range", () => {
  assert.equal(randomScrapeDelayMs(1200, 1200), 1200);
  for (let i = 0; i < 20; i += 1) {
    const delay = randomScrapeDelayMs(1000, 3000);
    assert.ok(delay >= 1000 && delay <= 3000);
  }
  const swapped = randomScrapeDelayMs(3000, 1000);
  assert.ok(swapped >= 1000 && swapped <= 3000);
});

test("builds durable ids from Recent Transactions hrefs", () => {
  assert.equal(
    sourceItemIdFromTransactionUrl(
      "/item/dbf1ee48-9dda-4210-983f-c8c3c36396fd",
    ),
    "alt:item:dbf1ee48-9dda-4210-983f-c8c3c36396fd",
  );
  assert.equal(
    sourceItemIdFromTransactionUrl(
      "https://www.ebay.com/itm/227481771683?mkcid=1&customid=abc",
    ),
    "ebay:itm:227481771683",
  );
  assert.equal(
    sourceItemIdFromTransactionUrl(
      "https://fanaticscollect.pxf.io/alt?u=https://www.fanaticscollect.com/weekly/e273c82a-86ba-11f1-9115-02ba9858bad3&subId1=research_transaction",
    ),
    "fanatics:weekly:e273c82a-86ba-11f1-9115-02ba9858bad3",
  );
  assert.equal(
    sourceItemIdFromTransactionUrl(
      "https://goldin.co/item/2006-pokemon-ex-holon-phantoms-holo-16-rayquaza-psa-gem-mt-10c6xtm",
    ),
    "goldin:item:2006-pokemon-ex-holon-phantoms-holo-16-rayquaza-psa-gem-mt-10c6xtm",
  );
});

test("maps marketplace from transaction url and logo label", () => {
  assert.equal(
    marketplaceFromTransaction(
      "https://www.ebay.com/itm/1",
      "eBay",
    ),
    "ebay",
  );
  assert.equal(
    marketplaceFromTransaction(
      "https://fanaticscollect.pxf.io/alt?u=https://www.fanaticscollect.com/weekly/e273c82a-86ba-11f1-9115-02ba9858bad3",
      "PWCC Weekly Auctions",
    ),
    "fanatics",
  );
});

test("treats Pending Unpaid Relisted as unresolved", () => {
  assert.equal(isUnresolvedTransactionStatus("Pending"), true);
  assert.equal(isUnresolvedTransactionStatus("Unpaid"), true);
  assert.equal(isUnresolvedTransactionStatus("Relisted"), true);
  assert.equal(isUnresolvedTransactionStatus(""), false);
});

test("parses transaction sale dates to ISO timestamps", () => {
  assert.match(transactionObservedAt("Aug 20, 2026"), /^2026-08-2/);
});
