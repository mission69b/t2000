// Slim verify-branded chrome + the designed marketing sections (How /
// Closer) around the live hub. Deliberately NOT the full t2000.ai nav —
// this subdomain's job is paste-to-verify; one link out is enough.

export function VerifyNav() {
  return (
    <nav className="sticky top-0 z-30 border-border border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
        <a
          className="flex items-baseline gap-2 no-underline"
          href="https://verify.t2000.ai"
        >
          <span className="font-bold text-[18px] text-foreground leading-none tracking-[-0.05em]">
            t2
          </span>
          <span className="font-semibold text-[14px] text-foreground tracking-tight">
            verify
          </span>
        </a>
        <span className="flex-1" />
        <a
          className="text-dim text-xs no-underline transition-colors hover:text-foreground"
          href="https://t2000.ai/api"
        >
          Private API
        </a>
        <a
          className="text-dim text-xs no-underline transition-colors hover:text-foreground"
          href="https://developers.t2000.ai/confidential-ai/how-it-works"
          rel="noreferrer"
          target="_blank"
        >
          Docs ↗
        </a>
        <a
          className="text-dim text-xs no-underline transition-colors hover:text-foreground"
          href="https://t2000.ai"
        >
          t2000.ai ↗
        </a>
      </div>
    </nav>
  );
}

const HOW_STEPS = [
  {
    n: "1",
    t: "Attest",
    d: "The upstream proves it's a genuine GPU-TEE with a hardware attestation report — checked before any prompt is forwarded, fail-closed.",
  },
  {
    n: "2",
    t: "Sign",
    d: "Each response gets a receipt binding your request + response hashes to that attested upstream. Hashes, never bodies.",
  },
  {
    n: "3",
    t: "Anchor",
    d: "The receipt's hash is committed on Sui as a ReceiptAnchored event — public, tamper-evident, permanent.",
  },
  {
    n: "4",
    t: "Verify",
    d: "This page re-checks the anchor + signature for any receipt; t2 verify runs the full check — including the Intel TDX quote against Intel — on your machine.",
  },
] as const;

export function VerifyHow() {
  return (
    <section className="mx-auto mt-16 max-w-3xl px-5">
      <div className="mb-6">
        <div className="font-mono text-[11px] text-dim uppercase tracking-[0.1em]">
          {"// HOW IT WORKS"}
        </div>
        <h2 className="mt-2 font-semibold text-2xl tracking-tight">
          Four steps. Check every one.
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {HOW_STEPS.map((s) => (
          <div
            className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-5"
            key={s.n}
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald font-mono text-black text-xs">
              {s.n}
            </span>
            <h3 className="font-semibold text-[15px] tracking-tight">{s.t}</h3>
            <p className="m-0 text-[13px] text-muted leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VerifyCloser() {
  return (
    <section className="mx-auto mt-16 max-w-3xl px-5 text-center">
      <div className="font-mono text-[11px] text-dim uppercase tracking-[0.1em]">
        {"// THE TRUST LOOP"}
      </div>
      <h2 className="mt-3 font-semibold text-3xl tracking-tight sm:text-4xl">
        Private is a claim.
        <br />
        <span className="text-emerald">Verifiable is a proof.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-md text-muted text-sm leading-relaxed">
        Every confidential response is one paste away from proof. Build on
        data you can check.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <a
          className="rounded-lg bg-emerald px-4 py-2 font-medium text-black text-sm no-underline"
          href="https://t2000.ai/api"
        >
          Private &amp; Confidential API →
        </a>
        <a
          className="rounded-lg border border-border px-4 py-2 font-medium text-foreground text-sm no-underline transition-colors hover:bg-surface"
          href="https://developers.t2000.ai/confidential-ai"
          rel="noreferrer"
          target="_blank"
        >
          How it works ↗
        </a>
      </div>
    </section>
  );
}
