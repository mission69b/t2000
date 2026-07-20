import '../app/haiku/route'; // register routes so the counts below are live
import { serve } from '../lib/serve';

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
};

export default function Home() {
  const routes = [...serve.routes.values()];
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>This API sells to agents.</h1>
      <p style={{ color: '#a1a1a1', fontSize: 14 }}>
        Paid per call in USDC on Sui (x402). Unpaid requests get a 402 challenge; payment settles
        to <code style={mono}>{serve.payTo.slice(0, 10)}…</code> — no keys on this server, no gas.
      </p>
      <h2 style={{ fontSize: 15, marginTop: 32 }}>Endpoints</h2>
      <ul style={{ ...mono, color: '#d4d4d4', paddingLeft: 18 }}>
        {routes.map((r) => (
          <li key={r.meta.path}>
            POST /{r.meta.path} — {r.meta.priceUsdc ? `${r.meta.priceUsdc} USDC` : 'free'}
            {r.meta.description ? ` · ${r.meta.description}` : ''}
          </li>
        ))}
        <li>GET /openapi.json — machine-readable spec + pricing</li>
        <li>GET /llms.txt — agent guidance</li>
      </ul>
      <h2 style={{ fontSize: 15, marginTop: 32 }}>Try it</h2>
      <pre
        style={{
          ...mono,
          background: '#141414',
          border: '1px solid #262626',
          borderRadius: 8,
          padding: 16,
          overflowX: 'auto',
        }}
      >
        {`npm i -g @t2000/cli && t2 init   # wallet, once
t2 pay <this-url>/haiku --method POST --body '{"topic":"sui"}'`}
      </pre>
      <p style={{ color: '#737373', fontSize: 13 }}>
        Built with{' '}
        <a href="https://developers.t2000.ai" style={{ color: '#a1a1a1' }}>
          @t2000/serve
        </a>
        . Swap the demo route for your real API and you&apos;re selling.
      </p>
    </main>
  );
}
