/**
 * t2000-run dispatcher — the R1 hosted-handler front door
 * (SPEC_AGENT_RUNTIME §2 R1, S.694).
 *
 * POST /h/<agent>/<slug> → dispatches to the seller's user Worker in the
 * `t2000-run` namespace (script name derived from agent+slug — see
 * scriptNameFor, mirrored in the gateway's lib/run.ts).
 *
 * Trust boundary: ONLY the t2000 gateway may invoke handlers — every request
 * must carry `x-t2000-run: {ts}.{hmac}` where hmac = HMAC-SHA256(
 * `${ts}|${agent}|${slug}`, RUN_DELIVERY_SECRET). Handlers therefore run
 * exclusively in response to paid, escrowed deliveries (no free-riding a
 * hosted handler by calling it directly).
 */

interface Env {
  DISPATCH: DispatchNamespace;
  RUN_DELIVERY_SECRET: string;
}

interface DispatchNamespace {
  get(
    name: string,
    args?: Record<string, unknown>,
    options?: { limits?: { cpuMs?: number; subRequests?: number } }
  ): { fetch(req: Request): Promise<Response> };
}

const FRESH_MS = 120_000;
/** Per-invocation CPU cap — generous for compose-and-return handlers. */
const CPU_MS = 5_000;

const PATH_RE = /^\/h\/(0x[0-9a-f]{64})\/([a-z0-9][a-z0-9-]{1,39})$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Mirror of the gateway's scriptNameFor — MUST stay in sync. */
function scriptNameFor(agent: string, slug: string): string {
  return `h-${agent.slice(2, 18)}-${slug}`;
}

async function verifyRunHeader(
  header: string | null,
  agent: string,
  slug: string,
  secret: string
): Promise<boolean> {
  if (!header) {
    return false;
  }
  const dot = header.indexOf(".");
  if (dot <= 0) {
    return false;
  }
  const ts = Number(header.slice(0, dot));
  const mac = header.slice(dot + 1);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FRESH_MS) {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${ts}|${agent}|${slug}`)
  );
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time-ish compare (same length hex strings).
  if (hex.length !== mac.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== "POST") {
      return json(405, { error: "POST only." });
    }
    const url = new URL(req.url);
    const m = PATH_RE.exec(url.pathname.toLowerCase());
    if (!m) {
      return json(404, { error: "Unknown handler path." });
    }
    const [, agent, slug] = m;

    const ok = await verifyRunHeader(
      req.headers.get("x-t2000-run"),
      agent,
      slug,
      env.RUN_DELIVERY_SECRET
    );
    if (!ok) {
      return json(401, {
        error:
          "Hosted handlers only run for paid deliveries — buy through the store (x402.t2000.ai/commerce/pay/…).",
      });
    }

    let worker: { fetch(req: Request): Promise<Response> };
    try {
      worker = env.DISPATCH.get(scriptNameFor(agent, slug), {}, {
        limits: { cpuMs: CPU_MS },
      });
    } catch {
      return json(404, { error: "Handler not deployed." });
    }

    try {
      return await worker.fetch(
        new Request(`https://run.internal/${agent}/${slug}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: req.body,
        })
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Handler crashed.";
      // A missing script surfaces here as a dispatch error in some runtimes.
      const status = /not.?found|no such worker/i.test(msg) ? 404 : 500;
      return json(status, { error: msg });
    }
  },
};
