/// <reference path="../pb_data/types.d.ts" />

// Keep PARSE_BOT_API_KEY on the PocketBase server. Never place it in index.html.
function parseCreditLimit() {
  const configured = parseInt($os.getenv("PARSE_BOT_MONTHLY_CREDITS") || "200", 10);
  return configured > 0 ? configured : 200;
}

function parseCreditState(e, increment) {
  const month = new Date().toISOString().slice(0, 7);
  const limit = parseCreditLimit();
  let record;
  try {
    record = $app.findFirstRecordByFilter(
      "app_preferences",
      "owner = {:owner}",
      { owner: e.auth.id }
    );
  } catch (_) {
    record = new Record($app.findCollectionByNameOrId("app_preferences"));
    record.set("owner", e.auth.id);
  }
  let used = record.getString("parse_credits_month") == month
    ? record.getInt("parse_credits_used")
    : 0;
  if (increment) used += 1;
  used = Math.max(0, used);
  record.set("parse_credits_month", month);
  record.set("parse_credits_used", used);
  $app.save(record);
  return {
    month: month,
    limit: limit,
    used: used,
    remaining: Math.max(0, limit - used),
    tracking: "slab_ledger_calls",
  };
}

function safeParseCreditState(e, increment) {
  try {
    return parseCreditState(e, increment);
  } catch (_) {
    return null;
  }
}

routerAdd("GET", "/api/slab-ledger/psa-credits", (e) => {
  const credits = safeParseCreditState(e, false);
  if (!credits) {
    return e.json(503, {
      message: "Run the PocketBase setup tool to enable Parse.bot credit tracking.",
    });
  }
  return e.json(200, credits);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/slab-ledger/psa-credits", (e) => {
  const input = new DynamicModel({ remaining: -1 });
  e.bindBody(input);
  const limit = parseCreditLimit();
  const remaining = Math.floor(Number(input.remaining));
  if (!Number.isFinite(remaining) || remaining < 0 || remaining > limit) {
    throw new BadRequestError("Enter a remaining credit balance from 0 to " + limit + ".");
  }
  const month = new Date().toISOString().slice(0, 7);
  let record;
  try {
    record = $app.findFirstRecordByFilter(
      "app_preferences",
      "owner = {:owner}",
      { owner: e.auth.id }
    );
  } catch (_) {
    record = new Record($app.findCollectionByNameOrId("app_preferences"));
    record.set("owner", e.auth.id);
  }
  record.set("parse_credits_month", month);
  record.set("parse_credits_used", limit - remaining);
  $app.save(record);
  return e.json(200, {
    month: month,
    limit: limit,
    used: limit - remaining,
    remaining: remaining,
    tracking: "slab_ledger_calls",
  });
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/slab-ledger/psa/{cert}", (e) => {
  const cert = e.request.pathValue("cert");
  if (!/^\d{8,10}$/.test(cert)) {
    return e.json(400, { message: "Enter an 8–10 digit PSA certification number." });
  }

  const apiKey = $os.getenv("PARSE_BOT_API_KEY");
  if (!apiKey) {
    return e.json(503, { message: "PSA lookup is not configured on this PocketBase server." });
  }

  const response = $http.send({
    url: "https://api.parse.bot/scraper/311daf8c-242f-4c68-af70-b50617fd1d13/get_cert_details?cert_number=" +
      encodeURIComponent(cert),
    method: "GET",
    headers: { "X-API-Key": apiKey, "Accept": "application/json" },
    timeout: 25,
  });
  if (response.statusCode != 200) {
    return e.json(response.statusCode == 404 ? 404 : (response.statusCode == 429 ? 429 : 502), {
      message: response.statusCode == 404
        ? "PSA could not find that certification number."
        : (response.statusCode == 429
          ? "The Parse.bot rate limit or monthly credit limit was reached."
          : "The PSA lookup service is temporarily unavailable."),
    });
  }

  const payload = response.json || {};
  const details = payload.data || payload.result || payload;
  return e.json(200, {
    cert_number: String(details.cert_number || cert),
    card_title: String(details.card_title || ""),
    subject: String(details.subject || ""),
    brand: String(details.brand || ""),
    year: String(details.year || ""),
    grade: String(details.grade || ""),
    population: String(details.population || ""),
    spec_id: String(details.spec_id || ""),
    front_image_url: details.front_image_url || null,
    back_image_url: details.back_image_url || null,
    credits: safeParseCreditState(e, true),
  });
}, $apis.requireAuth("users"));

// Relay only PSA-hosted public images. This avoids browser CORS failures while
// preventing this route from being used to reach the NAS or private network.
routerAdd("GET", "/api/slab-ledger/psa-image", (e) => {
  const rawUrl = e.request.url.query().get("url");
  const match = String(rawUrl || "").match(/^https:\/\/([a-z0-9.-]+)(?:[\/?#]|$)/i);
  if (!match) {
    return e.json(400, { message: "Invalid PSA image address." });
  }
  const hostname = match[1].toLowerCase();
  const allowedHost = hostname == "psacard.com" ||
    hostname.endsWith(".psacard.com") ||
    hostname == "collectors.com" ||
    hostname.endsWith(".collectors.com") ||
    hostname == "cloudfront.net" ||
    hostname.endsWith(".cloudfront.net");
  if (!allowedHost) {
    return e.json(400, { message: "That image host is not allowed." });
  }

  const response = $http.send({
    url: rawUrl,
    method: "GET",
    headers: { "Accept": "image/jpeg,image/png,image/webp,image/*" },
    timeout: 25,
  });
  const contentTypes = response.headers["Content-Type"] || response.headers["content-type"] || [];
  const contentType = String(contentTypes[0] || "image/jpeg").split(";")[0];
  if (response.statusCode != 200 || !contentType.startsWith("image/")) {
    return e.json(502, { message: "The PSA image is temporarily unavailable." });
  }
  if (!response.body || response.body.length > 10485760) {
    return e.json(413, { message: "The PSA image is too large to import." });
  }
  return e.blob(200, contentType, response.body);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/slab-ledger/psa/{cert}/sales", (e) => {
  const cert = e.request.pathValue("cert");
  if (!/^\d{8,10}$/.test(cert)) {
    return e.json(400, { message: "Enter an 8–10 digit PSA certification number." });
  }

  const apiKey = $os.getenv("PARSE_BOT_API_KEY");
  if (!apiKey) {
    return e.json(503, { message: "PSA lookup is not configured on this PocketBase server." });
  }

  const response = $http.send({
    url: "https://api.parse.bot/scraper/311daf8c-242f-4c68-af70-b50617fd1d13/get_cert_sales?cert_number=" +
      encodeURIComponent(cert),
    method: "GET",
    headers: { "X-API-Key": apiKey, "Accept": "application/json" },
    timeout: 25,
  });
  if (response.statusCode != 200) {
    return e.json(response.statusCode == 429 ? 429 : 502, {
      message: response.statusCode == 429
        ? "The Parse.bot rate limit or monthly credit limit was reached."
        : "Recent PSA sales could not be loaded.",
    });
  }

  const payload = response.json || {};
  const data = payload.data || payload.result || payload;
  const rawSales = Array.isArray(data) ? data :
    (Array.isArray(data.sales) ? data.sales : (Array.isArray(data.items) ? data.items : []));
  const sales = rawSales.slice(0, 3).map((sale) => ({
    date_sold: String(sale.date_sold || ""),
    price: Number(sale.price) || 0,
    title: String(sale.title || ""),
    url: String(sale.url || sale.ebay_url || ""),
  })).filter((sale) => sale.price > 0);
  const prices = sales.map((sale) => sale.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const estimate = !prices.length ? 0 :
    (prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2);

  return e.json(200, {
    estimate: Math.round(estimate * 100) / 100,
    sales_count: sales.length,
    sales: sales,
    method: "median_recent_sales",
    credits: safeParseCreditState(e, true),
  });
}, $apis.requireAuth("users"));
