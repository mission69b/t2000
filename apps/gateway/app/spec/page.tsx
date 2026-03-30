import { Header } from '../components/Header';
import { CodeBlock } from '../components/CodeBlock';
import { SpecSidebar } from './SpecSidebar';

export const metadata = {
  title: 'MPP Sui Charge Method Spec — t2000',
  description:
    'Sui USDC charge method specification for the Machine Payments Protocol.',
};

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'flow', label: 'Protocol Flow' },
  { id: 'schema', label: 'Method Schema' },
  { id: 'server', label: 'Server' },
  { id: 'client', label: 'Client' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'edge-cases', label: 'Edge Cases' },
  { id: 'why-sui', label: 'Why Sui?' },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4 scroll-mt-20">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function SpecPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-10 md:flex md:gap-10">
          {/* Sidebar — desktop */}
          <aside className="hidden md:block md:w-40 shrink-0">
            <SpecSidebar sections={SECTIONS} />
          </aside>

          {/* Content */}
          <article className="flex-1 min-w-0 space-y-10">
            {/* Section nav — mobile only */}
            <nav className="md:hidden flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="shrink-0 text-[10px] px-2.5 py-1 rounded-full border border-border text-muted hover:text-foreground hover:border-border-bright transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </nav>
            {/* Header */}
            <header className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-accent">
                MPP Charge Method
              </div>
              <h1 className="text-xl font-medium text-foreground">
                Sui USDC — <code className="text-accent">@mppsui/mpp</code>
              </h1>
              <p className="text-sm text-muted max-w-xl">
                A charge method implementation for the{' '}
                <a
                  href="https://mpp.dev"
                  className="text-accent hover:underline"
                >
                  Machine Payments Protocol
                </a>{' '}
                enabling Sui USDC payments on any MPP-protected API.
              </p>
            </header>

            <Section id="overview" title="Overview">
              <p className="text-xs text-muted leading-relaxed">
                When a server returns HTTP <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">402 Payment Required</code>,
                the client pays automatically with Sui USDC and retries — no API keys, no subscriptions, no human approval.
                Verification is peer-to-peer via Sui RPC. No facilitator or intermediary.
              </p>
            </Section>

            <Section id="flow" title="Protocol Flow">
              <CodeBlock
                lang="text"
                code={`Agent                    API Server
  │                          │
  │── GET /resource ────────>│
  │<── 402 Payment Required ─│
  │    {amount, currency,    │
  │     recipient}           │
  │                          │
  │── USDC transfer on Sui ──│  (~400ms finality)
  │                          │
  │── GET /resource ────────>│
  │   + payment credential   │── verify TX on-chain via RPC
  │   (Sui tx digest)        │
  │<── 200 OK + data ────────│`}
              />
            </Section>

            <Section id="schema" title="Method Schema">
              <p className="text-xs text-muted leading-relaxed">
                The <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">sui</code> charge
                method is defined using the <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">mppx</code> Method
                builder with the following schema:
              </p>
              <CodeBlock
                code={`import { Method, z } from 'mppx';

export const suiCharge = Method.from({
  intent: 'charge',
  name: 'sui',
  schema: {
    credential: {
      payload: z.object({
        digest: z.string(),  // Sui transaction digest
      }),
    },
    request: z.object({
      amount: z.string(),    // e.g. "0.01"
      currency: z.string(),  // Sui USDC coin type
      recipient: z.string(), // Sui address
    }),
  },
});`}
              />
            </Section>

            <Section id="server" title="Server — Verification">
              <p className="text-xs text-muted leading-relaxed">
                The server verifies the payment by querying the Sui RPC for the
                transaction. It checks three conditions:
              </p>
              <ul className="text-xs text-muted space-y-1.5 list-disc pl-5">
                <li>Transaction succeeded on-chain</li>
                <li>Payment sent to the correct recipient address</li>
                <li>Amount ≥ requested (BigInt precision, no floating-point)</li>
              </ul>
              <CodeBlock
                code={`import { Method, Receipt } from 'mppx';
import { suiCharge } from './method.js';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { parseAmountToRaw } from './utils.js';

export function sui(options: {
  currency: string;
  recipient: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  decimals?: number;
}) {
  const network = options.network ?? 'mainnet';
  const client: ClientWithCoreApi = /* SuiGrpcClient or compatible */;
  const normalizedRecipient = normalizeSuiAddress(options.recipient);
  const decimals = options.decimals ?? 6;

  return Method.toServer(suiCharge, {
    defaults: {
      currency: options.currency,
      recipient: options.recipient,
    },
    async verify({ credential }) {
      const digest = credential.payload.digest;

      const tx = await client.core.getTransaction({
        digest,
        include: { effects: true, balanceChanges: true },
      });

      const resolved = tx.Transaction ?? tx.FailedTransaction;
      if (!resolved || tx.FailedTransaction)
        throw new Error('Transaction failed on-chain');

      const payment = (resolved.balanceChanges ?? []).find(bc =>
        bc.coinType === options.currency &&
        normalizeSuiAddress(bc.address) === normalizedRecipient &&
        BigInt(bc.amount) > 0n
      );

      if (!payment)
        throw new Error('Payment not found in balance changes');

      const transferredRaw = BigInt(payment.amount);
      const requestedRaw = parseAmountToRaw(
        credential.challenge.request.amount, decimals
      );
      if (transferredRaw < requestedRaw)
        throw new Error(\`Transferred \${transferredRaw} < requested \${requestedRaw}\`);

      return Receipt.from({
        method: 'sui',
        reference: digest,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    },
  });
}`}
              />
            </Section>

            <Section id="client" title="Client — Payment">
              <p className="text-xs text-muted leading-relaxed">
                The client uses <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">coinWithBalance</code> for
                automatic coin selection and merging, with the <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">Signer</code> interface
                from <code className="text-foreground bg-panel px-1 py-0.5 rounded border border-border">@mysten/sui/cryptography</code>:
              </p>
              <CodeBlock
                code={`import { Method, Credential } from 'mppx';
import { suiCharge } from './method.js';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Signer } from '@mysten/sui/cryptography';
import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { parseAmountToRaw } from './utils.js';

export function sui(options: {
  client: ClientWithCoreApi;
  signer: Signer;
  decimals?: number;
  execute?: (tx: Transaction) => Promise<{ digest: string }>;
}) {
  const address = options.signer.toSuiAddress();
  const decimals = options.decimals ?? 6;

  return Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;
      const amountRaw = parseAmountToRaw(amount, decimals);

      const tx = new Transaction();
      tx.setSender(address);

      const payment = coinWithBalance({ balance: amountRaw, type: currency });
      tx.transferObjects([payment], recipient);

      const built = await tx.build({ client: options.client });
      const { signature } = await options.signer.signTransaction(built);
      const execResult = await options.client.core.executeTransaction({
        transaction: built,
        signatures: [signature],
        include: { effects: true },
      });

      return Credential.serialize({
        challenge,
        payload: { digest: execResult.Transaction!.digest },
      });
    },
  });
}`}
              />
            </Section>

            <Section id="utilities" title="Utilities">
              <CodeBlock
                code={`// Mainnet USDC coin type
export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

// String → BigInt without floating-point math
// "0.01" → 10000n (USDC has 6 decimals)
export function parseAmountToRaw(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + padded);
}

// Note: coin fetching and merging is handled automatically
// by \`coinWithBalance\` from @mysten/sui/transactions.
// No manual pagination or coin management needed.`}
              />
            </Section>

            <Section id="edge-cases" title="Edge Cases">
              <div className="space-y-3">
                {[
                  {
                    title: 'Coin selection',
                    desc: 'coinWithBalance handles coin fetching, merging, and splitting automatically — no manual pagination or coin management.',
                  },
                  {
                    title: 'Insufficient balance',
                    desc: 'coinWithBalance checks balance during tx.build() and throws if insufficient.',
                  },
                  {
                    title: 'TX confirmation race',
                    desc: 'Client waits for TX confirmation before sending the credential. Server verifies a confirmed TX — no race condition.',
                  },
                  {
                    title: 'Challenge replay',
                    desc: "Each challenge has a unique HMAC-bound ID and expiry. Replaying a credential against a different challenge fails validation.",
                  },
                  {
                    title: 'Digest replay',
                    desc: 'Server should track used digests to prevent the same on-chain TX from being presented to multiple challenges. Use a store or unique DB constraint.',
                  },
                  {
                    title: 'Amount precision',
                    desc: 'parseAmountToRaw() converts strings to BigInt via string splitting, not Number() multiplication. Zero floating-point risk.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3 text-xs">
                    <span className="text-accent shrink-0">·</span>
                    <div>
                      <span className="text-foreground font-medium">
                        {item.title}
                      </span>
                      <span className="text-muted"> — {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="why-sui" title="Why Sui?">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Finality', value: '~400ms' },
                  { label: 'Gas', value: '<$0.001' },
                  { label: 'USDC', value: 'Circle-issued' },
                  { label: 'Verification', value: 'Direct RPC' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="border border-border rounded-lg bg-surface/40 px-3 py-2.5 text-center"
                  >
                    <div className="text-accent font-medium text-sm">
                      {item.value}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Links */}
            <section className="border-t border-border pt-8 space-y-2">
              {[
                { href: 'https://mpp.dev', label: 'MPP Protocol' },
                {
                  href: 'https://www.npmjs.com/package/@mppsui/mpp',
                  label: 'npm: @mppsui/mpp',
                },
                {
                  href: 'https://github.com/mission69b/mppsui',
                  label: 'GitHub',
                },
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
          </article>
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
