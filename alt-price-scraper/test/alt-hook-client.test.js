import assert from "node:assert/strict";
import test from "node:test";
import { AltHookClient } from "../src/alt-hook-client.js";
test("uses scoped token", async () => {
  const calls = [];
  const token = "a".repeat(64);
  const client = new AltHookClient({
    baseUrl: "https://example.test",
    token,
    fetchImpl: async (url, options) => (
      calls.push({ url, options }),
      { ok: true, json: async () => ({ items: [] }) }
    ),
  });
  await client.inventory();
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.match(calls[0].url, /\/alt\/inventory$/);
});
test("posts observations to scoped endpoint", async () => {
  let url = "";
  const client = new AltHookClient({
    baseUrl: "https://example.test",
    token: "b".repeat(64),
    fetchImpl: async (value) => {
      url = value;
      return { ok: true, json: async () => ({ saved: 1 }) };
    },
  });
  assert.equal((await client.appendObservations([{ value: 1 }])).saved, 1);
  assert.match(url, /\/alt\/observations$/);
});
