import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { MESSAGE_TYPE_NAMES, DhcpMessageType } from '@/dhcp/protocol/constants';
import { parsePage, pageResult, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams, { defaultPageSize: 20, maxPageSize: 500 });
    const messageType = searchParams.get('messageType');
    const mac = searchParams.get('mac');
    const ip = searchParams.get('ip');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    // raw_options 体积大，默认不返回；需要时显式开启
    const includeRaw = searchParams.get('includeRaw') === '1' || searchParams.get('includeRaw') === 'true';

    const conditions: string[] = [];
    const params: any[] = [];

    if (messageType) {
      conditions.push('message_type = ?');
      params.push(parseInt(messageType, 10));
    }
    if (mac) {
      conditions.push('client_mac LIKE ?');
      params.push(`%${mac.toUpperCase()}%`);
    }
    if (ip) {
      conditions.push('(client_ip LIKE ? OR yiaddr LIKE ? OR siaddr LIKE ? OR giaddr LIKE ?)');
      params.push(`%${ip}%`, `%${ip}%`, `%${ip}%`, `%${ip}%`);
    }
    if (startTime) {
      conditions.push('timestamp >= ?');
      params.push(startTime);
    }
    if (endTime) {
      conditions.push('timestamp <= ?');
      params.push(endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM dhcp_logs ${whereClause}`).get(...params) as { count: number };

    const logs = db.prepare(`
      SELECT * FROM dhcp_logs ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, page.pageSize, page.offset) as any[];

    const items = serializeRows(logs).map((log: any) => {
      const { raw_options, ...rest } = log;
      return {
        ...rest,
        messageTypeName: MESSAGE_TYPE_NAMES[log.message_type as DhcpMessageType] || `UNKNOWN(${log.message_type})`,
        ...(includeRaw ? { raw_options: raw_options ? JSON.parse(raw_options) : null } : {}),
      };
    });

    return NextResponse.json(pageResult(items, page, total.count));
  } catch (error) {
    return serverError('GET /dhcp-logs', error, 'Failed to fetch logs');
  }
}

export async function DELETE(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM dhcp_logs').run();
    return NextResponse.json({ deleted: true, deletedCount: result.changes });
  } catch (error) {
    return serverError('DELETE /dhcp-logs', error, 'Failed to clear logs');
  }
}
