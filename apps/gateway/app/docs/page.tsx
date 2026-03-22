'use client';

import { useState } from 'react';
import { Header } from '../components/Header';
import { CodeBlock } from '../components/CodeBlock';

type Track = 'consumer' | 'provider';

export default function DocsPage() {
  const [track, setTrack] = useState<Track>('consumer');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
          {/* Header */}
          <header className="space-y-2">
            <h1 className="text-xl font-medium text-foreground">
              Developer Guide
            </h1>
            <p className="text-sm text-muted max-w-xl">
              Get started with MPP on Sui — pay for APIs or accept payments on
              yours.
            </p>
          </header>

          {/* Quickstart */}
          <section className="border border-accent/20 rounded-lg bg-accent-dim p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-accent">
              Quickstart
            </div>
            <p className="text-xs text-muted">
              Pay for any API in 3 lines:
            </p>
            <CodeBlock
              code={`import { T2000 } from '@t2000/sdk';
const agent = await T2000.create({ pin: 'my-secret' });
const result = await agent.pay({ url: 'https://mpp.t2000.ai/openai/v1/chat/completions', maxPrice: 0.05 });`}
            />
            <p className="text-xs text-muted">
              Accept payments in 3 lines:
            </p>
            <CodeBlock
              code={`import { Mppx } from 'mppx/nextjs';
import { sui } from '@t2000/mpp-sui/server';
export const POST = Mppx.create({ methods: [sui({ currency: SUI_USDC, recipient: '0xYOU' })] }).charge({ amount: '0.01' })(() => Response.json({ ok: true }));`}
            />
          </section>

          {/* Track picker */}
          <div className="flex gap-2">
            <button
              onClick={() => setTrack('consumer')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                track === 'consumer'
                  ? 'bg-accent-dim border border-accent/40 text-accent'
                  : 'border border-border text-muted hover:text-foreground hover:border-border-bright'
              }`}
            >
              Pay for APIs
            </button>
            <button
              onClick={() => setTrack('provider')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                track === 'provider'
                  ? 'bg-accent-dim border border-accent/40 text-accent'
                  : 'border border-border text-muted hover:text-foreground hover:border-border-bright'
              }`}
            >
              Accept Payments
            </button>
          </div>

          {/* Consumer track */}
          {track === 'consumer' && (
            <div className="space-y-8">
              <Step num={1} title="Install">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Install the MPP client library and the Sui payment method:
                </p>
                <CodeBlock
                  lang="bash"
                  code="npm install mppx @t2000/mpp-sui"
                />
              </Step>

              <Step num={2} title="Configure your wallet">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Create an mppx client with your Sui keypair. The client
                  handles 402 challenges automatically — when a server requires
                  payment, it pays with your USDC and retries.
                </p>
                <CodeBlock
                  code={`import { Mppx } from 'mppx/client';
import { sui } from '@t2000/mpp-sui/client';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const signer = Ed25519Keypair.deriveKeypair('your mnemonic');

const mppx = Mppx.create({
  methods: [sui({ client, signer })],
});`}
                />
              </Step>

              <Step num={3} title="Make a payment">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Use <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">mppx.fetch()</code> just
                  like <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">fetch()</code>.
                  If the API returns 402, payment happens transparently:
                </p>
                <CodeBlock
                  code={`const response = await mppx.fetch(
  'https://mpp.t2000.ai/openai/v1/chat/completions',
  {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    }),
  }
);

const data = await response.json();`}
                />
              </Step>

              <Step num={4} title="Or use the t2000 SDK">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  If you&apos;re using the{' '}
                  <a
                    href="https://www.npmjs.com/package/@t2000/sdk"
                    className="text-accent hover:underline"
                  >
                    t2000 SDK
                  </a>
                  , payments are even simpler — wallet management, safeguards,
                  and gas are handled for you:
                </p>
                <CodeBlock
                  code={`import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: 'my-secret' });

const result = await agent.pay({
  url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] }),
  maxPrice: 0.05,
});`}
                />
              </Step>

              <Step num={5} title="CLI">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Pay from the terminal:
                </p>
                <CodeBlock
                  lang="bash"
                  code={`# Simple GET request
t2000 pay https://mpp.t2000.ai/brave/v1/web/search?q=sui

# POST with data + price cap
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \\
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \\
  --max-price 0.05`}
                />
              </Step>

              <Step num={6} title="Browse services">
                <p className="text-xs text-muted leading-relaxed">
                  Explore all available pay-per-request APIs on the{' '}
                  <a
                    href="/services"
                    className="text-accent hover:underline"
                  >
                    services directory
                  </a>
                  . Each service lists its endpoints, pricing, and gateway URL.
                  View real-time payment activity on the{' '}
                  <a
                    href="/explorer"
                    className="text-accent hover:underline"
                  >
                    explorer
                  </a>
                  .
                </p>
              </Step>
            </div>
          )}

          {/* Provider track */}
          {track === 'provider' && (
            <div className="space-y-8">
              <Step num={1} title="Install">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Add the MPP server library and the Sui payment method to your
                  API:
                </p>
                <CodeBlock
                  lang="bash"
                  code="npm install mppx @t2000/mpp-sui"
                />
              </Step>

              <Step num={2} title="Set up charging">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Create an mppx server instance with your Sui address as the
                  payment recipient. USDC arrives directly in your wallet — no
                  intermediary:
                </p>
                <CodeBlock
                  code={`import { Mppx } from 'mppx/nextjs'; // or 'mppx/server'
import { sui } from '@t2000/mpp-sui/server';

const SUI_USDC =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const mppx = Mppx.create({
  methods: [
    sui({
      currency: SUI_USDC,
      recipient: '0xYOUR_SUI_ADDRESS',
    }),
  ],
});`}
                />
              </Step>

              <Step num={3} title="Protect your endpoints">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Wrap your route handlers with{' '}
                  <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">mppx.charge()</code>.
                  Unauthenticated requests get a 402 challenge. Paid requests
                  pass through to your handler:
                </p>
                <CodeBlock
                  code={`// Next.js App Router
export const POST = mppx.charge({ amount: '0.01' })(
  async (request) => {
    const body = await request.json();
    const result = await generateImage(body.prompt);
    return Response.json(result);
  }
);`}
                />
              </Step>

              <Step num={4} title="Custom pricing">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Use <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">chargeCustom()</code> for
                  dynamic pricing based on the request:
                </p>
                <CodeBlock
                  code={`export const POST = mppx.chargeCustom(async (request) => {
  const body = await request.json();

  // Price based on model
  const price = body.model === 'gpt-4o' ? '0.03' : '0.01';

  return {
    amount: price,
    handler: async () => {
      const result = await callUpstreamAPI(body);
      return Response.json(result);
    },
  };
});`}
                />
              </Step>

              <Step num={5} title="Verification">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Verification is automatic and peer-to-peer. When a client
                  submits a payment credential, the server:
                </p>
                <ul className="text-xs text-muted space-y-1 list-disc pl-5 mb-3">
                  <li>Queries the Sui RPC for the transaction</li>
                  <li>Confirms it succeeded on-chain</li>
                  <li>Verifies payment went to your address</li>
                  <li>Checks amount ≥ requested (BigInt precision)</li>
                </ul>
                <p className="text-xs text-muted leading-relaxed">
                  No webhooks. No callback URLs. No Stripe dashboard. See the
                  full verification logic in the{' '}
                  <a href="/spec" className="text-accent hover:underline">
                    spec
                  </a>
                  .
                </p>
              </Step>

              <Step num={6} title="Register with the gateway">
                <p className="text-xs text-muted leading-relaxed">
                  To list your service on{' '}
                  <a
                    href="/services"
                    className="text-accent hover:underline"
                  >
                    mpp.t2000.ai
                  </a>{' '}
                  and make it discoverable by agents, reach out on{' '}
                  <a
                    href="https://discord.gg/qtVJR5eH"
                    className="text-accent hover:underline"
                  >
                    Discord
                  </a>{' '}
                  or submit a PR to the{' '}
                  <a
                    href="https://github.com/mission69b/t2000"
                    className="text-accent hover:underline"
                  >
                    GitHub repo
                  </a>
                  . You can also run your own gateway.
                </p>
              </Step>
            </div>
          )}

          {/* Links */}
          <section className="border-t border-border pt-8 space-y-2">
            {[
              { href: '/spec', label: 'Sui charge method spec' },
              { href: '/services', label: 'Browse services' },
              { href: '/explorer', label: 'Payment explorer' },
              {
                href: 'https://www.npmjs.com/package/@t2000/mpp-sui',
                label: 'npm: @t2000/mpp-sui',
              },
              { href: 'https://mpp.dev', label: 'MPP Protocol' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                {link.label}
              </a>
            ))}
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000</span>
          <span>
            Powered by{' '}
            <a href="https://mpp.dev" className="text-accent hover:underline">
              MPP
            </a>{' '}
            +{' '}
            <a href="https://sui.io" className="text-accent hover:underline">
              Sui
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <span className="text-accent text-xs font-mono">{num}.</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
