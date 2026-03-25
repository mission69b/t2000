'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { BalanceHeader } from '@/components/dashboard/BalanceHeader';
import { SmartCardFeed } from '@/components/dashboard/SmartCardFeed';
import { ChipBar } from '@/components/dashboard/ChipBar';
import { InputBar } from '@/components/dashboard/InputBar';
import { ConfirmationCard } from '@/components/dashboard/ConfirmationCard';
import { ResultCard } from '@/components/dashboard/ResultCard';
import { AmountChips } from '@/components/dashboard/AmountChips';
import { FeedRenderer } from '@/components/dashboard/FeedRenderer';
import { AssetSelector } from '@/components/dashboard/AssetSelector';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ServicesPanel } from '@/components/services/ServicesPanel';
import { useChipFlow, type ChipFlowResult, type FlowContext } from '@/hooks/useChipFlow';
import { useFeed } from '@/hooks/useFeed';
import { useLlm } from '@/hooks/useLlm';
import { useLlmUsage } from '@/hooks/useLlmUsage';
import { useBalance } from '@/hooks/useBalance';
import { parseIntent, type ParsedIntent } from '@/lib/intent-parser';
import { mapError } from '@/lib/errors';
import { deriveSmartCards, type AccountState } from '@/lib/smart-cards';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';
import { useContacts } from '@/hooks/useContacts';
import { useAgent } from '@/hooks/useAgent';
import type { ServiceItem } from '@/lib/service-catalog';

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
  bal: { checking: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number },
  fromAsset?: string,
): number {
  switch (flow) {
    case 'save': return bal.checking;
    case 'send': return bal.checking;
    case 'withdraw': return bal.savings;
    case 'repay': return bal.borrows;
    case 'borrow': return bal.maxBorrow;
    case 'swap': {
      if (fromAsset === 'SUI') return bal.sui;
      if (fromAsset === 'USDC') return bal.usdc;
      if (fromAsset === 'GOLD' || fromAsset === 'USDT') return bal.checking;
      return bal.checking;
    }
    default: return bal.checking;
  }
}

function getAmountPresets(flow: string, bal: { checking: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number }, fromAsset?: string): number[] {
  const cap = Math.floor(capForFlow(flow, bal, fromAsset));
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
  const llm = useLlm();
  const llmUsage = useLlmUsage();
  const contactsHook = useContacts(address);
  const { agent } = useAgent();
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
  const [servicesOpen, setServicesOpen] = useState(false);
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());
  const feedEndRef = useRef<HTMLDivElement>(null);

  const balance = {
    total: balanceQuery.data?.total ?? 0,
    checking: balanceQuery.data?.checking ?? 0,
    savings: balanceQuery.data?.savings ?? 0,
    borrows: balanceQuery.data?.borrows ?? 0,
    savingsRate: balanceQuery.data?.savingsRate ?? 0,
    healthFactor: balanceQuery.data?.healthFactor ?? null,
    maxBorrow: balanceQuery.data?.maxBorrow ?? 0,
    pendingRewards: balanceQuery.data?.pendingRewards ?? 0,
    bestSaveRate: balanceQuery.data?.bestSaveRate ?? null,
    sui: balanceQuery.data?.sui ?? 0,
    usdc: balanceQuery.data?.usdc ?? 0,
    loading: balanceQuery.isLoading,
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.items.length]);

  const overnightData = useOvernightEarnings(balance.savings, balance.loading);

  const accountState: AccountState = {
    checking: balance.checking,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    pendingRewards: balance.pendingRewards,
    bestAlternativeRate: balance.bestSaveRate ?? undefined,
    currentRate: balance.savingsRate > 0 ? balance.savingsRate : undefined,
    healthFactor: balance.healthFactor ?? undefined,
    overnightEarnings: overnightData.earnings,
    isFirstOpenToday: overnightData.isFirstOpenToday,
    sessionExpiringSoon: expiringSoon,
    recentIncoming: incomingQuery.data,
  };

  const flowContext: FlowContext = {
    checking: balance.checking,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    maxBorrow: balance.maxBorrow,
  };

  const smartCards = deriveSmartCards(accountState).filter(
    (c) => !dismissedCards.has(c.type),
  );

  const handleDismissCard = useCallback((type: string) => {
    setDismissedCards((prev) => new Set(prev).add(type));
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

  const executeIntent = useCallback(
    (intent: ParsedIntent) => {
      if (!intent) return;

      switch (intent.action) {
        case 'save':
          chipFlow.startFlow('save', flowContext);
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'send': {
          chipFlow.startFlow('send', flowContext);
          const resolved = contactsHook.resolveContact(intent.to);
          if (resolved) {
            chipFlow.selectRecipient(resolved, intent.to, flowContext.checking);
          } else {
            chipFlow.selectRecipient(intent.to, undefined, flowContext.checking);
          }
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
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
            if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          }
          break;
        case 'borrow':
          chipFlow.startFlow('borrow', flowContext);
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'repay':
          if (balance.borrows <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any active debt to repay.',
              chips: [{ label: 'Borrow', flow: 'borrow' }],
            });
          } else {
            chipFlow.startFlow('repay', flowContext);
            if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          }
          break;
        case 'swap':
          chipFlow.startFlow('swap', flowContext);
          if (intent.from) chipFlow.selectAsset(intent.from, flowContext);
          if (intent.to) chipFlow.selectAsset(intent.to, flowContext);
          break;
        case 'claim-rewards':
          feed.addItem({
            type: 'ai-text',
            text: 'Rewards claiming will be available once connected to the SDK.',
          });
          break;
        case 'address':
          feed.addItem({
            type: 'receipt',
            title: 'Your Wallet Address',
            code: address ?? '',
            qr: true,
            meta: [
              { label: 'Network', value: SUI_NETWORK },
              { label: 'Display', value: address ? truncateAddress(address) : '' },
            ],
          });
          break;
        case 'balance': {
          const bd = balanceQuery.data;
          const lines = [
            `Total: $${balance.total.toFixed(2)}`,
            `Checking: $${balance.checking.toFixed(2)}`,
            `Savings: $${balance.savings.toFixed(2)}`,
          ];
          if (balance.borrows > 0) lines.push(`Debt: $${balance.borrows.toFixed(2)}`);
          if (balance.healthFactor && balance.healthFactor !== Infinity) {
            lines.push(`Health Factor: ${balance.healthFactor.toFixed(1)}`);
          }
          if (bd) {
            lines.push('');
            lines.push(`SUI: ${bd.sui.toFixed(4)} ($${bd.suiUsd.toFixed(2)})`);
            lines.push(`USDC: ${bd.usdc.toFixed(2)}`);
            lines.push(`SUI price: $${bd.suiPrice.toFixed(2)}`);
          }
          feed.addItem({ type: 'ai-text', text: `Your balance:\n\n${lines.join('\n')}` });
          break;
        }
        case 'report': {
          const rd = balanceQuery.data;
          const reportLines = [
            `Total: $${balance.total.toFixed(2)}`,
            `Checking: $${balance.checking.toFixed(2)}`,
            `Savings: $${balance.savings.toFixed(2)}`,
          ];
          if (balance.borrows > 0) reportLines.push(`Debt: $${balance.borrows.toFixed(2)}`);
          if (balance.healthFactor && balance.healthFactor !== Infinity) {
            reportLines.push(`Health Factor: ${balance.healthFactor.toFixed(1)}`);
          }
          if (balance.savingsRate > 0) reportLines.push(`Savings APY: ${balance.savingsRate.toFixed(1)}%`);
          const assetLines: string[] = [];
          if (rd) {
            assetLines.push(`SUI: ${rd.sui.toFixed(4)} ($${rd.suiUsd.toFixed(2)})`);
            assetLines.push(`USDC: ${rd.usdc.toFixed(2)}`);
          }
          feed.addItem({
            type: 'report',
            sections: [
              { title: 'Account Summary', lines: reportLines },
              ...(assetLines.length > 0 ? [{ title: 'Assets', lines: assetLines }] : []),
            ],
          });
          break;
        }
        case 'history':
          fetchHistory();
          break;
        case 'rates':
          feed.addItem({
            type: 'ai-text',
            text: 'Current rates will be fetched from Suilend and NAVI once connected. Use the [Save] chip to check rates.',
            chips: [{ label: 'Save', flow: 'save' }],
          });
          break;
        case 'help':
          feed.addItem({
            type: 'ai-text',
            text: 'Here\'s what I can help with:\n\n• Invest — Buy, sell, or swap SUI, BTC, ETH, GOLD\n• Save — Earn yield on idle funds\n• Send — Transfer to anyone\n• Borrow — Against your savings\n• Services — Gift cards, AI tools, and 90+ endpoints\n• Report — Full financial summary\n\nJust tap a chip below or type a command like "save $100" or "buy $50 BTC".',
          });
          break;
        case 'service':
          setServicesOpen(true);
          break;
      }
    },
    [chipFlow, feed, address, balance, balanceQuery.data, flowContext],
  );

  const handleSmartCardAction = useCallback(
    (chipFlowId: string) => {
      if (chipFlowId === 'refresh-session') {
        refresh();
        return;
      }
      if (chipFlowId === 'claim-rewards') {
        feed.addItem({ type: 'ai-text', text: 'Rewards claiming will be connected once the SDK integration is complete.' });
        return;
      }
      if (chipFlowId === 'receive') {
        executeIntent({ action: 'address' });
        return;
      }
      if (chipFlowId === 'history') {
        fetchHistory();
        return;
      }
      if (chipFlowId === 'save-all') {
        chipFlow.startFlow('save', flowContext);
        chipFlow.selectAmount(balance.checking);
        return;
      }
      if (chipFlowId === 'rebalance') {
        feed.addItem({
          type: 'ai-text',
          text: 'Rebalancing will be available once rate comparison is live.',
        });
        return;
      }
      if (chipFlowId === 'risk-explain') {
        feed.addItem({
          type: 'ai-text',
          text: 'Your health factor measures how safe your loan is. Below 1.5 means you\'re close to liquidation — repaying even a small amount brings it back to a safer level.',
          chips: [{ label: 'Repay $50', flow: 'repay' }],
        });
        return;
      }
      chipFlow.startFlow(chipFlowId, flowContext);
    },
    [chipFlow, refresh, feed, flowContext],
  );

  const handleChipClick = useCallback(
    (flow: string) => {
      if (flow === 'services') {
        setServicesOpen(true);
        return;
      }
      if (flow === 'help') { executeIntent({ action: 'help' }); return; }
      if (flow === 'report') { executeIntent({ action: 'report' }); return; }
      if (flow === 'history') { executeIntent({ action: 'history' }); return; }
      if (flow === 'receive') { executeIntent({ action: 'address' }); return; }
      if (flow === 'swap') {
        chipFlow.startFlow('swap', flowContext);
        return;
      }
      if (flow === 'balance') { executeIntent({ action: 'balance' }); return; }
      if (flow === 'rates') { executeIntent({ action: 'rates' }); return; }
      if (flow === 'repay' && balance.borrows <= 0) {
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any active debt to repay. Borrow first to create a loan.',
          chips: [{ label: 'Borrow', flow: 'borrow' }],
        });
        return;
      }
      if (flow === 'withdraw' && balance.savings <= 0) {
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any savings to withdraw. Save first to earn yield.',
          chips: [{ label: 'Save', flow: 'save' }],
        });
        return;
      }
      chipFlow.startFlow(flow, flowContext);
    },
    [chipFlow, feed, executeIntent, balance.borrows, balance.savings, flowContext],
  );

  const handleServiceSubmit = useCallback(
    async (service: ServiceItem, values: Record<string, string>) => {
      feed.addItem({
        type: 'ai-text',
        text: `Processing ${service.name}... Paying $${service.startingPrice} via MPP.`,
      });

      try {
        if (!agent) throw new Error('Not authenticated');
        const sdk = await agent.getInstance();
        const result = await sdk.payService({
          serviceId: service.id,
          fields: values,
        });

        feed.removeLastItem();

        feed.addItem({
          type: 'result',
          success: true,
          title: `${service.icon} ${service.name}`,
          details: `Paid $${result.price} · Tx: ${result.paymentDigest.slice(0, 8)}...${result.paymentDigest.slice(-6)}`,
        });

        const r = result.result as Record<string, unknown> | string;
        const images = typeof r === 'object' && r !== null && Array.isArray(r.images)
          ? (r.images as { url?: string }[]).filter((img) => img.url)
          : [];

        if (images.length > 0) {
          for (const img of images) {
            feed.addItem({ type: 'image', url: img.url!, alt: service.name, cost: `$${result.price}` });
          }
        } else {
          const responseText = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
          const previewLength = 500;
          const preview = responseText.length > previewLength
            ? responseText.slice(0, previewLength) + '...'
            : responseText;
          feed.addItem({
            type: 'ai-text',
            text: `**${service.name} response:**\n\n\`\`\`\n${preview}\n\`\`\``,
          });
        }

        balanceQuery.refetch();
      } catch (err) {
        feed.removeLastItem();
        const msg = err instanceof Error ? err.message : 'Service request failed';
        feed.addItem({
          type: 'ai-text',
          text: `${service.icon} ${service.name} failed: ${msg}`,
          chips: [{ label: 'Try again', flow: 'services' }],
        });
      }
    },
    [feed, agent, balanceQuery],
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

      // LLM rate limit check
      if (llmUsage.shouldWarn) {
        feed.addItem({
          type: 'ai-text',
          text: `You've used ${llmUsage.FREE_TIER_LIMIT} free AI queries today. Additional queries may incur a small cost from your balance.`,
        });
      }

      llmUsage.increment();
      const balanceCtx = `Total: $${balance.total.toFixed(2)}, Checking: $${balance.checking.toFixed(2)}, Savings: $${balance.savings.toFixed(2)}${balance.borrows > 0 ? `, Debt: $${balance.borrows.toFixed(2)}` : ''}`;
      const response = await llm.query(text, address, balanceCtx);
      feed.addItem(response);
    },
    [feed, executeIntent, llm, llmUsage, address],
  );

  const handleFeedChipClick = useCallback(
    (flow: string) => {
      handleChipClick(flow);
    },
    [handleChipClick],
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

  const fetchQuoteAndConfirm = useCallback(
    async (amount: number) => {
      const fromAsset = chipFlow.state.asset ?? 'USDC';
      const toAsset = chipFlow.state.toAsset ?? 'SUI';

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

      switch (flow) {
        case 'save': {
          const res = await sdk.save({ amount });
          txDigest = res.tx;
          flowLabel = 'Saved';
          break;
        }
        case 'send': {
          const recipient = chipFlow.state.recipient;
          if (!recipient) throw new Error('No recipient specified');
          const res = await sdk.send({ to: recipient, amount });
          txDigest = res.tx;
          flowLabel = 'Sent';
          break;
        }
        case 'withdraw': {
          const res = await sdk.withdraw({ amount });
          txDigest = res.tx;
          flowLabel = 'Withdrew';
          break;
        }
        case 'borrow': {
          const res = await sdk.borrow({ amount });
          txDigest = res.tx;
          flowLabel = 'Borrowed';
          break;
        }
        case 'repay': {
          const res = await sdk.repay({ amount });
          txDigest = res.tx;
          flowLabel = 'Repaid';
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
        default:
          throw new Error(`Unknown flow: ${flow}`);
      }

      const result: ChipFlowResult = {
        success: true,
        title: flow === 'swap' ? flowLabel : `${flowLabel} $${amount.toFixed(2)}`,
        details: txDigest
          ? `Tx: ${txDigest.slice(0, 8)}...${txDigest.slice(-6)}`
          : 'Transaction confirmed on-chain.',
      };
      chipFlow.setResult(result);

      feed.addItem({
        type: 'result',
        success: true,
        title: result.title,
        details: result.details,
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
  }, [chipFlow, feed, agent, contactsHook, balanceQuery]);

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

    details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

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
      <div className="mx-auto w-full max-w-xl px-4 py-6 space-y-5">
        <BalanceHeader
          address={address}
          balance={balance}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        {/* Result card (after transaction) */}
        {chipFlow.state.phase === 'result' && chipFlow.state.result && (
          <ResultCard
            success={chipFlow.state.result.success}
            title={chipFlow.state.result.title}
            details={chipFlow.state.result.details}
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
                f === 'save' ? `All $${fmtDollar(balance.checking)}` :
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
            onSelectContact={(addr, name) => chipFlow.selectRecipient(addr, name, balance.checking)}
            onSubmit={(input) => {
              const resolved = contactsHook.resolveContact(input);
              if (resolved) {
                chipFlow.selectRecipient(resolved, input, balance.checking);
              } else {
                chipFlow.selectRecipient(input, undefined, balance.checking);
              }
            }}
          />
        )}

        {/* Send flow — amount selection after recipient */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && chipFlow.state.recipient && (
          <AmountChips
            amounts={getAmountPresets('send', balance)}
            allLabel={`All $${fmtDollar(balance.checking)}`}
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
          />
        )}

        {/* Smart Cards — always visible when not in a flow */}
        {!isInFlow && (
          <SmartCardFeed
            cards={smartCards}
            loading={balance.loading}
            onAction={handleSmartCardAction}
            onDismiss={handleDismissCard}
          />
        )}

        {/* LLM loading indicator */}
        {llm.loading && (
          <div className="flex items-center gap-2 px-2">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-accent/40 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-accent/40 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-accent/40 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted">Thinking...</span>
          </div>
        )}

        {llmUsage.isOverFreeLimit && (
          <p className="text-center text-xs text-dim">
            AI queries today: {llmUsage.count} (costs apply)
          </p>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* Bottom bar — fixed */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm safe-bottom p-4 z-30">
        <div className="mx-auto max-w-xl space-y-3">
          <InputBar
            onSubmit={handleInputSubmit}
            disabled={chipFlow.state.phase === 'executing' || llm.loading}
          />
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

      <ServicesPanel
        open={servicesOpen}
        onClose={() => setServicesOpen(false)}
        onServiceSubmit={handleServiceSubmit}
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
