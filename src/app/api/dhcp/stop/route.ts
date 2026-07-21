import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { getDb } from '@/lib/db-instance';

export async function POST() {
  try {
    await dhcpInstance.stop();
    // Persist the disabled state so the server won't auto-start on next boot
    // (src/server.ts checks dhcp_enabled on startup).
    try {
      const db = getDb();
      db.prepare("UPDATE config SET value = '0', updated_at = datetime('now') WHERE key = 'dhcp_enabled'").run();
    } catch (e) {
      console.error('[DHCP] Failed to persist dhcp_enabled=0:', e);
    }
    return NextResponse.json({ status: 'stopped', message: 'DHCP server stopped' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop DHCP server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
