#!/usr/bin/env node
/**
 * anchor-x402-mcp — MCP server exposing the 9 anchor-x402 services as tools.
 *
 * Install:  npm install -g anchor-x402-mcp     (or use via `npx anchor-x402-mcp`)
 *
 * Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "anchor-x402": {
 *         "command": "npx",
 *         "args": ["-y", "anchor-x402-mcp"],
 *         "env": {
 *           "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
 *         }
 *       }
 *     }
 *   }
 *
 * The wallet pays $0.001–$0.010 USDC per call automatically via x402. If
 * ANCHOR_WALLET_PRIVATE_KEY is unset, tool calls return a helpful 402
 * message explaining how to fund + retry.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.ANCHOR_API_URL || "https://api.anchor-x402.com";
const PRIVATE_KEY = process.env.ANCHOR_WALLET_PRIVATE_KEY || "";

// Set up the payment-enabled fetch if a key is configured. Otherwise we
// fall through to plain fetch and surface 402 responses verbatim (useful
// for read-only inspection or when the operator wants to handle payment
// out-of-band).
let paidFetch = fetch;
let paymentEnabled = false;
if (PRIVATE_KEY) {
  try {
    const account = privateKeyToAccount(
      PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`
    );
    paidFetch = wrapFetchWithPayment(fetch, account);
    paymentEnabled = true;
    console.error(
      `anchor-x402-mcp: payment enabled, payer=${account.address}`
    );
  } catch (err) {
    console.error(
      `anchor-x402-mcp: invalid ANCHOR_WALLET_PRIVATE_KEY: ${err.message}`
    );
  }
} else {
  console.error(
    "anchor-x402-mcp: no ANCHOR_WALLET_PRIVATE_KEY set — paid calls will return 402"
  );
}

const server = new Server(
  { name: "anchor-x402", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "anchor_hash",
    description:
      "Anchor a 32-byte hash to BOTH Base mainnet (as EIP-1559 calldata) and Solana mainnet (via the Memo program) in a single call. Returns both transaction hashes plus block-explorer URLs as cryptographic proof of when the hash existed. Pure infrastructure — no opinions about content. Use for DAO vote receipts, AI decision attestations, contract notarization, scientific data integrity, audit trails. $0.005 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        hash: {
          type: "string",
          description: "Pre-computed 32-byte hex hash (64 chars, no 0x prefix). Mutually exclusive with `data`.",
        },
        data: {
          description: "Arbitrary JSON to be canonicalized + SHA-256'd by the server. Mutually exclusive with `hash`.",
        },
        note: {
          type: "string",
          description: "Optional 200-char note included in the response (NOT on-chain).",
        },
      },
    },
  },
  {
    name: "screen_wallet",
    description:
      "Sanctions + AML screening for any EVM or Solana wallet address. Returns sanctions match (boolean), specific OFAC SDN programs flagged (Tornado Cash, Lazarus Group, Hydra Market, Garantex, Blender.io etc.), inferred chain, and a low/medium/high risk verdict. Use for AML pre-flight checks before any treasury transfer, KYC onboarding, vendor diligence, payroll wallet verification, marketplace counterparty checks. $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: {
          type: "string",
          description: "EVM 0x… address (40 hex) or Solana base58 pubkey.",
        },
      },
      required: ["wallet"],
    },
  },
  {
    name: "attest_decision",
    description:
      "Verify a wallet signature over (input_hash, output_hash, decision) with domain separation, then dual-chain anchor the resulting Merkle root on Base and Solana mainnet. Returns the verified signer plus on-chain proof URLs. Use when an AI agent's decision needs a cryptographic, auditable receipt — autonomous trade approvals, AI-assisted contract decisions, model-output attestation for liability records. $0.010 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        input_hash: { type: "string", description: "64-char hex SHA-256 of the agent's input." },
        output_hash: { type: "string", description: "64-char hex SHA-256 of the agent's output / decision payload." },
        decision: { type: "string", description: 'Free-form short label, e.g. "APPROVED", "REJECTED", "CONFIDENCE=0.93" (max 64 chars).' },
        scheme: { type: "string", enum: ["eip191", "ed25519"], description: "Signature scheme." },
        signature: { type: "string", description: "0x-prefixed hex (eip191) or base58 (ed25519)." },
        signer_pubkey: { type: "string", description: "Required for ed25519 (Solana base58 pubkey)." },
      },
      required: ["input_hash", "output_hash", "decision", "scheme", "signature"],
    },
  },
  {
    name: "decode_tx",
    description:
      "Structured decode of any mainnet transaction by hash. Supply chain ('base' | 'ethereum' | 'solana') and tx_hash. Returns from/to/value/gas/status/calldata for EVM, or slot/fee/signers/program_calls for Solana. Mined txs cached in-process. Use for tx inspection, audit, agent UX (rendering tx summaries to users). $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["base", "ethereum", "solana"] },
        tx_hash: { type: "string", description: "EVM 0x+64hex or Solana base58 signature." },
      },
      required: ["chain", "tx_hash"],
    },
  },
  {
    name: "resolve_name",
    description:
      "Cross-chain name resolution. Pass a name like 'vitalik.eth' or 'bonfida.sol' and get back the resolved address(es) across supported registries. Currently supports ENS (.eth) and Bonfida SNS (.sol). Cached 1h server-side. $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name, e.g. 'vitalik.eth' or 'bonfida.sol'." },
      },
      required: ["name"],
    },
  },
  {
    name: "token_price",
    description:
      "USD spot price for any major token. Pass either `symbol` (BTC, ETH, SOL, USDC, etc.) OR (chain + contract). Returns USD price, 24h change percent, market cap, fetched-at timestamp. CoinGecko-backed, cached 60s. $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Token symbol like 'ETH'. Mutually exclusive with chain+contract." },
        chain: { type: "string", description: "Chain slug: base, ethereum, solana, polygon, arbitrum, optimism, bsc, avalanche." },
        contract: { type: "string", description: "Token contract address. Required with chain." },
      },
    },
  },
  {
    name: "decode_calldata",
    description:
      "Decode raw EVM calldata into a human-readable function name, canonical signature, and typed parameter values. Resolves the 4-byte selector against openchain.xyz's signature directory, then ABI-decodes the args. Use for tx inspection before signing, mempool analysis, debug. EVM-only (chain='ethereum'); 'solana' returns 400. $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["ethereum", "solana"], description: "EVM-only; 'solana' returns 400." },
        calldata_hex: { type: "string", description: "Raw EVM calldata (>=4 byte selector), with or without 0x prefix." },
        contract_address: { type: "string", description: "Optional. Reserved for future on-chain ABI lookups." },
      },
      required: ["chain", "calldata_hex"],
    },
  },
  {
    name: "parse_datetime",
    description:
      "Parse any freeform datetime string ('tomorrow at noon', 'yesterday', '2026-05-13T15:30Z', 'in 2 hours') into a fully structured normalized form: ISO 8601, unix epoch, components (year/month/day/hour/min/sec/weekday), relative seconds + human form, confidence score. Saves agent LLM tokens on date parsing. $0.001 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Freeform datetime string." },
        base_time: { type: "string", description: "Optional ISO 8601 reference; defaults to now UTC." },
        timezone: { type: "string", description: "Optional IANA tz name (e.g. 'America/New_York'); defaults to UTC." },
      },
      required: ["input"],
    },
  },
  {
    name: "intel_wallet",
    description:
      "Unified wallet intelligence bundle. ONE call returns balances on Base + Ethereum + Solana, USDC across chains, transaction count, ENS/SNS reverse lookup, and sanctions verdict — all aggregated from 8–10 parallel free public sources. Replaces a wallet-investigation script with a single $0.005 call. Use for KYB pre-flight, counterparty research, fraud detection. $0.005 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "EVM 0x… address (40 hex) or Solana base58 pubkey." },
      },
      required: ["wallet"],
    },
  },
  {
    name: "roast",
    description:
      "Witty, observational roast of any target — a wallet address, tweet, code snippet, startup idea, person, meme, anything. Returns a 3-5 paragraph LLM roast and a one-sentence neutral summary of the target. Clever, not mean-spirited. Use for entertainment, demo content, social. $0.05 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Anything to roast — free text up to 8000 chars." },
      },
      required: ["target"],
    },
  },
  {
    name: "oracle",
    description:
      "Yes/no oracle with dual-chain anchored verdict. LLM answers YES / NO / MAYBE with one-sentence reason, then anchors sha256(question|answer|timestamp) to Base + Solana mainnet so anyone can prove the question was asked at a specific time. Use for prediction-market commits, conditional contracts, time-stamped opinions, settling bets. $0.05 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "A yes/no question (max 1000 chars)." },
      },
      required: ["question"],
    },
  },
  {
    name: "tldr",
    description:
      "Summarize a URL or pasted text into 3-5 concise bullets. Fetches up to 500KB on the URL path, strips HTML with BeautifulSoup. Use for research distillation, link-rot insurance, agent reading lists. Exactly one of `text` or `url`. $0.01 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Pasted text to summarize. Omit if providing `url`." },
        url: { type: "string", description: "URL to fetch + summarize. Omit if providing `text`." },
      },
    },
  },
  {
    name: "aura",
    description:
      "Aura read of any target — returns color (free-form e.g. 'molten gold with copper veins'), tier (S/A/B/C/D/F), score (0-9999), and a 2-3 sentence punchy description. Universal input — wallet, tweet, project, person, idea, meme. Use for viral / shareable content, brand vibes, social. $0.01 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Anything to read the aura of (max 4000 chars)." },
      },
      required: ["target"],
    },
  },
  {
    name: "grade",
    description:
      "Academic letter grade (A+ to F) with 3-7 red-pen marginalia one-liners and a one-paragraph teacher summary. Universal input — code, pitch deck, tweet, wallet, idea. Use for sharp feedback at low cost, prompt engineering eval, pre-investment screen. $0.01 USDC.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Anything to grade (max 6000 chars)." },
      },
      required: ["target"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

function buildRequest(name, args) {
  switch (name) {
    case "anchor_hash":
      return {
        url: `${BASE_URL}/v1/anchor`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(args.hash !== undefined ? { hash: args.hash } : {}),
            ...(args.data !== undefined ? { data: args.data } : {}),
            ...(args.note ? { note: String(args.note).slice(0, 200) } : {}),
          }),
        },
      };
    case "screen_wallet":
      return {
        url: `${BASE_URL}/v1/screen?${new URLSearchParams({ wallet: args.wallet })}`,
        opts: { method: "GET" },
      };
    case "attest_decision":
      return {
        url: `${BASE_URL}/v1/attest`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input_hash: args.input_hash,
            output_hash: args.output_hash,
            decision: String(args.decision).slice(0, 64),
            scheme: args.scheme,
            signature: args.signature,
            ...(args.signer_pubkey ? { signer_pubkey: args.signer_pubkey } : {}),
          }),
        },
      };
    case "decode_tx":
      return {
        url: `${BASE_URL}/v1/decode/tx`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chain: args.chain, tx_hash: args.tx_hash }),
        },
      };
    case "resolve_name":
      return {
        url: `${BASE_URL}/v1/resolve/name?${new URLSearchParams({ name: args.name })}`,
        opts: { method: "GET" },
      };
    case "token_price": {
      const params = new URLSearchParams();
      if (args.symbol) params.set("symbol", args.symbol);
      if (args.chain) params.set("chain", args.chain);
      if (args.contract) params.set("contract", args.contract);
      return {
        url: `${BASE_URL}/v1/price/token?${params}`,
        opts: { method: "GET" },
      };
    }
    case "decode_calldata":
      return {
        url: `${BASE_URL}/v1/decode/calldata`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chain: args.chain,
            calldata_hex: args.calldata_hex,
            ...(args.contract_address ? { contract_address: args.contract_address } : {}),
          }),
        },
      };
    case "parse_datetime":
      return {
        url: `${BASE_URL}/v1/parse/datetime`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: String(args.input).slice(0, 500),
            ...(args.base_time ? { base_time: args.base_time } : {}),
            ...(args.timezone ? { timezone: args.timezone } : {}),
          }),
        },
      };
    case "intel_wallet":
      return {
        url: `${BASE_URL}/v1/intel/wallet?${new URLSearchParams({ wallet: args.wallet })}`,
        opts: { method: "GET" },
      };
    case "roast":
      return {
        url: `${BASE_URL}/v1/roast`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: String(args.target).slice(0, 8000) }),
        },
      };
    case "oracle":
      return {
        url: `${BASE_URL}/v1/oracle`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: String(args.question).slice(0, 1000) }),
        },
      };
    case "tldr": {
      const body = {};
      if (args.text != null) body.text = String(args.text).slice(0, 200000);
      if (args.url != null) body.url = String(args.url).slice(0, 2048);
      return {
        url: `${BASE_URL}/v1/tldr`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      };
    }
    case "aura":
      return {
        url: `${BASE_URL}/v1/aura`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: String(args.target).slice(0, 4000) }),
        },
      };
    case "grade":
      return {
        url: `${BASE_URL}/v1/grade`,
        opts: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: String(args.target).slice(0, 6000) }),
        },
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  let req;
  try {
    req = buildRequest(name, args);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }

  try {
    const res = await paidFetch(req.url, req.opts);

    if (res.status === 402) {
      const body = await res.text().catch(() => "");
      const msg = paymentEnabled
        ? `Payment failed (402). The wallet may be out of USDC on Base, or the x402 facilitator rejected the payload.\n\nResponse body: ${body.slice(0, 300)}`
        : `Payment required (402). Set ANCHOR_WALLET_PRIVATE_KEY in your MCP config so this server can pay automatically:\n\n  "env": {\n    "ANCHOR_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"\n  }\n\nFund the wallet with USDC on Base (any amount > $0.05 is plenty). The wallet pays $0.001–$0.010 per call.\n\nResponse body: ${body.slice(0, 300)}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        content: [{ type: "text", text: `anchor-x402 returned ${res.status}: ${body.slice(0, 500)}` }],
        isError: true,
      };
    }

    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `anchor-x402 request failed: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("anchor-x402-mcp running");
