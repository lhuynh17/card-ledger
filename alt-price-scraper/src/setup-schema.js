#!/usr/bin/env node
import { adminFromEnvironment } from "./pocketbase.js";
const admin = adminFromEnvironment();
await admin.authenticate();
try {
  await admin.getCollection("market_value_observations");
  console.log("market_value_observations already exists; no changes made.");
  process.exit(0);
} catch (error) {
  if (!/404|not found|wasn't found/i.test(error.message)) throw error;
}
const users = await admin.getCollection("users");
const ownerRule = '@request.auth.id != "" && owner = @request.auth.id';
await admin.request("POST", "/api/collections", {
  name: "market_value_observations",
  type: "base",
  listRule: ownerRule,
  viewRule: ownerRule,
  createRule:
    '@request.auth.id != "" && @request.body.owner = @request.auth.id',
  updateRule: null,
  deleteRule: ownerRule,
  fields: [
    {
      name: "owner",
      type: "relation",
      required: true,
      collectionId: users.id,
      maxSelect: 1,
      cascadeDelete: true,
    },
    { name: "card_id", type: "text", required: true, max: 100 },
    {
      name: "source",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["ebay", "alt"],
    },
    { name: "value", type: "number", required: true, min: 0 },
    { name: "currency", type: "text", required: true, max: 10 },
    { name: "observed_at", type: "date", required: true },
    { name: "source_url", type: "url" },
    { name: "source_item_id", type: "text", max: 500 },
    { name: "cert_number", type: "text", max: 100 },
    {
      name: "match_status",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["matched", "unmatched", "ambiguous"],
    },
    { name: "metadata", type: "json", maxSize: 500000 },
  ],
});
console.log("market_value_observations created.");
