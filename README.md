# anchor-x402-mcp

> MCP server exposing 14 [anchor-x402](https://anchor-x402.com) services as tools any Claude Desktop / Cursor / Codex / Continue agent can call. Pay-per-use USDC via x402 on Base mainnet — no API keys, no subscriptions.

## What an agent gets

Fourteen tools, $0.001–$0.05 per call.

**Commodity primitives** (9, $0.001–$0.010):

| Tool | Price | What it does |
|---|---|---|
| `anchor_hash` | $0.005 | Anchor any 32-byte hash to Base + Solana mainnet in parallel; returns both tx URLs |
| `screen_wallet` | $0.001 | OFAC SDN sanctions screening for any EVM or Solana wallet |
| `attest_decision` | $0.010 | Verify a wallet signature over (input_hash, output_hash, decision); dual-chain anchor the result |
| `decode_tx` | $0.001 | Structured decode of any mainnet tx (Base / Ethereum / Solana) |
| `resolve_name` | $0.001 | Cross-chain name resolution (ENS, Bonfida SNS) |
| `token_price` | $0.001 | USD spot price for any token by symbol or chain+contract |
| `decode_calldata` | $0.001 | 4byte selector + ABI param decode for raw EVM calldata |
| `parse_datetime` | $0.001 | Freeform datetime string → structured ISO 8601 |
| `intel_wallet` | $0.005 | Bundled wallet intelligence: balances + activity + identity + sanctions in one call |

**Universal LLM endpoints** (5, $0.01–$0.05) — added in v0.2:

| Tool | Price | What it does |
|---|---|---|
| `roast` | $0.05 | Witty 3-5 paragraph roast of any target — wallet, tweet, code, idea, anything |
| `oracle` | $0.05 | Yes/no oracle. Returns YES/NO/MAYBE + reason + dual-chain anchored `(question \| answer \| timestamp)` hash. Cryptographic receipt of when you asked. |
| `tldr` | $0.01 | Summarize a URL (fetches up to 500KB) or pasted text into 3-5 concise bullets |
| `aura` | $0.01 | Returns color, tier (S/A/B/C/D/F), score 0-9999, and a punchy 2-3 sentence aura read |
| `grade` | $0.01 | Academic letter grade (A+ to F) with red-pen marginalia and one-paragraph summary |

The investigator (`/v1/investigate`, $7.77 async) and the hosted chatbot at [chat.anchor-x402.com](https://chat.anchor-x402.com) are not included in the MCP — they're accessed directly via the HTTP API and the browser respectively.

The MCP server pays for itself — your wallet gets debited automatically for each call. No prepay, no API key, no account.

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "anchor-x402": {
      "command": "npx",
      "args": ["-y", "anchor-x402-mcp"],
      "env": {
        "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: *"Anchor the hash `7646dda1564bde0ef3f3971f4c002962df64246da4aa1d8c47247e7632494710` on mainnet"* — it'll call `anchor_hash` and pay $0.005 USDC from your wallet.

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "anchor-x402": {
    "command": "npx",
    "args": ["-y", "anchor-x402-mcp"],
    "env": {
      "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
    }
  }
}
```

### Codex CLI (OpenAI)

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.anchor-x402]
command = "npx"
args = ["-y", "anchor-x402-mcp"]

[mcp_servers.anchor-x402.env]
ANCHOR_WALLET_PRIVATE_KEY = "0xYOUR_BASE_WALLET_PRIVATE_KEY"
```

Restart `codex`. Type `/mcp` to confirm anchor-x402 shows in the loaded servers list.

### ChatGPT Desktop

Settings → **Integrations** → **MCP servers** → **Add server**. Paste:

```json
{
  "command": "npx",
  "args": ["-y", "anchor-x402-mcp"],
  "env": {
    "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
  }
}
```

Save, restart, the 9 tools appear in any chat with tool-use enabled.

### Cursor

Edit `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (project-scoped):

```json
{
  "mcpServers": {
    "anchor-x402": {
      "command": "npx",
      "args": ["-y", "anchor-x402-mcp"],
      "env": {
        "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
      }
    }
  }
}
```

### OpenAI Agents SDK (programmatic)

```python
from openai_agents import Agent, MCPServerStdio

mcp = MCPServerStdio(
    command="npx",
    args=["-y", "anchor-x402-mcp"],
    env={"ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"},
)
agent = Agent(name="researcher", model="gpt-4o", mcp_servers=[mcp])
```

Same package, same env, programmatic instead of config-driven.

### Continue / Smithery / generic MCP client

Same shape — `command: npx`, `args: [-y, anchor-x402-mcp]`, env carries your wallet key. The MCP SDK handles transport.

Or install via [Smithery](https://smithery.ai) one-liner:
```
npx -y @smithery/cli install anchor-x402-mcp --client claude
```
(replace `--client claude` with `cursor`, `codex`, `windsurf`, etc.)

### Run standalone

```bash
ANCHOR_WALLET_PRIVATE_KEY=0xYOUR_KEY npx anchor-x402-mcp
```

Speaks MCP over stdio. Pipe into any MCP-compatible client.

## Funding your wallet

The wallet you set as `ANCHOR_WALLET_PRIVATE_KEY` needs **USDC on Base mainnet**. Any amount works — even $1 buys 100 anchor calls or 1000 commodity-tier calls. Send USDC to your wallet's Base address:

- USDC contract on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Bridge from Ethereum mainnet via [bridge.base.org](https://bridge.base.org)
- Buy directly on Coinbase and withdraw to Base

The MCP server signs payments via [x402](https://github.com/coinbase/x402) — Coinbase's open HTTP-native micropayments protocol. Each request:

1. Hits an `anchor-x402` endpoint
2. Gets a 402 with payment requirements
3. Server signs a USDC transfer authorization with your private key
4. Retries the request with the signed payment — the API settles via Coinbase's facilitator

You see the response, your wallet's USDC balance ticks down by the call price. Sub-second, no ledger, no account.

## Environment variables

| Variable | Required? | Purpose |
|---|---|---|
| `ANCHOR_WALLET_PRIVATE_KEY` | Yes for paid calls | EVM private key. The wallet pays for x402 calls. |
| `ANCHOR_API_URL` | No | Override the API base URL. Default: `https://api.anchor-x402.com`. Useful for development against a self-hosted fork. |

If `ANCHOR_WALLET_PRIVATE_KEY` is unset, paid tool calls return a friendly 402 message explaining how to set it. `/health` and `/openapi.json` (not exposed as tools, but reachable via direct `curl`) work without payment.

## Security notes

- The private key lives in your MCP client's config file. **Treat it like a hot wallet** — only fund what you're willing to spend autonomously.
- Recommended: generate a fresh wallet specifically for agent use. Top up periodically; don't reuse a wallet that holds significant funds.
- The MCP server only signs USDC payment authorizations to anchor-x402's known treasury addresses (visible in the 402 response). It cannot drain your wallet to arbitrary addresses.
- Source code is fully open at [github.com/hypeprinter007-stack/anchor-x402-mcp](https://github.com/hypeprinter007-stack/anchor-x402-mcp). Audit before installing.

## Verifying anchor receipts

Every `anchor_hash` and `attest_decision` call returns Base + Solana tx URLs. These are independently verifiable on the public block explorers — agents can confirm an anchor exists without re-paying:

- Base: `https://basescan.org/tx/<base.tx>` — Input Data field contains the merkle root
- Solana: `https://solscan.io/tx/<solana.tx>` — Memo program data contains the same hex

The on-chain bytes are the receipt; the API response is just a convenience wrapper around them. See [the on-chain verifiability primer](https://anchor-x402.com/trust/on-chain-verifiability) for the full verification recipe.

## Troubleshooting

**"Payment required (402). Set ANCHOR_WALLET_PRIVATE_KEY..."**
You haven't configured a wallet. Add the env var to your MCP config and restart Claude Desktop.

**"Payment failed (402). The wallet may be out of USDC..."**
Your wallet ran out. Send USDC on Base to the wallet address shown in the server's startup log (it logs `payer=0x…` to stderr).

**"anchor-x402 request failed: ..."**
Network or DNS issue. Check `https://api.anchor-x402.com/health` returns 200; if not, see the [status page](https://anchor-x402.betteruptime.com).

## Links

- **Live API:** https://api.anchor-x402.com
- **Site / trust portal:** https://anchor-x402.com
- **Status:** https://anchor-x402.betteruptime.com
- **Server source:** https://github.com/hypeprinter007-stack/anchor-x402
- **MCP server source (this repo):** https://github.com/hypeprinter007-stack/anchor-x402-mcp
- **x402 protocol:** https://github.com/coinbase/x402
- **MCP spec:** https://modelcontextprotocol.io

## License

MIT
