'use client';

import { useCallback, useEffect, useState } from 'react';

export interface DcaSchedule {
  id: string;
  strategy: string;
  strategyName: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  createdAt: string;
  enabled: boolean;
}

export function useDcaSchedules(userAddress: string | null) {
  const [schedules, setSchedules] = useState<DcaSchedule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userAddress) return;

    fetch(`/api/user/preferences?address=${userAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.dcaSchedules)) {
          setSchedules(data.dcaSchedules as DcaSchedule[]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [userAddress]);

  const persist = useCallback(
    (updated: DcaSchedule[]) => {
      if (!userAddress) return;
      fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: userAddress, dcaSchedules: updated }),
      });
    },
    [userAddress],
  );

  const add = useCallback(
    (params: Omit<DcaSchedule, 'id' | 'createdAt' | 'enabled'>) => {
      const schedule: DcaSchedule = {
        ...params,
        id: `dca-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        enabled: true,
      };
      const updated = [...schedules, schedule];
      setSchedules(updated);
      persist(updated);
      return schedule;
    },
    [schedules, persist],
  );

  const remove = useCallback(
    (id: string) => {
      const updated = schedules.filter((s) => s.id !== id);
      setSchedules(updated);
      persist(updated);
    },
    [schedules, persist],
  );

  const toggleEnabled = useCallback(
    (id: string) => {
      const updated = schedules.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      setSchedules(updated);
      persist(updated);
    },
    [schedules, persist],
  );

  const active = schedules.filter((s) => s.enabled);

  return { schedules, active, loaded, add, remove, toggleEnabled };
}
