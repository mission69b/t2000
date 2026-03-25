'use client';

import { useState } from 'react';
import { giftCardPrice } from '@/lib/service-pricing';

interface Brand {
  id: string;
  name: string;
  icon: string;
  minAmount: number;
  maxAmount: number;
}

const POPULAR_BRANDS: Brand[] = [
  { id: 'amazon', name: 'Amazon', icon: '📦', minAmount: 5, maxAmount: 500 },
  { id: 'uber-eats', name: 'Uber Eats', icon: '🍔', minAmount: 10, maxAmount: 200 },
  { id: 'netflix', name: 'Netflix', icon: '🎬', minAmount: 15, maxAmount: 100 },
  { id: 'spotify', name: 'Spotify', icon: '🎵', minAmount: 10, maxAmount: 60 },
  { id: 'apple', name: 'Apple', icon: '🍎', minAmount: 10, maxAmount: 500 },
  { id: 'google-play', name: 'Google Play', icon: '▶️', minAmount: 5, maxAmount: 200 },
  { id: 'steam', name: 'Steam', icon: '🎮', minAmount: 5, maxAmount: 100 },
  { id: 'playstation', name: 'PlayStation', icon: '🎯', minAmount: 10, maxAmount: 100 },
  { id: 'xbox', name: 'Xbox', icon: '🕹️', minAmount: 10, maxAmount: 100 },
  { id: 'starbucks', name: 'Starbucks', icon: '☕', minAmount: 5, maxAmount: 100 },
  { id: 'doordash', name: 'DoorDash', icon: '🚗', minAmount: 10, maxAmount: 200 },
  { id: 'target', name: 'Target', icon: '🎯', minAmount: 10, maxAmount: 500 },
  { id: 'walmart', name: 'Walmart', icon: '🏪', minAmount: 10, maxAmount: 500 },
  { id: 'nike', name: 'Nike', icon: '👟', minAmount: 25, maxAmount: 200 },
  { id: 'visa', name: 'Visa Gift', icon: '💳', minAmount: 10, maxAmount: 500 },
  { id: 'mastercard', name: 'Mastercard Gift', icon: '💳', minAmount: 10, maxAmount: 500 },
];

interface GiftCardGridProps {
  onSelect: (brand: string, amount: number, email: string) => void;
  onCancel: () => void;
}

type Phase = 'brand' | 'amount' | 'email' | 'confirm';

export function GiftCardGrid({ onSelect, onCancel }: GiftCardGridProps) {
  const [phase, setPhase] = useState<Phase>('brand');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');

  const handleBrandClick = (brand: Brand) => {
    setSelectedBrand(brand);
    setPhase('amount');
  };

  const handleAmountSubmit = () => {
    const val = parseFloat(amount);
    if (!selectedBrand || isNaN(val) || val < selectedBrand.minAmount || val > selectedBrand.maxAmount) return;
    setPhase('email');
  };

  const handleEmailSubmit = () => {
    if (!email.includes('@') || !selectedBrand) return;
    setPhase('confirm');
  };

  const handleConfirm = () => {
    if (!selectedBrand) return;
    onSelect(selectedBrand.name, parseFloat(amount), email);
  };

  if (phase === 'brand') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Choose a brand:</p>
        <div className="grid grid-cols-4 gap-2">
          {POPULAR_BRANDS.map((brand) => (
            <button
              key={brand.id}
              onClick={() => handleBrandClick(brand)}
              className="flex flex-col items-center gap-1 rounded-sm border border-border bg-panel p-2.5 transition hover:border-accent/50 hover:bg-accent-dim active:scale-[0.97]"
            >
              <span className="text-lg">{brand.icon}</span>
              <span className="text-[11px] font-medium text-foreground leading-tight text-center">{brand.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'amount' && selectedBrand) {
    const presets = [selectedBrand.minAmount, 25, 50, 100].filter(
      (v) => v >= selectedBrand.minAmount && v <= selectedBrand.maxAmount,
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setPhase('brand')} className="text-muted hover:text-foreground text-xs">
            ← Back
          </button>
          <p className="text-sm text-muted">
            {selectedBrand.icon} {selectedBrand.name} — choose amount (${selectedBrand.minAmount}-${selectedBrand.maxAmount}):
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((val) => (
            <button
              key={val}
              onClick={() => { setAmount(String(val)); setPhase('email'); }}
              className="rounded-full border border-border bg-panel px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:bg-accent-dim active:scale-[0.97]"
            >
              ${val}
            </button>
          ))}
          <div className="flex gap-1 items-center">
            <span className="text-sm text-muted">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Custom"
              className="w-20 rounded-sm border border-border bg-panel px-2 py-2 text-sm text-foreground outline-none focus:border-border-bright"
              min={selectedBrand.minAmount}
              max={selectedBrand.maxAmount}
            />
            <button
              onClick={handleAmountSubmit}
              disabled={!amount || isNaN(parseFloat(amount))}
              className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'email') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setPhase('amount')} className="text-muted hover:text-foreground text-xs">
            ← Back
          </button>
          <p className="text-sm text-muted">
            {selectedBrand?.icon} {selectedBrand?.name} ${amount} — send to:
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recipient@email.com"
            autoFocus
            className="flex-1 rounded-sm border border-border bg-panel px-3 py-2.5 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright"
            onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSubmit(); }}
          />
          <button
            onClick={handleEmailSubmit}
            disabled={!email.includes('@')}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'confirm' && selectedBrand) {
    const pricing = giftCardPrice(parseFloat(amount));
    const { faceValue, fee, total, feeLabel } = pricing;

    return (
      <div className="rounded-sm border border-border bg-surface p-5 space-y-4">
        <p className="font-medium text-foreground">
          {selectedBrand.icon} {selectedBrand.name} Gift Card
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Face value</span>
            <span className="text-foreground font-medium font-mono">${faceValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Fee ({feeLabel})</span>
            <span className="text-foreground font-medium font-mono">${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2">
            <span className="text-muted font-medium">Total</span>
            <span className="text-foreground font-semibold font-mono">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Send to</span>
            <span className="text-foreground font-mono text-xs">{email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Gas</span>
            <span className="text-foreground font-medium">Sponsored</span>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleConfirm}
            className="flex-1 bg-accent py-3 text-sm font-semibold text-background tracking-[0.05em] uppercase transition hover:bg-[#00f0a0] hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.98]"
          >
            ✓ Buy ${faceValue} Gift Card
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 text-sm text-muted hover:text-foreground transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
