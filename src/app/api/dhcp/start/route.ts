import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { getDb } from '@/lib/db-instance';

export async function POST() {
  try {
    await dhcpInstance.start();
    // Persist the enabled state so the server auto-starts on next boot too.
    try {
      const db = getDb();
      db.prepare("UPDATE config SET value = '1', updated_at = datetime('now') WHERE key = 'dhcp_enabled'").run();
    } catch (e) {
      console.error('[DHCP] Failed to persist dhcp_enabled=1:', e);
    }
    return NextResponse.json({ status: 'running', message: 'DHCP server started' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start DHCP server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
