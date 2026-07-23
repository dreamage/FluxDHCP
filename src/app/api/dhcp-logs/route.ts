import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { MESSAGE_TYPE_NAMES, DhcpMessageType } from '@/dhcp/protocol/constants';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const messageType = searchParams.get('messageType');
    const mac = searchParams.get('mac');
    const ip = searchParams.get('ip');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

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
    `).all(...params, pageSize, (page - 1) * pageSize);

    const data = (logs as any[]).map(log => ({
      ...log,
      messageTypeName: MESSAGE_TYPE_NAMES[log.message_type as DhcpMessageType] || `UNKNOWN(${log.message_type})`,
      raw_options: log.raw_options ? JSON.parse(log.raw_options) : null,
    }));

    return NextResponse.json({ total: total.count, page, pageSize, data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM dhcp_logs').run();
    return NextResponse.json({ message: 'All logs cleared', deleted: result.changes });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
}
