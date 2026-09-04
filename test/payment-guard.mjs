#!/usr/bin/env node
/**
 * Layer 2 (unit) — the payment guard that backs the SECURITY.md guarantee.
 *
 * treasuryPolicy is the x402 PaymentPolicy passed to the client at construction.
 * A policy returning [] makes the client's selector fail closed (no payment
 * signed), so these assertions ARE the drain-prevention contract. Regression
 * guard against the finding: without this, the client signed EIP-3009
 * authorizations to an arbitrary payTo / amount / expiry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  treasuryPolicy,
  MAX_ATOMIC,
  MAX_WINDOW_SECONDS,
} from "../payment-guard.mjs";

const TREASURY = "0x127462e296fAc1A7F5cF33bA57bB2f0FFf5cD0B6";
// A well-formed anchor v2 requirement: treasury payTo, $0.05, 300s window.
const req = (over = {}) => ({
  scheme: "exact",
  network: "eip155:8453",
  payTo: TREASURY,
  amount: "50000",
  maxTimeoutSeconds: 300,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ...over,
});
const kept = (r) => treasuryPolicy(2, [r]).length === 1;

test("keeps a legit anchor treasury requirement (v2 amount, $0.05, 300s)", () => {
  assert.ok(kept(req()));
});

test("treasury match is case-insensitive", () => {
  assert.ok(kept(req({ payTo: TREASURY.toLowerCase() })));
  assert.ok(kept(req({ payTo: TREASURY.toUpperCase().replace("0X", "0x") })));
});

test("drops a non-treasury payTo (the arbitrary-recipient PoC)", () => {
  assert.ok(!kept(req({ payTo: "0x000000000000000000000000000000000000dEaD" })));
});

test("keeps exactly the $0.05 boundary, drops one atomic unit over", () => {
  assert.ok(kept(req({ amount: String(MAX_ATOMIC) })));
  assert.ok(!kept(req({ amount: String(MAX_ATOMIC + 1n) })));
});

test("drops an over-long validity window (the bearer-instrument PoC)", () => {
  assert.ok(!kept(req({ maxTimeoutSeconds: 315360000 })));
  assert.ok(kept(req({ maxTimeoutSeconds: MAX_WINDOW_SECONDS })));
});

test("fails closed on an unverifiable amount (no amount / no maxAmountRequired)", () => {
  const r = req();
  delete r.amount;
  assert.ok(!kept(r));
});

test("also honors the v1 maxAmountRequired field name", () => {
  const r = req();
  delete r.amount;
  r.maxAmountRequired = "50000";
  assert.ok(kept(r));
});

test("filters a mixed list down to only the legit treasury option", () => {
  const out = treasuryPolicy(2, [
    req({ payTo: "0x000000000000000000000000000000000000dEaD" }),
    req({ amount: "1000000" }), // $1.00 to treasury — over cap
    req(), // the one good one
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].payTo, TREASURY);
});

test("empty input and non-array input fail closed without throwing", () => {
  assert.deepEqual(treasuryPolicy(2, []), []);
  assert.deepEqual(treasuryPolicy(2, undefined), []);
});
