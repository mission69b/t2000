'use client';

import { useCallback, useSyncExternalStore } from 'react';

export interface DcaSchedule {
  id: string;
  strategy: string;
  strategyName: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  createdAt: string;
  enabled: boolean;
}

const STORAGE_KEY = 't2000_dca_schedules';

let listeners: Array<() => void> = [];

function emitChange() {
  for (const listener of listeners) listener();
}

function getSnapshot(): DcaSchedule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function getServerSnapshot(): DcaSchedule[] {
  return [];
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useDcaSchedules() {
  const schedules = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const remove = useCallback((id: string) => {
    const updated = getSnapshot().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    emitChange();
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    const all = getSnapshot();
    const target = all.find((s) => s.id === id);
    if (target) {
      target.enabled = !target.enabled;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      emitChange();
    }
  }, []);

  const active = schedules.filter((s) => s.enabled);

  return { schedules, active, remove, toggleEnabled };
}
