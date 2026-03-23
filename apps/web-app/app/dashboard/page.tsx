'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ServicesPanel } from '@/components/services/ServicesPanel';
import { useChipFlow, type ChipFlowResult } from '@/hooks/useChipFlow';
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

function DashboardContent() {
  const { address, session, expiringSoon, logout, refresh } = useZkLogin();
  const chipFlow = useChipFlow();
  const feed = useFeed();
  const llm = useLlm();
  const llmUsage = useLlmUsage();
  const contactsHook = useContacts(address);
  const { agent } = useAgent();
  const balanceQuery = useBalance(address);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());
  const feedEndRef = useRef<HTMLDivElement>(null);
  const prevTotalRef = useRef<number | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);

  const balance = {
    total: balanceQuery.data?.total ?? 0,
    checking: balanceQuery.data?.checking ?? 0,
    savings: balanceQuery.data?.savings ?? 0,
    loading: balanceQuery.isLoading,
  };

  useEffect(() => {
    if (balanceQuery.data && !balanceQuery.isLoading) {
      const currentTotal = balanceQuery.data.total;
      if (prevTotalRef.current !== null && currentTotal > prevTotalRef.current) {
        const diff = currentTotal - prevTotalRef.current;
        if (diff >= 0.01) {
          setReceivedAmount(diff);
        }
      }
      prevTotalRef.current = currentTotal;
    }
  }, [balanceQuery.data, balanceQuery.isLoading]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.items.length]);

  const accountState: AccountState = {
    checking: balance.checking,
    savings: balance.savings,
    savingsRate: 0,
    pendingRewards: 0,
    sessionExpiringSoon: expiringSoon,
    receivedAmount: receivedAmount ?? undefined,
  };

  const smartCards = deriveSmartCards(accountState).filter(
    (c) => !dismissedCards.has(c.type),
  );

  const handleDismissCard = useCallback((type: string) => {
    setDismissedCards((prev) => new Set(prev).add(type));
    if (type === 'received-funds') setReceivedAmount(null);
  }, []);

  const executeIntent = useCallback(
    (intent: ParsedIntent) => {
      if (!intent) return;

      switch (intent.action) {
        case 'save':
          chipFlow.startFlow('save');
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'send':
          chipFlow.startFlow('send');
          chipFlow.selectRecipient(intent.to);
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'withdraw':
          chipFlow.startFlow('withdraw');
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'borrow':
          chipFlow.startFlow('borrow');
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'repay':
          chipFlow.startFlow('repay');
          if (intent.amount > 0) chipFlow.selectAmount(intent.amount);
          break;
        case 'invest':
          feed.addItem({
            type: 'ai-text',
            text: `To invest $${intent.amount} in ${intent.asset}, the SDK needs to be connected. This will be wired once the agent integration is complete.`,
            chips: [{ label: 'Check rates', flow: 'rates' }],
          });
          break;
        case 'swap':
          feed.addItem({
            type: 'ai-text',
            text: `Swap $${intent.amount} to ${intent.to} will be available once the exchange flow is connected.`,
          });
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
          if (bd) {
            lines.push('');
            lines.push(`SUI: ${bd.sui.toFixed(4)} ($${bd.suiUsd.toFixed(2)})`);
            lines.push(`USDC: ${bd.usdc.toFixed(2)}`);
            lines.push(`SUI price: $${bd.suiPrice.toFixed(2)}`);
          }
          feed.addItem({ type: 'ai-text', text: `Your balance:\n\n${lines.join('\n')}` });
          break;
        }
          break;
        case 'report': {
          const rd = balanceQuery.data;
          const reportLines = [
            `Total: $${balance.total.toFixed(2)}`,
            `Checking: $${balance.checking.toFixed(2)}`,
            `Savings: $${balance.savings.toFixed(2)}`,
          ];
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
          break;
        case 'history':
          feed.addItem({
            type: 'ai-text',
            text: 'No transactions yet. Make your first save or send to see your history here.',
          });
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
            text: 'Here\'s what I can help with:\n\n• Save — Earn yield on idle funds\n• Send — Transfer to anyone\n• Borrow — Against your savings\n• Invest — Buy SUI, BTC, ETH, GOLD\n• Services — Gift cards, AI tools, and 90+ endpoints\n• Report — Full financial summary\n\nJust tap a chip below or type a command like "save $100".',
          });
          break;
      }
    },
    [chipFlow, feed, address, balance],
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
      if (chipFlowId === 'save-all') {
        chipFlow.startFlow('save');
        chipFlow.selectAmount(-1);
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
      chipFlow.startFlow(chipFlowId);
    },
    [chipFlow, refresh, feed],
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
      if (flow === 'invest') {
        feed.addItem({
          type: 'ai-text',
          text: 'What would you like to invest in? Type "invest $100 in SUI" or choose an asset.',
          chips: [
            { label: 'SUI', flow: 'invest-sui' },
            { label: 'BTC', flow: 'invest-btc' },
            { label: 'ETH', flow: 'invest-eth' },
          ],
        });
        return;
      }
      if (flow === 'swap') {
        feed.addItem({
          type: 'ai-text',
          text: 'What would you like to swap? Type "swap $50 to SUI" to get started.',
        });
        return;
      }
      chipFlow.startFlow(flow);
    },
    [chipFlow, feed, executeIntent],
  );

  const handleServiceSubmit = useCallback(
    (service: ServiceItem, values: Record<string, string>) => {
      const details = Object.entries(values)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      feed.addItem({
        type: 'confirmation',
        title: `${service.icon} ${service.name}`,
        details: [
          { label: 'Service', value: service.name },
          ...Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => ({ label: k, value: v })),
          { label: 'Cost', value: `From ${service.startingPrice}` },
        ],
        flow: service.id,
      });

      // TODO: Execute via MPP gateway when wired
      feed.addItem({
        type: 'ai-text',
        text: `Your ${service.name} request is ready. MPP gateway execution will be connected in a future update.\n\n${details}`,
      });
    },
    [feed],
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
      const response = await llm.query(text, address);
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

  const handleAmountSelect = useCallback(
    (amount: number) => {
      const actualAmount = amount === -1 ? balance.checking : amount;
      chipFlow.selectAmount(actualAmount);
    },
    [chipFlow, balance.checking],
  );

  const handleConfirm = useCallback(async () => {
    chipFlow.confirm();

    const flow = chipFlow.state.flow;
    const amount = chipFlow.state.amount ?? 0;

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
        default:
          throw new Error(`Unknown flow: ${flow}`);
      }

      const result: ChipFlowResult = {
        success: true,
        title: `${flowLabel} $${amount.toFixed(2)}`,
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
    const details: { label: string; value: string }[] = [];

    details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

    if (flow === 'send' && chipFlow.state.recipient) {
      details.push({ label: 'To', value: chipFlow.state.subFlow ?? chipFlow.state.recipient });
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

        {/* Executing state */}
        {chipFlow.state.phase === 'executing' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={() => {}}
            onCancel={() => {}}
            loading
          />
        )}

        {/* Amount sub-chips */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow && chipFlow.state.flow !== 'send' && (
          <AmountChips
            amounts={[50, 100, 200]}
            allLabel={chipFlow.state.flow === 'withdraw' || chipFlow.state.flow === 'save' ? `All $${Math.floor(balance.checking)}` : undefined}
            onSelect={handleAmountSelect}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {/* Send flow — recipient selection */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && !chipFlow.state.recipient && (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3 feed-row">
            <p className="text-sm text-muted">Who do you want to send to?</p>
            {contactsHook.contacts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {contactsHook.contacts.map((c) => (
                  <button
                    key={c.address}
                    onClick={() => chipFlow.selectRecipient(c.address, c.name)}
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
                placeholder={contactsHook.contacts.length > 0 ? 'Or paste address (0x...)' : 'Paste address (0x...) or contact name'}
                autoFocus
                className="flex-1 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget.value.trim();
                    if (!input) return;
                    const resolved = contactsHook.resolveContact(input);
                    if (resolved) {
                      chipFlow.selectRecipient(resolved, input);
                    } else {
                      chipFlow.selectRecipient(input);
                    }
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Send flow — amount selection after recipient */}
        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && chipFlow.state.recipient && (
          <AmountChips
            amounts={[10, 25, 50]}
            allLabel={`All $${Math.floor(balance.checking)}`}
            onSelect={handleAmountSelect}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {/* Smart Cards Feed (only show when not in a flow and no feed items) */}
        {!isInFlow && !hasFeedItems && (
          <SmartCardFeed
            cards={smartCards}
            loading={balance.loading}
            onAction={handleSmartCardAction}
            onDismiss={handleDismissCard}
          />
        )}

        {/* Conversational Feed */}
        {hasFeedItems && !isInFlow && (
          <>
            <FeedRenderer
              items={feed.items}
              onChipClick={handleFeedChipClick}
              onCopy={handleCopy}
              onSaveContact={handleSaveContact}
            />

            <SmartCardFeed
              cards={smartCards}
              loading={balance.loading}
              onAction={handleSmartCardAction}
              onDismiss={handleDismissCard}
            />
          </>
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
        network={SUI_NETWORK}
        sessionExpiresAt={session.expiresAt}
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
