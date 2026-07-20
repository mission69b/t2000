import '../app/haiku/route'; // register routes so the listing below is live
import { serve } from '../lib/serve';

// Zero-dependency landing page (inline styles only — the template ships
// without a CSS framework). This page is what buyers and their agents see
// when they open the API's origin in a browser.
const mono =
  'ui-monospace, SFMono-Regular, Menlo, monospace';

const FLOW = [
  { n: '01', title: 'Request', body: 'Any HTTP call. No account, no API key.' },
  { n: '02', title: '402', body: 'The route answers with its price and payment terms.' },
  { n: '03', title: 'Sign', body: 'The buyer signs a gasless USDC payment. Nothing moves yet.' },
  { n: '04', title: 'Settle + serve', body: 'Work runs first — payment settles on Sui only on success.' },
];

export default function Home() {
  const routes = [...serve.routes.values()];
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '0 28px 72px', lineHeight: 1.6 }}>
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '22px 0',
          borderBottom: '1px solid #1f1f1f',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: '#ededed',
              color: '#0a0a0a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: mono,
            }}
          >
            $
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{serve.name ?? 'Agent-payable API'}</span>
        </div>
        <span
          style={{
            fontSize: 11.5,
            fontFamily: mono,
            color: '#7ee2a8',
            border: '1px solid #1f3a2a',
            background: '#0d1a12',
            borderRadius: 999,
            padding: '4px 10px',
            letterSpacing: '0.02em',
          }}
        >
          ● x402 · USDC · Sui mainnet
        </span>
      </header>

      {/* Hero */}
      <section style={{ padding: '64px 0 28px' }}>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.08,
            margin: 0,
          }}
        >
          This API sells to agents.
        </h1>
        <p style={{ color: '#a1a1a1', fontSize: 16, maxWidth: 560, margin: '18px 0 0' }}>
          Paid per call in USDC. No signup, no keys — a buyer&apos;s agent reads the price from a{' '}
          <code style={{ fontFamily: mono, fontSize: 14, color: '#d4d4d4' }}>402</code>, pays
          gasless, and gets the response. Payment settles straight to{' '}
          <code style={{ fontFamily: mono, fontSize: 14, color: '#d4d4d4' }}>
            {serve.payTo.slice(0, 8)}…{serve.payTo.slice(-4)}
          </code>
          . This server holds no keys and pays no gas.
        </p>
      </section>

      {/* Flow strip */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          margin: '26px 0 0',
        }}
      >
        {FLOW.map((s) => (
          <div
            key={s.n}
            style={{
              border: '1px solid #1f1f1f',
              borderRadius: 10,
              padding: '14px 16px',
              background: '#0e0e0e',
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 11, color: '#666' }}>{s.n}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, margin: '4px 0 2px' }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: '#8f8f8f', lineHeight: 1.5 }}>{s.body}</div>
          </div>
        ))}
      </section>

      {/* Endpoints */}
      <section style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#8f8f8f', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 12px' }}>
          Endpoints
        </h2>
        <div style={{ border: '1px solid #1f1f1f', borderRadius: 12, overflow: 'hidden' }}>
          {routes.map((r, i) => (
            <div
              key={r.meta.path}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                padding: '14px 18px',
                borderTop: i === 0 ? 'none' : '1px solid #1a1a1a',
                background: '#0e0e0e',
              }}
            >
              <code style={{ fontFamily: mono, fontSize: 13.5, color: '#ededed', whiteSpace: 'nowrap' as const }}>
                <span style={{ color: '#7ea8e2' }}>POST</span> /{r.meta.path}
              </code>
              <span style={{ fontSize: 13, color: '#8f8f8f', flex: 1 }}>{r.meta.description}</span>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 12.5,
                  color: '#7ee2a8',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {r.meta.priceUsdc ? `${r.meta.priceUsdc} USDC` : 'free'}
              </span>
            </div>
          ))}
          {[
            { path: 'openapi.json', desc: 'Machine-readable spec + pricing' },
            { path: 'llms.txt', desc: 'Plain-text agent guidance' },
          ].map((d) => (
            <div
              key={d.path}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                padding: '14px 18px',
                borderTop: '1px solid #1a1a1a',
                background: '#0b0b0b',
              }}
            >
              <code style={{ fontFamily: mono, fontSize: 13.5, color: '#a1a1a1', whiteSpace: 'nowrap' as const }}>
                <span style={{ color: '#666' }}>GET</span> /{d.path}
              </code>
              <span style={{ fontSize: 13, color: '#666', flex: 1 }}>{d.desc}</span>
              <span style={{ fontFamily: mono, fontSize: 12.5, color: '#666' }}>discovery</span>
            </div>
          ))}
        </div>
      </section>

      {/* Try it */}
      <section style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#8f8f8f', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 12px' }}>
          Try it
        </h2>
        <pre
          style={{
            fontFamily: mono,
            fontSize: 13,
            background: '#0e0e0e',
            border: '1px solid #1f1f1f',
            borderRadius: 12,
            padding: '18px 20px',
            overflowX: 'auto',
            margin: 0,
            lineHeight: 1.75,
          }}
        >
          <span style={{ color: '#666' }}># wallet, once</span>
          {'\n'}
          <span style={{ color: '#666' }}>$ </span>npm i -g @t2000/cli && t2 init
          {'\n\n'}
          <span style={{ color: '#666' }}># pay the route — 402 → sign → settle → response</span>
          {'\n'}
          <span style={{ color: '#666' }}>$ </span>t2 pay &lt;this-url&gt;/haiku --method POST --body{' '}
          {`'{"topic":"sui"}'`}
        </pre>
        <p style={{ color: '#666', fontSize: 13, margin: '16px 0 0' }}>
          Built with{' '}
          <a href="https://developers.t2000.ai/sell-to-agents/overview" style={{ color: '#a1a1a1' }}>
            @t2000/serve
          </a>{' '}
          — invalid input and failed handlers are never charged. Swap the demo route for your real
          API and you&apos;re selling.
        </p>
      </section>
    </main>
  );
}
