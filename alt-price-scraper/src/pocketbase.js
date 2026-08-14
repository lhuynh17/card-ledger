const PAGE_SIZE = 500;
export class PocketBaseAdmin {
  constructor({ baseUrl, email, password, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    this.email = String(email || "").trim();
    this.password = String(password || "");
    this.fetch = fetchImpl;
    this.token = "";
    if (!this.baseUrl || !this.email || !this.password)
      throw new Error(
        "PocketBase superuser URL, email, and password are required.",
      );
  }
  async authenticate() {
    const response = await this.fetch(
      this.baseUrl + "/api/collections/_superusers/auth-with-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ identity: this.email, password: this.password }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body?.mfaId)
        throw new Error("The automation superuser requires MFA.");
      throw new Error(
        body?.message ||
          `PocketBase authentication failed: HTTP ${response.status}`,
      );
    }
    this.token = body.token;
    return body;
  }
  async request(method, path, body) {
    if (!this.token) await this.authenticate();
    const response = await this.fetch(this.baseUrl + path, {
      method,
      headers: {
        Authorization: this.token,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result?.message || `PocketBase HTTP ${response.status}`);
    return result;
  }
  getCollection(name) {
    return this.request("GET", `/api/collections/${encodeURIComponent(name)}`);
  }
  async listAllRecords(collection, { filter = "", sort = "" } = {}) {
    const records = [];
    for (let page = 1; ; page += 1) {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(PAGE_SIZE),
      });
      if (filter) params.set("filter", filter);
      if (sort) params.set("sort", sort);
      const result = await this.request(
        "GET",
        `/api/collections/${encodeURIComponent(collection)}/records?${params}`,
      );
      records.push(...(result.items || []));
      if (page >= (result.totalPages || 1)) return records;
    }
  }
}
export const adminFromEnvironment = () =>
  new PocketBaseAdmin({
    baseUrl: process.env.SLAB_POCKETBASE_URL,
    email: process.env.SLAB_POCKETBASE_SUPERUSER_EMAIL,
    password: process.env.SLAB_POCKETBASE_SUPERUSER_PASSWORD,
  });
