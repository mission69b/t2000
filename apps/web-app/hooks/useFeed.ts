'use client';

import { useCallback, useRef, useState } from 'react';
import { type FeedItem, type FeedItemData, createFeedItem } from '@/lib/feed-types';

export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const addItem = useCallback((data: FeedItemData) => {
    setItems((prev) => [...prev, createFeedItem(data)]);
  }, []);

  const addItems = useCallback((dataList: FeedItemData[]) => {
    setItems((prev) => [...prev, ...dataList.map(createFeedItem)]);
  }, []);

  const removeLastItem = useCallback(() => {
    setItems((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  return { items, addItem, addItems, removeLastItem, clear, scrollRef };
}
