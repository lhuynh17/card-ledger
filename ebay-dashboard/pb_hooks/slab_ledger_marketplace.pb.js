/// <reference path="../pb_data/types.d.ts" />

// PocketBase serializes each route and cron handler into an isolated runtime.
// Load the service directly inside each handler so its CommonJS dependencies
// are available in that runtime. Provider credentials remain server-only.

routerAdd("GET", "/api/slab-ledger/marketplace/usage", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).usageHandler(e);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/slab-ledger/marketplace/schedule", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).scheduleHandler(e);
}, $apis.requireAuth("users"));

routerAdd("PUT", "/api/slab-ledger/marketplace/schedule", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).saveScheduleHandler(e);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/slab-ledger/marketplace/schedule/card/{cardId}", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).cardScheduleHandler(e);
}, $apis.requireAuth("users"));

routerAdd("PUT", "/api/slab-ledger/marketplace/schedule/card/{cardId}", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).saveCardScheduleHandler(e);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/slab-ledger/marketplace/search", (e) => {
  return require(`${__hooks}/lib/marketplace-service.js`).searchHandler(e);
}, $apis.requireAuth("users"));

cronAdd("slab-ledger-marketplace-schedule", "*/15 * * * *", () => {
  require(`${__hooks}/lib/marketplace-service.js`).scheduledRun();
});

cronAdd("slab-ledger-marketplace-retention", "17 3 * * *", () => {
  require(`${__hooks}/lib/marketplace-service.js`).retentionRun();
});
