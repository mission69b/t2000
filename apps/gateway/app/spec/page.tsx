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
                Sui USDC — <code className="text-accent">@t2000/mpp-sui</code>
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
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export function sui(options: {
  currency: string;
  recipient: string;
  rpcUrl?: string;
}) {
  const client = new SuiClient({
    url: options.rpcUrl ?? getFullnodeUrl('mainnet'),
  });

  return Method.toServer(suiCharge, {
    defaults: {
      currency: options.currency,
      recipient: options.recipient,
    },
    async verify({ credential, request }) {
      const tx = await client.getTransactionBlock({
        digest: credential.payload.digest,
        options: { showEffects: true, showBalanceChanges: true },
      });

      if (tx.effects?.status?.status !== 'success')
        throw new Error('Transaction failed on-chain');

      const payment = (tx.balanceChanges ?? []).find(bc =>
        bc.coinType === options.currency &&
        typeof bc.owner === 'object' &&
        'AddressOwner' in bc.owner &&
        bc.owner.AddressOwner === options.recipient &&
        Number(bc.amount) > 0
      );

      if (!payment)
        throw new Error('Payment not found in balance changes');

      const transferred = Number(payment.amount) / 1e6;
      const requested = Number(request.amount);
      if (transferred < requested)
        throw new Error(\`Paid $\${transferred} < requested $\${requested}\`);

      return Receipt.from({
        method: 'sui',
        reference: credential.payload.digest,
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
                The client handles coin fetching, balance checks, coin merging,
                transaction building, and credential serialization:
              </p>
              <CodeBlock
                code={`import { Method, Credential } from 'mppx';
import { suiCharge } from './method.js';
import { Transaction } from '@mysten/sui/transactions';
import { fetchCoins, parseAmountToRaw } from './utils.js';

export function sui(options: { client: SuiClient; signer: Ed25519Keypair }) {
  const address = options.signer.getPublicKey().toSuiAddress();

  return Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;
      const amountRaw = parseAmountToRaw(amount, 6); // USDC = 6 decimals

      const coins = await fetchCoins(options.client, address, currency);
      const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n);
      if (total < amountRaw)
        throw new Error(\`Not enough USDC (need $\${amount}, have $\${Number(total) / 1e6})\`);

      const tx = new Transaction();
      tx.setSender(address);

      const primary = tx.object(coins[0].coinObjectId);
      if (coins.length > 1)
        tx.mergeCoins(primary, coins.slice(1).map(c => tx.object(c.coinObjectId)));

      const [payment] = tx.splitCoins(primary, [amountRaw]);
      tx.transferObjects([payment], recipient);

      const result = await options.client.signAndExecuteTransaction({
        signer: options.signer, transaction: tx,
      });
      await options.client.waitForTransaction({ digest: result.digest });

      return Credential.serialize({
        challenge,
        payload: { digest: result.digest },
      });
    },
  });
}`}
              />
            </Section>

            <Section id="utilities" title="Utilities">
              <CodeBlock
                code={`export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

// Fetch ALL coins — handles Sui pagination (max 50 per page)
export async function fetchCoins(client, owner, coinType) {
  const coins = [];
  let cursor;
  do {
    const page = await client.getCoins({ owner, coinType, cursor });
    coins.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : undefined;
  } while (cursor);
  return coins;
}

// String → BigInt without floating-point math
// "0.01" → 10000n (USDC has 6 decimals)
export function parseAmountToRaw(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + padded);
}`}
              />
            </Section>

            <Section id="edge-cases" title="Edge Cases">
              <div className="space-y-3">
                {[
                  {
                    title: 'Coin fragmentation',
                    desc: 'USDC may be split across multiple coin objects. The client merges all coins before splitting the payment amount.',
                  },
                  {
                    title: 'Insufficient balance',
                    desc: 'Client checks total balance before building the TX. Throws a clear error with available vs. requested amounts.',
                  },
                  {
                    title: 'TX confirmation race',
                    desc: 'Client waits for TX confirmation before sending the credential. Server verifies a confirmed TX — no race condition.',
                  },
                  {
                    title: 'Double payment',
                    desc: "Each challenge has a unique ID. Replaying a credential against a different challenge fails validation.",
                  },
                  {
                    title: 'Amount precision',
                    desc: 'parseAmountToRaw() converts strings to BigInt via string splitting, not Number() multiplication. Zero floating-point risk.',
                  },
                  {
                    title: 'Coin pagination',
                    desc: "Sui's getCoins RPC returns max 50 objects per page. fetchCoins() paginates until all coins are fetched.",
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
                  href: 'https://www.npmjs.com/package/@t2000/mpp-sui',
                  label: 'npm: @t2000/mpp-sui',
                },
                {
                  href: 'https://github.com/mission69b/t2000',
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
