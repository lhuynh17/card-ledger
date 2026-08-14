export class AltHookClient {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    this.token = String(token || "").trim();
    this.fetch = fetchImpl;
    if (!this.baseUrl || this.token.length < 32)
      throw new Error(
        "SLAB_POCKETBASE_URL and a strong SLAB_ALT_SCRAPER_TOKEN are required.",
      );
  }
  async request(method, path, body) {
    const response = await this.fetch(this.baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result.message ||
          `PocketBase Alt hook returned HTTP ${response.status}.`,
      );
    return result;
  }
  inventory() {
    return this.request("GET", "/api/slab-ledger/alt/inventory");
  }
  appendObservations(observations) {
    return this.request("POST", "/api/slab-ledger/alt/observations", {
      observations,
    });
  }
}
export const altHookFromEnvironment = () =>
  new AltHookClient({
    baseUrl: process.env.SLAB_POCKETBASE_URL,
    token: process.env.SLAB_ALT_SCRAPER_TOKEN,
  });
