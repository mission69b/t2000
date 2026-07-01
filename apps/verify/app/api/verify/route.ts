import { verifyReceipt } from "@t2000/sdk";

// GET /api/verify?id=<rcpt-…>&model=<phala/…> — server-side verify of a
// confidential response: the trustless checks (signed receipt · attested
// upstream · on-chain Sui anchor · signature). The client-side DCAP quote is
// left to `t2 verify` (the CLI CTA) — the same honest framing as the Audric
// Verify modal (SPEC_CONFIDENTIAL_UI §4).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const model = searchParams.get("model") ?? undefined;
  if (!id) {
    return Response.json({ error: "A receipt id is required." }, { status: 400 });
  }
  try {
    const result = await verifyReceipt(id, { model, skipQuote: true });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "verification failed" },
      { status: 502 }
    );
  }
}
