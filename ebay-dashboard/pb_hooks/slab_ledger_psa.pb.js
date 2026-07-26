/// <reference path="../pb_data/types.d.ts" />

// Keep PARSE_BOT_API_KEY on the PocketBase server. Never place it in index.html.
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
  });
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
  });
}, $apis.requireAuth("users"));
