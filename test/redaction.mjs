#!/usr/bin/env node
/**
 * Secret-redaction test. This server holds a spending key
 * (ANCHOR_WALLET_PRIVATE_KEY) — the one failure that turns a bug into a
 * security incident is that key leaking into an error string, a log line, or a
 * tool result the model then sees. Nothing else can verify that, and there is
 * no safe way to induce it for real, so it lives in its own test.
 *
 * SPEND-SAFE: spawned with ANCHOR_API_URL pointed at an unroutable host, so the
 * payment client is BUILT (the key is loaded — that's the point) but every call
 * fails at the socket before any signing or settlement. The key used is anvil's
 * publicly-documented default test key — not a real secret.
 *
 * Run: node --test test/redaction.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The env var this server reads its spending key from.
const SECRET_ENV = "ANCHOR_WALLET_PRIVATE_KEY";
// anvil/hardhat account #0 — a public, well-known throwaway key. Never a real secret.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_BODY = TEST_KEY.slice(2); // also check the un-prefixed form never leaks

async function spawnWith(secretValue) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../index.js", import.meta.url).pathname],
    env: { PATH: process.env.PATH, ANCHOR_API_URL: "http://127.0.0.1:9", [SECRET_ENV]: secretValue },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (c) => (stderr += c.toString()));
  const client = new Client({ name: "redaction-ci", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

function assertNoKey(haystack, where) {
  assert.ok(!haystack.includes(TEST_KEY), `${SECRET_ENV} (0x-form) leaked into ${where}`);
  assert.ok(!haystack.includes(KEY_BODY), `${SECRET_ENV} (raw hex) leaked into ${where}`);
}

test("valid key loaded: key never appears in stderr or tool results on failure", async () => {
  const { client, stderr } = await spawnWith(TEST_KEY);
  try {
    // Every code path a caller/log could see: a network failure with the
    // payment client active, and a 402-ish path. Both must stay key-free.
    const res = await client.callTool({ name: "token_price", arguments: { symbol: "ETH" } });
    assert.equal(res.isError, true);
    assertNoKey(JSON.stringify(res), "tool result");
    assertNoKey(stderr(), "stderr");
    // sanity: the payment path really was exercised (address, not key, is logged)
    assert.match(stderr(), /payment enabled, payer=0x/i, "expected the key-loaded path to run");
  } finally {
    await client.close();
  }
});

test("malformed key: the bad value is not echoed into stderr", async () => {
  // Distinct sentinel so a leak is unambiguous. Non-32-byte hex → the account
  // build throws and index.js logs an 'invalid ...' line; the value must not ride along.
  const SENTINEL = "0xdeadbeefsentinel";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../index.js", import.meta.url).pathname],
    env: { PATH: process.env.PATH, ANCHOR_API_URL: "http://127.0.0.1:9", [SECRET_ENV]: SENTINEL },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (c) => (stderr += c.toString()));
  const client = new Client({ name: "redaction-ci", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    await client.listTools(); // let the server finish its startup logging
    assert.ok(!stderr.includes(SENTINEL), "malformed key value leaked into stderr");
    assert.ok(!stderr.includes("deadbeefsentinel"), "malformed key body leaked into stderr");
  } finally {
    await client.close();
  }
});
