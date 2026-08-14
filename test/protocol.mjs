#!/usr/bin/env node
/**
 * Layer 2 — MCP protocol CI. Drives the REAL server over stdio and asserts it
 * speaks the protocol correctly. Run with: node --test test/protocol.mjs
 *
 * SPEND-SAFE BY CONSTRUCTION: the child is spawned with NO ANCHOR_WALLET_PRIVATE_KEY
 * (so no payment client is ever built) and ANCHOR_API_URL pointed at an
 * unroutable host (so even a tool call that reaches fetch can't hit the live
 * paid API). Nothing here can move USDC.
 *
 * What it covers:
 *   - initialize            → serverInfo.name + version (the runtime-drift guard:
 *                             version MUST equal package.json, catching any future
 *                             re-hardcoding of a literal in index.js)
 *   - tools/list            → the 14-stdio inventory CONTRACT: exact count + exact
 *                             name set + every tool has an object inputSchema
 *   - tools/call (unknown)  → clean MCP isError result, not a throw
 *   - tools/call (real name, unroutable API) → the handler NEVER lets an exception
 *                             escape the MCP boundary; it returns isError instead
 *
 * NOT covered here (needs the payment path mocked — that's layer 3):
 *   402 handling, upstream 4xx/5xx, timeout, and secret-redaction on error.
 *   Note also that index.js does NO input validation, so "invalid args" is a
 *   layer-3 concern: a malformed call currently falls through to fetch.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// The stdio inventory contract. If you add/remove a stdio tool, update this set
// (and the "14 over stdio" claim in server.json / package.json) deliberately.
const EXPECTED_TOOLS = new Set([
  "anchor_hash",
  "screen_wallet",
  "attest_decision",
  "decode_tx",
  "resolve_name",
  "token_price",
  "decode_calldata",
  "parse_datetime",
  "intel_wallet",
  "roast",
  "oracle",
  "tldr",
  "aura",
  "grade",
]);

let client;

before(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../index.js", import.meta.url).pathname],
    // Spend-safe env: no wallet key, unroutable API. Inherit nothing that could
    // carry a real key from the developer's shell.
    env: {
      PATH: process.env.PATH,
      ANCHOR_API_URL: "http://127.0.0.1:9",
    },
    stderr: "ignore",
  });
  client = new Client({ name: "protocol-ci", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

test("initialize: serverInfo name + version match the package", () => {
  const info = client.getServerVersion();
  assert.equal(info?.name, "anchor-x402", "serverInfo.name");
  assert.equal(
    info?.version,
    pkg.version,
    `runtime serverInfo.version (${info?.version}) must equal package.json (${pkg.version}) — version drift`
  );
});

test("tools/list: exact 14-tool stdio inventory contract", async () => {
  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));

  assert.equal(tools.length, EXPECTED_TOOLS.size, `expected ${EXPECTED_TOOLS.size} tools, got ${tools.length}`);

  const missing = [...EXPECTED_TOOLS].filter((n) => !names.has(n));
  const extra = [...names].filter((n) => !EXPECTED_TOOLS.has(n));
  assert.deepEqual(missing, [], `missing tools: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `unexpected tools: ${extra.join(", ")}`);

  for (const t of tools) {
    assert.ok(t.description?.length > 0, `${t.name}: has description`);
    assert.equal(t.inputSchema?.type, "object", `${t.name}: inputSchema.type === "object"`);
  }
});

test("tools/call unknown tool → clean isError, not a throw", async () => {
  const res = await client.callTool({ name: "does_not_exist", arguments: {} });
  assert.equal(res.isError, true, "unknown tool must return isError");
  assert.match(res.content?.[0]?.text ?? "", /Unknown tool/i);
});

test("tools/call with unroutable API → handler returns isError, never escapes", async () => {
  // token_price reaches fetch; the unroutable host makes it fail. The contract:
  // the CallTool handler catches it and returns a well-formed isError result
  // rather than letting the exception cross the MCP boundary.
  const res = await client.callTool({ name: "token_price", arguments: { symbol: "ETH" } });
  assert.equal(res.isError, true, "network failure must surface as isError");
  assert.ok(res.content?.[0]?.text?.length > 0, "isError result still carries a text message");
});
