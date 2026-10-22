'use client';

import { useState, useCallback } from 'react';

export function useMacNotes() {
  const [macNotes, setMacNotes] = useState<Record<string, string>>({});
  const [knownMacs, setKnownMacs] = useState<string[]>([]);

  const fetchMacNotes = useCallback(async () => {
    try {
      // 备注量通常不大，一次取满用于自动补全；接口默认分页，这里显式提高上限
      const res = await fetch('/api/mac-notes?pageSize=1000');
      if (res.ok) {
        const json = await res.json();
        const items: Array<{ mac_address: string; note: string }> = Array.isArray(json.items) ? json.items : [];
        const map: Record<string, string> = {};
        for (const row of items) map[row.mac_address] = row.note;
        setMacNotes(map);
        setKnownMacs(items.map(row => row.mac_address));
      }
    } catch { /* ignore */ }
  }, []);

  return { macNotes, knownMacs, fetchMacNotes };
}
