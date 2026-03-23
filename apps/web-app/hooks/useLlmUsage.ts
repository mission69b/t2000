'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 't2000:llm-usage';
const FREE_TIER_LIMIT = 10;

interface LlmUsageState {
  date: string;
  count: number;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function loadUsage(): LlmUsageState {
  if (typeof window === 'undefined') return { date: getToday(), count: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: getToday(), count: 0 };
    const parsed = JSON.parse(raw) as LlmUsageState;
    if (parsed.date !== getToday()) return { date: getToday(), count: 0 };
    return parsed;
  } catch {
    return { date: getToday(), count: 0 };
  }
}

function saveUsage(state: LlmUsageState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full — degrade gracefully */ }
}

export function useLlmUsage() {
  const [usage, setUsage] = useState<LlmUsageState>(loadUsage);

  const increment = useCallback(() => {
    setUsage((prev) => {
      const today = getToday();
      const next: LlmUsageState = {
        date: today,
        count: prev.date === today ? prev.count + 1 : 1,
      };
      saveUsage(next);
      return next;
    });
  }, []);

  const isOverFreeLimit = usage.count >= FREE_TIER_LIMIT;
  const queriesRemaining = Math.max(0, FREE_TIER_LIMIT - usage.count);
  const shouldWarn = usage.count === FREE_TIER_LIMIT;

  return {
    count: usage.count,
    isOverFreeLimit,
    queriesRemaining,
    shouldWarn,
    increment,
    FREE_TIER_LIMIT,
  };
}
