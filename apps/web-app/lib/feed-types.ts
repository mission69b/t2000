export type FeedItemType =
  | 'user-message'
  | 'ai-text'
  | 'confirmation'
  | 'result'
  | 'receipt'
  | 'list'
  | 'report'
  | 'image'
  | 'audio'
  | 'error'
  | 'contact-prompt'
  | 'transaction-history';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: number;
  data: FeedItemData;
}

export type FeedItemData =
  | { type: 'user-message'; text: string }
  | { type: 'ai-text'; text: string; chips?: { label: string; flow: string }[] }
  | { type: 'confirmation'; title: string; details: { label: string; value: string }[]; flow: string; amount?: number }
  | { type: 'result'; success: boolean; title: string; details: string }
  | { type: 'receipt'; title: string; code?: string; qr?: boolean; meta: { label: string; value: string }[] }
  | { type: 'list'; title: string; items: { label: string; value: string; sub?: string }[] }
  | { type: 'report'; sections: { title: string; lines: string[] }[] }
  | { type: 'image'; url: string; alt: string; cost?: string }
  | { type: 'audio'; url: string; title: string; cost?: string }
  | { type: 'error'; message: string; chips?: { label: string; flow: string }[] }
  | { type: 'contact-prompt'; address: string }
  | { type: 'transaction-history'; transactions: TxHistoryEntry[]; network: string };

export interface TxHistoryEntry {
  digest: string;
  action: string;
  direction: 'out' | 'in' | 'self';
  amount?: number;
  asset?: string;
  counterparty?: string;
  timestamp: number;
}

let nextId = 0;
export function createFeedItem(data: FeedItemData): FeedItem {
  return {
    id: `feed-${Date.now()}-${nextId++}`,
    type: data.type,
    timestamp: Date.now(),
    data,
  };
}
