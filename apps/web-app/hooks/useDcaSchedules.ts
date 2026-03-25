'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;

  useEffect(() => {
    if (!userAddress) return;

    fetch(`/api/user/preferences?address=${userAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.dcaSchedules)) {
          const fetched = data.dcaSchedules as DcaSchedule[];
          setSchedules(fetched);
          schedulesRef.current = fetched;
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
      }).catch(() => {});
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
      const updated = [...schedulesRef.current, schedule];
      schedulesRef.current = updated;
      setSchedules(updated);
      persist(updated);
      return schedule;
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      const updated = schedulesRef.current.filter((s) => s.id !== id);
      schedulesRef.current = updated;
      setSchedules(updated);
      persist(updated);
    },
    [persist],
  );

  const toggleEnabled = useCallback(
    (id: string) => {
      const updated = schedulesRef.current.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      schedulesRef.current = updated;
      setSchedules(updated);
      persist(updated);
    },
    [persist],
  );

  const active = schedules.filter((s) => s.enabled);

  return { schedules, active, loaded, add, remove, toggleEnabled };
}
