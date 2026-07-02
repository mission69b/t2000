import { ImageResponse } from 'next/og';

// Public shareable agent card PNG (dealer.exe-style, §II.13.B). Deliberately
// unauthenticated — shareability IS the product; the PAID part (composition,
// caption, stats fetch) lives in /sellers/agent-card. Renders the agent's
// live profile + receipt-backed stats in the agents.t2000.ai visual language.
export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.t2000.ai/v1';

const CATEGORY_LABELS: Record<string, string> = {
  'ai-models': 'AI models',
  'data-feeds': 'Data feeds',
  finance: 'Finance',
  research: 'Research',
  'dev-tools': 'Dev tools',
  creative: 'Creative',
  other: 'Other',
};

type Profile = {
  name: string;
  description?: string;
  image?: string;
  priceUsdc?: string;
  category?: string;
  reputation?: { sales: number; volumeUsd: number; deliveredRate?: number | null };
  registrations?: { agentId?: number }[];
};

// Deterministic per-agent gradient (mirrors the agents.t2000.ai avatar).
function hue(address: string, offset: number): number {
  let h = 0;
  for (let i = 2; i < Math.min(address.length, 14); i++) {
    h = (h * 31 + address.charCodeAt(i)) % 360;
  }
  return (h + offset) % 360;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
): Promise<ImageResponse | Response> {
  const { address } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{16,64}$/.test(address)) {
    return Response.json({ error: 'Invalid agent address' }, { status: 400 });
  }

  let p: Profile | null = null;
  try {
    const res = await fetch(`${API_BASE}/agents/${address}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      p = (await res.json()) as Profile;
    }
  } catch {
    p = null;
  }
  if (!p) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }

  const numericId = p.registrations?.[0]?.agentId;
  const category = p.category ? (CATEGORY_LABELS[p.category] ?? p.category) : null;
  const sales = p.reputation?.sales ?? 0;
  const delivered =
    typeof p.reputation?.deliveredRate === 'number'
      ? Math.round(p.reputation.deliveredRate * 100)
      : null;
  const h1 = hue(address, 0);
  const h2 = hue(address, 75);
  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#1e1e1e',
        color: '#ececec',
        padding: 64,
        fontFamily: 'sans-serif',
        border: '2px solid #3a3a3a',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', color: '#8f8f8f', fontSize: 26 }}>
          AGENT CARD · t2000 rail
        </div>
        {category && (
          <div
            style={{
              display: 'flex',
              color: '#a8a8a8',
              fontSize: 24,
              border: '1px solid #3a3a3a',
              borderRadius: 999,
              padding: '8px 22px',
            }}
          >
            {category}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <div
          style={{
            display: 'flex',
            width: 130,
            height: 130,
            borderRadius: 999,
            border: '2px solid #3a3a3a',
            background: `linear-gradient(135deg, hsl(${h1} 62% 48%), hsl(${h2} 58% 32%))`,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: -1.5,
            }}
          >
            <span
              style={{
                display: 'block',
                maxWidth: 760,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {p.name}
            </span>
            {numericId != null && (
              <span style={{ color: '#8f8f8f', fontSize: 40, fontWeight: 400 }}>
                #{numericId}
              </span>
            )}
          </div>
          {p.description && (
            <div
              style={{
                display: 'block',
                color: '#a8a8a8',
                fontSize: 27,
                maxWidth: 860,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {p.description.split('\n')[0]}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 26 }}>
          {p.priceUsdc && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 46, fontWeight: 600 }}>
              ${p.priceUsdc}
              <span style={{ color: '#8f8f8f', fontSize: 24, fontWeight: 400 }}>/ call</span>
            </div>
          )}
          {sales > 0 && (
            <div style={{ display: 'flex', color: '#34d399', fontSize: 26 }}>
              ✓ {sales} sold{delivered != null ? ` · ${delivered}% delivered` : ''}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            color: '#8f8f8f',
            fontSize: 23,
            gap: 4,
          }}
        >
          <span>agents.t2000.ai/{shortAddr}</span>
          <span>Pay in USDC · receipts on Sui</span>
        </div>
      </div>
    </div>,
    { width: 1200, height: 675 },
  );
}
