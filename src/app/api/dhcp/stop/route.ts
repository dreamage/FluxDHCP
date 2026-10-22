import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { getDb } from '@/lib/db-instance';
import { apiError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    // 先持久化开关状态（服务端启动时据此决定是否自动拉起），再停止服务
    try {
      const db = getDb();
      db.prepare("UPDATE config SET value = '0', updated_at = datetime('now') WHERE key = 'dhcp_enabled'").run();
    } catch (e) {
      console.error('[DHCP] Failed to persist dhcp_enabled=0:', e);
    }

    await dhcpInstance.stop();
    dhcpInstance.reloadConfig();

    return NextResponse.json({ status: dhcpInstance.getStatus(), message: 'DHCP server stopped' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop DHCP server';
    return apiError('DHCP_STOP_FAILED', message, 500, {
      details: {
        dhcpStatus: dhcpInstance.getStatus(),
        lastError: dhcpInstance.getLastError(),
      },
    });
  }
}
