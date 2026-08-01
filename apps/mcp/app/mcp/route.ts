import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { CLAIM_CONFIRM_CARD, UI_MIME } from "@/lib/cards";

// ── Passport Connect — Slice 0 SPIKE (SPEC_T2_PASSPORT_CONNECT §5) ──────────
//
// Purpose, and ONLY this: prove that (a) a hosted streamable-HTTP MCP is
// reachable and routable from Claude/ChatGPT, and (b) an MCP Apps confirm card
// renders in the host. Slice 0 is explicitly a spike — "routing fail ≠ kill
// Connect" — so it records a result, it does not ship the product.
//
// DELIBERATELY ABSENT until Slice 1:
//   · the delegated spend session (server-held zkLogin ephemeral key, founder
//     lock 2026-08-01) — so this server holds NO credential and can move NO
//     money;
//   · every write/money tool. The tools below are read-only against the public
//     commerce API, plus one confirm card that resolves locally and spends
//     nothing.
//
// That ordering is the point: a spike that can already spend is not a spike.

const COMMERCE_API = "https://api.t2000.ai/v1";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "t2000-connect", version: "0.0.0-spike" },
    {
      instructions: [
        "t2000 Passport Connect (SPIKE). This host exposes the t2000 A2A store:",
        "agents sell Services, fulfilled either as an escrowed Job or a per-call",
        "x402 endpoint. Use t2000_services to see what is listed and",
        "t2000_job_board to see open work anyone can claim.",
        "",
        "EARN-FIRST: claiming an Open job costs $0 — a Passport with no USDC can",
        "still earn. Do not tell the user they need funds before working.",
        "",
        "This spike is READ-ONLY: no money tool is wired yet.",
      ].join("\n"),
    }
  );

  server.registerResource(
    "claim-confirm-card",
    CLAIM_CONFIRM_CARD.uri,
    { title: "Claim confirmation", mimeType: UI_MIME },
    () => ({
      contents: [
        {
          uri: CLAIM_CONFIRM_CARD.uri,
          mimeType: UI_MIME,
          text: CLAIM_CONFIRM_CARD.html,
        },
      ],
    })
  );

  server.registerTool(
    "t2000_services",
    {
      title: "Browse Services",
      description:
        "Discover Services on the t2000 A2A store — what agents actually sell. Read-only, no wallet needed.",
      inputSchema: { query: z.string().optional() },
    },
    async ({ query }) => {
      const url = `${COMMERCE_API}/services${query ? `?q=${encodeURIComponent(query)}` : ""}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const body = await res.text();
      return { content: [{ type: "text" as const, text: body }] };
    }
  );

  server.registerTool(
    "t2000_job_board",
    {
      title: "Open job board",
      description:
        "List Open jobs anyone can claim. Claiming is free — this is the earn-first door for a $0 Passport.",
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${COMMERCE_API}/open-jobs`, {
        headers: { accept: "application/json" },
      });
      const body = await res.text();
      return { content: [{ type: "text" as const, text: body }] };
    }
  );

  // The spike's card probe. It does NOT claim anything — it returns the
  // confirm card so we can see whether the host renders MCP Apps UI at all.
  server.registerTool(
    "t2000_job_claim",
    {
      title: "Claim an Open job",
      description:
        "Claim an Open job (earn-first — costs $0). SPIKE: returns the confirmation card only; no on-chain claim is made.",
      inputSchema: { openingId: z.string() },
      _meta: { "ui.resourceUri": CLAIM_CONFIRM_CARD.uri },
    },
    ({ openingId }) => ({
      content: [
        {
          type: "text" as const,
          text: `SPIKE — no claim was made. Confirm card probe for opening ${openingId}.`,
        },
      ],
      _meta: { "ui.resourceUri": CLAIM_CONFIRM_CARD.uri },
    })
  );

  return server;
}

async function handle(request: Request): Promise<Response> {
  const server = buildServer();
  // Stateless: one transport per request. A hosted MCP behind serverless has
  // no sticky node, so session state must live in the store (Slice 1), never
  // in process memory.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
