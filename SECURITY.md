# Security policy

## Reporting a vulnerability

**Email: [security@anchor-x402.com](mailto:security@anchor-x402.com)**

Subject line format: `[anchor-x402-mcp security] <one-line summary>`

We acknowledge within **5 business days** and aim to publish a fix or mitigation within **30 days**. Default coordinated disclosure timeline: **90 days**. We won't pursue legal action against good-faith researchers operating within these bounds.

## Scope

In scope:

- The MCP server (this repo) leaking the user's `ANCHOR_WALLET_PRIVATE_KEY` to anywhere other than the x402 payment payload sent to the configured anchor-x402 API
- Tool-call argument injection that causes the MCP server to send arbitrary HTTP requests to non-anchor-x402 endpoints (signed with the user's wallet)
- Path traversal or RCE via crafted tool arguments
- Any vulnerability in the npm tarball that could be exploited at install time (`postinstall` scripts, etc. — note: we ship none)
- Issues in our pinned `package.json` dependencies (`@modelcontextprotocol/sdk`, `x402-fetch`, `viem`) — file the upstream report and CC us so we can pin a patched version

Out of scope:

- Misconfiguration on the user's side (e.g., putting an over-funded wallet in their MCP config and getting drained by their own agent calling many tools)
- Vulnerabilities in `@modelcontextprotocol/sdk` itself — report to Anthropic via [their security policy](https://github.com/modelcontextprotocol/specification/security/policy)
- Issues in the underlying anchor-x402 server — report to https://github.com/hypeprinter007-stack/anchor-x402/security
- Self-DoS by configuring the MCP server with an empty / invalid wallet key (returns 402, doesn't drain anything)

## What this MCP server does with your private key

It signs USDC payment authorizations to **anchor-x402's known treasury addresses only**. Each request flow:

1. Tool call hits an `https://api.anchor-x402.com/v1/<tool>` endpoint
2. Receives a 402 response with payment requirements (specifies anchor-x402's treasury as the recipient)
3. Signs an EIP-3009 USDC `transferWithAuthorization` for the requested amount, to that treasury address
4. Retries with the signed payment in the `X-PAYMENT` header

The wallet **cannot** be drained to arbitrary addresses by this MCP server — payment is always to a server-specified recipient (anchor-x402's treasury) for a server-specified amount ($0.001–$0.05 USDC per call). The treasury addresses are public and visible in the 402 response payload.

**This guarantee is enforced in code, not just documented** (`payment-guard.mjs`, since v0.2.4). The payment client is constructed with an x402 policy that filters every 402's payment requirements to: `payTo` in the treasury allowlist, amount ≤ $0.05 (50000 atomic), and validity window ≤ 600s — and the fetch uses `redirect: "error"`. A 402 requesting any other recipient, a larger amount, a longer window, or arriving via a redirect is filtered out, and the call **fails closed** (no authorization is signed) rather than paying. Reaching an unenforced state would require an attacker-controlled response on `api.anchor-x402.com` or a user-set `ANCHOR_API_URL`; the policy holds even then. Regression-tested in `test/payment-guard.mjs`. Reported by Mehdi Kerimov (2026-09).

## Recommended hot-wallet hygiene

Treat the wallet you put in `ANCHOR_WALLET_PRIVATE_KEY` like a **hot wallet**:

- Generate fresh — don't reuse a wallet that holds significant funds
- Top up only what you're willing to spend autonomously (e.g., $5–$50 USDC at a time)
- The agent decides when to call tools; it can rack up calls quickly. Set a personal budget and watch your wallet balance
- Rotate the key if you suspect compromise (generate a new wallet, sweep the old one)

## Recognition

We credit good-faith researchers in the release notes and a public security advisory (or keep it anonymous — your call). This project does **not** offer a monetary bug bounty.

## Disclosure procedure

1. Email security@anchor-x402.com.
2. Acknowledge within 5 business days.
3. Severity + timeline within 7 days.
4. Default 90-day coordinated disclosure.
5. Public advisory at https://github.com/hypeprinter007-stack/anchor-x402-mcp/security/advisories with credit (or anonymous, your call).

## Acknowledgments

Hall of fame — none yet. Be the first.
