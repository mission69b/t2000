'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { BalanceHeader } from '@/components/dashboard/BalanceHeader';
import { ContextualChips } from '@/components/dashboard/ContextualChips';
import { ChipBar } from '@/components/dashboard/ChipBar';
import { InputBar } from '@/components/dashboard/InputBar';
import { ConfirmationCard } from '@/components/dashboard/ConfirmationCard';
import { ResultCard } from '@/components/dashboard/ResultCard';
import { AmountChips } from '@/components/dashboard/AmountChips';
import { FeedRenderer } from '@/components/dashboard/FeedRenderer';
import { resolveFlow } from '@/components/dashboard/AgentMarkdown';
import { AssetSelector } from '@/components/dashboard/AssetSelector';
import { StrategySelector } from '@/components/dashboard/StrategySelector';
import { FrequencySelector } from '@/components/dashboard/FrequencySelector';
import { useDcaSchedules } from '@/hooks/useDcaSchedules';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useChipFlow, type ChipFlowResult, type FlowContext } from '@/hooks/useChipFlow';
import { useFeed } from '@/hooks/useFeed';
import { useAgentLoop, type AgentStep } from '@/hooks/useAgentLoop';
import type { AgentStepData } from '@/lib/feed-types';
import { useBalance } from '@/hooks/useBalance';
import { parseIntent, type ParsedIntent } from '@/lib/intent-parser';
import { mapError } from '@/lib/errors';
import { deriveContextualChips, type AccountState } from '@/lib/contextual-chips';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';
import { useContacts } from '@/hooks/useContacts';
import { useAgent } from '@/hooks/useAgent';

const LS_LAST_SAVINGS = 't2000_last_savings';
const LS_LAST_OPEN = 't2000_last_open_date';

function decodeJwtEmail(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

function fmtDollar(n: number): string {
  if (n >= 1) return `${Math.floor(n)}`;
  if (n > 0) return n.toFixed(2);
  return '0';
}

function fmtToken(amount: number): string {
  if (amount > 0 && amount < 0.001) return amount.toFixed(8);
  if (amount > 0 && amount < 1) return amount.toFixed(6);
  return amount.toFixed(4);
}

function capForFlow(
  flow: string,
  bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> },
  fromAsset?: string,
): number {
  switch (flow) {
    case 'save': return bal.usdc;
    case 'send': return bal.cash;
    case 'invest': return bal.usdc;
    case 'withdraw': return bal.savings;
    case 'repay': return bal.borrows;
    case 'borrow': return bal.maxBorrow;
    case 'rebalance': return bal.savings;
    case 'swap': {
      if (fromAsset === 'SUI') return bal.sui;
      if (fromAsset === 'USDC') return bal.usdc;
      if (fromAsset && fromAsset in bal.assetBalances) return bal.assetBalances[fromAsset];
      return bal.cash;
    }
    default: return bal.cash;
  }
}

function getAmountPresets(flow: string, bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> }, fromAsset?: string): number[] {
  const rawCap = capForFlow(flow, bal, fromAsset);
  if (rawCap <= 0) return [];

  const isTokenAsset = flow === 'swap' && fromAsset && fromAsset !== 'USDC';
  if (isTokenAsset && rawCap < 1) {
    const quarter = rawCap * 0.25;
    const half = rawCap * 0.5;
    const threeQ = rawCap * 0.75;
    return [quarter, half, threeQ].filter((v) => v > 0);
  }

  const cap = Math.floor(rawCap);
  if (cap <= 0) return [];
  if (cap <= 5) return [1, 2, Math.min(5, cap)].filter((v, i, a) => v <= cap && a.indexOf(v) === i);
  if (cap <= 20) return [1, 5, 10].filter((v) => v <= cap);
  if (cap <= 100) return [5, 10, 25].filter((v) => v <= cap);
  if (cap <= 500) return [25, 50, 100].filter((v) => v <= cap);
  return [50, 100, 200];
}

function SendRecipientInput({
  contacts,
  onSelectContact,
  onSubmit,
}: {
  contacts: Array<{ name: string; address: string }>;
  onSelectContact: (address: string, name: string) => void;
  onSubmit: (input: string) => void;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const input = value.trim();
    if (!input) return;
    onSubmit(input);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setValue(text.trim());
      }
    } catch {
      // clipboard access denied
    }
  };

  return (
    <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
      <p className="text-sm text-muted">Who do you want to send to?</p>
      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <button
              key={c.address}
              onClick={() => onSelectContact(c.address, c.name)}
              className="rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-medium text-muted hover:border-border-bright hover:text-foreground transition"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Address (0x...) or contact name"
          autoFocus
          className="flex-1 rounded-sm border border-border bg-panel px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        {value.trim() ? (
          <button
            onClick={handleSubmit}
            className="bg-accent px-4 py-2 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:bg-[#00f0a0] hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97]"
          >
            Go
          </button>
        ) : (
          <button
            onClick={handlePaste}
            className="rounded-sm border border-border bg-panel px-4 py-2 text-sm text-muted transition hover:text-foreground hover:border-border-bright active:scale-[0.97]"
          >
            📋 Paste
          </button>
        )}
      </div>
    </div>
  );
}

function useOvernightEarnings(savings: number, loading: boolean) {
  return useMemo(() => {
    if (loading || typeof window === 'undefined') {
      return { earnings: undefined, isFirstOpenToday: false };
    }

    const today = new Date().toDateString();
    const lastOpen = localStorage.getItem(LS_LAST_OPEN);
    const isFirstOpenToday = lastOpen !== today;

    let earnings: number | undefined;
    if (isFirstOpenToday && savings > 0) {
      const lastSavings = parseFloat(localStorage.getItem(LS_LAST_SAVINGS) ?? '0');
      if (lastSavings > 0 && savings > lastSavings) {
        earnings = savings - lastSavings;
      }
    }

    localStorage.setItem(LS_LAST_OPEN, today);
    if (savings > 0) {
      localStorage.setItem(LS_LAST_SAVINGS, savings.toString());
    }

    return { earnings, isFirstOpenToday };
  }, [savings, loading]);
}

function DashboardContent() {
  const { address, session, expiringSoon, logout, refresh } = useZkLogin();
  const chipFlow = useChipFlow();
  const feed = useFeed();
  const contactsHook = useContacts(address);
  const dcaHook = useDcaSchedules(address);
  const { agent } = useAgent();
  const agentLoop = useAgentLoop();
  const balanceQuery = useBalance(address);
  const incomingQuery = useQuery({
    queryKey: ['incoming-tx', address],
    enabled: !!address,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/history?address=${address}&limit=5`);
      const data = await res.json();
      const items = (data.items ?? []) as Array<{
        direction: string; amount?: number; asset?: string;
        counterparty?: string; timestamp: number;
      }>;
      return items
        .filter((tx) => tx.direction === 'in' && tx.amount && tx.amount > 0)
        .map((tx) => ({
          amount: tx.amount!,
          asset: tx.asset ?? 'USDC',
          from: tx.counterparty ?? '',
          timestamp: tx.timestamp,
        }));
    },
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentBudget, setAgentBudget] = useState(0.50);
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());
  const [scrolled, setScrolled] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const balance = {
    total: balanceQuery.data?.total ?? 0,
    cash: balanceQuery.data?.cash ?? 0,
    investments: balanceQuery.data?.investments ?? 0,
    savings: balanceQuery.data?.savings ?? 0,
    borrows: balanceQuery.data?.borrows ?? 0,
    savingsRate: balanceQuery.data?.savingsRate ?? 0,
    healthFactor: balanceQuery.data?.healthFactor ?? null,
    maxBorrow: balanceQuery.data?.maxBorrow ?? 0,
    pendingRewards: balanceQuery.data?.pendingRewards ?? 0,
    bestSaveRate: balanceQuery.data?.bestSaveRate ?? null,
    bestAlternativeRate: balanceQuery.data?.bestAlternativeRate ?? null,
    currentRate: balanceQuery.data?.currentRate ?? 0,
    savingsBreakdown: balanceQuery.data?.savingsBreakdown ?? [],
    sui: balanceQuery.data?.sui ?? 0,
    suiUsd: balanceQuery.data?.suiUsd ?? 0,
    suiPrice: balanceQuery.data?.suiPrice ?? 0,
    usdc: balanceQuery.data?.usdc ?? 0,
    assetBalances: balanceQuery.data?.assetBalances ?? {},
    assetUsdValues: balanceQuery.data?.assetUsdValues ?? {},
    loading: balanceQuery.isLoading,
    error: balanceQuery.isError,
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.items.length]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/user/preferences?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        const budget = data.limits?.agentBudget;
        if (typeof budget === 'number' && budget >= 0) setAgentBudget(budget);
      })
      .catch(() => {});
  }, [address]);

  const overnightData = useOvernightEarnings(balance.savings, balance.loading);
  const dailyReportShown = useRef(false);
  const confirmResolverRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    if (dailyReportShown.current || balance.loading || !overnightData.isFirstOpenToday) return;
    if (balance.total <= 0) return;
    dailyReportShown.current = true;

    const reportLines = [
      `Total: $${balance.total.toFixed(2)}`,
      `Cash: $${balance.cash.toFixed(2)}`,
      balance.investments > 0 ? `Investments: $${balance.investments.toFixed(2)}` : '',
      `Savings: $${balance.savings.toFixed(2)}`,
    ].filter(Boolean);
    if (balance.borrows > 0) {
      reportLines.push(`Debt: $${balance.borrows.toFixed(2)}`);
      if (balance.healthFactor && balance.healthFactor !== Infinity) {
        reportLines.push(`Health Factor: ${balance.healthFactor.toFixed(1)}`);
      }
    }
    if (balance.savingsRate > 0) reportLines.push(`Savings APY: ${balance.savingsRate.toFixed(1)}%`);
    const assetLines: string[] = [];
    const bd = balanceQuery.data;
    if (bd) {
      if (bd.sui > 0) assetLines.push(`SUI: ${bd.sui.toFixed(4)}`);
      if (bd.usdc > 0) assetLines.push(`USDC: ${bd.usdc.toFixed(2)}`);
      for (const [symbol, amt] of Object.entries(bd.assetBalances)) {
        if (amt > 0) assetLines.push(`${symbol}: ${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}`);
      }
    }

    feed.addItem({
      type: 'report',
      sections: [
        { title: 'Good morning', lines: reportLines },
        ...(assetLines.length > 0 ? [{ title: 'Assets', lines: assetLines }] : []),
      ],
    });
  }, [balance, balanceQuery.data, overnightData.isFirstOpenToday, feed]);

  const accountState: AccountState = {
    cash: balance.cash,
    savings: balance.savings,
    investments: balance.investments,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    pendingRewards: balance.pendingRewards,
    bestAlternativeRate: balance.bestAlternativeRate ?? undefined,
    currentRate: balance.currentRate > 0 ? balance.currentRate : undefined,
    healthFactor: balance.healthFactor ?? undefined,
    overnightEarnings: overnightData.earnings,
    isFirstOpenToday: overnightData.isFirstOpenToday,
    sessionExpiringSoon: expiringSoon,
    recentIncoming: incomingQuery.data,
  };

  const flowContext: FlowContext = {
    cash: balance.cash,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    maxBorrow: balance.maxBorrow,
  };

  const [lastAgentAction, setLastAgentAction] = useState<string | undefined>();

  const contextualChips = deriveContextualChips(accountState, { lastAgentAction }).filter(
    (c) => !dismissedCards.has(c.id),
  );

  const handleDismissChip = useCallback((id: string) => {
    setDismissedCards((prev) => new Set(prev).add(id));
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    feed.addItem({ type: 'ai-text', text: 'Loading transaction history...' });
    try {
      const res = await fetch(`/api/history?address=${address}&limit=20`);
      const data = await res.json();
      feed.removeLastItem();
      if (data.items && data.items.length > 0) {
        feed.addItem({
          type: 'transaction-history',
          transactions: data.items,
          network: data.network ?? SUI_NETWORK,
        });
      } else {
        feed.addItem({
          type: 'ai-text',
          text: 'No transactions found yet. Make your first save or send to see your activity here.',
          chips: [{ label: 'Save', flow: 'save' }, { label: 'Receive', flow: 'receive' }],
        });
      }
    } catch {
      feed.removeLastItem();
      feed.addItem({
        type: 'ai-text',
        text: 'Could not load transaction history right now. Try again later.',
      });
    }
  }, [address, feed]);

  const fetchQuoteAndConfirm = useCallback(
    async (amount: number, fromOverride?: string, toOverride?: string) => {
      const fromAsset = fromOverride ?? chipFlow.state.asset ?? 'USDC';
      const toAsset = toOverride ?? chipFlow.state.toAsset ?? 'SUI';

      chipFlow.setQuoting(amount);

      try {
        const res = await fetch(
          `/api/quote?from=${fromAsset}&to=${toAsset}&amount=${amount}`,
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? 'Quote failed');
        }
        const data = await res.json();
        chipFlow.setQuote({
          expectedOutput: data.expectedOutput,
          priceImpact: data.priceImpact,
          poolPrice: data.poolPrice,
          fromAsset,
          toAsset,
          fromAmount: amount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get quote';
        chipFlow.setError(msg);
        feed.addItem({ type: 'ai-text', text: `Could not get a price quote: ${msg}` });
      }
    },
    [chipFlow, feed],
  );

  const executeIntent = useCallback(
    (intent: ParsedIntent) => {
      if (!intent) return;

      switch (intent.action) {
        case 'save': {
          const cap = capForFlow('save', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No USDC available to save right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('save', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'send': {
          const cap = capForFlow('send', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No funds available to send right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('send', flowContext);
            const resolved = contactsHook.resolveContact(intent.to);
            if (resolved) {
              chipFlow.selectRecipient(resolved, intent.to, flowContext.cash);
            } else {
              chipFlow.selectRecipient(intent.to, undefined, flowContext.cash);
            }
            const sendAmt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (sendAmt > 0) chipFlow.selectAmount(sendAmt);
          }
          break;
        }
        case 'withdraw':
          if (balance.savings <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any savings to withdraw.',
              chips: [{ label: 'Save', flow: 'save' }],
            });
          } else {
            chipFlow.startFlow('withdraw', flowContext);
            const amt = intent.amount === -1 ? balance.savings : intent.amount > 0 ? Math.min(intent.amount, balance.savings) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'borrow': {
          const cap = capForFlow('borrow', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'Nothing available to borrow. You need savings deposited as collateral first.', chips: [{ label: 'Save', flow: 'save' }] });
          } else {
            chipFlow.startFlow('borrow', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'repay':
          if (balance.borrows <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any active debt to repay.',
              chips: [{ label: 'Borrow', flow: 'borrow' }],
            });
          } else {
            chipFlow.startFlow('repay', flowContext);
            const amt = intent.amount === -1 ? balance.borrows : intent.amount > 0 ? Math.min(intent.amount, balance.borrows) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'swap': {
          const cap = capForFlow('swap', balance, intent.from);
          if (intent.amount === -1 && cap <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: `No ${intent.from} available to swap.`,
              chips: [{ label: 'Balance', flow: 'balance' }],
            });
            break;
          }
          chipFlow.startFlow('swap', flowContext);
          if (intent.from) chipFlow.selectAsset(intent.from, flowContext);
          if (intent.to) chipFlow.selectAsset(intent.to, flowContext);
          const swapAmt = intent.amount === -1 ? cap : intent.amount;
          if (swapAmt > 0) {
            fetchQuoteAndConfirm(swapAmt, intent.from, intent.to);
          }
          break;
        }
        case 'claim-rewards':
          if (balance.pendingRewards <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'No pending rewards to claim right now.',
            });
          } else {
            feed.addItem({ type: 'ai-text', text: `Claiming $${balance.pendingRewards.toFixed(2)} in rewards...` });
            (async () => {
              try {
                if (!agent) throw new Error('Not authenticated');
                const sdk = await agent.getInstance();
                const res = await sdk.claimRewards();
                feed.removeLastItem();
                feed.addItem({
                  type: 'result',
                  success: true,
                  title: `Claimed $${balance.pendingRewards.toFixed(2)} in rewards`,
                  details: `Tx: ${res.tx.slice(0, 8)}...${res.tx.slice(-6)}`,
                });
                balanceQuery.refetch();
                setTimeout(() => balanceQuery.refetch(), 3000);
              } catch (err) {
                feed.removeLastItem();
                const msg = err instanceof Error ? err.message : 'Failed to claim rewards';
                feed.addItem({
                  type: 'ai-text',
                  text: `Claim failed: ${msg}`,
                  chips: [{ label: 'Try again', flow: 'claim-rewards' }],
                });
              }
            })();
          }
          break;
        case 'address':
          feed.addItem({
            type: 'receipt',
            title: 'Deposit Address',
            code: address ?? '',
            qr: true,
            meta: [
              { label: 'Network', value: 'Sui (mainnet)' },
              { label: 'Token', value: 'USDC' },
            ],
            instructions: [
              {
                title: 'From Binance',
                steps: [
                  'Go to Withdraw → search "USDC"',
                  'Select network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From Coinbase',
                steps: [
                  'Go to Send → select USDC',
                  'Choose network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From any Sui wallet',
                steps: [
                  'Send USDC to the address above',
                ],
              },
            ],
          });
          break;
        case 'balance': {
          const bd = balanceQuery.data;
          const stats: string[] = [
            `<<stat label="Cash" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          if (balance.investments > 0) {
            stats.push(`<<stat label="Investments" value="$${balance.investments.toFixed(2)}" status="safe">>`);
          }
          stats.push(`<<stat label="Total" value="$${balance.total.toFixed(2)}" status="${balance.total > 0 ? 'safe' : 'neutral'}">>`)
          if (balance.borrows > 0) {
            stats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
            if (balance.healthFactor && balance.healthFactor !== Infinity) {
              stats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
            }
          }
          if (bd) {
            if (bd.sui > 0) stats.push(`<<stat label="SUI" value="${bd.sui.toFixed(4)} ($${bd.suiUsd.toFixed(2)})" status="safe">>`);
            if (bd.usdc > 0) stats.push(`<<stat label="USDC" value="${bd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(bd.assetBalances)) {
              if (amt > 0) stats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: stats.join('\n') });
          break;
        }
        case 'report': {
          const rd = balanceQuery.data;
          const rStats: string[] = [
            `<<stat label="Cash" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          if (balance.investments > 0) {
            rStats.push(`<<stat label="Investments" value="$${balance.investments.toFixed(2)}" status="safe">>`);
          }
          if (balance.borrows > 0) {
            rStats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
          } else {
            rStats.push(`<<stat label="Debt" value="$0.00" status="safe">>`);
          }
          if (balance.savingsRate > 0) {
            rStats.push(`<<stat label="Yield" value="${balance.savingsRate.toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.healthFactor && balance.healthFactor !== Infinity && balance.borrows > 0) {
            rStats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
          }
          if (rd) {
            if (rd.sui > 0) rStats.push(`<<stat label="SUI" value="${rd.sui.toFixed(4)} ($${rd.suiUsd.toFixed(2)})" status="safe">>`);
            if (rd.usdc > 0) rStats.push(`<<stat label="USDC" value="${rd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(rd.assetBalances)) {
              if (amt > 0) rStats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: rStats.join('\n') });
          break;
        }
        case 'history':
          fetchHistory();
          break;
        case 'rates': {
          const rtStats: string[] = [];
          if (balance.savingsRate > 0) {
            rtStats.push(`<<stat label="Your Rate" value="${balance.savingsRate.toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.bestSaveRate) {
            const isBetter = balance.bestSaveRate.rate > balance.savingsRate + 0.3;
            rtStats.push(`<<stat label="Best Available" value="${balance.bestSaveRate.rate.toFixed(1)}% APY" status="${isBetter ? 'safe' : 'neutral'}">>`)
            rtStats.push(`<<stat label="Protocol" value="${balance.bestSaveRate.protocol}" status="neutral">>`)
          }
          if (balance.savings > 0 && balance.savingsRate > 0) {
            const monthly = (balance.savings * (balance.savingsRate / 100)) / 12;
            rtStats.push(`<<stat label="Monthly Earnings" value="~$${monthly.toFixed(2)}" status="neutral">>`);
          }
          if (rtStats.length === 0) {
            feed.addItem({ type: 'ai-text', text: 'No rate data available yet — rates refresh every 30s.' });
          } else {
            feed.addItem({
              type: 'ai-text',
              text: rtStats.join('\n'),
              chips: balance.cash > 5
                ? [{ label: 'Save', flow: 'save' }]
                : [],
            });
          }
          break;
        }
        case 'help':
          feed.addItem({
            type: 'ai-text',
            text: 'Here\'s what I can help with:\n\n• Swap — Buy, sell, or swap SUI, BTC, ETH, GOLD\n• Save — Earn yield on idle funds\n• Send — Transfer to anyone\n• Borrow — Against your savings\n• Invest — DCA or one-time into BTC, ETH, GOLD\n• Report — Full financial summary\n\nI can also search the web, send emails, translate, generate images, buy gift cards, and more — just type what you need.',
          });
          break;
        case 'invest':
          chipFlow.startFlow('invest', flowContext);
          break;
      }
    },
    [chipFlow, feed, address, balance, balanceQuery, flowContext, agent, contactsHook, fetchHistory, fetchQuoteAndConfirm],
  );

  const handleChipClick = useCallback(
    (flow: string) => {
      if (flow === 'refresh-session') { refresh(); return; }

      if (flow === 'claim-rewards') { chipFlow.reset(); executeIntent({ action: 'claim-rewards' }); return; }
      if (flow === 'help') { chipFlow.reset(); executeIntent({ action: 'help' }); return; }
      if (flow === 'report') { chipFlow.reset(); executeIntent({ action: 'report' }); return; }
      if (flow === 'history') { chipFlow.reset(); executeIntent({ action: 'history' }); return; }
      if (flow === 'receive') { chipFlow.reset(); executeIntent({ action: 'address' }); return; }
      if (flow === 'balance') { chipFlow.reset(); executeIntent({ action: 'balance' }); return; }
      if (flow === 'rates') { chipFlow.reset(); executeIntent({ action: 'rates' }); return; }

      if (flow === 'save-all') {
        chipFlow.startFlow('save', flowContext);
        chipFlow.selectAmount(balance.cash);
        return;
      }
      if (flow === 'rebalance') {
        const alt = balance.bestAlternativeRate;
        if (alt && balance.savings > 0) {
          chipFlow.startFlow('rebalance', {
            ...flowContext,
            protocol: alt.protocolId,
            toAsset: alt.asset,
          });
          chipFlow.selectAmount(balance.savings);
        } else {
          chipFlow.reset();
          feed.addItem({
            type: 'ai-text',
            text: 'No better rates found right now. Your savings are already at the best available rate.',
          });
        }
        return;
      }
      if (flow === 'risk-explain') {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'Your health factor measures how safe your loan is. Below 1.5 means you\'re close to liquidation — repaying even a small amount brings it back to a safer level.',
          chips: [{ label: 'Repay $50', flow: 'repay' }],
        });
        return;
      }
      if (flow === 'swap') {
        chipFlow.startFlow('swap', flowContext);
        return;
      }
      if (flow === 'invest') {
        chipFlow.startFlow('invest', flowContext);
        return;
      }
      if (flow === 'repay' && balance.borrows <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any active debt to repay.',
          chips: [{ label: 'Borrow', flow: 'borrow' }],
        });
        return;
      }
      if (flow === 'withdraw' && balance.savings <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any savings to withdraw. Save first to earn yield.',
          chips: [{ label: 'Save', flow: 'save' }],
        });
        return;
      }
      chipFlow.startFlow(flow, flowContext);
    },
    [chipFlow, feed, executeIntent, balance, flowContext, refresh],
  );

  const handleInputSubmit = useCallback(
    async (text: string) => {
      feed.addItem({ type: 'user-message', text });

      const intent = parseIntent(text);
      if (intent) {
        executeIntent(intent);
        return;
      }

      if (!address) return;

      const email = decodeJwtEmail(session?.jwt) ?? '';
      const balanceCtx = `Total: $${balance.total.toFixed(2)}, Cash: $${balance.cash.toFixed(2)}${balance.investments > 0 ? `, Investments: $${balance.investments.toFixed(2)}` : ''}, Savings: $${balance.savings.toFixed(2)}${balance.borrows > 0 ? `, Debt: $${balance.borrows.toFixed(2)}` : ''}`;

      feed.addItem({
        type: 'agent-response',
        steps: [],
        status: 'running',
      });

      const stepsAccum: AgentStepData[] = [];

      try {
      await agentLoop.run(text, {
        address,
        email,
        balanceSummary: balanceCtx,
        budget: agentBudget,
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        timezone: typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined,
      }, {
        onStep: (step: AgentStep) => {
          stepsAccum.push({ ...step });
          feed.updateLastOfType('agent-response', () => ({
            type: 'agent-response',
            steps: [...stepsAccum],
            status: 'running',
          }));
        },
        onStepUpdate: (tool: string, update: Partial<AgentStep>) => {
          const idx = stepsAccum.findIndex((s) => s.tool === tool && s.status === 'running');
          if (idx !== -1) {
            stepsAccum[idx] = { ...stepsAccum[idx], ...update };
          }
          if (update.status === 'done') setLastAgentAction(tool);
          feed.updateLastOfType('agent-response', () => ({
            type: 'agent-response',
            steps: [...stepsAccum],
            status: 'running',
          }));
        },
        onText: (responseText: string) => {
          feed.updateLastOfType('agent-response', () => ({
            type: 'agent-response',
            steps: [...stepsAccum],
            text: responseText,
            status: 'done',
          }));
        },
        onMedia: (media) => {
          const TOOL_LABELS: Record<string, string> = {
            generate_image: 'Generated image',
            text_to_speech: 'Text to speech',
            take_screenshot: 'Screenshot',
            generate_qr: 'QR Code',
          };
          if (media.type === 'image') {
            feed.addItem({
              type: 'image',
              url: media.dataUri,
              alt: TOOL_LABELS[media.tool] ?? 'Generated image',
              cost: media.cost ? `$${media.cost.toFixed(3)}` : undefined,
            });
          } else if (media.type === 'audio') {
            feed.addItem({
              type: 'audio',
              url: media.dataUri,
              title: TOOL_LABELS[media.tool] ?? 'Audio',
              cost: media.cost ? `$${media.cost.toFixed(3)}` : undefined,
            });
          }
        },
        onConfirmNeeded: async (tool: string, args: Record<string, unknown>, cost: number) => {
          const summaryParts: string[] = [];
          if (args.to_name) summaryParts.push(`To: ${args.to_name}`);
          if (args.recipient_name) summaryParts.push(`To: ${args.recipient_name}`);
          if (args.email) summaryParts.push(`Email: ${args.email}`);
          if (args.to) summaryParts.push(`To: ${args.to}`);
          if (args.amount) summaryParts.push(`$${args.amount}`);
          if (args.brand) summaryParts.push(String(args.brand));
          if (args.message && String(args.message).length <= 60) summaryParts.push(`"${args.message}"`);
          if (args.path) summaryParts.push(String(args.path));
          const summary = summaryParts.length > 0 ? summaryParts.join(' · ') : undefined;

          return new Promise<boolean>((resolve) => {
            confirmResolverRef.current = resolve;
            feed.updateLastOfType('agent-response', (prev) => {
              if (prev.type !== 'agent-response') return prev;
              return { ...prev, confirm: { tool, cost, summary } };
            });
          });
        },
        onDone: (totalCost: number) => {
          feed.updateLastOfType('agent-response', (prev) => {
            if (prev.type !== 'agent-response') return prev;
            return { ...prev, totalCost, status: 'done' as const };
          });
          balanceQuery.refetch();
          setTimeout(() => balanceQuery.refetch(), 3000);
        },
        onError: (error: string) => {
          feed.updateLastOfType('agent-response', (prev) => {
            if (prev.type !== 'agent-response') return prev;
            return { ...prev, status: 'error' as const, error, steps: [...stepsAccum] };
          });
        },
      });
      } catch (err) {
        feed.updateLastOfType('agent-response', (prev) => {
          if (prev.type !== 'agent-response') return prev;
          return { ...prev, status: 'error' as const, error: err instanceof Error ? err.message : 'Something went wrong', steps: [...stepsAccum] };
        });
      }
    },
    [feed, executeIntent, address, session, balance, agentLoop, balanceQuery, agentBudget],
  );

  const handleFeedChipClick = useCallback(
    (flowOrLabel: string) => {
      const intent = parseIntent(flowOrLabel);
      if (intent) {
        executeIntent(intent);
        return;
      }
      const flow = resolveFlow(flowOrLabel) ?? flowOrLabel;
      handleChipClick(flow);
    },
    [handleChipClick, executeIntent],
  );

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleSaveContact = useCallback(
    async (name: string, addr: string) => {
      await contactsHook.addContact(name, addr);
      feed.addItem({
        type: 'ai-text',
        text: `Saved "${name}" as a contact. Next time you send, just type their name.`,
      });
    },
    [contactsHook, feed],
  );

  const handleAmountSelect = useCallback(
    (amount: number) => {
      const flow = chipFlow.state.flow ?? '';
      const fromAsset = chipFlow.state.asset ?? undefined;
      const cap = capForFlow(flow, balance, fromAsset);
      const resolved = amount === -1 ? cap : Math.min(amount, cap);

      if (flow === 'swap') {
        fetchQuoteAndConfirm(resolved);
      } else if (amount === -1) {
        chipFlow.selectAmount(cap);
      } else {
        chipFlow.selectAmount(Math.min(amount, cap));
      }
    },
    [chipFlow, balance, fetchQuoteAndConfirm],
  );

  const handleConfirm = useCallback(async () => {
    chipFlow.confirm();

    const flow = chipFlow.state.flow;
    const fromAsset = chipFlow.state.asset ?? undefined;
    const cap = capForFlow(flow ?? '', balance, fromAsset);
    const rawAmount = chipFlow.state.amount ?? 0;
    const amount = Math.min(rawAmount, cap);

    try {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();

      let txDigest = '';
      let flowLabel = '';

      const protocol = chipFlow.state.protocol ?? undefined;

      switch (flow) {
        case 'save': {
          const res = await sdk.save({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Saved';
          break;
        }
        case 'send': {
          const recipient = chipFlow.state.recipient;
          if (!recipient) throw new Error('No recipient specified');
          let sendAsset: string | undefined;
          let sendAmount = amount;
          if (amount > balance.usdc && balance.sui > 0) {
            sendAsset = 'SUI';
            sendAmount = balance.suiPrice > 0 ? amount / balance.suiPrice : 0;
          }
          const res = await sdk.send({ to: recipient, amount: sendAmount, asset: sendAsset });
          txDigest = res.tx;
          flowLabel = 'Sent';
          break;
        }
        case 'withdraw': {
          const primary = balance.savingsBreakdown.length > 0
            ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
            : null;
          const fromAsset = primary?.asset ?? 'USDC';
          const toAsset = fromAsset !== 'USDC' ? 'USDC' : undefined;
          const res = await sdk.withdraw({
            amount,
            protocol: protocol ?? primary?.protocolId,
            fromAsset: fromAsset !== 'USDC' ? fromAsset : undefined,
            toAsset,
          });
          txDigest = res.tx;
          flowLabel = 'Withdrew';
          break;
        }
        case 'borrow': {
          const res = await sdk.borrow({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Borrowed';
          break;
        }
        case 'repay': {
          const res = await sdk.repay({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Repaid';
          break;
        }
        case 'rebalance': {
          const toProtocol = protocol;
          const primary = balance.savingsBreakdown.length > 0
            ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
            : null;
          const fromProtocol = primary?.protocolId ?? 'navi';
          if (!toProtocol) throw new Error('No target protocol for rebalance');
          const fromAsset = primary?.asset ?? 'USDC';
          const toAsset = chipFlow.state.toAsset ?? balance.bestAlternativeRate?.asset ?? fromAsset;
          const res = await sdk.rebalance({ amount, fromProtocol, toProtocol, fromAsset, toAsset });
          txDigest = res.tx;
          const alt = balance.bestAlternativeRate;
          const toLabel = alt ? `${alt.protocol}${alt.asset !== 'USDC' ? ` ${alt.asset}` : ''}` : toProtocol;
          flowLabel = `Rebalanced $${amount.toFixed(2)} to ${toLabel}`;
          break;
        }
        case 'swap': {
          const from = chipFlow.state.asset ?? 'USDC';
          const to = chipFlow.state.toAsset ?? 'SUI';
          const res = await sdk.swap({ from, to, amount });
          txDigest = res.tx;
          const q = chipFlow.state.quote;
          const isBuy = from === 'USDC';
          const isSell = to === 'USDC';
          if (isBuy && q) {
            flowLabel = `Bought ${fmtToken(q.expectedOutput)} ${to} for $${amount.toFixed(2)}`;
          } else if (isSell && q) {
            flowLabel = `Sold ${fmtToken(amount)} ${from} for ~$${q.expectedOutput.toFixed(2)}`;
          } else if (q) {
            flowLabel = `Swapped ${fmtToken(amount)} ${from} → ${fmtToken(q.expectedOutput)} ${to}`;
          } else {
            flowLabel = `Swapped ${fmtToken(amount)} ${from} → ${to}`;
          }
          break;
        }
        case 'invest': {
          const strategyKey = chipFlow.state.strategy;
          if (!strategyKey) throw new Error('No strategy selected');
          const freq = chipFlow.state.frequency ?? 'once';
          const strategyName = chipFlow.state.subFlow ?? strategyKey;

          const strategyResult = await sdk.strategyBuy({ strategy: strategyKey, amount });

          if (strategyResult.partial) {
            const bought = strategyResult.buys.map((b) => `${b.asset} $${b.amount.toFixed(2)}`).join(', ');
            txDigest = strategyResult.buys[0]?.tx ?? '';
            flowLabel = `Partial invest into ${strategyName}: bought ${bought}. ${strategyResult.failedAsset} swap failed: ${strategyResult.error}`;
          } else {
            txDigest = strategyResult.buys[0]?.tx ?? '';
            const bought = strategyResult.buys.map((b) => `${b.asset} $${b.amount.toFixed(2)}`).join(', ');
            flowLabel = `Invested $${amount.toFixed(2)} into ${strategyName} (${bought})`;
          }

          if (freq !== 'once') {
            dcaHook.add({
              strategy: strategyKey,
              strategyName,
              amount,
              frequency: freq,
            });
            flowLabel += ` — repeats ${freq}`;
          }
          break;
        }
        default:
          throw new Error(`Unknown flow: ${flow}`);
      }

      const hasAmountInLabel = flow === 'swap' || flow === 'invest' || flow === 'rebalance';
      const explorerBase = SUI_NETWORK === 'testnet'
        ? 'https://suiscan.xyz/testnet/tx'
        : 'https://suiscan.xyz/mainnet/tx';
      const txUrl = txDigest ? `${explorerBase}/${txDigest}` : undefined;
      const result: ChipFlowResult = {
        success: true,
        title: hasAmountInLabel ? flowLabel : `${flowLabel} $${amount.toFixed(2)}`,
        details: txDigest
          ? `Tx: ${txDigest.slice(0, 8)}...${txDigest.slice(-6)}`
          : 'Transaction confirmed on-chain.',
        txUrl,
      };
      chipFlow.setResult(result);

      feed.addItem({
        type: 'result',
        success: true,
        title: result.title,
        details: result.details,
        txUrl,
      });

      balanceQuery.refetch();
      setTimeout(() => balanceQuery.refetch(), 3000);

      if (
        flow === 'send' &&
        chipFlow.state.recipient &&
        !contactsHook.isKnownAddress(chipFlow.state.recipient)
      ) {
        feed.addItem({
          type: 'contact-prompt',
          address: chipFlow.state.recipient,
        });
      }
    } catch (err) {
      const errorData = mapError(err);
      chipFlow.setError(errorData.type === 'error' ? errorData.message : 'Transaction failed');
      feed.addItem(errorData);
    }
  }, [chipFlow, feed, agent, contactsHook, dcaHook, balanceQuery]);

  const getConfirmationDetails = () => {
    const flow = chipFlow.state.flow;
    const amount = chipFlow.state.amount ?? 0;
    const quote = chipFlow.state.quote;
    const details: { label: string; value: string }[] = [];

    if (flow === 'swap' && quote) {
      const isBuy = quote.fromAsset === 'USDC';
      const isSell = quote.toAsset === 'USDC';
      if (isBuy) {
        details.push({ label: 'You pay', value: `$${amount.toFixed(2)} USDC` });
        details.push({ label: 'You receive', value: `~${fmtToken(quote.expectedOutput)} ${quote.toAsset}` });
        const unitPrice = amount / quote.expectedOutput;
        details.push({ label: 'Price', value: `$${unitPrice.toFixed(2)} / ${quote.toAsset}` });
      } else if (isSell) {
        details.push({ label: 'You sell', value: `${fmtToken(amount)} ${quote.fromAsset}` });
        details.push({ label: 'You receive', value: `~$${quote.expectedOutput.toFixed(2)} USDC` });
      } else {
        details.push({ label: 'You send', value: `${fmtToken(amount)} ${quote.fromAsset}` });
        details.push({ label: 'You receive', value: `~${fmtToken(quote.expectedOutput)} ${quote.toAsset}` });
      }
      if (quote.priceImpact > 0.001) {
        details.push({ label: 'Price impact', value: `${(quote.priceImpact * 100).toFixed(2)}%` });
      }
      details.push({ label: 'Gas', value: 'Sponsored' });
      let title: string;
      let confirmLabel: string;
      if (isBuy) {
        title = `Buy ${quote.toAsset}`;
        confirmLabel = `Buy ${fmtToken(quote.expectedOutput)} ${quote.toAsset}`;
      } else if (isSell) {
        title = `Sell ${quote.fromAsset}`;
        confirmLabel = `Sell ${fmtToken(amount)} ${quote.fromAsset}`;
      } else {
        title = `Swap ${quote.fromAsset} → ${quote.toAsset}`;
        confirmLabel = `Swap ${fmtToken(amount)} ${quote.fromAsset}`;
      }
      return {
        title,
        confirmLabel,
        details,
      };
    }

    if (flow === 'rebalance') {
      const alt = balance.bestAlternativeRate;
      const fromEntry = balance.savingsBreakdown.length > 0
        ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
        : null;
      const fromAsset = fromEntry?.asset ?? 'USDC';
      const toAsset = chipFlow.state.toAsset ?? alt?.asset ?? fromAsset;
      const fromName = fromEntry?.protocol ?? 'current';
      const toProtocol = alt?.protocol ?? chipFlow.state.protocol ?? 'target';
      const toLabel = `${toProtocol}${toAsset !== 'USDC' ? ` ${toAsset}` : ''}`;
      const fromLabel = `${fromName}${fromAsset !== 'USDC' ? ` ${fromAsset}` : ''}`;
      details.push({ label: 'From', value: `${fromLabel} (${(fromEntry?.apy ?? balance.savingsRate).toFixed(1)}%)` });
      details.push({ label: 'To', value: `${toLabel} (${(alt?.rate ?? 0).toFixed(1)}%)` });
      if (fromAsset !== toAsset) {
        details.push({ label: 'Swap', value: `${fromAsset} → ${toAsset} (auto)` });
      }
      details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });
      details.push({ label: 'Gas', value: 'Sponsored' });
      return {
        title: `Rebalance to ${toLabel}`,
        confirmLabel: `Switch $${amount.toFixed(0)} to ${toLabel}`,
        details,
      };
    }

    if (flow === 'invest') {
      const strategy = chipFlow.state.subFlow ?? 'Strategy';
      const freq = chipFlow.state.frequency ?? 'once';
      const isRecurring = freq !== 'once';
      details.push({ label: 'Strategy', value: strategy });
      details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });
      if (isRecurring) {
        details.push({ label: 'Repeat', value: freq.charAt(0).toUpperCase() + freq.slice(1) });
      }
      details.push({ label: 'Gas', value: 'Sponsored' });
      return {
        title: isRecurring ? `DCA into ${strategy}` : `Invest into ${strategy}`,
        confirmLabel: `Invest $${amount.toFixed(0)} into ${strategy}`,
        details,
      };
    }

    details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

    if (flow === 'withdraw') {
      const primary = balance.savingsBreakdown.length > 0
        ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
        : null;
      if (primary && primary.asset !== 'USDC') {
        details.push({ label: 'Swap', value: `${primary.asset} → USDC (auto)` });
      }
    }

    if (flow === 'send' && chipFlow.state.recipient) {
      details.push({ label: 'To', value: chipFlow.state.subFlow ?? chipFlow.state.recipient });
    }

    if (flow === 'save' && balance.savingsRate > 0) {
      details.push({ label: 'APY', value: `${balance.savingsRate.toFixed(1)}%` });
      const monthly = (amount * (balance.savingsRate / 100)) / 12;
      if (monthly >= 0.01) details.push({ label: 'Est. monthly', value: `+$${monthly.toFixed(2)}` });
    }

    if (flow === 'borrow' && balance.savingsRate > 0) {
      details.push({ label: 'Collateral', value: `$${Math.floor(balance.savings)}` });
    }

    details.push({ label: 'Gas', value: 'Sponsored' });

    return {
      title: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      confirmLabel: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      details,
    };
  };

  if (!address || !session) return null;

  const isInFlow = chipFlow.state.phase !== 'idle';
  const hasFeedItems = feed.items.length > 0;

  return (
    <main className="flex flex-1 flex-col pb-36">
      <div className={`sticky top-0 z-20 bg-background/95 backdrop-blur-sm transition-[border-color] duration-200 border-b ${scrolled ? 'border-border/50' : 'border-transparent'}`}>
        <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-4">
          <BalanceHeader
            address={address}
            balance={balance}
            compact={scrolled}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-xl px-4 py-4 space-y-5">

        {/* Result card (after transaction) */}
        {chipFlow.state.phase === 'result' && chipFlow.state.result && (
          <ResultCard
            success={chipFlow.state.result.success}
            title={chipFlow.state.result.title}
            details={chipFlow.state.result.details}
            txUrl={chipFlow.state.result.txUrl}
            onDismiss={chipFlow.reset}
          />
        )}

        {/* Confirmation card */}
        {chipFlow.state.phase === 'confirming' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={handleConfirm}
            onCancel={chipFlow.reset}
          />
        )}

        {/* Quoting state (fetching swap quote) */}
        {chipFlow.state.phase === 'quoting' && (
          <div className="rounded-sm border border-border bg-surface p-5 space-y-3 feed-row">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              <p className="text-sm text-muted">Fetching price quote...</p>
            </div>
          </div>
        )}

        {/* Executing state */}
        {chipFlow.state.phase === 'executing' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={() => {}}
            onCancel={() => {}}
            loading
          />
        )}

        {/* Asset selection (trade/swap) */}
        {chipFlow.state.phase === 'asset-select' && chipFlow.state.flow === 'swap' && (
          <AssetSelector
            flow="swap"
            selectedFrom={chipFlow.state.asset}
            message={chipFlow.state.message ?? undefined}
            onSelect={(asset) => chipFlow.selectAsset(asset, flowContext)}
          />
        )}

        {/* Strategy selection (invest/DCA) */}
        {chipFlow.state.phase === 'strategy-select' && chipFlow.state.flow === 'invest' && (
          <StrategySelector
            message={chipFlow.state.message ?? undefined}
            onSelect={(key, name) => chipFlow.selectStrategy(key, name)}
          />
        )}

        {/* DCA frequency selection */}
        {chipFlow.state.phase === 'dca-frequency' && chipFlow.state.flow === 'invest' && (
          <FrequencySelector
            amount={chipFlow.state.amount ?? 0}
            strategyName={chipFlow.state.subFlow ?? 'Strategy'}
            onSelect={(freq) => chipFlow.selectFrequency(freq)}
          />
        )}

        {/* Amount sub-chips */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow && chipFlow.state.flow !== 'send' && (() => {
          const f = chipFlow.state.flow!;
          const swapFrom = chipFlow.state.asset ?? undefined;
          const swapCap = f === 'swap' && swapFrom ? capForFlow('swap', balance, swapFrom) : 0;
          return (
            <AmountChips
              amounts={getAmountPresets(f, balance, swapFrom)}
              allLabel={
                f === 'withdraw' ? `All $${fmtDollar(balance.savings)}` :
                f === 'save' ? `All $${fmtDollar(balance.cash)}` :
                f === 'repay' ? `All $${fmtDollar(balance.borrows)}` :
                f === 'borrow' && balance.maxBorrow > 0 ? `Max $${fmtDollar(balance.maxBorrow)}` :
                f === 'swap' && swapFrom ? `All ${swapCap.toFixed(swapFrom === 'USDC' ? 2 : 4)} ${swapFrom}` :
                undefined
              }
              assetLabel={f === 'swap' && swapFrom ? swapFrom : undefined}
              onSelect={handleAmountSelect}
              message={chipFlow.state.message ?? undefined}
            />
          );
        })()}

        {/* Send flow — recipient selection */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && !chipFlow.state.recipient && (
          <SendRecipientInput
            contacts={contactsHook.contacts}
            onSelectContact={(addr, name) => chipFlow.selectRecipient(addr, name, balance.cash)}
            onSubmit={(input) => {
              const resolved = contactsHook.resolveContact(input);
              if (resolved) {
                chipFlow.selectRecipient(resolved, input, balance.cash);
              } else {
                chipFlow.selectRecipient(input, undefined, balance.cash);
              }
            }}
          />
        )}

        {/* Send flow — amount selection after recipient */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && chipFlow.state.recipient && (
          <AmountChips
            amounts={getAmountPresets('send', balance)}
            allLabel={`All $${fmtDollar(balance.cash)}`}
            onSelect={handleAmountSelect}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {/* Conversational Feed */}
        {hasFeedItems && !isInFlow && (
          <FeedRenderer
            items={feed.items}
            onChipClick={handleFeedChipClick}
            onCopy={handleCopy}
            onSaveContact={handleSaveContact}
            onConfirmResolve={(approved) => {
              const resolver = confirmResolverRef.current;
              if (resolver) {
                confirmResolverRef.current = null;
                feed.updateLastItem((prev) => {
                  if (prev.type !== 'agent-response') return prev;
                  return { ...prev, confirm: undefined };
                });
                resolver(approved);
              }
            }}
          />
        )}

        {/* Contextual chips now live in the fixed bottom bar */}

        {/* Agent loading indicator */}
        {agentLoop.status === 'running' && (
          <div className="flex items-center gap-2 px-2">
            <div className="h-4 w-full max-w-[200px] rounded-full overflow-hidden bg-border/30">
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
            </div>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* Bottom bar — fixed */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm safe-bottom p-4 z-30">
        <div className="mx-auto max-w-xl space-y-3">
          {!isInFlow && agentLoop.status !== 'running' && contextualChips.length > 0 && (
            <ContextualChips
              chips={contextualChips}
              onChipFlow={handleChipClick}
              onAgentPrompt={(prompt) => handleInputSubmit(prompt)}
              onDismiss={handleDismissChip}
            />
          )}
          <InputBar
            onSubmit={handleInputSubmit}
            disabled={chipFlow.state.phase === 'executing' || agentLoop.status === 'running'}
          />
          {agentLoop.status === 'running' ? (
            <div className="flex items-center justify-between">
              <button
                onClick={agentLoop.cancel}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface px-4 py-2 text-sm text-muted hover:text-foreground hover:border-border-bright transition active:scale-[0.97]"
              >
                <span className="text-base">■</span> Stop
              </button>
              {agentLoop.totalCost > 0 && (
                <span className="text-xs text-muted">${agentLoop.totalCost.toFixed(3)} spent</span>
              )}
            </div>
          ) : (
            <>
              <ChipBar
                onChipClick={handleChipClick}
                activeFlow={chipFlow.state.flow}
                disabled={chipFlow.state.phase === 'executing'}
              />
              {isInFlow && chipFlow.state.phase !== 'result' && (
                <button
                  onClick={chipFlow.reset}
                  className="w-full text-center text-xs text-muted hover:text-foreground transition py-1"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Panels */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        address={address}
        email={decodeJwtEmail(session.jwt)}
        network={SUI_NETWORK}
        sessionExpiresAt={session.expiresAt}
        contacts={contactsHook.contacts}
        onRemoveContact={contactsHook.removeContact}
        onSignOut={logout}
        onRefreshSession={refresh}
      />

    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
