#!/usr/bin/env node
import { adminFromEnvironment } from "./pocketbase.js";
const admin = adminFromEnvironment();
await admin.authenticate();
const [cards, observations] = await Promise.all([
  admin.listAllRecords("cards"),
  admin.listAllRecords("market_value_observations"),
]);
console.log(
  JSON.stringify(
    {
      authenticated: true,
      inventoryCards: cards.filter((card) => !card.sold).length,
      observations: observations.length,
    },
    null,
    2,
  ),
);
