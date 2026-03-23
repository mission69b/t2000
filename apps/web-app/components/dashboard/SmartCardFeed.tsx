'use client';

import type { SmartCardData } from '@/lib/smart-cards';
import { SmartCard } from './SmartCard';
import { SkeletonCard } from './SkeletonCard';

interface SmartCardFeedProps {
  cards: SmartCardData[];
  loading: boolean;
  onAction: (chipFlow: string) => void;
  onDismiss: (cardType: string) => void;
}

export function SmartCardFeed({ cards, loading, onAction, onDismiss }: SmartCardFeedProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <SmartCard
          key={card.type}
          card={card}
          onAction={onAction}
          onDismiss={() => onDismiss(card.type)}
        />
      ))}
    </div>
  );
}
