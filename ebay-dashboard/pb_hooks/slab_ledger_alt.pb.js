/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/slab-ledger/alt/inventory", (e) => {
  return require(`${__hooks}/lib/alt-service.js`).inventoryHandler(e);
});

routerAdd("POST", "/api/slab-ledger/alt/observations", (e) => {
  return require(`${__hooks}/lib/alt-service.js`).observationsHandler(e);
});

