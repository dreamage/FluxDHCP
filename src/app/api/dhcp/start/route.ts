import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { getDb } from '@/lib/db-instance';

export async function POST() {
  try {
    // 先持久化开关状态，再启动，保证 start() 内部读到的配置与 DB 一致
    try {
      const db = getDb();
      db.prepare("UPDATE config SET value = '1', updated_at = datetime('now') WHERE key = 'dhcp_enabled'").run();
    } catch (e) {
      console.error('[DHCP] Failed to persist dhcp_enabled=1:', e);
    }

    dhcpInstance.reloadConfig();
    await dhcpInstance.start();

    return NextResponse.json({ status: dhcpInstance.getStatus(), message: 'DHCP server started' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start DHCP server';
    return NextResponse.json(
      { error: message, status: dhcpInstance.getStatus(), detail: dhcpInstance.getLastError() },
      { status: 500 },
    );
  }
}
