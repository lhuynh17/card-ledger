import assert from "node:assert/strict";
import test from "node:test";
import { PocketBaseAdmin } from "../src/pocketbase.js";
test("authenticates", async () => {
  const client = new PocketBaseAdmin({
    baseUrl: "https://example.test",
    email: "a@b.test",
    password: "secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ token: "token" }),
    }),
  });
  await client.authenticate();
  assert.equal(client.token, "token");
});
test("refuses MFA automation", async () => {
  const client = new PocketBaseAdmin({
    baseUrl: "https://example.test",
    email: "a@b.test",
    password: "secret",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ mfaId: "mfa" }),
    }),
  });
  await assert.rejects(client.authenticate(), /requires MFA/);
});
