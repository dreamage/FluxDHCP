'use client';

import { useState, useCallback } from 'react';

export function useMacNotes() {
  const [macNotes, setMacNotes] = useState<Record<string, string>>({});
  const [knownMacs, setKnownMacs] = useState<string[]>([]);

  const fetchMacNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/mac-notes');
      if (res.ok) {
        const notes = await res.json();
        setMacNotes(notes);
        setKnownMacs(Object.keys(notes));
      }
    } catch { /* ignore */ }
  }, []);

  return { macNotes, knownMacs, fetchMacNotes };
}

