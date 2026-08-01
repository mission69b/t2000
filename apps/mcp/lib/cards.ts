// MCP Apps card resources (SPEC_T2_PASSPORT_CONNECT §4).
//
// Cards are served as `text/html+skybridge` UI resources and referenced from a
// tool's `_meta["ui.resourceUri"]`. The host renders them in a sandboxed
// iframe; a host WITHOUT MCP Apps support ignores `_meta` and falls back to the
// tool's text content, which is why every card-bearing tool must still return
// a meaningful `content` block (spec: "degrade to text if host lacks Apps").
//
// Styling is inlined on purpose: the iframe gets no stylesheet from us, so the
// 9a Ember Steel tokens are copied in as literals rather than imported. That
// duplication is deliberate and bounded — see `design-tokens/tokens.css` for
// the source of truth for the values.

export const UI_MIME = "text/html+skybridge";

const T2K = {
  void: "#0c0f12",
  plate: "#12161a",
  raised: "#171c21",
  hairline: "rgba(255,255,255,0.08)",
  paper: "#e8eaed",
  muted: "#9aa3ab",
  faint: "#6b747c",
  ember: "#ff7a45",
  emberInk: "#1a0d06",
} as const;

/** Slice 0's single probe card: does the host render MCP Apps UI at all? */
export const CLAIM_CONFIRM_CARD = {
  uri: "ui://t2000/confirm/claim",
  html: `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: ${T2K.void};
    color: ${T2K.paper};
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    background: ${T2K.plate};
    border: 1px solid ${T2K.hairline};
    padding: 18px;
  }
  .eyebrow {
    font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${T2K.faint};
  }
  h1 { margin: 10px 0 4px; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; color: ${T2K.muted}; font-size: 12.5px; }
  .money {
    margin: 14px 0;
    padding: 14px;
    background: ${T2K.raised};
    border: 1px solid rgba(255,122,69,0.2);
    font: 26px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    color: ${T2K.ember};
  }
  .money small { display: block; margin-top: 6px; font-size: 10.5px; color: ${T2K.faint}; letter-spacing: 0.1em; text-transform: uppercase; }
  .row { display: flex; gap: 9px; margin-top: 16px; }
  button {
    flex: 1; padding: 10px 14px; border: 1px solid ${T2K.hairline};
    background: transparent; color: ${T2K.paper};
    font: inherit; font-size: 13px; cursor: pointer;
  }
  button.primary { background: ${T2K.ember}; border-color: ${T2K.ember}; color: ${T2K.emberInk}; font-weight: 600; }
  button:focus-visible { outline: 2px solid ${T2K.ember}; outline-offset: 2px; }
  .done { margin-top: 14px; font-size: 12.5px; color: ${T2K.muted}; }
  @media (prefers-reduced-motion: no-preference) {
    .card { animation: rise .18s ease-out both; }
    @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  }
</style>
<div class="card">
  <div class="eyebrow">Passport Connect · confirm</div>
  <h1>Claim this Open job</h1>
  <p>Claiming is free. You are committing to deliver the work, not to pay.</p>
  <div class="money">$0.00<small>you pay nothing to claim</small></div>
  <div class="row" id="actions">
    <button type="button" id="deny">Deny</button>
    <button type="button" class="primary" id="allow">Allow</button>
  </div>
  <div class="done" id="done" hidden></div>
</div>
<script>
  // Slice 0 probe: report the decision back to the host and show the result
  // inline. The real approve/deny wiring lands with the session in Slice 1.
  const done = document.getElementById("done");
  const actions = document.getElementById("actions");
  function decide(decision) {
    actions.hidden = true;
    done.hidden = false;
    done.textContent = decision === "allow" ? "Allowed — claim would run here." : "Denied — nothing happened.";
    try {
      window.parent.postMessage({ type: "t2000/confirm", decision }, "*");
    } catch {}
  }
  document.getElementById("allow").addEventListener("click", () => decide("allow"));
  document.getElementById("deny").addEventListener("click", () => decide("deny"));
</script>`,
} as const;
