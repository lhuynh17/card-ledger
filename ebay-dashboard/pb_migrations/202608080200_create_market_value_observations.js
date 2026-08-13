migrate((app) => {
  try {
    app.findCollectionByNameOrId("market_value_observations");
    return;
  } catch (_) {
    // Create the append-only series only when it is not already installed.
  }

  const users = app.findCollectionByNameOrId("users");
  const ownerRule = '@request.auth.id != "" && owner = @request.auth.id';
  const collection = new Collection({
    type: "base",
    name: "market_value_observations",
    listRule: ownerRule,
    viewRule: ownerRule,
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: null,
    deleteRule: ownerRule,
    fields: [
      { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "card_id", type: "text", required: true, max: 100 },
      { name: "source", type: "select", required: true, maxSelect: 1, values: ["ebay", "alt"] },
      { name: "value", type: "number", required: true, min: 0 },
      { name: "currency", type: "text", required: true, max: 10 },
      { name: "observed_at", type: "date", required: true },
      { name: "source_url", type: "url" },
      { name: "source_item_id", type: "text", max: 500 },
      { name: "cert_number", type: "text", max: 100 },
      { name: "match_status", type: "select", required: true, maxSelect: 1, values: ["matched", "unmatched", "ambiguous"] },
      { name: "metadata", type: "json", maxSize: 500000 },
    ],
    indexes: [
      "CREATE INDEX `idx_market_value_observation_owner_card_time` ON `market_value_observations` (`owner`, `card_id`, `observed_at`)",
      "CREATE INDEX `idx_market_value_observation_owner_source_time` ON `market_value_observations` (`owner`, `source`, `observed_at`)",
    ],
  });
  app.save(collection);
});

