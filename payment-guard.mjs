// Enforces the SECURITY.md guarantee IN CODE (not just prose): this MCP server
// will only ever sign a payment authorization to anchor-x402's treasury, for at
// most the documented per-call ceiling, with a bounded validity window.
//
// Without this, @x402's client signs an EIP-3009 transferWithAuthorization for
// whatever payTo / amount / expiry the responding endpoint asks for. That is
// only reachable by an attacker who controls the response on api.anchor-x402.com
// or via a user-set ANCHOR_API_URL — defence in depth, not a live drain — but
// the guarantee is the reason a user funds the wallet, so it must be real.
//
// Implemented as an x402 PaymentPolicy: (x402Version, requirements[]) => requirements[].
// Returning [] makes the client's requirement selector fail closed — no payment
// is signed. (@x402/core 2.12.0 has no `spendControls` config and no default
// amount cap, so the cap must live here.)

// anchor-x402's Base (eip155:8453) treasury payTo, lowercased. The MCP only
// registers the Base scheme, so this is the only recipient that can ever be legit.
export const TREASURY = new Set([
  "0x127462e296fac1a7f5cf33ba57bb2f0fff5cd0b6",
]);

// $0.05 USDC in 6-decimal atomic units — the top of the documented $0.001–$0.05
// range (oracle/roast are the priciest exposed tools at exactly $0.05).
export const MAX_ATOMIC = 50000n;

// Bound the authorization's validity window. anchor issues 300s; the drain PoC
// set ~10 years to mint a long-lived bearer instrument. 600s leaves margin for a
// minor server-side change without ever allowing a years-long window.
export const MAX_WINDOW_SECONDS = 600;

// x402 v2 requirements carry the price in `amount`; v1 used `maxAmountRequired`.
// Accept either; anything unparseable is unverifiable and must fail closed.
function amountAtomic(r) {
  const raw = r?.amount ?? r?.maxAmountRequired;
  if (raw == null) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export const treasuryPolicy = (_x402Version, requirements) =>
  (Array.isArray(requirements) ? requirements : []).filter((r) => {
    const amt = amountAtomic(r);
    const window = Number(r?.maxTimeoutSeconds ?? 0);
    return (
      typeof r?.payTo === "string" &&
      TREASURY.has(r.payTo.toLowerCase()) &&
      amt !== null &&
      amt <= MAX_ATOMIC &&
      Number.isFinite(window) &&
      window > 0 &&
      window <= MAX_WINDOW_SECONDS
    );
  });
