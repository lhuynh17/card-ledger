"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const adapter = require("./chrome-extension/alt-adapter.js");

const expected = {
  cert:"68410100", grader:"PSA", grade:"10", year:"2006",
  subject:"Rayquaza Holon Phantoms", cardNumber:"16",
};

test("accepts an exact cert, grader, grade, and card identity", () => {
  const result = adapter.normalizeResult({
    identityText:"2006 Pokemon EX Holon Phantoms #16 Rayquaza PSA 10 Cert 68410100",
    soldItems:[{
      id:"sale-1", title:"Rayquaza #16 PSA 10", priceText:"$10,786.40",
      soldText:"Sold Jul 19, 2026", soldAt:"2026-07-19",
      url:"https://www.ebay.com/itm/123456789",
    }, {
      id:"sale-old", title:"Rayquaza #16 PSA 10", priceText:"$9,000",
      soldText:"Sold May 7, 2026", soldAt:"May 7, 2026",
      url:"https://alt.xyz/marketplace/sale-old",
    }],
    activeItems:[
      { id:"a", title:"Rayquaza #16 PSA 10", priceText:"$12,000", url:"https://alt.xyz/marketplace/a" },
      { id:"b", title:"Rayquaza #16 PSA 10", priceText:"$11,500", url:"https://alt.xyz/marketplace/b" },
    ],
  }, expected);
  assert.equal(result.exact, true);
  assert.equal(result.soldItems[0].price, 10786.40);
  assert.equal(result.soldItems[0].id, "sale-1");
  assert.equal(result.activeItems[0].price, 11500);
});

test("rejects a wrong grade even when the cert digits are present", () => {
  const result = adapter.normalizeResult({
    identityText:"2006 Holon Phantoms #16 Rayquaza PSA 9 Cert 68410100",
    soldItems:[{
      title:"Wrong grade", priceText:"$200", soldAt:"2026-07-19",
      url:"https://alt.xyz/marketplace/wrong",
    }],
  }, expected);
  assert.equal(result.exact, false);
  assert.deepEqual(result.soldItems, []);
});

test("rejects a different card and never passes its price through", () => {
  const result = adapter.normalizeResult({
    identityText:"2005 EX Deoxys #22 Rayquaza PSA 10 Cert 68410100",
    soldItems:[{
      title:"Different Rayquaza", priceText:"$1,050", soldAt:"2026-07-30",
      url:"https://alt.xyz/marketplace/wrong-card",
    }],
  }, expected);
  assert.equal(result.exact, false);
  assert.equal(result.soldItems.length, 0);
});
