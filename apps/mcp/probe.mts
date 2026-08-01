// Slice 0 acceptance probe (SPEC_T2_PASSPORT_CONNECT §5).
//
// Drives the hosted MCP with a REAL MCP client and asserts the two things the
// spike exists to answer: is the hosted transport reachable/routable, and does
// an MCP Apps card come back correctly (with a text fallback for hosts that
// lack Apps).
//
//   pnpm --filter @t2000/mcp-host dev      # terminal 1
//   pnpm --filter @t2000/mcp-host probe    # terminal 2
//
// Point it elsewhere with MCP_URL once mcp.t2000.ai is bound:
//   MCP_URL=https://mcp.t2000.ai/mcp pnpm --filter @t2000/mcp-host probe
//
// The other half of Slice 0 — the Claude Desktop cold-prompt ROUTING test —
// cannot be scripted: it needs a human adding the connector and asking for
// work in a fresh session. Record that result separately.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://localhost:3040/mcp");
const client = new Client({ name: "slice0-probe", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(url));

console.log("instructions present:", Boolean(client.getInstructions()));
console.log("earn-first primed:", /EARN-FIRST/.test(client.getInstructions() ?? ""));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).sort().join(", "));

const { resources } = await client.listResources();
console.log("ui resources:", resources.map((r) => `${r.uri} (${r.mimeType})`).join(", "));

// (b) the MCP App confirm card probe
const claim = await client.callTool({ name: "t2000_job_claim", arguments: { openingId: "op-demo" } });
const meta = (claim as any)._meta ?? {};
console.log("card meta on tool result:", JSON.stringify(meta));
console.log("degrades to text:", Boolean((claim as any).content?.[0]?.text));

const card = await client.readResource({ uri: "ui://t2000/confirm/claim" });
const html = (card.contents[0] as any).text as string;
console.log("card mime:", (card.contents[0] as any).mimeType);
console.log("card has Allow/Deny:", /id="allow"/.test(html) && /id="deny"/.test(html));
console.log("card respects reduced motion:", /prefers-reduced-motion/.test(html));

// read-only store tools actually reach the live commerce API
const svc = await client.callTool({ name: "t2000_services", arguments: {} });
const txt = (svc as any).content[0].text as string;
console.log("services tool -> live API:", txt.slice(0, 60).replace(/\s+/g, " "));

await client.close();
