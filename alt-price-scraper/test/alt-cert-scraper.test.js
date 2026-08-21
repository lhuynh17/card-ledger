import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCertPrice,
  normalizeBrowseResultLabel,
  parseMoney,
} from "../src/alt-cert-scraper.js";

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
    normalizeBrowseResultLabel(
      "  Charizard  Holo  #4  ",
    ),
    "Charizard Holo #4",
  );
  assert.equal(
    normalizeBrowseResultLabel(
      "2016 Pokemon XY Promo Japanese 20th Anniversary Festa Participation Prize Holo Pikachu #279XYP",
    ),
    "2016 Pokemon XY Promo Japanese 20th Anniversary Festa Participation Prize Holo Pikachu #279XYP",
  );
});
