'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Contact {
  name: string;
  address: string;
}

export function useContacts(userAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userAddress) return;

    fetch(`/api/user/preferences?address=${userAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.contacts)) {
          setContacts(data.contacts as Contact[]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [userAddress]);

  const addContact = useCallback(
    async (name: string, address: string) => {
      if (!userAddress) return;

      const existing = contacts.find(
        (c) => c.address.toLowerCase() === address.toLowerCase(),
      );
      if (existing) return;

      const updated = [...contacts, { name, address }];
      setContacts(updated);

      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: userAddress, contacts: updated }),
      });
    },
    [userAddress, contacts],
  );

  const isKnownAddress = useCallback(
    (addr: string) =>
      contacts.some((c) => c.address.toLowerCase() === addr.toLowerCase()),
    [contacts],
  );

  const resolveContact = useCallback(
    (nameOrAddress: string): string | null => {
      const match = contacts.find(
        (c) => c.name.toLowerCase() === nameOrAddress.toLowerCase(),
      );
      return match?.address ?? null;
    },
    [contacts],
  );

  return { contacts, loaded, addContact, isKnownAddress, resolveContact };
}
